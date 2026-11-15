import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LAYERS } from '@/content/catalog';
import { PATHWAYS } from '@/content/load';
import { useAtlas } from '@/store/atlas';
import { explodeOffset, resolvePathwayPoint, sectionPlane } from './section';

interface Candidate { key: string; structureId: string; meshId: string | null; text: string; anchor: THREE.Vector3; priority: number; surface: boolean }

const SURFACE_LAYERS = new Set(['cortex', 'cerebellum', 'body-skeleton', 'body-muscles', 'body-skin']);
const v = new THREE.Vector3();
const toCam = new THREE.Vector3();

// Larghezza reale del testo, misurata una volta per etichetta e dimensione: evita testi che escono dal riquadro.
const measure = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
const widths = new Map<string, number>();
function textWidth(text: string, px: number): number {
  const key = `${px}:${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (measure) measure.font = `600 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    w = (measure ? measure.measureText(text).width : text.length * px * 0.58) + 18;
    widths.set(key, w);
  }
  return w;
}

/**
 * Etichette in spazio schermo. A ogni fotogramma sceglie, in ordine di priorità, quelle che non si sovrappongono
 * e stanno nello schermo; il numero massimo e la dimensione dipendono dalla larghezza. Scrive direttamente nel DOM
 * (nessun re-render di React durante la rotazione).
 */
export function Labels({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const catalog = useAtlas((s) => s.catalog)!;
  const layers = useAtlas((s) => s.layers);
  const scope = useAtlas((s) => s.scope);
  const selection = useAtlas((s) => s.selection);
  const isolated = useAtlas((s) => s.isolated);
  const explode = useAtlas((s) => s.explode);
  const enabled = useAtlas((s) => s.labels);
  const pathwayId = useAtlas((s) => s.pathwayId);
  const section = useAtlas((s) => s.section);
  const invalidate = useThree((s) => s.invalidate);
  const pool = useRef<HTMLButtonElement[]>([]);

  const candidates = useMemo<Candidate[]>(() => {
    if (!enabled) return [];
    const out: Candidate[] = [];
    const pathway = PATHWAYS.find((p) => p.id === pathwayId);
    if (pathway) {
      // Con una via attiva le etichette sono le sue tappe, nell'ordine del percorso.
      pathway.tracks.forEach((t, ti) => t.points.forEach((p, i) => {
        const anchor = p.label ? resolvePathwayPoint(p, catalog) : null;
        if (anchor) out.push({ key: `${ti}:${i}`, structureId: p.ref, meshId: null, text: `${i + 1}. ${p.label}`, anchor, priority: 1000 - i - ti * 100, surface: false });
      }));
      return out;
    }
    const scopeCenter = catalog.scopes[scope].center;
    for (const layer of LAYERS) {
      const state = layers[layer.id];
      if (!state.visible || layer.group !== scope) continue;
      for (const s of catalog.byLayer.get(layer.id) ?? []) {
        const picked = selection?.structureId === s.id;
        if (isolated && selection && !picked) continue;
        for (const m of s.meshes) {
          const anchor = new THREE.Vector3(...m.centroid).add(explodeOffset(m, catalog, explode));
          const size = Math.hypot(m.bbox[1][0] - m.bbox[0][0], m.bbox[1][1] - m.bbox[0][1], m.bbox[1][2] - m.bbox[0][2]);
          // Le strutture di superficie si etichettano sul lato esterno, così l'etichetta non finisce dentro il modello.
          const surface = SURFACE_LAYERS.has(layer.id) && state.opacity >= 0.5;
          if (surface) anchor.add(v.set(anchor.x - scopeCenter[0], anchor.y - scopeCenter[1], anchor.z - scopeCenter[2]).multiplyScalar(0.12));
          out.push({
            key: m.id, structureId: s.id, meshId: m.id, anchor, surface,
            text: s.names.it + (m.side === 'L' ? ' (sx)' : m.side === 'R' ? ' (dx)' : ''),
            priority: (picked && (!selection!.meshId || selection!.meshId === m.id) ? 10000 : 0) + (s.card ? 40 : 0) + size * 1000 * (state.opacity >= 0.5 ? 1 : 0.3),
          });
        }
      }
    }
    return out.sort((a, b) => b.priority - a.priority).slice(0, 260);
  }, [enabled, catalog, layers, scope, selection, isolated, explode, pathwayId]);

  useEffect(() => { invalidate(); }, [candidates, invalidate]);

  useFrame(({ camera, size }) => {
    const root = container.current;
    if (!root) return;
    const narrow = size.width < 640;
    const max = candidates.length && pathwayId ? 14 : narrow ? 7 : 16;
    const px = narrow ? 11 : 12, h = narrow ? 22 : 24, maxW = Math.min(narrow ? 190 : 260, size.width - 12);
    const placed: [number, number, number, number][] = [];
    const center = catalog.scopes[scope].center;
    let used = 0;
    for (const c of candidates) {
      if (used >= max) break;
      if (section && sectionPlane.distanceToPoint(c.anchor) < 0) continue;
      if (c.surface) {
        // nascosta se sta sulla faccia del modello opposta alla camera
        toCam.set(camera.position.x - center[0], camera.position.y - center[1], camera.position.z - center[2]);
        if (v.set(c.anchor.x - center[0], c.anchor.y - center[1], c.anchor.z - center[2]).dot(toCam) < 0) continue;
      }
      v.copy(c.anchor).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
      const w = Math.min(maxW, textWidth(c.text, px));
      const left = x - w / 2, top = y - h - 6;
      if (left < 4 || top < 4 || left + w > size.width - 4 || top + h > size.height - 4) continue;
      if (top < 126 && left < (narrow ? size.width : 300)) continue; // zona dei comandi in alto a sinistra
      if (placed.some(([l, t, r, b]) => left < r + 4 && left + w > l - 4 && top < b + 3 && top + h > t - 3)) continue;
      placed.push([left, top, left + w, top + h]);
      let el = pool.current[used];
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'atlas-label';
        el.addEventListener('click', () => {
          const { structureId, meshId } = el.dataset;
          if (structureId) useAtlas.getState().select(structureId, meshId || null);
        });
        pool.current[used] = el;
        root.appendChild(el);
      }
      if (el.textContent !== c.text) el.textContent = c.text;
      el.dataset.structureId = c.structureId;
      el.dataset.meshId = c.meshId ?? '';
      el.style.cssText = `left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w.toFixed(0)}px;height:${h}px;font-size:${px}px`;
      el.classList.toggle('atlas-label-selected', c.priority >= 10000);
      el.hidden = false;
      used++;
    }
    for (let i = used; i < pool.current.length; i++) pool.current[i].hidden = true;
  });

  return null;
}
