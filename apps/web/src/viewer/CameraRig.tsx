import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAtlas, type ViewName } from '@/store/atlas';

// Assi del modello: +X = sinistra del soggetto, +Y = superiore, +Z = anteriore.
const VIEW_DIR: Record<ViewName, [number, number, number]> = {
  'lateral-left': [1, 0.12, 0.25],
  'lateral-right': [-1, 0.12, 0.25],
  anterior: [0, 0.1, 1],
  posterior: [0, 0.1, -1],
  superior: [0, 1, 0.001],
  inferior: [0, -1, 0.001],
};
const HOME_VIEW: Record<'body' | 'brain', ViewName> = { body: 'anterior', brain: 'lateral-left' };

interface Anim { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number }

/** Esegue le richieste di inquadratura dello store (viste standard, "centra sulla struttura") con una breve animazione. */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const request = useAtlas((s) => s.cameraRequest);
  const scope = useAtlas((s) => s.scope);
  const { center, halfHeight, halfWidth } = useAtlas((s) => s.catalog!.scopes[s.scope]);
  const covered = useAtlas((s) => s.coveredBottom);
  const anim = useRef<Anim | null>(null);
  const first = useRef(true);

  const fitDistance = (radius: number) => {
    const vFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hFov = Math.atan(Math.tan(vFov) * (size.width / size.height));
    const usable = Math.max(0.5, 1 - covered); // parte dello schermo non coperta dal pannello
    return (radius / Math.sin(Math.min(Math.atan(Math.tan(vFov) * usable), hFov))) * 1.05;
  };

  /** Distanza a cui l'intero ambito (corpo o encefalo) entra nello schermo, in altezza e in larghezza. */
  const fitScope = () => {
    const usable = Math.max(0.4, 1 - covered - coveredTop);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return Math.max(halfHeight / (tanV * usable), halfWidth / (tanV * (size.width / size.height))) * 1.12;
  };

  const go = (toPos: THREE.Vector3, toTarget: THREE.Vector3, instant: boolean) => {
    if (!controls) return;
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(toPos); controls.target.copy(toTarget); controls.update();
    } else {
      anim.current = { fromPos: camera.position.clone(), toPos, fromTarget: controls.target.clone(), toTarget, t: 0 };
    }
    invalidate();
  };

  // Su schermi stretti i comandi in alto coprono una fascia del modello.
  const coveredTop = size.width < 1024 ? Math.min(0.25, 118 / size.height) : 0;

  // Centra il modello nella parte di schermo libera: sotto i comandi, sopra il pannello mobile.
  useEffect(() => {
    if (covered > 0 || coveredTop > 0) camera.setViewOffset(size.width, size.height, 0, ((covered - coveredTop) * size.height) / 2, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, covered, coveredTop, size, invalidate]);

  // Inquadratura iniziale
  useEffect(() => {
    if (!controls || !first.current) return;
    first.current = false;
    const c = new THREE.Vector3(...center);
    go(c.clone().addScaledVector(new THREE.Vector3(...VIEW_DIR[HOME_VIEW[scope]]).normalize(), fitScope()), c, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  useEffect(() => {
    if (!request || !controls) return;
    if (request.kind === 'view') {
      const c = new THREE.Vector3(...center);
      go(c.clone().addScaledVector(new THREE.Vector3(...VIEW_DIR[request.view]).normalize(), fitScope()), c, false);
    } else {
      const target = new THREE.Vector3(...request.target);
      const dir = camera.position.clone().sub(controls.target).normalize();
      const dist = Math.max(fitDistance(request.radius) * 1.6, scope === 'brain' ? 0.26 : 0.35); // mai così vicino da perdere il contesto
      go(target.clone().addScaledVector(dir, dist), target, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.55);
    const k = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    controls.target.lerpVectors(a.fromTarget, a.toTarget, k);
    controls.update();
    if (a.t >= 1) anim.current = null;
    else invalidate();
  });

  return null;
}
