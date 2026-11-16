import casesFile from '@content/cases.json';
import { create } from 'zustand';
import { LAYERS, type Catalog, type StructureEntry } from '@/content/catalog';
import type { LayerId } from '@/content/schema';
import { db, type StudySession } from '@/db/user';
import { useAtlas } from '@/store/atlas';
import { cardText, getSample, TIERS } from '@/tutor/engine';
import { useTutor } from '@/tutor/store';
import { DAY, mastery, newItem, review, type SrsItem } from './sm2';

export interface ClinicalCase { id: string; title: string; vignette: string; question: string; answer: string[]; side?: 'L' | 'R'; explanation: string }
export const CASES = casesFile.cases as ClinicalCase[];

/** Regioni di studio: i livelli da cui si pescano le domande e quelli lasciati in trasparenza come riferimento. */
export interface Region { id: string; label: string; layers: LayerId[]; ghost: LayerId[] }
export const REGIONS: Region[] = [
  { id: 'cortex', label: 'Corteccia: giri e solchi', layers: ['cortex'], ghost: [] },
  { id: 'deep', label: 'Nuclei della base, diencefalo, sistema limbico', layers: ['basal-ganglia', 'diencephalon', 'limbic'], ghost: ['cortex'] },
  { id: 'brainstem', label: 'Tronco encefalico e nervi cranici', layers: ['brainstem', 'cranial-nerves'], ghost: ['cortex', 'cerebellum'] },
  { id: 'ventricles', label: 'Sistema ventricolare e sostanza bianca', layers: ['ventricles', 'white-matter'], ghost: ['cortex'] },
  { id: 'vessels', label: 'Arterie cerebrali', layers: ['vessels'], ghost: ['cortex', 'brainstem', 'cerebellum'] },
];
const EXCLUDED = /^(cerebellar-lobule|white-matter-of|internal-medullary-lamina)/;
export function regionOf(e: StructureEntry): Region | undefined { return REGIONS.find((r) => r.layers.includes(e.layer)); }
export function pool(catalog: Catalog, regionId: string): StructureEntry[] {
  const regions = regionId === 'all' ? REGIONS : REGIONS.filter((r) => r.id === regionId);
  return regions.flatMap((r) => r.layers.flatMap((l) => catalog.byLayer.get(l) ?? [])).filter((e) => !EXCLUDED.test(e.id));
}

export type Mode = 'identify' | 'locate' | 'latin' | 'function' | 'cases' | 'review';
export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'identify', label: 'Riconosci la struttura', hint: 'Una struttura si illumina sul modello: scegli il suo nome.' },
  { id: 'locate', label: 'Trova sul modello', hint: 'Leggi il nome e tocca la struttura sul modello.' },
  { id: 'latin', label: 'Nomi latini', hint: 'Abbina il nome italiano al termine latino.' },
  { id: 'function', label: 'Funzioni', hint: 'Riconosci la struttura dalla descrizione della sua funzione.' },
  { id: 'cases', label: 'Casi clinici', hint: 'Leggi il caso e tocca sul modello la sede della lesione.' },
  { id: 'review', label: 'Ripasso programmato', hint: 'Le strutture in scadenza secondo la ripetizione dilazionata.' },
];

export interface Question {
  kind: 'identify' | 'locate' | 'latin' | 'function' | 'case';
  structureId: string;            // struttura valutata (per la ripetizione dilazionata)
  prompt: string;
  detail?: string;
  options?: { id: string; label: string }[];
  accepted: string[];             // id accettati come risposta
  side?: 'L' | 'R';
  explanation?: string;
}
export interface Answered { correct: boolean; chosen: string | null; quality: number }

interface StudyState {
  srs: Record<string, SrsItem>;
  sessions: StudySession[];
  session: { mode: Mode; region: string; questions: Question[]; index: number; correct: number; startedAt: number; askedAt: number; answered: Answered | null; done: boolean } | null;
  open: { structureId: string; question: string; status: 'asking' | 'ready' | 'grading' | 'graded'; feedback?: string; score?: number; error?: string } | null;
  load: () => Promise<void>;
  start: (mode: Mode, region: string) => string | null;
  answer: (chosen: string) => void;
  next: () => void;
  quit: () => void;
  openQuestion: () => Promise<void>;
  gradeOpen: (text: string) => Promise<void>;
  closeOpen: () => void;
}

