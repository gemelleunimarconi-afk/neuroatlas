import { Fragment, useEffect, useState, type ReactNode } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Markdown minimo usato nelle schede: *corsivo* (termini latini) e **grassetto**. */
export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith('*') ? <em key={i} lang="la">{p.slice(1, -1)}</em>
    : <Fragment key={i}>{p}</Fragment>);
}

export const btn =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
export const btnOn = 'border-accent-600! bg-accent-600! text-white! dark:border-accent-300! dark:bg-accent-300! dark:text-slate-900!';
