import type { ReactNode } from 'react';
import { LAYERS } from '@/content/catalog';
import { useUser } from '@/db/user';
import { useAtlas } from '@/store/atlas';
import { useTutor } from '@/tutor/store';
import { RichText, btn, btnOn } from './util';

const SIDE = { L: 'Sinistra', R: 'Destra', M: 'Mediana' } as const;
const CONN = { afferent: 'Afferenza', efferent: 'Efferenza', reciprocal: 'Reciproca' } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-3 dark:border-slate-700">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h3>
      <div className="space-y-2 text-[0.95rem] leading-relaxed text-slate-800 dark:text-slate-200">{children}</div>
    </section>
  );
}

/** Rimando a un'altra struttura: la seleziona e la inquadra. */
function Ref({ id }: { id?: string }) {
  const entry = useAtlas((s) => (id ? s.catalog!.byId.get(id) : undefined));
  if (!entry) return null;
  return (
    <button type="button" className="ml-1 text-sm font-medium text-accent-600 underline underline-offset-2 dark:text-accent-300"
      onClick={() => { useAtlas.getState().select(entry.id); useAtlas.getState().focusSelection(); }}
      aria-label={`Mostra ${entry.names.it}`}>
      mostra
    </button>
  );
}

export function StructureCard() {
  const catalog = useAtlas((s) => s.catalog)!;
  const selection = useAtlas((s) => s.selection);
  const isolated = useAtlas((s) => s.isolated);
  const { select, focusSelection, setIsolated, clearSelection } = useAtlas.getState();
  const entry = selection ? catalog.byId.get(selection.structureId) : undefined;
  const bookmarked = useUser((s) => (entry ? !!s.bookmarks[entry.id] : false));
  const note = useUser((s) => (entry ? s.notes[entry.id]?.text ?? '' : ''));

  if (!entry) {
    return (
      <div className="p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <p className="font-medium text-slate-900 dark:text-slate-100">Nessuna struttura selezionata</p>
        <p className="mt-1">Tocca una struttura sul modello, cercala per nome oppure aprila dall'elenco dei livelli. Con i pulsanti Corpo ed Encefalo passi dal corpo intero all'encefalo in dettaglio.</p>
      </div>
    );
  }
  const card = entry.card;
  const layer = LAYERS.find((l) => l.id === entry.layer)!;
  const sources = [...new Set(entry.meshes.map((m) => m.source))].map((k) => catalog.manifest.sources[k]);

  return (
    <article className="px-4 pb-6" aria-labelledby="card-title">
      <header className="pb-3 pt-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{layer.label}</p>
            <h2 id="card-title" className="text-xl font-semibold leading-tight text-slate-900 dark:text-white">{entry.names.it}</h2>
            {entry.names.la && <p className="italic text-slate-700 dark:text-slate-300" lang="la">{entry.names.la}</p>}
            <p className="text-sm text-slate-600 dark:text-slate-400" lang="en">{entry.names.en}</p>
          </div>
          <button type="button" onClick={clearSelection} aria-label="Chiudi scheda" className={`${btn} size-11 shrink-0 px-0!`}>✕</button>
        </div>
        {entry.names.synonyms.length > 0 && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Sinonimi: {entry.names.synonyms.join(', ')}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.meshes.length > 1 && (
            <div role="group" aria-label="Lato" className="flex gap-1">
              <button type="button" className={`${btn} ${!selection!.meshId ? btnOn : ''}`} aria-pressed={!selection!.meshId}
                onClick={() => { select(entry.id, null); focusSelection(); }}>Tutte</button>
              {entry.meshes.map((m) => (
                <button key={m.id} type="button" className={`${btn} ${selection!.meshId === m.id ? btnOn : ''}`}
                  aria-pressed={selection!.meshId === m.id}
                  onClick={() => { select(entry.id, m.id); focusSelection(); }}>{SIDE[m.side]}</button>
              ))}
            </div>
          )}
          <button type="button" className={btn} onClick={focusSelection}>Centra</button>
          <button type="button" className={`${btn} ${bookmarked ? btnOn : ''}`} aria-pressed={bookmarked}
            onClick={() => useUser.getState().toggleBookmark(entry.id)}>{bookmarked ? '★ Salvata' : '☆ Segnalibro'}</button>
          <button type="button" className={btn}
            onClick={() => useTutor.getState().ask(`Spiegami ${entry.names.it}: dove si trova, che cosa fa e perché è importante in clinica.`)}>Chiedi al tutor</button>
          <button type="button" className={`${btn} ${isolated ? btnOn : ''}`} aria-pressed={isolated} onClick={() => setIsolated(!isolated)}>
            {isolated ? 'Mostra tutto' : 'Isola'}
          </button>
        </div>
      </header>

      {card ? (
        <>
          {card.review === 'draft' && (
            <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100">
              Bozza non ancora revisionata: verifica i contenuti sui testi di riferimento.
            </p>
          )}
          <Section title="Posizione"><p><RichText text={card.location} /></p></Section>
          {card.relations.length > 0 && (
            <Section title="Rapporti">
              <ul className="space-y-1.5">
                {card.relations.map((r, i) => (
                  <li key={i}><span className="font-medium">{r.direction.charAt(0).toUpperCase() + r.direction.slice(1)}:</span> <RichText text={r.text} /><Ref id={r.structureId} /></li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={card.layer === 'vessels' ? 'Territorio e ruolo' : 'Funzione'}><p><RichText text={card.function} /></p></Section>
          {card.connections.length > 0 && (
            <Section title={card.layer === 'vessels' ? 'Rami' : 'Connessioni'}>
              <ul className="space-y-1.5">
                {card.connections.map((c, i) => (
                  <li key={i}>
                    {card.layer !== 'vessels' && <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">{CONN[c.type]}</span>}
                    {c.via && <span className="font-medium">{c.via.charAt(0).toUpperCase() + c.via.slice(1)}. </span>}
                    <RichText text={c.text} /><Ref id={c.targetId} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {card.bloodSupply.length > 0 && (
            <Section title="Vascolarizzazione">
              <ul className="space-y-1.5">{card.bloodSupply.map((b, i) => <li key={i}><RichText text={b.text} /><Ref id={b.arteryId} /></li>)}</ul>
            </Section>
          )}
          {card.clinical.length > 0 && (
            <Section title="Correlati clinici">
              <dl className="space-y-2">
                {card.clinical.map((c, i) => (<div key={i}><dt className="font-medium">{c.title}</dt><dd><RichText text={c.text} /></dd></div>))}
              </dl>
            </Section>
          )}
        </>
      ) : (
        <Section title="Scheda">
          <p>La scheda completa di questa struttura è in preparazione. Per ora sono disponibili il modello 3D e la nomenclatura.</p>
        </Section>
      )}

      {catalog.brodmann[entry.id] && (
        <Section title="Aree di Brodmann">
          <p>{catalog.brodmann[entry.id].join(', ')} <span className="text-sm text-slate-600 dark:text-slate-400">(corrispondenza approssimata con il giro)</span></p>
        </Section>
      )}

      <Section title="Le mie note">
        <textarea id={`note-${entry.id}`} key={entry.id} defaultValue={note} rows={3} aria-label={`Note personali su ${entry.names.it}`}
          placeholder="Scrivi qui i tuoi appunti: si salvano da soli su questo dispositivo."
          onChange={(e) => useUser.getState().setNote(entry.id, e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-base text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400" />
      </Section>

      <Section title="Modello 3D">
        {sources.map((s) => (
          <p key={s.name} className="text-sm">
            {s.name}, licenza <a className="underline" href={s.licenseUrl} target="_blank" rel="noreferrer">{s.license}</a>.
          </p>
        ))}
      </Section>
    </article>
  );
}