const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const SESSION_LENGTH = 10;

/** Prima le strutture in scadenza, poi quelle mai viste, poi le altre. */
function prioritise(entries: StructureEntry[], srs: Record<string, SrsItem>, now: number): StructureEntry[] {
  const due = entries.filter((e) => srs[e.id] && srs[e.id].due <= now).sort((a, b) => srs[a.id].due - srs[b.id].due);
  const fresh = shuffle(entries.filter((e) => !srs[e.id]));
  const rest = shuffle(entries.filter((e) => srs[e.id] && srs[e.id].due > now));
  return [...due, ...fresh, ...rest];
}
function distractors(target: StructureEntry, among: StructureEntry[], label: (e: StructureEntry) => string | null): { id: string; label: string }[] {
  const seen = new Set([label(target)]);
  const out: { id: string; label: string }[] = [];
  for (const e of shuffle(among)) {
    const l = label(e);
    if (e.id === target.id || !l || seen.has(l)) continue;
    seen.add(l); out.push({ id: e.id, label: l });
    if (out.length === 3) break;
  }
  return out;
}
const redact = (text: string, e: StructureEntry) =>
  [e.names.it, e.names.la ?? '', ...e.names.synonyms].filter((n) => n.length > 2)
    .reduce((t, n) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '▢▢▢'), text.replace(/\*+/g, ''));

export function buildQuestions(catalog: Catalog, mode: Mode, regionId: string, srs: Record<string, SrsItem>, now: number): Question[] {
  if (mode === 'cases') {
    return shuffle(CASES).slice(0, SESSION_LENGTH).map((c) => ({
      kind: 'case', structureId: c.answer[0], prompt: c.title, detail: `${c.vignette}\n\n${c.question}`, accepted: c.answer, side: c.side, explanation: c.explanation,
    }));
  }
  const all = pool(catalog, regionId);
  const make = (e: StructureEntry, kind: Question['kind']): Question | null => {
    const same = (catalog.byLayer.get(e.layer) ?? []).filter((x) => !EXCLUDED.test(x.id));
    if (kind === 'identify') {
      const o = distractors(e, same, (x) => x.names.it);
      return o.length < 3 ? null : { kind, structureId: e.id, prompt: 'Quale struttura è evidenziata?', options: shuffle([{ id: e.id, label: e.names.it }, ...o]), accepted: [e.id] };
    }
    if (kind === 'locate') return { kind, structureId: e.id, prompt: `Tocca sul modello: ${e.names.it}`, detail: e.names.la ?? undefined, accepted: [e.id] };
    if (kind === 'latin') {
      if (!e.names.la) return null;
      const o = distractors(e, same.filter((x) => x.names.la), (x) => x.names.la);
      return o.length < 3 ? null : { kind, structureId: e.id, prompt: `Qual è il termine latino di: ${e.names.it}?`, options: shuffle([{ id: e.id, label: e.names.la }, ...o]), accepted: [e.id] };
    }
    if (!e.card) return null;
    const withCard = catalog.structures.filter((x) => x.card);
    const o = distractors(e, withCard, (x) => x.names.it);
    return { kind: 'function', structureId: e.id, prompt: 'A quale struttura corrisponde questa descrizione?', detail: redact(e.card.function, e), options: shuffle([{ id: e.id, label: e.names.it }, ...o]), accepted: [e.id], explanation: e.card.function };
  };
  const source = mode === 'function' ? catalog.structures.filter((e) => e.card) : all;
  const ordered = mode === 'review' ? source.filter((e) => srs[e.id] && srs[e.id].due <= now).sort((a, b) => srs[a.id].due - srs[b.id].due) : prioritise(source, srs, now);
  const out: Question[] = [];
  for (const [i, e] of ordered.entries()) {
    const kind = mode === 'review' ? (i % 2 ? 'locate' : 'identify') : (mode as Question['kind']);
    const q = make(e, kind);
    if (q) out.push(q);
    if (out.length === SESSION_LENGTH) break;
  }
  return out;
}

