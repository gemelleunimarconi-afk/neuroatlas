import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { LAYERS } from '@/content/catalog';
import { useAtlas } from '@/store/atlas';
import { CameraRig } from './CameraRig';
import { LayerModel } from './LayerModel';
import { Labels } from './Labels';
import { PathwayView } from './PathwayView';
import { updateSectionPlane } from './section';

/** Luce solidale alla camera: la struttura che guardi è sempre illuminata. */
function Headlight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return <directionalLight ref={ref} intensity={1.6} />;
}

/** Tiene allineato il piano di taglio allo stato; con una sezione attiva il tocco deve poter attraversare la parte rimossa. */
function SectionController() {
  const section = useAtlas((s) => s.section);
  const bounds = useAtlas((s) => s.catalog!.scopes[s.scope]);
  const { gl, raycaster, invalidate } = useThree();
  useEffect(() => {
    gl.localClippingEnabled = true;
    (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = !section;
    if (section) updateSectionPlane(section, bounds);
    invalidate();
  }, [section, bounds, gl, raycaster, invalidate]);
  return null;
}
function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div role="status" className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow dark:bg-slate-800/90 dark:text-slate-200">
      Caricamento modelli… {Math.round(progress)}%
    </div>
  );
}

export function Viewer() {
  const layers = useAtlas((s) => s.layers);
  const theme = useAtlas((s) => s.theme);
  const lod = useAtlas((s) => s.lod);
  const clearSelection = useAtlas((s) => s.clearSelection);
  const labelRoot = useRef<HTMLDivElement>(null);
  return (
    <div className="absolute inset-0 touch-none" data-testid="viewer">
      <Canvas
        frameloop="demand"
        dpr={[1, lod === 'lod2' ? 1.5 : 2]}
        camera={{ fov: 32, near: 0.01, far: 20, position: [0, 0.9, 4] }}
        raycaster={{ firstHitOnly: true } as Partial<THREE.Raycaster>}
        onPointerMissed={(e) => { if (e.type === 'click') clearSelection(); }}
        aria-label="Modello 3D del corpo umano e dell'encefalo. Usa l'elenco dei livelli o la ricerca per selezionare le strutture da tastiera."
        role="img"
      >
        <color attach="background" args={[theme === 'dark' ? '#0b1220' : '#eef1f5']} />
        <hemisphereLight args={['#ffffff', '#8a93a3', 1.5]} />
        <ambientLight intensity={0.35} />
        <Headlight />
        {LAYERS.filter((l) => layers[l.id].visible).map((l) => (
          <Suspense key={`${l.id}:${lod}`} fallback={null}>
            <LayerModel layer={l.id} lod={lod} />
          </Suspense>
        ))}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={0.04} maxDistance={8} rotateSpeed={0.9} />
        <CameraRig />
        <SectionController />
        <PathwayView />
        <Labels container={labelRoot} />
      </Canvas>
      <div ref={labelRoot} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <Loading />
    </div>
  );
}
