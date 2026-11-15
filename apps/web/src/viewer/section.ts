import * as THREE from 'three';
import type { Bounds, Catalog } from '@/content/catalog';
import type { LayerId, ManifestMesh, PathwayPoint } from '@/content/schema';
import type { Section } from '@/store/atlas';
import { LAYERS } from '@/content/catalog';

/** Piano di taglio condiviso da tutti i materiali: aggiornarlo non richiede di ricompilare gli shader. */
export const sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

// Assi del modello: X = sinistra, Y = alto, Z = avanti.
const AXIS = { sagittal: 0, axial: 1, coronal: 2 } as const;

export function updateSectionPlane(section: Section, bounds: Bounds): void {
  const i = AXIS[section.axis];
  const pad = (bounds.max[i] - bounds.min[i]) * 0.02;
  const c = bounds.min[i] - pad + section.position * (bounds.max[i] - bounds.min[i] + 2 * pad);
  const n = [0, 0, 0];
  n[i] = section.flip ? 1 : -1; // di base resta visibile la parte con coordinata minore
  sectionPlane.normal.set(n[0], n[1], n[2]);
  sectionPlane.constant = section.flip ? -c : c;
}

const layerGroup = Object.fromEntries(LAYERS.map((l) => [l.id, l.group])) as Record<LayerId, 'body' | 'brain'>;

/** Spostamento di una mesh nella vista esplosa: si allontana dal centro del proprio ambito. */
export function explodeOffset(mesh: ManifestMesh, catalog: Catalog, explode: number, out = new THREE.Vector3()): THREE.Vector3 {
  if (explode <= 0) return out.set(0, 0, 0);
  const c = catalog.scopes[layerGroup[mesh.layer]].center;
  return out.set(mesh.centroid[0] - c[0], mesh.centroid[1] - c[1], mesh.centroid[2] - c[2]).multiplyScalar(explode * 0.7);
}

/** Posizione nello spazio di un punto di una via. */
export function resolvePathwayPoint(p: PathwayPoint, catalog: Catalog): THREE.Vector3 | null {
  const mesh = catalog.byId.get(p.ref)?.meshes.find((m) => m.side === p.side);
  if (!mesh) return null;
  const v = new THREE.Vector3(...mesh.centroid);
  if (p.at === 'bottom') v.y = mesh.bbox[0][1];
  if (p.at === 'top') v.y = mesh.bbox[1][1];
  if (p.shift) v.add(new THREE.Vector3(p.shift[0], p.shift[1], p.shift[2]).multiplyScalar(0.001));
  return v;
}
