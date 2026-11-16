import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { MODULES, TIERS, type Tier } from '@/tutor/engine';
import { useTutor } from '@/tutor/store';
import { useAtlas } from '@/store/atlas';
import { RichText, btn, btnOn } from './util';

/** Markdown essenziale per le risposte del tutor: paragrafi, elenchi, titoletti, grassetto e corsivo. */
function Markdown({ text }: { text: string }): ReactNode {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}><RichText text={it} /></li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol>
      : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line), numbered = /^\d+[.)]\s+(.*)$/.exec(line), heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    blocks.push(heading
      ? <p key={blocks.length} className="font-semibold"><RichText text={heading[1]} /></p>
      : <p key={blocks.length}><RichText text={line} /></p>);
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}

const SUGGESTIONS = [
  'Spiegami la struttura selezionata e fammi una domanda per verificare se ho capito.',
  'Mostrami la via piramidale e chiedimi dove incrocia.',
  'Quali strutture irrora l\'arteria cerebrale media? Fammi ragionare.',
];

export function TutorPanel() {
  const available = useTutor((s) => s.available);
  const messages = useTutor((s) => s.messages);
  const busy = useTutor((s) => s.busy);
  const tier = useTutor((s) => s.tier);
  const moduleId = useTutor((s) => s.moduleId);
  const draft = useTutor((s) => s.draft);
  const selected = useAtlas((s) => (s.selection ? s.catalog!.byId.get(s.selection.structureId) : undefined));
  const { init, send, stop, reset, setTier, setDraft, startModule } = useTutor.getState();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  if (available === 'checking') return <p role="status" className="p-4 text-sm text-slate-700 dark:text-slate-300">Collegamento al tutor…</p>;
  if (available === 'no') {
    return (
      <div className="space-y-2 p-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
        <p className="font-semibold text-slate-900 dark:text-white">Il tutor non è disponibile qui</p>
        <p>Il tutor usa il tuo account Claude e funziona solo quando apri NeuroAtlas dentro Claude (sito o app), dopo aver consentito alla pagina di usare Claude.</p>
        <p>Atlante, schede, sezioni, vie e note funzionano comunque.</p>
      </div>
    );
  }
  const mod = MODULES.find((m) => m.id === moduleId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          Modalità
          <select value={tier} onChange={(e) => setTier(e.target.value as Tier)} disabled={busy} id="tutor-tier"
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            {(Object.keys(TIERS) as Tier[]).map((t) => <option key={t} value={t} title={TIERS[t].hint}>{TIERS[t].label}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <span className="sr-only">Percorso guidato</span>
          <select value={moduleId ?? ''} disabled={busy} id="tutor-module" aria-label="Percorso guidato"
            onChange={(e) => (e.target.value ? startModule(e.target.value) : reset())}
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            <option value="">Domande libere</option>
            {MODULES.map((m) => <option key={m.id} value={m.id}>Percorso {m.title}</option>)}
          </select>
        </label>
        <button type="button" className={`${btn} min-h-9! px-2! text-xs!`} onClick={reset} disabled={messages.length === 0}>Nuova</button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {mod && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <p className="font-semibold text-slate-900 dark:text-white">{mod.title}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Obiettivi di apprendimento</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{mod.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
        )}
        {messages.length === 0 && !mod && (
          <div className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
            <p>Chiedi al tutor di spiegare, mostrare sul modello o interrogarti. Conosce la struttura selezionata, il piano di sezione e la via mostrata, e usa il tuo account Claude.</p>
            <ul className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <li key={s}><button type="button" className={`${btn} w-full justify-start py-2 text-left`} onClick={() => void send(s)}>{s}</button></li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[92%] space-y-2 rounded-2xl px-3 py-2 text-[0.95rem] leading-relaxed ${m.role === 'user'
              ? 'bg-accent-600 text-white dark:bg-accent-300 dark:text-slate-900'
              : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'}`}>
              {m.actions && m.actions.length > 0 && (
                <ul className="space-y-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {m.actions.map((a, i) => <li key={i}>▸ {a}</li>)}
                </ul>
              )}
              {m.content ? (m.role === 'user' ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown text={m.content} />)
                : m.pending ? <p className="text-slate-600 dark:text-slate-300">Sto pensando…</p> : null}
              {m.model && <p className="text-xs text-slate-600 dark:text-slate-400">Ha risposto: {m.model}</p>}
              {m.note && <p className="text-xs text-slate-600 dark:text-slate-400">{m.note}</p>}
              {m.error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{m.error}</p>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <form className="flex items-end gap-2 border-t border-slate-200 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-700"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <textarea id="tutor-input" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
          aria-label="Messaggio per il tutor"
          placeholder={selected ? `Chiedi qualcosa su: ${selected.names.it}` : 'Scrivi una domanda…'}
          className="min-h-11 flex-1 resize-none rounded-lg border border-slate-300 bg-white p-2 text-base text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400" />
        {busy
          ? <button type="button" className={btn} onClick={stop}>Ferma</button>
          : <button type="submit" className={`${btn} ${btnOn}`} disabled={!draft.trim()}>Invia</button>}
      </form>
    </div>
  );
}
