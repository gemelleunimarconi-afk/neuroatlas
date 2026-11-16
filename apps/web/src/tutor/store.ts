import { create } from 'zustand';
import { useAtlas } from '@/store/atlas';
import { MODULES, TIERS, buildInput, buildTools, errorCopy, getSample, type SampleError, type SampleFn, type SampleMessage, type Tier } from './engine';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** azioni eseguite sul visualizzatore durante questa risposta */
  actions?: string[];
  pending?: boolean;
  error?: string;
  note?: string;
}

interface TutorState {
  available: 'checking' | 'yes' | 'no';
  messages: ChatMessage[];
  busy: boolean;
  tier: Tier;
  moduleId: string | null;
  /** testo proposto nel campo di scrittura (es. da "Chiedi al tutor" nella scheda) */
  draft: string;
  /** cresce ogni volta che un'altra parte dell'app chiede di aprire il pannello del tutor */
  openRequest: number;
  ask: (draft: string) => void;
  init: () => void;
  setTier: (t: Tier) => void;
  setDraft: (s: string) => void;
  send: (text: string) => Promise<void>;
  startModule: (id: string) => void;
  stop: () => void;
  reset: () => void;
}

const KEY = 'neuroatlas-tutor-v1';
let sample: SampleFn | null = null;
let controller: AbortController | null = null;
let nextId = 1;

function restore(): Pick<TutorState, 'messages' | 'tier' | 'moduleId'> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { messages: ChatMessage[]; tier: Tier; moduleId: string | null } | null;
    if (raw && Array.isArray(raw.messages)) {
      const messages = raw.messages.filter((m) => !m.pending).map((m) => ({ ...m, id: nextId++ }));
      return { messages, tier: raw.tier in TIERS ? raw.tier : 'deep', moduleId: raw.moduleId ?? null };
    }
  } catch { /* nessuna conversazione salvata */ }
  return { messages: [], tier: 'deep', moduleId: null };
}
function persist(s: TutorState) {
  try { localStorage.setItem(KEY, JSON.stringify({ messages: s.messages.slice(-40), tier: s.tier, moduleId: s.moduleId })); } catch { /* ignora */ }
}

export const useTutor = create<TutorState>((set, get) => {
  const patch = (id: number, p: Partial<ChatMessage>) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
  return {
    available: 'checking',
    ...restore(),
    busy: false,
    draft: '',
    openRequest: 0,
    ask: (draft) => set((s) => ({ draft, openRequest: s.openRequest + 1 })),
    init: () => {
      if (get().available !== 'checking') return;
      void getSample().then((fn) => { sample = fn; set({ available: fn ? 'yes' : 'no' }); });
    },
    setTier: (tier) => { set({ tier }); persist(get()); },
    setDraft: (draft) => set({ draft }),
    startModule: (id) => {
      const mod = MODULES.find((m) => m.id === id);
      if (!mod) return;
      set({ moduleId: id, messages: [] });
      void get().send(`Iniziamo il percorso guidato "${mod.title}". Presentami gli obiettivi e parti dalla prima tappa.`);
    },
    stop: () => controller?.abort(),
    reset: () => { controller?.abort(); set({ messages: [], moduleId: null, busy: false }); persist(get()); },
    send: async (text) => {
      const catalog = useAtlas.getState().catalog;
      const question = text.trim();
      if (!question || get().busy || !sample || !catalog) return;
      const history: SampleMessage[] = get().messages.filter((m) => m.content && !m.error).map((m) => ({ role: m.role, content: m.content }));
      const user: ChatMessage = { id: nextId++, role: 'user', content: question };
      const reply: ChatMessage = { id: nextId++, role: 'assistant', content: '', pending: true, actions: [] };
      set((s) => ({ messages: [...s.messages, user, reply], busy: true, draft: '' }));
      controller = new AbortController();
      const actions: string[] = [];
      try {
        const limits = await sample.limits().catch(() => null);
        const tools = limits?.tools ? buildTools(catalog, (a) => { actions.push(a); patch(reply.id, { actions: [...actions] }); }) : undefined;
        const tier = TIERS[get().tier];
        const result = await sample(buildInput(catalog, history, question, get().moduleId), {
          ...tier.options, cache: false, signal: controller.signal, tools,
          onText: ({ text: t }) => patch(reply.id, { content: t }),
        });
        const notes: string[] = [];
        if (result.truncated) notes.push('Risposta interrotta per lunghezza: chiedi di continuare.');
        if (tier.options.model && !result.modelApplied) notes.push('Ha risposto un modello diverso da quello richiesto, il più vicino disponibile per il tuo account.');
        if (!tools) notes.push('In questa vista il tutor non può comandare il modello 3D.');
        patch(reply.id, { content: result.text, pending: false, note: notes.join(' ') || undefined });
      } catch (err) {
        const e = err as SampleError;
        if (e.code === 'cancelled') patch(reply.id, { content: e.text ?? '', pending: false, note: 'Risposta fermata.' });
        else {
          patch(reply.id, { content: e.code === 'refused' ? '' : e.text ?? '', pending: false, error: errorCopy(e.code) });
          if (['not_granted', 'sampling_disabled', 'capability_disabled', 'not_declared', 'capability_removed'].includes(e.code)) set({ available: 'no' });
        }
      } finally {
        controller = null;
        set((s) => ({ busy: false, messages: s.messages.filter((m) => m.id !== reply.id || m.content || m.error || m.note) }));
        persist(get());
      }
    },
  };
});
