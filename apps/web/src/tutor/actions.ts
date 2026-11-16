import { PATHWAYS } from '@/content/load';
import type { LayerId } from '@/content/schema';
import { useAtlas } from '@/store/atlas';

/** Apre una via nervosa accendendo i livelli delle strutture che attraversa. Restituisce false se l'id non esiste. */
export function openPathway(id: string): boolean {
  const { catalog, showPathway } = useAtlas.getState();
  const p = PATHWAYS.find((x) => x.id === id);
  if (!p || !catalog) return false;
  const layers = new Set<LayerId>(['cortex', 'brainstem']);
  for (const t of p.tracks) for (const pt of t.points) { const e = catalog.byId.get(pt.ref); if (e) layers.add(e.layer); }
  showPathway(id, [...layers]);
  return true;
}
