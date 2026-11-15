import { useAtlas, type ViewName } from '@/store/atlas';

const VIEWS: [ViewName, string, string][] = [
  ['lateral-left', 'Sx', 'Vista laterale sinistra'],
  ['lateral-right', 'Dx', 'Vista laterale destra'],
  ['anterior', 'Ant', 'Vista anteriore'],
  ['posterior', 'Post', 'Vista posteriore'],
  ['superior', 'Sup', 'Vista superiore'],
  ['inferior', 'Inf', 'Vista inferiore'],
];

/** Ambito (corpo o encefalo) e viste standard, sovrapposti al modello. */
export function ViewControls() {
  const setView = useAtlas((s) => s.setView);
  const scope = useAtlas((s) => s.scope);
  const setScope = useAtlas((s) => s.setScope);
  return (
    <div className="absolute left-2 top-2 z-20 flex flex-col items-start gap-1.5 lg:left-3 lg:top-3">
    <div role="group" aria-label="Ambito" className="flex gap-0.5 rounded-xl bg-white/85 p-1 shadow backdrop-blur dark:bg-slate-900/85">
      {([['body', 'Corpo'], ['brain', 'Encefalo']] as const).map(([id, label]) => (
        <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}
          className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${scope === id ? 'bg-accent-600 text-white dark:bg-accent-300 dark:text-slate-900' : 'text-slate-800 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-700'}`}>
          {label}
        </button>
      ))}
    </div>
    <div role="toolbar" aria-label="Viste standard"
      className="flex gap-0.5 rounded-xl bg-white/85 p-1 shadow backdrop-blur dark:bg-slate-900/85">
      {VIEWS.map(([v, short, long]) => (
        <button key={v} type="button" title={long} aria-label={long} onClick={() => setView(v)}
          className="min-h-11 min-w-11 rounded-lg px-2 text-xs font-semibold text-slate-800 hover:bg-slate-200 dark:text-slate-100 dark:hover:bg-slate-700">
          {short}
        </button>
      ))}
    </div>
    </div>
  );
}
