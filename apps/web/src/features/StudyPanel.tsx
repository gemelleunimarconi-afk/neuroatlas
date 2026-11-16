import { useEffect, useMemo, useState } from 'react';
import { useAtlas } from '@/store/atlas';
import { MODES, REGIONS, progress, useStudy, type Mode } from '@/study/store';
import { useTutor } from '@/tutor/store';
import { RichText, btn, btnOn } from './util';

const fmtDate = (t: number) => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const modeLabel = (id: string) => MODES.find((m) => m.id === id)?.label ?? id;
const regionLabel = (id: string) => (id === 'all' ? 'Tutto l\'encefalo' : REGIONS.find((r) => r.id === id)?.label ?? id);
const box = 'rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60';
const h3 = 'mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100';

function Session() {
  const s = useStudy((x) => x.session)!;
  const { answer, next, quit } = useStudy.getState();
  const tap = useAtlas((x) => x.quizTap);
  const catalog = useAtlas((x) => x.catalog)!;
  const q = s.questions[s.index];

  // In "trova sul modello" e nei casi clinici la risposta è il tocco sul modello.
  useEffect(() => { if (tap && !s.answered && !s.done && !q.options) answer(tap.structureId); }, [tap]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.done) {
    return (
      <div className="space-y-3 p-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sessione conclusa</h2>
        <p className="text-slate-800 dark:text-slate-200">Risposte corrette: <strong>{s.correct} su {s.questions.length}</strong>.</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">Le strutture sbagliate torneranno domani nel ripasso programmato; quelle giuste, a intervalli sempre più lunghi.</p>
        <button type="button" className={`${btn} ${btnOn}`} onClick={quit}>Torna ai progressi</button>
      </div>
    );
  }
  const a = s.answered;
  const chosenName = a?.chosen ? catalog.byId.get(a.chosen)?.names.it : null;
  const target = catalog.byId.get(q.structureId)!;
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {modeLabel(s.mode)} · domanda {s.index + 1} di {s.questions.length}
        </p>
        <button type="button" className={`${btn} min-h-9! px-2! text-xs!`} onClick={quit}>Esci</button>
      </div>
      <progress className="h-1.5 w-full accent-accent-500" value={s.index + (a ? 1 : 0)} max={s.questions.length} aria-label="Avanzamento" />
      <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">{q.prompt}</h2>
      {q.detail && <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-slate-800 dark:text-slate-200">{q.kind === 'locate' ? <em lang="la">{q.detail}</em> : q.detail}</p>}

      {q.options ? (
        <ul className="space-y-1.5">
          {q.options.map((o) => {
            const right = a && q.accepted.includes(o.id), wrong = a && a.chosen === o.id && !right;
            return (
              <li key={o.id}>
                <button type="button" disabled={!!a} onClick={() => answer(o.id)}
                  className={`${btn} w-full justify-start py-2 text-left disabled:opacity-100 ${right ? 'border-emerald-600! bg-emerald-50! text-emerald-900! dark:bg-emerald-500/20! dark:text-emerald-100!' : ''} ${wrong ? 'border-red-600! bg-red-50! text-red-900! dark:bg-red-500/20! dark:text-red-100!' : ''}`}>
                  {right && <span aria-hidden>✓ </span>}{wrong && <span aria-hidden>✗ </span>}
                  <span lang={q.kind === 'latin' ? 'la' : undefined} className={q.kind === 'latin' ? 'italic' : ''}>{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : !a && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">Tocca la struttura sul modello. Puoi ruotare e ingrandire; le strutture in trasparenza non contano.</p>
      )}

      {a && (
        <div role="status" className={`rounded-lg border px-3 py-2 text-[0.95rem] leading-relaxed ${a.correct ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-50' : 'border-red-600 bg-red-50 text-red-950 dark:bg-red-500/15 dark:text-red-50'}`}>
          <p className="font-semibold">{a.correct ? 'Corretto' : 'Non corretto'}</p>
          {!a.correct && !q.options && chosenName && <p>Hai toccato: {chosenName}.</p>}
          <p>La risposta è <strong>{target.names.it}</strong>{target.names.la ? <> (<em lang="la">{target.names.la}</em>)</> : null}, ora evidenziata sul modello.</p>
          {q.explanation && <p className="mt-1"><RichText text={q.explanation} /></p>}
        </div>
      )}
      {a && <button type="button" className={`${btn} ${btnOn} w-full`} onClick={next}>{s.index + 1 >= s.questions.length ? 'Concludi' : 'Prossima domanda'}</button>}
    </div>
  );
}

function OpenQuestion() {
  const o = useStudy((x) => x.open)!;
  const catalog = useAtlas((x) => x.catalog)!;
  const { gradeOpen, closeOpen, openQuestion } = useStudy.getState();
  const [text, setText] = useState('');
  const entry = catalog.byId.get(o.structureId);
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Domanda aperta{entry ? ` · ${entry.names.it}` : ''}</p>
        <button type="button" className={`${btn} min-h-9! px-2! text-xs!`} onClick={closeOpen}>Esci</button>
      </div>
      {o.status === 'asking' && <p role="status" className="text-slate-700 dark:text-slate-300">Il tutor sta preparando la domanda…</p>}
      {o.question && <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">{o.question}</h2>}
      {o.error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{o.error}</p>}
      {o.question && o.status !== 'graded' && (
        <>
          <textarea id="open-answer" rows={6} value={text} onChange={(e) => setText(e.target.value)} disabled={o.status === 'grading'} aria-label="La tua risposta"
            placeholder="Scrivi la tua risposta in 3-6 frasi."
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-base text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
          <button type="button" className={`${btn} ${btnOn} w-full`} disabled={!text.trim() || o.status === 'grading'} onClick={() => void gradeOpen(text)}>
            {o.status === 'grading' ? 'Correzione in corso…' : 'Fatti correggere'}
          </button>
        </>
      )}
      {o.status === 'graded' && (
        <div role="status" className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-[0.95rem] leading-relaxed text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          <p className="font-semibold">Punteggio: {o.score} su 5</p>
          <p><RichText text={o.feedback ?? ''} /></p>
          <button type="button" className={`${btn} ${btnOn}`} onClick={() => { setText(''); void openQuestion(); }}>Un'altra domanda</button>
        </div>
      )}
    </div>
  );
}

/** Studio: quiz sul modello, casi clinici, ripasso programmato e progressi. */
export function StudyPanel() {
  const catalog = useAtlas((s) => s.catalog)!;
  const session = useStudy((s) => s.session);
  const open = useStudy((s) => s.open);
  const srs = useStudy((s) => s.srs);
  const sessions = useStudy((s) => s.sessions);
  const tutor = useTutor((s) => s.available);
  const [mode, setMode] = useState<Mode>('identify');
  const [region, setRegion] = useState('cortex');
  const [message, setMessage] = useState<string | null>(null);
  const stats = useMemo(() => progress(catalog, srs, Date.now()), [catalog, srs]);

  useEffect(() => { useTutor.getState().init(); }, []);
  if (session) return <Session />;
  if (open) return <OpenQuestion />;
  const needsRegion = mode === 'identify' || mode === 'locate' || mode === 'latin';

  return (
    <div className="flex flex-col gap-2 p-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Studio</h2>

      <section className={box}>
        <h3 className={h3}>Nuova sessione</h3>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="study-mode">Tipo di esercizio</label>
        <select id="study-mode" value={mode} onChange={(e) => { setMode(e.target.value as Mode); setMessage(null); }}
          className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}{m.id === 'review' ? ` (${stats.due})` : ''}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{MODES.find((m) => m.id === mode)!.hint}</p>
        {needsRegion && (
          <>
            <label className="mt-2 block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="study-region">Regione</label>
            <select id="study-region" value={region} onChange={(e) => setRegion(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              <option value="all">Tutto l'encefalo</option>
            </select>
          </>
        )}
        <button type="button" className={`${btn} ${btnOn} mt-3 w-full`} onClick={() => setMessage(useStudy.getState().start(mode, needsRegion ? region : 'all'))}>Inizia</button>
        {message && <p role="status" className="mt-2 text-sm text-slate-800 dark:text-slate-200">{message}</p>}
        <button type="button" className={`${btn} mt-2 w-full`} disabled={tutor !== 'yes'} onClick={() => void useStudy.getState().openQuestion()}>Domanda aperta corretta dal tutor</button>
        {tutor === 'no' && <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">Le domande aperte richiedono il tutor, disponibile solo dentro Claude.</p>}
      </section>

      <section className={box} aria-label="Progressi">
        <h3 className={h3}>Progressi</h3>
        <p className="text-sm text-slate-800 dark:text-slate-200">
          Strutture studiate: <strong>{stats.studied}</strong> · da ripassare oggi: <strong>{stats.due}</strong> · entro domani: <strong>{stats.dueTomorrow}</strong>
        </p>
        <ul className="mt-2 space-y-2">
          {stats.regions.map((r) => (
            <li key={r.id}>
              <div className="flex justify-between gap-2 text-sm text-slate-900 dark:text-slate-100">
                <span>{r.label}</span><span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-300">{r.mastered} / {r.total}</span>
              </div>
              <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="img"
                aria-label={`${r.label}: ${r.mastered} padroneggiate, ${r.learning} in apprendimento, ${r.new} nuove`}>
                <div className="bg-emerald-600" style={{ width: `${(r.mastered / r.total) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(r.learning / r.total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-700 dark:text-slate-300">
          <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-emerald-600" />padroneggiate</span>
          <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-amber-500" />in apprendimento</span>
          <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-slate-300 dark:bg-slate-600" />nuove</span>
        </p>
      </section>

      <section className={box}>
        <h3 className={h3}>Punti deboli</h3>
        {stats.weak.length === 0 ? <p className="text-sm text-slate-700 dark:text-slate-300">Ancora nessuno: compariranno qui le strutture che sbagli.</p> : (
          <ul>
            {stats.weak.map((w) => {
              const e = catalog.byId.get(w.structureId);
              return e && (
                <li key={w.structureId}>
                  <button type="button" onClick={() => { useAtlas.getState().select(e.id); useAtlas.getState().focusSelection(); }}
                    className="flex w-full justify-between gap-2 rounded px-2 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700">
                    <span>{e.names.it}</span><span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-300">{w.correct}/{w.seen} corrette</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={box}>
        <h3 className={h3}>Storico delle sessioni</h3>
        {sessions.length === 0 ? <p className="text-sm text-slate-700 dark:text-slate-300">Nessuna sessione conclusa.</p> : (
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
            {sessions.slice(0, 10).map((s, i) => (
              <li key={s.id ?? i} className="flex justify-between gap-2 py-1.5 text-slate-900 dark:text-slate-100">
                <span><span className="block">{modeLabel(s.mode)}</span><span className="text-xs text-slate-700 dark:text-slate-300">{fmtDate(s.startedAt)} · {regionLabel(s.region)}</span></span>
                <span className="shrink-0 font-semibold tabular-nums">{s.correct}/{s.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
