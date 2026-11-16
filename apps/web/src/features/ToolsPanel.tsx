import { useEffect, useState, type ReactNode } from 'react';
import { LAYERS } from '@/content/catalog';
import { modelUrl } from '@/viewer/modelUrl';
import { PATHWAYS } from '@/content/load';
import { useUser } from '@/db/user';
import { useAtlas, type Lod, type SectionAxis } from '@/store/atlas';
import { openPathway } from '@/tutor/actions';
import { RichText, btn, btnOn } from './util';

const AXES: [SectionAxis, string][] = [['sagittal', 'Sagittale'], ['coronal', 'Coronale'], ['axial', 'Assiale']];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {children}
    </section>
  );
}
const toggleRow = 'flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-slate-900 dark:text-slate-100';

const QUALITY: [Lod, string][] = [['lod2', 'Leggera'], ['lod1', 'Media'], ['lod0', 'Alta']];

/** Qualità dei modelli e download per l'uso senza connessione (solo dove il service worker è attivo). */
function DeviceBlock() {
  const lod = useAtlas((s) => s.lod);
  const manifest = useAtlas((s) => s.catalog)!.manifest;
  const [offline, setOffline] = useState(false);
  const [state, setState] = useState<{ done: number; total: number; error?: boolean } | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistration().then((r) => setOffline(!!r));
  }, []);
  const mb = Object.values(manifest.layers).reduce((sum, l) => sum + (l.files[lod]?.bytes ?? 0), 0) / 1048576;
  const download = async () => {
    setState({ done: 0, total: LAYERS.length });
    let done = 0, error = false;
    for (const l of LAYERS) {
      try { const r = await fetch(modelUrl(l.id, lod)); if (!r.ok) error = true; await r.arrayBuffer(); } catch { error = true; }
      setState({ done: ++done, total: LAYERS.length, error });
    }
  };
  return (
    <Block title="Dispositivo">
      <p className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Qualità dei modelli</p>
      <div role="group" aria-label="Qualità dei modelli" className="flex gap-1">
        {QUALITY.map(([id, label]) => (
          <button key={id} type="button" className={`${btn} flex-1 ${lod === id ? btnOn : ''}`} aria-pressed={lod === id}
            onClick={() => { useAtlas.getState().setLod(id); setState(null); }}>{label}</button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">Se il modello va a scatti scegli Leggera. Tutti i livelli a questa qualità: {mb.toFixed(0)} MB.</p>
      {offline ? (
        <div className="mt-3">
          <button type="button" className={`${btn} w-full`} disabled={!!state && state.done < state.total} onClick={() => void download()}>
            Scarica tutto per l'uso offline ({mb.toFixed(0)} MB)
          </button>
          {state && (
            <p role="status" className="mt-1 text-xs text-slate-800 dark:text-slate-200">
              {state.done < state.total ? `Download: ${state.done} di ${state.total} livelli…`
                : state.error ? 'Alcuni livelli non sono stati scaricati: controlla la connessione e riprova.'
                : 'Fatto: atlante, schede, quiz e note funzionano anche senza connessione. Il tutor richiede sempre internet.'}
            </p>
          )}
          {!state && <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">I livelli già aperti restano disponibili offline anche senza questo download.</p>}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">L'uso senza connessione è disponibile sul sito installabile, non dentro Claude.</p>
      )}
    </Block>
  );
}

/** Strumenti di studio: piano di sezione, vista esplosa, etichette, aree di Brodmann, vie, segnalibri. */
export function ToolsPanel() {
  const catalog = useAtlas((s) => s.catalog)!;
  const section = useAtlas((s) => s.section);
  const explode = useAtlas((s) => s.explode);
  const labels = useAtlas((s) => s.labels);
  const brodmann = useAtlas((s) => s.brodmann);
  const pathwayId = useAtlas((s) => s.pathwayId);
  const scope = useAtlas((s) => s.scope);
  const { setSection, setExplode, setLabels, setBrodmann, showPathway, select, focusSelection } = useAtlas.getState();
  const bookmarks = useUser((s) => s.bookmarks);
  const notes = useUser((s) => s.notes);
  const persistent = useUser((s) => s.persistent);
  const active = PATHWAYS.find((p) => p.id === pathwayId);

  const open = openPathway;
  const saved = [...new Set([...Object.keys(bookmarks), ...Object.keys(notes)])]
    .map((id) => catalog.byId.get(id)).filter((e) => e !== undefined)
    .sort((a, b) => a.names.it.localeCompare(b.names.it, 'it'));

  return (
    <div className="flex flex-col gap-2 p-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Strumenti</h2>

      <Block title="Piano di sezione">
        <div role="group" aria-label="Piano" className="flex flex-wrap gap-1">
          <button type="button" className={`${btn} ${!section ? btnOn : ''}`} aria-pressed={!section} onClick={() => setSection(null)}>Nessuno</button>
          {AXES.map(([axis, label]) => (
            <button key={axis} type="button" className={`${btn} ${section?.axis === axis ? btnOn : ''}`} aria-pressed={section?.axis === axis}
              onClick={() => setSection({ axis, position: 0.5, flip: false })}>{label}</button>
          ))}
        </div>
        {section && (
          <div className="mt-2 flex items-center gap-2">
            <input type="range" min={0} max={1} step={0.005} value={section.position} className="h-11 flex-1 accent-accent-500"
              aria-label="Posizione del piano di sezione"
              onChange={(e) => setSection({ ...section, position: Number(e.target.value) })} />
            <button type="button" className={btn} onClick={() => setSection({ ...section, flip: !section.flip })}>Inverti</button>
          </div>
        )}
      </Block>

      <Block title="Vista esplosa">
        <input type="range" min={0} max={1} step={0.02} value={explode} className="h-11 w-full accent-accent-500"
          aria-label="Separazione delle strutture" onChange={(e) => setExplode(Number(e.target.value))} />
      </Block>

      <Block title="Visualizzazione">
        <label className={toggleRow}>
          <input type="checkbox" className="size-5 accent-accent-500" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          Etichette sul modello
        </label>
        <label className={toggleRow}>
          <input type="checkbox" className="size-5 accent-accent-500" checked={brodmann} onChange={(e) => setBrodmann(e.target.checked)} />
          Aree di Brodmann sulla corteccia
        </label>
        {brodmann && (
          <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            Corrispondenza approssimata: ogni giro è colorato secondo la sua area prevalente. Non è una mappa citoarchitettonica; l'elenco delle aree è nella scheda di ciascun giro.
          </p>
        )}
      </Block>

      <Block title="Vie nervose">
        {scope === 'body' && !active && <p className="mb-2 text-xs text-slate-700 dark:text-slate-300">Aprendo una via si passa all'encefalo.</p>}
        <ul className="flex flex-col gap-1">
          {PATHWAYS.map((p) => (
            <li key={p.id}>
              <button type="button" aria-pressed={p.id === pathwayId} onClick={() => (p.id === pathwayId ? showPathway(null) : open(p.id))}
                className={`${btn} w-full justify-start text-left ${p.id === pathwayId ? btnOn : ''}`}>{p.names.it}</button>
            </li>
          ))}
        </ul>
        {active && (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:text-slate-200" aria-live="polite">
            <p className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-400/20 dark:text-amber-100">
              Schema didattico, non un dato di trattografia{active.review === 'draft' ? ' · bozza da rivedere' : ''}
            </p>
            <p><RichText text={active.summary} /></p>
            {active.tracks.map((t) => (
              <div key={t.label} className="mt-3">
                <p className="flex items-center gap-2 font-medium"><span aria-hidden className="h-1.5 w-6 rounded-full" style={{ background: t.color }} />{t.label}</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {t.points.filter((pt) => pt.label).map((pt, i) => (
                    <li key={i}>
                      <button type="button" className="text-left font-medium text-accent-600 underline underline-offset-2 dark:text-accent-300"
                        onClick={() => { select(pt.ref, catalog.byId.get(pt.ref)?.meshes.find((m) => m.side === pt.side)?.id ?? null); }}>{pt.label}</button>
                      {pt.note && <span>. {pt.note}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            <button type="button" className={`${btn} mt-3`} onClick={() => showPathway(null)}>Chiudi la via</button>
          </div>
        )}
      </Block>

      <DeviceBlock />

      <Block title="Segnalibri e note">
        {!persistent && <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">Questo browser non permette il salvataggio: segnalibri e note restano solo finché la pagina è aperta.</p>}
        {saved.length === 0 ? (
          <p className="text-sm text-slate-700 dark:text-slate-300">Nessun segnalibro. Aggiungili dalla scheda di una struttura.</p>
        ) : (
          <ul className="flex flex-col">
            {saved.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { select(e.id); focusSelection(); }}
                  className="w-full rounded px-2 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700">
                  <span aria-hidden>{bookmarks[e.id] ? '★ ' : '✎ '}</span>{e.names.it}
                  {notes[e.id] && <span className="block truncate text-xs text-slate-600 dark:text-slate-400">{notes[e.id].text}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
