import { create } from 'zustand';
import { LAYERS, type Catalog, type Scope } from '@/content/catalog';
import type { LayerId } from '@/content/schema';

export type ViewName = 'lateral-left' | 'lateral-right' | 'anterior' | 'posterior' | 'superior' | 'inferior';
export type CameraRequest =
  | { kind: 'view'; view: ViewName; seq: number }
  | { kind: 'focus'; target: [number, number, number]; radius: number; seq: number };
export interface Selection { structureId: string; meshId: string | null }
export type Theme = 'light' | 'dark';
export type SectionAxis = 'sagittal' | 'coronal' | 'axial';
/** Piano di sezione: `position` va da 0 a 1 lungo l'asse; `flip` inverte la metà mostrata. */
export interface Section { axis: SectionAxis; position: number; flip: boolean }

interface AtlasState {
  catalog: Catalog | null;
  layers: Record<LayerId, { visible: boolean; opacity: number }>;
  /** Ambito di lavoro: tutto il corpo oppure l'encefalo. Decide i livelli accesi in partenza e l'inquadratura. */
  scope: Scope;
  selection: Selection | null;
  isolated: boolean;
  cameraRequest: CameraRequest | null;
  theme: Theme;
  /** Frazione inferiore dello schermo coperta dal pannello mobile: il modello viene spostato in alto di conseguenza. */
  section: Section | null;
  /** Vista esplosa: 0 = strutture al loro posto, 1 = massima separazione. */
  explode: number;
  /** Via nervosa mostrata (id) e livelli da ripristinare alla chiusura. */
  pathwayId: string | null;
  layersBeforePathway: AtlasState['layers'] | null;
  labels: boolean;
  brodmann: boolean;
  setSection: (s: Section | null) => void;
  setExplode: (v: number) => void;
  /** Mostra una via: passa all'encefalo, accende i livelli delle sue strutture e rende trasparente la corteccia. */
  showPathway: (id: string | null, layerIds?: LayerId[]) => void;
  setLabels: (on: boolean) => void;
  setBrodmann: (on: boolean) => void;
  coveredBottom: number;
  setCoveredBottom: (f: number) => void;
  setCatalog: (c: Catalog) => void;
  setScope: (scope: Scope) => void;
  /** Seleziona una struttura. Rende visibile il suo livello se era spento. */
  select: (structureId: string, meshId?: string | null) => void;
  clearSelection: () => void;
  setLayerVisible: (id: LayerId, visible: boolean) => void;
  setLayerOpacity: (id: LayerId, opacity: number) => void;
  setIsolated: (on: boolean) => void;
  focusSelection: () => void;
  setView: (view: ViewName) => void;
  resetLayers: () => void;
  setTheme: (t: Theme) => void;
}

const defaultLayers = (scope: Scope) =>
  Object.fromEntries(LAYERS.map((l) => [l.id, { visible: l.visibleIn.includes(scope), opacity: 1 }])) as AtlasState['layers'];
const START: Scope = 'body';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('neuroatlas-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage non disponibile */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let seq = 0;

export const useAtlas = create<AtlasState>((set, get) => ({
  catalog: null,
  layers: defaultLayers(START),
  scope: START,
  selection: null,
  isolated: false,
  cameraRequest: null,
  theme: initialTheme(),
  section: null,
  explode: 0,
  pathwayId: null,
  layersBeforePathway: null,
  labels: true,
  brodmann: false,
  setSection: (section) => set({ section }),
  setExplode: (explode) => set({ explode }),
  showPathway: (id, layerIds = []) => {
    const s = get();
    if (!id) {
      set({ pathwayId: null, layers: s.layersBeforePathway ?? s.layers, layersBeforePathway: null });
      return;
    }
    const base = s.layersBeforePathway ?? (s.scope === 'brain' ? s.layers : defaultLayers('brain'));
    const layers = Object.fromEntries(LAYERS.map((l) => [l.id, { visible: false, opacity: 1 }])) as AtlasState['layers'];
    for (const l of layerIds) layers[l] = { visible: true, opacity: l === 'cortex' || l === 'cerebellum' ? 0.12 : l === 'white-matter' ? 0.25 : 0.55 };
    set({
      pathwayId: id, layers, layersBeforePathway: base, scope: 'brain', explode: 0, section: null, selection: null, isolated: false,
      cameraRequest: { kind: 'view', view: 'lateral-left', seq: ++seq },
    });
  },
  setLabels: (labels) => set({ labels }),
  setBrodmann: (brodmann) => set({ brodmann }),
  coveredBottom: 0,
  setCoveredBottom: (coveredBottom) => set({ coveredBottom }),
  setCatalog: (catalog) => set({ catalog }),
  setScope: (scope) => set({ scope, layers: defaultLayers(scope), selection: null, isolated: false, pathwayId: null, layersBeforePathway: null, section: null, explode: 0, cameraRequest: { kind: 'view', view: scope === 'body' ? 'anterior' : 'lateral-left', seq: ++seq } }),
  select: (structureId, meshId = null) => {
    const entry = get().catalog?.byId.get(structureId);
    if (!entry) return;
    // Una struttura dell'encefalo scelta mentre si guarda il corpo porta nell'ambito Encefalo, altrimenti resterebbe nascosta dal cranio.
    const toBrain = get().scope === 'body' && LAYERS.find((l) => l.id === entry.layer)!.group === 'brain';
    const layers = toBrain ? defaultLayers('brain') : get().layers;
    set({
      scope: toBrain ? 'brain' : get().scope,
      isolated: toBrain ? false : get().isolated,
      selection: { structureId, meshId },
      layers: layers[entry.layer].visible ? layers : { ...layers, [entry.layer]: { ...layers[entry.layer], visible: true } },
    });
  },
  clearSelection: () => set({ selection: null, isolated: false }),
  setLayerVisible: (id, visible) => set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], visible } } })),
  setLayerOpacity: (id, opacity) => set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], opacity } } })),
  setIsolated: (isolated) => set({ isolated }),
  focusSelection: () => {
    const { selection, catalog } = get();
    const entry = selection && catalog?.byId.get(selection.structureId);
    if (!entry) return;
    const mesh = selection.meshId ? entry.meshes.find((m) => m.id === selection.meshId) : null;
    const target = mesh ? mesh.centroid : entry.center;
    const radius = mesh
      ? Math.hypot(...[0, 1, 2].map((i) => mesh.bbox[1][i] - mesh.bbox[0][i])) / 2
      : entry.radius;
    set({ cameraRequest: { kind: 'focus', target, radius, seq: ++seq } });
  },
  setView: (view) => set({ cameraRequest: { kind: 'view', view, seq: ++seq } }),
  resetLayers: () => set({ layers: defaultLayers(get().scope), isolated: false }),
  setTheme: (theme) => {
    try { localStorage.setItem('neuroatlas-theme', theme); } catch { /* ignora */ }
    set({ theme });
  },
}));

// Accesso allo stato dalla console del browser e dai test end-to-end.
if (typeof window !== 'undefined') (window as unknown as { __neuroatlas: typeof useAtlas }).__neuroatlas = useAtlas;
