import { create } from 'zustand';
import { LAYERS, type Catalog, type Scope } from '@/content/catalog';
import type { LayerId } from '@/content/schema';

export type ViewName = 'lateral-left' | 'lateral-right' | 'anterior' | 'posterior' | 'superior' | 'inferior';
export type CameraRequest =
  | { kind: 'view'; view: ViewName; seq: number }
  | { kind: 'focus'; target: [number, number, number]; radius: number; seq: number };
export interface Selection { structureId: string; meshId: string | null }
export type Theme = 'light' | 'dark';
export type Lod = 'lod0' | 'lod1' | 'lod2';
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
  /** Livello di dettaglio dei modelli: lod2 leggero, lod1 medio, lod0 massimo. */
  lod: Lod;
  setLod: (l: Lod) => void;
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
  /** Quiz sul modello: finché `reveal` è falso nomi ed etichette restano nascosti; in `locate` il tocco è una risposta. */
  quiz: { mode: 'identify' | 'locate'; reveal: boolean } | null;
  quizTap: { structureId: string; seq: number } | null;
  /** Strutture nascoste qualunque sia il livello (nei quiz: la sostanza bianca degli emisferi, che coprirebbe quelle profonde). */
  hiddenStructures: string[];
  setQuiz: (q: AtlasState['quiz']) => void;
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

/** Scelta iniziale: quella salvata, `?lod=` nell'URL, altrimenti leggera su telefoni e dispositivi con poca memoria. */
function initialLod(): Lod {
  if (typeof window === 'undefined') return 'lod1';
  const forced = new URLSearchParams(location.search).get('lod');
  if (forced === 'lod0' || forced === 'lod1' || forced === 'lod2') return forced;
  try {
    const saved = localStorage.getItem('neuroatlas-lod');
    if (saved === 'lod0' || saved === 'lod1' || saved === 'lod2') return saved;
  } catch { /* ignora */ }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  return (mem !== undefined && mem <= 4) || phone ? 'lod2' : 'lod1';
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
  lod: initialLod(),
  setLod: (lod) => { try { localStorage.setItem('neuroatlas-lod', lod); } catch { /* ignora */ } set({ lod }); },
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
  quiz: null,
  quizTap: null,
  hiddenStructures: [],
  setQuiz: (quiz) => set({ quiz }),
  coveredBottom: 0,
  setCoveredBottom: (coveredBottom) => set({ coveredBottom }),
  setCatalog: (catalog) => set({ catalog }),
  setScope: (scope) => set({ quiz: null, hiddenStructures: [], scope, layers: defaultLayers(scope), selection: null, isolated: false, pathwayId: null, layersBeforePathway: null, section: null, explode: 0, cameraRequest: { kind: 'view', view: scope === 'body' ? 'anterior' : 'lateral-left', seq: ++seq } }),
  select: (structureId, meshId = null) => {
    const entry = get().catalog?.byId.get(structureId);
    if (!entry) return;
    const quiz = get().quiz;
    if (quiz && !quiz.reveal) {
      if (quiz.mode === 'locate') set({ quizTap: { structureId, seq: ++seq } });
      return; // durante una domanda la selezione non deve rivelare il nome
    }
    // Una struttura dell'encefalo scelta mentre si guarda il corpo porta nell'ambito Encefalo, altrimenti resterebbe nascosta dal cranio.
    // Vale anche al contrario: un organo scelto mentre si guarda l'encefalo riporta al corpo.
    const group = LAYERS.find((l) => l.id === entry.layer)!.group;
    const toBrain = group !== get().scope; // nome storico: indica un cambio di ambito
    const layers = toBrain ? defaultLayers(group) : get().layers;
    set({
      scope: group,
      isolated: toBrain ? false : get().isolated,
      pathwayId: toBrain ? null : get().pathwayId,
      layersBeforePathway: toBrain ? null : get().layersBeforePathway,
      selection: { structureId, meshId },
      layers: layers[entry.layer].visible ? layers : { ...layers, [entry.layer]: { ...layers[entry.layer], visible: true } },
    });
  },
  clearSelection: () => { if (!get().quiz) set({ selection: null, isolated: false }); },
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
