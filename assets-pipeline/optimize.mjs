// Raw per-layer GLB -> 3 levels of detail, welded, simplified and Meshopt-compressed.
// Mesh/node names are preserved: they are the join key with the anatomical content.
import { readdirSync, mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { weld, simplify, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const LODS = [
  { name: 'lod0', ratio: 0.5, error: 0.0005 }, // desktop
  { name: 'lod1', ratio: 0.2, error: 0.002 },  // tablet / good phones
  { name: 'lod2', ratio: 0.06, error: 0.006 }, // low-end phones, first paint
];
// Whole-body layers are much larger than the brain ones: cap their triangle count per level instead.
const BODY_CAPS = { lod0: 320000, lod1: 150000, lod2: 55000 };
// Layers that come at full resolution from Z-Anatomy and must be capped like the body ones.
const CAPPED = new Set(['cranial-nerves', 'meninges']);
const BODY_ERROR = { lod0: 0.004, lod1: 0.012, lod2: 0.03 };
const rawManifest = JSON.parse(readFileSync(new URL('./build/manifest.json', import.meta.url).pathname, 'utf8'));
const RAW = new URL('./build/raw/', import.meta.url).pathname;
const OUT = new URL('./build/models/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const report = {};
for (const file of readdirSync(RAW).filter((f) => f.endsWith('.glb'))) {
  const layer = file.replace('.glb', '');
  report[layer] = {};
  for (const lod of LODS) {
    const doc = await io.read(RAW + file);
    const body = layer.startsWith('body-') || CAPPED.has(layer);
    const ratio = body ? Math.min(0.6, BODY_CAPS[lod.name] / rawManifest.layers[layer].triangles) : lod.ratio;
    const error = body ? BODY_ERROR[lod.name] : lod.error;
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error }),
      reorder({ encoder: MeshoptEncoder }),
      quantize({ quantizePosition: 14, quantizeNormal: 8 }),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const out = `${OUT}${layer}.${lod.name}.glb`;
    await io.write(out, doc);
    let tris = 0;
    for (const mesh of doc.getRoot().listMeshes())
      for (const p of mesh.listPrimitives()) tris += p.getIndices().getCount() / 3;
    report[layer][lod.name] = { file: `${layer}.${lod.name}.glb`, bytes: statSync(out).size, triangles: tris };
  }
  console.log(layer.padEnd(15), LODS.map((l) => `${l.name} ${(report[layer][l.name].bytes / 1024).toFixed(0)}KB/${report[layer][l.name].triangles}t`).join('  '));
}
const mPath = new URL('./build/manifest.json', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
for (const [layer, files] of Object.entries(report)) manifest.layers[layer].files = files;
writeFileSync(mPath, JSON.stringify(manifest, null, 1));
const tot = (l) => Object.values(report).reduce((s, r) => s + r[l].bytes, 0);
console.log('total', LODS.map((l) => `${l.name} ${(tot(l.name) / 1048576).toFixed(1)}MB`).join('  '));
