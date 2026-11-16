import { lazy, Suspense, useEffect, useState } from 'react';
import { loadCatalog } from '@/content/load';
import { BottomSheet } from '@/features/BottomSheet';
import { Credits } from '@/features/Credits';
import { LayersPanel } from '@/features/LayersPanel';
import { SearchBox } from '@/features/SearchBox';
import { StructureCard } from '@/features/StructureCard';
import { ToolsPanel } from '@/features/ToolsPanel';
import { useStudy } from '@/study/store';
import { useTutor } from '@/tutor/store';
import { useUser } from '@/db/user';
import { ViewControls } from '@/features/ViewControls';
import { btn, btnOn, useMediaQuery } from '@/features/util';
import { useAtlas } from '@/store/atlas';

// Caricati a parte: il visualizzatore 3D è la parte più pesante, tutor e studio servono solo quando si aprono.
const Viewer = lazy(() => import('@/viewer/Viewer').then((m) => ({ default: m.Viewer })));
const TutorPanel = lazy(() => import('@/features/TutorPanel').then((m) => ({ default: m.TutorPanel })));
const StudyPanel = lazy(() => import('@/features/StudyPanel').then((m) => ({ default: m.StudyPanel })));
const wait = <p role="status" className="p-4 text-sm text-slate-700 dark:text-slate-300">Caricamento…</p>;

/** Durante una domanda la scheda rivelerebbe la risposta. */
function QuizNotice() {
  return <p className="p-4 text-sm text-slate-800 dark:text-slate-200">Quiz in corso: la scheda torna visibile dopo la risposta. Trovi la domanda nella scheda Studio.</p>;
}

export function App() {
  const catalog = useAtlas((s) => s.catalog);
  const theme = useAtlas((s) => s.theme);
  const setTheme = useAtlas((s) => s.setTheme);
  const selection = useAtlas((s) => s.selection);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState(false);
  const [mobileTab, setMobileTab] = useState<'card' | 'layers' | 'tools' | 'tutor' | 'study'>('card');
  const [rightTab, setRightTab] = useState<'card' | 'tutor' | 'study'>('card');
  const quizHidden = useAtlas((s) => !!s.quiz && !s.quiz.reveal);
  const tutorRequest = useTutor((s) => s.openRequest);
  const [sideTab, setSideTab] = useState<'layers' | 'tools'>('layers');
  const pathwayId = useAtlas((s) => s.pathwayId);
  const desktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => { void useUser.getState().load(); void useStudy.getState().load(); }, []);
  useEffect(() => { loadCatalog().then(useAtlas.getState().setCatalog).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0f172a' : '#ffffff');
  }, [theme]);
  // Una nuova selezione porta alla scheda, tranne mentre si lavora con il tutor (che evidenzia strutture da sé).
  useEffect(() => { if (selection) setMobileTab((t) => (t === 'tutor' || t === 'study' ? t : 'card')); }, [selection]);
  useEffect(() => { if (tutorRequest > 0) { setMobileTab('tutor'); setRightTab('tutor'); } }, [tutorRequest]);

  if (error) return <p role="alert" className="p-6 text-red-700">{error}</p>;
  if (!catalog) return <p role="status" className="p-6 text-slate-700 dark:text-slate-200">Caricamento dell'atlante…</p>;

  const selected = selection ? catalog.byId.get(selection.structureId) : undefined;

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="z-40 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-slate-700 dark:bg-slate-900">
        <h1 className="hidden text-base font-semibold tracking-tight sm:block">Neuro<span className="text-accent-500 dark:text-accent-300">Atlas</span></h1>
        <div className="flex flex-1 justify-center"><SearchBox /></div>
        <button type="button" className={`${btn} size-11 px-0!`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}>{theme === 'dark' ? '☀' : '☾'}</button>
        <button type="button" className={`${btn} size-11 px-0!`} onClick={() => setCredits(true)} aria-label="Crediti e licenze">ⓘ</button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {desktop && (
          <aside aria-label="Livelli e strumenti" className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
            <div role="tablist" aria-label="Pannello laterale" className="sticky top-0 z-10 flex gap-2 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
              {(['layers', 'tools'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={sideTab === t} onClick={() => setSideTab(t)}
                  className={`${btn} flex-1 ${sideTab === t ? btnOn : ''}`}>{t === 'layers' ? 'Livelli' : 'Strumenti'}</button>
              ))}
            </div>
            {sideTab === 'layers' ? <LayersPanel /> : <ToolsPanel />}
          </aside>
        )}
        <main className="relative min-w-0 flex-1">
          <Suspense fallback={wait}><Viewer /></Suspense>
          <ViewControls />
        </main>
        {desktop && (
          <aside aria-label="Scheda e tutor" className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div role="tablist" aria-label="Pannello destro" className="flex shrink-0 gap-2 border-b border-slate-200 p-2 dark:border-slate-700">
              {(['card', 'tutor', 'study'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={rightTab === t} onClick={() => setRightTab(t)}
                  className={`${btn} flex-1 ${rightTab === t ? btnOn : ''}`}>{{ card: 'Scheda', tutor: 'Tutor', study: 'Studio' }[t]}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-2"><Suspense fallback={wait}>{rightTab === 'study' ? <StudyPanel /> : rightTab === 'tutor' ? <TutorPanel /> : quizHidden ? <QuizNotice /> : <StructureCard />}</Suspense></div>
          </aside>
        )}
        {!desktop && (
          <BottomSheet title={quizHidden ? 'Quiz in corso' : selected ? selected.names.it : pathwayId ? 'Via nervosa' : 'Atlante: scheda, livelli, strumenti'} openKey={selection ? `${selection.structureId}:${selection.meshId}` : null}>
            <div role="tablist" aria-label="Contenuto del pannello" className="sticky top-0 z-10 flex gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              {(['card', 'layers', 'tools', 'tutor', 'study'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={mobileTab === t} onClick={() => setMobileTab(t)}
                  className={`${btn} flex-1 px-0.5! text-[0.8rem]! ${mobileTab === t ? btnOn : ''}`}>{{ card: 'Scheda', layers: 'Livelli', tools: 'Strumenti', tutor: 'Tutor', study: 'Studio' }[t]}</button>
              ))}
            </div>
            <Suspense fallback={wait}>{mobileTab === 'study' ? <StudyPanel /> : mobileTab === 'card' ? (quizHidden ? <QuizNotice /> : <StructureCard />) : mobileTab === 'layers' ? <LayersPanel /> : mobileTab === 'tools' ? <ToolsPanel /> : <div className="h-[calc(100%-3.75rem)]"><TutorPanel /></div>}</Suspense>
          </BottomSheet>
        )}
      </div>
      <Credits open={credits} onClose={() => setCredits(false)} />
    </div>
  );
}