/** Prepara il modello per una domanda: livelli della regione, corteccia in trasparenza, struttura evidenziata se serve. */
function stage(q: Question) {
  const atlas = useAtlas.getState();
  const catalog = atlas.catalog!;
  const entry = catalog.byId.get(q.structureId)!;
  const onModel = q.kind === 'identify' || q.kind === 'locate' || q.kind === 'case';
  if (!onModel) { useAtlas.setState({ quiz: null }); return; }
  const region = regionOf(entry) ?? REGIONS[0];
  const layers = Object.fromEntries(LAYERS.map((l) => [l.id, { visible: false, opacity: 1 }])) as typeof atlas.layers;
  for (const l of region.layers) layers[l] = { visible: true, opacity: 1 };
  for (const l of region.ghost) layers[l] = { visible: true, opacity: 0.1 };
  const identify = q.kind === 'identify';
  const mesh = identify ? entry.meshes[Math.floor(Math.random() * entry.meshes.length)] : null;
  useAtlas.setState({
    scope: 'brain', layers, isolated: false, pathwayId: null, layersBeforePathway: null, section: null, explode: 0,
    quiz: { mode: identify ? 'identify' : 'locate', reveal: false }, quizTap: null,
    selection: mesh ? { structureId: entry.id, meshId: mesh.id } : null,
  });
  if (identify) useAtlas.getState().focusSelection(); else useAtlas.getState().setView('lateral-left');
}

