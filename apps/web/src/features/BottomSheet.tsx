import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAtlas } from '@/store/atlas';

type Snap = 'peek' | 'half' | 'full';
const HEIGHT: Record<Snap, string> = { peek: '4.5rem', half: '46dvh', full: '88dvh' };
const ORDER: Snap[] = ['peek', 'half', 'full'];
const COVERED: Record<Snap, number> = { peek: 0.08, half: 0.46, full: 0.46 };

/** Pannello a scorrimento dal basso per smartphone: tre altezze, trascinabile dalla maniglia. */
export function BottomSheet({ title, openKey, children }: { title: string; openKey: string | null; children: ReactNode }) {
  const [snap, setSnap] = useState<Snap>('peek');
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  // Quando cambia la selezione il pannello si apre a metà.
  useEffect(() => { if (openKey) setSnap((s) => (s === 'peek' ? 'half' : s)); }, [openKey]);

  useEffect(() => {
    useAtlas.getState().setCoveredBottom(COVERED[snap]);
    return () => useAtlas.getState().setCoveredBottom(0);
  }, [snap]);

  const step = (dir: 1 | -1) => setSnap((s) => ORDER[Math.max(0, Math.min(2, ORDER.indexOf(s) + dir))]);

  return (
    <section aria-label={title} style={{ height: HEIGHT[snap] }}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] transition-[height] duration-200 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" aria-label={snap === 'full' ? 'Riduci pannello' : 'Espandi pannello'} aria-expanded={snap !== 'peek'}
        className="flex min-h-11 w-full shrink-0 touch-none flex-col items-center justify-center gap-1 pb-1 pt-2"
        onPointerDown={(e) => { drag.current = { y: e.clientY, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) > 36) { step(dy < 0 ? 1 : -1); d.y = e.clientY; d.moved = true; }
        }}
        onPointerUp={() => { const d = drag.current; drag.current = null; if (d && !d.moved) setSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')); } }}>
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-slate-400 dark:bg-slate-500" />
        <span className="max-w-[90%] truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]" inert={snap === 'peek'}>
        {children}
      </div>
    </section>
  );
}
