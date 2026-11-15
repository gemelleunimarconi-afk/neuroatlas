import { useId, useMemo, useState } from 'react';
import { LAYERS, searchStructures } from '@/content/catalog';
import { useAtlas } from '@/store/atlas';

const layerLabel = Object.fromEntries(LAYERS.map((l) => [l.id, l.label]));

/** Ricerca con autocompletamento (pattern ARIA combobox). */
export function SearchBox() {
  const catalog = useAtlas((s) => s.catalog)!;
  const select = useAtlas((s) => s.select);
  const focusSelection = useAtlas((s) => s.focusSelection);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchStructures(catalog, query), [catalog, query]);

  const choose = (id: string) => {
    select(id);
    focusSelection();
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-md">
      <input
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        aria-label="Cerca una struttura"
        placeholder="Cerca una struttura…"
        autoComplete="off"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active].id); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      {open && query.trim() && (
        <ul id={listId} role="listbox" aria-label="Risultati"
          className="absolute left-0 right-0 top-12 z-40 max-h-[60dvh] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">Nessuna struttura trovata</li>}
          {results.map((r, i) => (
            <li key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(r.id); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-slate-100 dark:bg-slate-700' : ''}`}>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.names.it}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {r.names.la && <em lang="la">{r.names.la} · </em>}{layerLabel[r.layer]}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
