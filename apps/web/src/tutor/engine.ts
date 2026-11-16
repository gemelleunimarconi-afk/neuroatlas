import modulesFile from '@content/modules.json';
import { LAYERS, searchStructures, type Catalog, type StructureEntry } from '@/content/catalog';
import { PATHWAYS } from '@/content/load';
import { useAtlas, type SectionAxis, type ViewName } from '@/store/atlas';
import { openPathway } from './actions';

// ---- Tipi minimi della funzione `sample` offerta dal visualizzatore di Claude (contratto 0.2) ----
export interface SampleMessage { role: 'user' | 'assistant'; content: string }
export interface SampleTool {
  name: string; description: string;
  inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>): unknown;
}
export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void; signal?: AbortSignal; tools?: SampleTool[];
  modelTier?: 'default' | 'complex' | 'quick'; model?: string; cache?: boolean;
}
export interface SampleResult { text: string; truncated: boolean; modelTierApplied: string; modelApplied?: string }
export interface SampleFn {
  (input: string | SampleMessage[], options?: SampleOptions): Promise<SampleResult>;
  limits(): Promise<{ tools?: { maxCount: number } }>;
  json<T = unknown>(input: string | SampleMessage[], options?: SampleOptions): Promise<T>;
}
export interface SampleError { code: string; message: string; text?: string }

/** La funzione per interrogare Claude con l'account di chi guarda, oppure null fuori da Claude. */
export async function getSample(): Promise<SampleFn | null> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (!claude?.use) return null;
  try { return ((await claude.use('sample')) as SampleFn | null) ?? null; } catch { return null; }
}

export interface Module { id: string; title: string; objectives: string[]; focus: string[]; pathways: string[] }
export const MODULES = modulesFile.modules as Module[];

export type Tier = 'deep' | 'balanced' | 'quick';
export const TIERS: Record<Tier, { label: string; hint: string; options: Pick<SampleOptions, 'model' | 'modelTier'> }> = {
  deep: { label: 'Approfondito', hint: 'Il più capace, più lento', options: { model: 'claude-fable-5-2', modelTier: 'complex' } },
  balanced: { label: 'Equilibrato', hint: 'Buon compromesso', options: { modelTier: 'default' } },
  quick: { label: 'Rapido', hint: 'Risposte quasi immediate, meno profonde', options: { modelTier: 'quick' } },
};

const RULES = `Sei il tutor di neuroanatomia di NeuroAtlas, un atlante 3D interattivo usato da uno studente universitario (Medicina, Psicologia, Neuroscienze) per preparare gli esami.

REGOLE
- Rispondi sempre in italiano, a livello universitario, con il termine latino (Terminologia Anatomica) tra parentesi la prima volta che nomini una struttura.
- Metodo socratico: guida lo studente a ragionare. Di norma chiudi con UNA domanda mirata invece di dare subito tutto. Se lo studente chiede esplicitamente la risposta diretta, o ha già provato, dagliela in modo chiaro.
- Basati sui CONTENUTI VERIFICATI DELL'APP riportati nel messaggio (schede e vie) e su quelli che ottieni con gli strumenti. Quando aggiungi nozioni che non sono in quei contenuti, dichiaralo con la formula "Oltre i contenuti dell'app:".
- Le schede marcate "draft" sono bozze non ancora revisionate: se ti basi su una di esse, dillo in una riga.
- Se non sei sicuro di un dato anatomico, dillo esplicitamente. Non inventare mai connessioni, numeri, eponimi o riferimenti bibliografici.
- Le vie nervose dell'atlante sono schemi didattici, non dati di trattografia.
- Sii conciso: risposte di 80-200 parole salvo richiesta diversa. Usa elenchi brevi quando aiutano. Niente tabelle.

STRUMENTI
Puoi comandare il visualizzatore 3D. Usalo quando mostrare aiuta davvero: evidenzia la struttura di cui parli, apri la via che stai spiegando, imposta un piano di sezione per mostrare un rapporto.
- Gli id delle strutture sono in inglese con trattini (es. "hippocampus"). Se non conosci l'id esatto, cercalo prima con search_structures; non tirare a indovinare.
- Dopo aver usato uno strumento, di' in una frase che cosa lo studente sta vedendo.
- Non usare più di tre strumenti per risposta.`;

