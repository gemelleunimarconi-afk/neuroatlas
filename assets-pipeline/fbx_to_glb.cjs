// Converts the Z-Anatomy FBX files to GLB (one named mesh per structure, transforms baked) using three.js in headless Chromium.
// Usage: node fbx_to_glb.cjs NervousSystem100 SkeletalSystem100
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, '.cache/z-anatomy');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(OUT, path.basename(url)), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const PAGE = `<!doctype html><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
window.convert = async (name) => {
  const root = await new FBXLoader().loadAsync('/.cache/z-anatomy/' + name + '.fbx');
  root.updateMatrixWorld(true);
  const scene = new THREE.Scene(), list = [], material = new THREE.MeshStandardMaterial();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(o.matrixWorld);
    const chain = []; for (let p = o.parent; p && p !== root; p = p.parent) chain.unshift(p.name);
    const m = new THREE.Mesh(g, material); m.name = o.name; scene.add(m);
    g.computeBoundingBox();
    list.push({ name: o.name, parents: chain, vertices: g.attributes.position.count, min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() });
  });
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  await fetch('/' + name + '.glb', { method: 'PUT', body: glb });
  await fetch('/' + name + '.json', { method: 'PUT', body: JSON.stringify(list) });
  return list.length;
};
window.ready = true;
</script>`;

(async () => {
  fs.writeFileSync(path.join(OUT, 'convert.html'), PAGE);
  await new Promise((r) => server.listen(8766, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('http://localhost:8766/.cache/z-anatomy/convert.html');
  await page.waitForFunction(() => window.ready);
  for (const name of process.argv.slice(2)) console.log(name, '->', await page.evaluate((n) => window.convert(n), name), 'meshes');
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
