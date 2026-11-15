import type { LayerId, Manifest, ManifestMesh, StructureCard } from './schema';
import { LAYER_IDS } from './schema';

export type Scope = 'body' | 'brain';
/** `visibleIn`: gli ambiti in cui il livello è acceso in partenza. */
export interface LayerInfo { id: LayerId; group: Scope; label: string; tint: string; visibleIn: Scope[] }
export const LAYERS: LayerInfo[] = [
  { id: 'body-skeleton', group: 'body', label: 'Scheletro e denti', tint: '#e6dcbd', visibleIn: ['body'] },
  { id: 'body-ligaments', group: 'body', label: 'Legamenti e articolazioni', tint: '#d1ccb8', visibleIn: [] },
  { id: 'body-muscles', group: 'body', label: 'Muscoli', tint: '#9e3833', visibleIn: [] },
  { id: 'body-heart', group: 'body', label: 'Cuore', tint: '#b32933', visibleIn: ['body'] },
  { id: 'body-arteries', group: 'body', label: 'Arterie', tint: '#cc1f1f', visibleIn: [] },
  { id: 'body-veins', group: 'body', label: 'Vene', tint: '#334db3', visibleIn: [] },
  { id: 'body-nerves', group: 'body', label: 'Nervi periferici e sistema autonomo', tint: '#edcc40', visibleIn: ['body'] },
  { id: 'body-spinal-cord', group: 'body', label: 'Midollo spinale: sostanza grigia e fasci', tint: '#dbcc9e', visibleIn: ['body'] },
  { id: 'body-respiratory', group: 'body', label: 'Apparato respiratorio', tint: '#d9999e', visibleIn: ['body'] },
  { id: 'body-digestive', group: 'body', label: 'Apparato digerente', tint: '#c2805c', visibleIn: ['body'] },
  { id: 'body-urogenital', group: 'body', label: 'Apparato urogenitale', tint: '#996180', visibleIn: ['body'] },
  { id: 'body-endocrine', group: 'body', label: 'Ghiandole endocrine e organi linfatici', tint: '#8c73b3', visibleIn: ['body'] },
  { id: 'body-sense', group: 'body', label: 'Occhio e orecchio', tint: '#8cb3cc', visibleIn: [] },
  { id: 'body-skin', group: 'body', label: 'Cute', tint: '#dbad8f', visibleIn: [] },
  { id: 'cortex', group: 'brain', label: 'Corteccia cerebrale', tint: '#d9a48f', visibleIn: ['brain'] },
  { id: 'sulci', group: 'brain', label: 'Solchi', tint: '#7c6fb0', visibleIn: [] },
  { id: 'white-matter', group: 'brain', label: 'Sostanza bianca', tint: '#e8e4d8', visibleIn: [] },
  { id: 'basal-ganglia', group: 'brain', label: 'Nuclei della base', tint: '#5b8fd6', visibleIn: [] },
  { id: 'diencephalon', group: 'brain', label: 'Diencefalo', tint: '#59a86b', visibleIn: [] },
  { id: 'limbic', group: 'brain', label: 'Sistema limbico', tint: '#d6b23e', visibleIn: [] },
  { id: 'brainstem', group: 'brain', label: 'Tronco encefalico', tint: '#b98a6a', visibleIn: ['brain'] },
  { id: 'cerebellum', group: 'brain', label: 'Cervelletto', tint: '#c98f9f', visibleIn: ['brain'] },
  { id: 'ventricles', group: 'brain', label: 'Sistema ventricolare', tint: '#4fb3c8', visibleIn: [] },
  { id: 'cranial-nerves', group: 'brain', label: 'Nervi cranici (I–XII) e via ottica', tint: '#e3c94a', visibleIn: [] },
  { id: 'vessels', group: 'brain', label: 'Arterie cerebrali', tint: '#c73a3a', visibleIn: [] },
  { id: 'meninges', group: 'brain', label: 'Meningi', tint: '#b9b3a8', visibleIn: [] },
];

export interface StructureEntry {
  id: string;
  layer: LayerId;
  names: { it: string; la: string | null; en: string; synonyms: string[] };
  meshes: ManifestMesh[];
  card: StructureCard | null;
  /** centro e raggio (metri) dell'insieme delle mesh, per l'inquadratura */
  center: [number, number, number];
  radius: number;
}
export interface Catalog {
  manifest: Manifest;
  structures: StructureEntry[];
  byId: Map<string, StructureEntry>;
  meshById: Map<string, ManifestMesh>;
  byLayer: Map<LayerId, StructureEntry[]>;
  /** centro e raggio (metri) dei due ambiti, per le inquadrature */
  scopes: Record<Scope, Bounds>;
  /** aree di Brodmann (corrispondenza approssimata) per id struttura */
  brodmann: Record<string, number[]>;
}
export type NameTable = Record<string, [string, string | null] | string>;

