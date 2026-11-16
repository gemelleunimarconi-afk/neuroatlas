import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { suspend } from 'suspend-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { LAYERS } from '@/content/catalog';
import type { LayerId } from '@/content/schema';
import { useAtlas } from '@/store/atlas';
import { explodeOffset, sectionPlane } from './section';
import { WRAPPED, modelUrl } from './modelUrl';

const HIGHLIGHT = new THREE.Color('#ffb020');
const noRaycast = () => {};
const BLACK = new THREE.Color(0);
const CLIP = [sectionPlane];
const tmp = new THREE.Vector3();

/** Colore di un'area di Brodmann: tinte ben distanziate, stabili per numero. */
function brodmannColor(area: number): THREE.Color {
  return new THREE.Color().setHSL(((area * 137.508) % 360) / 360, 0.62, 0.52);
}

/** Le facce interne, visibili solo dove un piano taglia la struttura, sono rese a tinta piatta: il taglio appare pieno. */
function flatBackfaces(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    '#include <opaque_fragment>\n\tif ( ! gl_FrontFacing ) gl_FragColor = vec4( diffuse * 0.78, diffuseColor.a );',
  );
}

async function loadWrapped(url: string): Promise<THREE.Group> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Modello non trovato: ${url}`);
  const bin = atob(((await res.json()) as { glb: string }).glb);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '');
  return gltf.scene;
}
function useModelScene(url: string): THREE.Group {
  // Il formato è fissato alla build, quindi l'ordine degli hook non cambia mai a runtime.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return WRAPPED ? suspend(loadWrapped, [url]) : useGLTF(url, false, true).scene;
}

/** Un livello anatomico: un file GLB con una mesh per struttura (nome mesh = id nel manifest). */
export function LayerModel({ layer, lod }: { layer: LayerId; lod: string }) {
  const scene = useModelScene(modelUrl(layer, lod));
  const invalidate = useThree((s) => s.invalidate);
  const catalog = useAtlas((s) => s.catalog)!;
  const opacity = useAtlas((s) => s.layers[layer].opacity);
  const selection = useAtlas((s) => s.selection);
  const isolated = useAtlas((s) => s.isolated);
  const select = useAtlas((s) => s.select);
  const sectionOn = useAtlas((s) => s.section !== null);
  const explode = useAtlas((s) => s.explode);
  const brodmann = useAtlas((s) => s.brodmann && layer === 'cortex');

  // Prepara le mesh una sola volta: materiale proprio, colore, BVH per un picking veloce.
  const meshes = useMemo(() => {
    const tint = new THREE.Color(LAYERS.find((l) => l.id === layer)!.tint);
    const out: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const info = catalog.meshById.get(mesh.name);
      if (!info) return;
      const color = new THREE.Color().setRGB(...info.color, THREE.SRGBColorSpace).lerp(tint, 0.55);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
      material.onBeforeCompile = flatBackfaces;
      mesh.material = material;
      mesh.userData.baseColor = color.clone();
      mesh.userData.basePosition = mesh.position.clone();
      mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
      out.push(mesh);
    });
    return out;
  }, [scene, layer, catalog]);

  useEffect(() => {
    for (const mesh of meshes) {
      const info = catalog.meshById.get(mesh.name)!;
      const inStructure = !!selection && info.structure === selection.structureId;
      const selected = inStructure && (!selection.meshId || selection.meshId === mesh.name);
      const visible = !(isolated && selection && !inStructure);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mesh.visible = visible;
      // Un livello reso quasi trasparente non intercetta i tocchi: si seleziona ciò che sta sotto.
      mesh.raycast = visible && (opacity >= 0.5 || selected) ? acceleratedRaycast : noRaycast;
      const alpha = selected ? 1 : opacity;
      mat.transparent = alpha < 1;
      mat.opacity = alpha;
      mat.depthWrite = alpha >= 1;
      mat.emissive.copy(selected ? HIGHLIGHT : BLACK);
      const areas = brodmann ? catalog.brodmann[info.structure] : undefined;
      mat.color.copy(areas ? brodmannColor(areas[0]) : (mesh.userData.baseColor as THREE.Color));
      mat.clippingPlanes = sectionOn ? CLIP : null;
      mesh.position.copy(mesh.userData.basePosition as THREE.Vector3).add(explodeOffset(info, catalog, explode, tmp));
      mat.emissiveIntensity = selected ? 0.55 : 0;
      mat.needsUpdate = true;
      // Sagoma "a raggi X": la struttura selezionata resta visibile anche dietro alle altre.
      let ghost = mesh.userData.ghost as THREE.Mesh | undefined;
      if (selected && !ghost) {
        ghost = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({
          color: HIGHLIGHT, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false,
        }));
        ghost.raycast = noRaycast;
        ghost.renderOrder = 999;
        mesh.add(ghost);
        mesh.userData.ghost = ghost;
      } else if (!selected && ghost) {
        mesh.remove(ghost);
        (ghost.material as THREE.Material).dispose();
        delete mesh.userData.ghost;
      }
    }
    invalidate();
  }, [meshes, catalog, opacity, selection, isolated, sectionOn, explode, brodmann, invalidate]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // era un trascinamento, non un tocco
    const info = catalog.meshById.get(e.object.name);
    if (!info) return;
    // Un punto nella parte tagliata via non è visibile: il tocco prosegue verso ciò che sta dietro.
    if (useAtlas.getState().section && sectionPlane.distanceToPoint(e.point) < 0) return;
    e.stopPropagation();
    select(info.structure, info.id);
  };

  return <primitive object={scene} onClick={onClick} />;
}