export function cardText(e: StructureEntry): string {
  const c = e.card;
  if (!c) return `[${e.id}] ${e.names.it}${e.names.la ? ` (${e.names.la})` : ''} — nessuna scheda: solo nomenclatura e modello.`;
  return [
    `[${e.id}] ${c.names.it} (${c.names.la}) — stato: ${c.review}`,
    `Posizione: ${c.location}`,
    `Rapporti: ${c.relations.map((r) => `${r.direction}: ${r.text}`).join(' ')}`,
    `Funzione: ${c.function}`,
    `Connessioni: ${c.connections.map((x) => `${x.type}${x.via ? ` (${x.via})` : ''}: ${x.text}`).join(' ')}`,
    c.bloodSupply.length ? `Vascolarizzazione: ${c.bloodSupply.map((b) => b.text).join(' ')}` : '',
    `Clinica: ${c.clinical.map((x) => `${x.title}: ${x.text}`).join(' ')}`,
  ].filter(Boolean).join('\n');
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Retrieval semplice sui contenuti dell'app: la struttura selezionata, quelle nominate nella domanda, le vie pertinenti. */
export function buildContext(catalog: Catalog, question: string, moduleId: string | null): string {
  const s = useAtlas.getState();
  const q = norm(question);
  const picked = new Map<string, StructureEntry>();
  const sel = s.selection ? catalog.byId.get(s.selection.structureId) : undefined;
  if (sel) picked.set(sel.id, sel);
  for (const e of catalog.structures) {
    if (picked.size >= 5) break;
    if (!e.card) continue;
    const names = [e.names.it, e.names.la ?? '', e.names.en, ...e.names.synonyms].map(norm).filter((n) => n.length > 3);
    if (names.some((n) => q.includes(n))) picked.set(e.id, e);
  }
  const mod = MODULES.find((m) => m.id === moduleId);
  if (mod) for (const id of mod.focus) { const e = catalog.byId.get(id); if (e?.card && picked.size < 6) picked.set(id, e); }
  const paths = PATHWAYS.filter((p) => p.id === s.pathwayId || norm(p.names.it).split(/[^a-z]+/).some((w) => w.length > 5 && q.includes(w)) || mod?.pathways.includes(p.id)).slice(0, 3);

  const visible = LAYERS.filter((l) => s.layers[l.id].visible).map((l) => l.label).join(', ');
  const side = s.selection?.meshId ? catalog.meshById.get(s.selection.meshId)?.side : null;
  const lines = [
    '--- STATO DELL\'ATLANTE (ciò che lo studente vede ora) ---',
    `Ambito: ${s.scope === 'brain' ? 'encefalo' : 'corpo intero'}`,
    `Struttura selezionata: ${sel ? `${sel.names.it} [${sel.id}]${side === 'L' ? ', lato sinistro' : side === 'R' ? ', lato destro' : ''}` : 'nessuna'}`,
    `Piano di sezione: ${s.section ? `${{ sagittal: 'sagittale', coronal: 'coronale', axial: 'assiale' }[s.section.axis]}, posizione ${s.section.position.toFixed(2)} (0-1)` : 'nessuno'}`,
    `Via mostrata: ${s.pathwayId ?? 'nessuna'}`,
    `Livelli visibili: ${visible || 'nessuno'}`,
    '',
    '--- CONTENUTI VERIFICATI DELL\'APP ---',
    picked.size ? [...picked.values()].map(cardText).join('\n\n') : 'Nessuna scheda pertinente trovata automaticamente: usa search_structures e get_structure_card se servono.',
    '',
    `Vie disponibili (id: nome): ${PATHWAYS.map((p) => `${p.id}: ${p.names.it}`).join('; ')}`,
    ...paths.map((p) => `Via [${p.id}] ${p.names.it} — ${p.summary} Tappe: ${p.tracks.map((t) => t.points.filter((x) => x.label).map((x) => x.label).join(' → ')).join(' | ')}`),
    `Schede complete disponibili (id): ${catalog.structures.filter((e) => e.card).map((e) => e.id).join(', ')}`,
  ];
  if (mod) lines.unshift(`--- PERCORSO GUIDATO IN CORSO: ${mod.title} ---`, `Obiettivi di apprendimento: ${mod.objectives.map((o, i) => `${i + 1}) ${o}`).join(' ')}`,
    'Procedi una tappa alla volta: spiega poco, mostra sul modello, poi fai una domanda di verifica prima di proseguire. Dichiara a quale obiettivo stai lavorando.', '');
  return lines.join('\n');
}