export const useStudy = create<StudyState>((set, get) => ({
  srs: {}, sessions: [], session: null, open: null,
  load: async () => {
    try {
      const [items, sessions] = await Promise.all([db.srs.toArray(), db.sessions.orderBy('startedAt').reverse().limit(30).toArray()]);
      set({ srs: Object.fromEntries(items.map((i) => [i.structureId, i])), sessions });
    } catch { /* senza archivio i progressi valgono solo per questa visita */ }
  },
  start: (mode, region) => {
    const catalog = useAtlas.getState().catalog;
    if (!catalog) return 'Atlante non ancora caricato.';
    const now = Date.now();
    const questions = buildQuestions(catalog, mode, region, get().srs, now);
    if (!questions.length) return mode === 'review' ? 'Nessuna struttura in scadenza: torna più tardi o fai una sessione normale.' : 'Nessuna domanda disponibile per questa scelta.';
    set({ session: { mode, region, questions, index: 0, correct: 0, startedAt: now, askedAt: now, answered: null, done: false }, open: null });
    stage(questions[0]);
    return null;
  },
  answer: (chosen) => {
    const s = get().session;
    if (!s || s.answered || s.done) return;
    const q = s.questions[s.index];
    const correct = q.accepted.includes(chosen);
    const seconds = (Date.now() - s.askedAt) / 1000;
    const quality = correct ? (seconds < 8 ? 5 : seconds < 20 ? 4 : 3) : 2;
    const now = Date.now();
    const srs = { ...get().srs, [q.structureId]: review(get().srs[q.structureId] ?? newItem(q.structureId), quality, now) };
    db.srs.put(srs[q.structureId]).catch(() => {});
    set({ srs, session: { ...s, answered: { correct, chosen, quality }, correct: s.correct + (correct ? 1 : 0) } });
    // mostra la risposta giusta sul modello, con nome e scheda
    const entry = useAtlas.getState().catalog!.byId.get(q.structureId)!;
    const mesh = q.side ? entry.meshes.find((m) => m.side === q.side) : undefined;
    const current = useAtlas.getState().selection;
    useAtlas.setState({ quiz: { mode: 'identify', reveal: true }, selection: current?.structureId === entry.id ? current : { structureId: entry.id, meshId: mesh?.id ?? null } });
    useAtlas.getState().focusSelection();
  },
  next: () => {
    const s = get().session;
    if (!s) return;
    if (s.index + 1 >= s.questions.length) {
      const record: StudySession = { mode: s.mode, region: s.region, startedAt: s.startedAt, total: s.questions.length, correct: s.correct };
      db.sessions.add(record).catch(() => {});
      set({ session: { ...s, done: true, answered: null }, sessions: [record, ...get().sessions].slice(0, 30) });
      useAtlas.setState({ quiz: null });
      return;
    }
    set({ session: { ...s, index: s.index + 1, answered: null, askedAt: Date.now() } });
    stage(s.questions[s.index + 1]);
  },
  quit: () => { set({ session: null }); useAtlas.setState({ quiz: null, quizTap: null }); },

  // ---- Domanda aperta corretta dal tutor (solo dentro Claude) ----
  openQuestion: async () => {
    const catalog = useAtlas.getState().catalog!;
    const sample = await getSample();
    if (!sample) { set({ open: { structureId: '', question: '', status: 'ready', error: 'Le domande aperte richiedono il tutor, disponibile solo dentro Claude.' } }); return; }
    const withCard = catalog.structures.filter((e) => e.card);
    const srs = get().srs;
    const entry = [...withCard].sort((a, b) => (srs[a.id]?.ease ?? 2.4) - (srs[b.id]?.ease ?? 2.4) + (Math.random() - 0.5))[0];
    set({ open: { structureId: entry.id, question: '', status: 'asking' } });
    try {
      const out = await sample.json<{ question: string }>(
        `Sei un docente di neuroanatomia. Scrivi UNA domanda aperta d'esame, in italiano, a cui si risponde in 3-6 frasi usando SOLO la scheda seguente. Deve richiedere ragionamento (rapporti, connessioni o correlazione clinica), non la semplice definizione. Rispondi solo con JSON: {"question": "..."}\n\nSCHEDA\n${cardText(entry)}`,
        { ...TIERS[useTutor.getState().tier].options, cache: false });
      set({ open: { structureId: entry.id, question: String(out.question ?? ''), status: 'ready' } });
    } catch (e) {
      set({ open: { structureId: entry.id, question: '', status: 'ready', error: `Non è stato possibile generare la domanda (${(e as { code?: string }).code ?? 'errore'}).` } });
    }
  },
  gradeOpen: async (text) => {
    const o = get().open;
    const catalog = useAtlas.getState().catalog!;
    const sample = await getSample();
    if (!o || !sample || !text.trim()) return;
    set({ open: { ...o, status: 'grading', error: undefined } });
    try {
      const out = await sample.json<{ score: number; feedback: string }>(
        `Sei un docente di neuroanatomia che corregge una risposta aperta. Valuta la risposta dello studente SOLO rispetto alla scheda. Rispondi solo con JSON: {"score": intero da 0 a 5, "feedback": "correzione motivata in italiano, 60-120 parole: che cosa è corretto, che cosa manca o è sbagliato, e la risposta attesa in sintesi"}. Punteggio: 5 completa e corretta, 3 sufficiente con lacune, 0-2 errori importanti. Se la scheda è una bozza ("draft") dillo in una frase. Non inventare nozioni assenti dalla scheda.\n\nSCHEDA\n${cardText(catalog.byId.get(o.structureId)!)}\n\nDOMANDA\n${o.question}\n\nRISPOSTA DELLO STUDENTE\n${text.slice(0, 4000)}`,
        { ...TIERS[useTutor.getState().tier].options, cache: false });
      const score = Math.max(0, Math.min(5, Math.round(Number(out.score) || 0)));
      const srs = { ...get().srs, [o.structureId]: review(get().srs[o.structureId] ?? newItem(o.structureId), score, Date.now()) };
      db.srs.put(srs[o.structureId]).catch(() => {});
      set({ srs, open: { ...o, status: 'graded', score, feedback: String(out.feedback ?? '') } });
    } catch (e) {
      set({ open: { ...o, status: 'ready', error: `Correzione non riuscita (${(e as { code?: string }).code ?? 'errore'}). Riprova.` } });
    }
  },
  closeOpen: () => set({ open: null }),
}));

/** Riepilogo per la dashboard. */
export function progress(catalog: Catalog, srs: Record<string, SrsItem>, now: number) {
  const regions = REGIONS.map((r) => {
    const entries = pool(catalog, r.id);
    const counts = { mastered: 0, learning: 0, new: 0 };
    for (const e of entries) counts[mastery(srs[e.id])]++;
    return { ...r, total: entries.length, ...counts };
  });
  const seen = Object.values(srs).filter((i) => i.seen > 0);
  const weak = seen.filter((i) => i.lapses > 0 || i.ease < 2.3).sort((a, b) => a.ease - b.ease || b.lapses - a.lapses).slice(0, 8);
  return { regions, weak, due: seen.filter((i) => i.due <= now).length, dueTomorrow: seen.filter((i) => i.due > now && i.due <= now + DAY).length, studied: seen.length };
}
