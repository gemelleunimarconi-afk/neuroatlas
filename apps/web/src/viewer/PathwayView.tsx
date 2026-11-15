import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PATHWAYS } from '@/content/load';
import { useAtlas } from '@/store/atlas';
import { resolvePathwayPoint } from './section';

const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const PULSES = 3;

/** Via nervosa mostrata come percorso tra strutture reali, con impulsi che ne indicano il verso. Sempre visibile attraverso le strutture. */
export function PathwayView() {
  const id = useAtlas((s) => s.pathwayId);
  const catalog = useAtlas((s) => s.catalog)!;
  const pulses = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);

  const tracks = useMemo(() => {
    const pathway = PATHWAYS.find((p) => p.id === id);
    if (!pathway) return [];
    return pathway.tracks.map((t) => {
      const points = t.points.map((p) => resolvePathwayPoint(p, catalog)).filter((v): v is THREE.Vector3 => v !== null);
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      return { color: t.color, points, curve, geometry: new THREE.TubeGeometry(curve, points.length * 24, 0.0011, 8, false) };
    });
  }, [id, catalog]);

  useFrame((state, dt) => {
    if (!tracks.length || reducedMotion) return;
    clock.current = (clock.current + dt * 0.28) % 1;
    tracks.forEach((t, ti) => {
      for (let k = 0; k < PULSES; k++) {
        const mesh = pulses.current[ti * PULSES + k];
        if (mesh) mesh.position.copy(t.curve.getPointAt((clock.current + k / PULSES) % 1));
      }
    });
    state.invalidate(); // l'animazione tiene vivo il rendering solo mentre una via è mostrata
  });

  if (!tracks.length) return null;
  return (
    <group renderOrder={1000}>
      {tracks.map((t, ti) => (
        <group key={ti}>
          <mesh geometry={t.geometry} renderOrder={1000} raycast={() => {}}>
            <meshBasicMaterial color={t.color} depthTest={false} transparent opacity={0.92} />
          </mesh>
          {t.points.map((p, i) => (
            <mesh key={i} position={p} renderOrder={1001} raycast={() => {}}>
              <sphereGeometry args={[0.0021, 12, 12]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} transparent />
            </mesh>
          ))}
          {!reducedMotion && Array.from({ length: PULSES }, (_, k) => (
            <mesh key={`p${k}`} ref={(m) => { pulses.current[ti * PULSES + k] = m; }} renderOrder={1002} raycast={() => {}}>
              <sphereGeometry args={[0.0032, 12, 12]} />
              <meshBasicMaterial color={t.color} depthTest={false} transparent />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