const VIEWS: ViewName[] = ['lateral-left', 'lateral-right', 'anterior', 'posterior', 'superior', 'inferior'];

/** Gli strumenti con cui il tutor comanda il visualizzatore e interroga i contenuti. `onUse` serve a mostrare l'azione nella chat. */
export function buildTools(catalog: Catalog, onUse: (text: string) => void): SampleTool[] {
  const atlas = () => useAtlas.getState();
  const entry = (id: unknown) => {
    const e = catalog.byId.get(String(id));
    if (!e) throw new Error(`Nessuna struttura con id "${String(id)}". Cerca l'id corretto con search_structures.`);
    return e;
  };
  return [
    {
      name: 'search_structures',
      description: 'Cerca strutture dell\'atlante per nome italiano, latino o inglese. Restituisce fino a 8 risultati con id, nomi, livello e se hanno una scheda completa. Usalo per trovare l\'id esatto prima di evidenziare o leggere una scheda.',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Nome o parte del nome' } }, required: ['query'] },
      execute: ({ query }) => searchStructures(catalog, String(query ?? '')).map((e) => ({ id: e.id, it: e.names.it, la: e.names.la, layer: e.layer, sides: e.meshes.map((m) => m.side).join(''), hasCard: !!e.card })),
    },
    {
      name: 'get_structure_card',
      description: 'Restituisce la scheda verificata di una struttura (posizione, rapporti, funzione, connessioni, vascolarizzazione, clinica) dato il suo id. Se la struttura non ha scheda restituisce solo i nomi.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: ({ id }) => cardText(entry(id)),
    },
    {
      name: 'highlight_structure',
      description: 'Evidenzia una struttura sul modello 3D e la inquadra. Lo studente la vede illuminata e si apre la sua scheda. Restituisce il nome mostrato.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, side: { type: 'string', enum: ['left', 'right', 'both'], description: 'Lato; predefinito both' } }, required: ['id'] },
      execute: ({ id, side }) => {
        const e = entry(id);
        const mesh = side === 'left' ? e.meshes.find((m) => m.side === 'L') : side === 'right' ? e.meshes.find((m) => m.side === 'R') : undefined;
        atlas().select(e.id, mesh?.id ?? null);
        atlas().focusSelection();
        onUse(`Evidenziato: ${e.names.it}`);
        return { shown: e.names.it, layer: e.layer };
      },
    },
    {
      name: 'set_section_plane',
      description: 'Imposta o rimuove il piano di sezione del modello. position va da 0 a 1 lungo l\'asse (0.5 = centro): sagittale da destra (0) a sinistra (1), coronale da posteriore (0) ad anteriore (1), assiale da inferiore (0) a superiore (1). Resta visibile la parte con valore minore; flip la inverte.',
      inputSchema: { type: 'object', properties: { plane: { type: 'string', enum: ['sagittal', 'coronal', 'axial', 'none'] }, position: { type: 'number' }, flip: { type: 'boolean' } }, required: ['plane'] },
      execute: ({ plane, position, flip }) => {
        if (plane === 'none') { atlas().setSection(null); onUse('Piano di sezione rimosso'); return { section: 'none' }; }
        if (!['sagittal', 'coronal', 'axial'].includes(String(plane))) throw new Error('plane deve essere sagittal, coronal, axial o none');
        const p = Math.min(1, Math.max(0, Number.isFinite(Number(position)) ? Number(position) : 0.5));
        atlas().setSection({ axis: plane as SectionAxis, position: p, flip: flip === true });
        onUse(`Sezione ${{ sagittal: 'sagittale', coronal: 'coronale', axial: 'assiale' }[plane as SectionAxis]}`);
        return { section: plane, position: p };
      },
    },
    {
      name: 'show_pathway',
      description: 'Mostra una via nervosa animata sul modello (schema didattico) dato il suo id, oppure la chiude con id "none". Gli id disponibili sono elencati nei contenuti dell\'app.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: ({ id }) => {
        if (id === 'none') { atlas().showPathway(null); onUse('Via chiusa'); return { pathway: 'none' }; }
        if (!openPathway(String(id))) throw new Error(`Nessuna via con id "${String(id)}". Id validi: ${PATHWAYS.map((p) => p.id).join(', ')}`);
        const p = PATHWAYS.find((x) => x.id === id)!;
        onUse(`Via mostrata: ${p.names.it}`);
        return { pathway: p.names.it, steps: p.tracks[0].points.filter((x) => x.label).map((x) => x.label) };
      },
    },
    {
      name: 'focus_camera',
      description: 'Sposta la camera su una vista standard dell\'ambito corrente (lateral-left, lateral-right, anterior, posterior, superior, inferior) oppure centra la struttura selezionata (selection). Con scope si passa tra encefalo (brain) e corpo intero (body).',
      inputSchema: { type: 'object', properties: { view: { type: 'string', enum: [...VIEWS, 'selection'] }, scope: { type: 'string', enum: ['brain', 'body'] } }, required: ['view'] },
      execute: ({ view, scope }) => {
        if ((scope === 'brain' || scope === 'body') && atlas().scope !== scope) atlas().setScope(scope);
        if (view === 'selection') atlas().focusSelection();
        else if (VIEWS.includes(view as ViewName)) atlas().setView(view as ViewName);
        else throw new Error(`view non valida: ${String(view)}`);
        onUse('Vista aggiornata');
        return { view };
      },
    },
  ];
}