const ZONE: Record<string, string> = {
  v: 'verme', m: 'zona mediale dell’emisfero', l: 'zona laterale dell’emisfero',
  l1: 'zona laterale dell’emisfero (1)', l2: 'zona laterale dell’emisfero (2)',
};
/** I lobuli cerebellari dell'atlante SPL hanno id regolari: ne ricaviamo il nome. */
export function cerebellarName(id: string): string | null {
  const m = /^cerebellar-lobule-(.+)-(v|m|l|l1|l2)$/.exec(id);
  if (!m) return null;
  const lobule = m[1].toUpperCase().replace('CRUSII', 'Crus II').replace('CRUSI', 'Crus I').replace('I-II', 'I–II').replace(/-/g, ' ');
  return `Lobulo ${lobule} del cervelletto, ${ZONE[m[2]]}`;
}

export interface Bounds { center: Vec3; radius: number; halfHeight: number; halfWidth: number; min: Vec3; max: Vec3 }
type Vec3 = [number, number, number];
function bounds(meshes: ManifestMesh[]): Bounds {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let i = 0; i < 3; i++) {
    lo[i] = Math.min(lo[i], m.bbox[0][i]); hi[i] = Math.max(hi[i], m.bbox[1][i]);
  }
  const center = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2) as [number, number, number];
  return {
    center, radius: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2,
    halfHeight: (hi[1] - lo[1]) / 2, halfWidth: Math.max(hi[0] - lo[0], hi[2] - lo[2]) / 2,
    min: lo as Vec3, max: hi as Vec3,
  };
}

export function buildCatalog(manifest: Manifest, names: NameTable, cards: StructureCard[], brodmann: Record<string, number[]> = {}): Catalog {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const groups = new Map<string, ManifestMesh[]>();
  for (const m of manifest.meshes) {
    if (!groups.has(m.structure)) groups.set(m.structure, []);
    groups.get(m.structure)!.push(m);
  }
  const structures: StructureEntry[] = [];
  for (const [id, meshes] of groups) {
    const card = cardById.get(id) ?? null;
    const named = names[id];
    const en = meshes[0].labelEn.replace(/\b(left|right)\b ?/g, '').replace(/\s+/g, ' ').trim();
    const enCap = en.charAt(0).toUpperCase() + en.slice(1);
    const it = card?.names.it ?? (Array.isArray(named) ? named[0] : null) ?? cerebellarName(id) ?? enCap;
    const la = card?.names.la ?? (Array.isArray(named) ? named[1] : null);
    structures.push({
      id, layer: meshes[0].layer, meshes: [...meshes].sort((a, b) => a.side.localeCompare(b.side)), card,
      names: { it, la, en: card?.names.en ?? enCap, synonyms: card?.names.synonyms ?? [] },
      center: bounds(meshes).center, radius: bounds(meshes).radius,
    });
  }
  structures.sort((a, b) => a.names.it.localeCompare(b.names.it, 'it'));
  const byLayer = new Map<LayerId, StructureEntry[]>(LAYER_IDS.map((l) => [l, []]));
  for (const s of structures) byLayer.get(s.layer)!.push(s);
  const core = manifest.meshes.filter((m) => m.layer === 'cortex' || m.layer === 'cerebellum' || m.layer === 'brainstem');
  const skeleton = manifest.meshes.filter((m) => m.layer === 'body-skeleton');
  const brain = bounds(core.length ? core : manifest.meshes);
  return {
    manifest, structures, byLayer, brodmann,
    byId: new Map(structures.map((s) => [s.id, s])),
    meshById: new Map(manifest.meshes.map((m) => [m.id, m])),
    scopes: { brain, body: skeleton.length ? bounds(skeleton) : brain },
  };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ricerca per nome italiano, latino, inglese e sinonimi; insensibile ad accenti e maiuscole. */
export function searchStructures(catalog: Catalog, query: string, limit = 8): StructureEntry[] {
  const q = norm(query.trim());
  if (!q) return [];
  const scored: [number, StructureEntry][] = [];
  for (const s of catalog.structures) {
    let best = 0;
    const fields = [s.names.it, s.names.la ?? '', s.names.en, ...s.names.synonyms];
    fields.forEach((f, i) => {
      const n = norm(f);
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 60;
      else if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) score = 40;
      else if (n.includes(q)) score = 20;
      if (score) best = Math.max(best, score - i * 2 + (s.card ? 3 : 0) - Math.min(n.length, 60) / 20);
    });
    if (best > 0) scored.push([best, s]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, s]) => s);
}
