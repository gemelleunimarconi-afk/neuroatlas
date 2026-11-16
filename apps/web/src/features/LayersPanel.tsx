import { LAYERS } from '@/content/catalog';
import { useAtlas } from '@/store/atlas';

/** Livelli anatomici: visibilità, trasparenza ed elenco delle strutture (alternativa da tastiera al tocco sul modello). */
export function LayersPanel() {
  const catalog = useAtlas((s) => s.catalog)!;
  const layers = useAtlas((s) => s.layers);
  // durante una domanda l'elenco non deve rivelare la struttura evidenziata
  const selection = useAtlas((s) => (s.quiz && !s.quiz.reveal ? null : s.selection));
  const { setLayerVisible, setLayerOpacity, select, focusSelection, resetLayers } = useAtlas.getState();

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Livelli</h2>
        <button type="button" onClick={resetLayers} className="min-h-11 rounded px-2 text-sm font-medium text-accent-600 hover:underline dark:text-accent-300">Ripristina</button>
      </div>
      {(['body', 'brain'] as const).map((group) => (
      <section key={group} aria-label={group === 'body' ? 'Corpo' : 'Encefalo'}>
      <h3 className="mb-1.5 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group === 'body' ? 'Corpo' : 'Encefalo'}</h3>
      <ul className="flex flex-col gap-1.5">
        {LAYERS.filter((l) => l.group === group).map((l) => {
          const state = layers[l.id];
          const items = catalog.byLayer.get(l.id) ?? [];
          return (
            <li key={l.id} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3">
                <input type="checkbox" className="size-5 accent-accent-500" checked={state.visible}
                  onChange={(e) => setLayerVisible(l.id, e.target.checked)} />
                <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: l.tint }} />
                <span className="flex-1 text-sm font-medium text-slate-900 dark:text-slate-100">{l.label}</span>
                <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{items.length}</span>
              </label>
              {state.visible && (
                <div className="border-t border-slate-200 px-3 pb-2 pt-1 dark:border-slate-700">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <span className="w-20 shrink-0">Opacità {Math.round(state.opacity * 100)}%</span>
                    <input type="range" min={0.05} max={1} step={0.05} value={state.opacity} className="h-8 flex-1 accent-accent-500"
                      aria-label={`Opacità ${l.label}`}
                      onChange={(e) => setLayerOpacity(l.id, Number(e.target.value))} />
                  </label>
                  <details>
                    <summary className="cursor-pointer py-1.5 text-xs font-medium text-accent-600 dark:text-accent-300">Elenco strutture</summary>
                    <ul className="max-h-56 overflow-auto">
                      {items.map((s) => (
                        <li key={s.id}>
                          <button type="button" onClick={() => { select(s.id); focusSelection(); }}
                            aria-current={selection?.structureId === s.id}
                            className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${selection?.structureId === s.id ? 'bg-amber-100 font-semibold text-slate-900 dark:bg-amber-400/20 dark:text-amber-100' : 'text-slate-800 dark:text-slate-200'}`}>
                            {s.names.it}{s.card && <span className="ml-1 text-xs text-accent-600 dark:text-accent-300" title="Scheda completa">●</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </section>
      ))}
    </div>
  );
}