/** Elenco dei turni da inviare: regole, cronologia recente, ultimo messaggio con lo stato dell'atlante e i contenuti pertinenti. */
export function buildInput(catalog: Catalog, history: SampleMessage[], question: string, moduleId: string | null): SampleMessage[] {
  return [
    { role: 'user', content: RULES },
    ...history.slice(-12),
    { role: 'user', content: `${buildContext(catalog, question, moduleId)}\n\n--- MESSAGGIO DELLO STUDENTE ---\n${question}` },
  ];
}

export function errorCopy(code: string): string {
  switch (code) {
    case 'not_granted': return 'Non hai autorizzato questa pagina a usare Claude. Ricarica la pagina e consenti l\'uso per attivare il tutor.';
    case 'sampling_disabled': case 'capability_disabled': case 'not_declared': case 'capability_removed':
      return 'Il tutor non è disponibile per questo account o in questa vista.';
    case 'rate_limited': return 'Hai raggiunto un limite di utilizzo di Claude. Riprova tra qualche minuto.';
    case 'session_expired': return 'La sessione è scaduta: accedi di nuovo a Claude e ricarica la pagina.';
    case 'refused': return 'Claude non ha risposto a questa richiesta. Prova a riformularla.';
    case 'prompt_too_large': return 'La conversazione è diventata troppo lunga: iniziane una nuova.';
    case 'empty_completion': return 'Nessuna risposta. Prova a riformulare la domanda.';
    default: return 'Risposta interrotta da un problema di connessione o del servizio. Puoi riprovare.';
  }
}
