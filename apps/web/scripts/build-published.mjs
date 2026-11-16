// Build per l'anteprima pubblicata: un'unica pagina + file di tipo servito (JS, JSON). I .glb diventano JSON base64.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
const out = new URL('../dist-artifact/', import.meta.url).pathname;
execSync('npx vite build --base ./ --outDir dist-artifact', { stdio: 'inherit', env: { ...process.env, VITE_MODEL_FORMAT: 'json' } });
const files = {};
for (const f of readdirSync(out + 'models')) {
  if (f.endsWith('.glb')) {
    if (!f.includes('.lod0.')) {
      const name = f.replace('.glb', '.json');
      writeFileSync(out + 'models/' + name, JSON.stringify({ glb: readFileSync(out + 'models/' + f).toString('base64') }));
      files['models/' + name] = 'models/' + name;
    }
    rmSync(out + 'models/' + f);
  } else files['models/' + f] = 'models/' + f;
}
const html = readFileSync(out + 'index.html', 'utf8');
const js = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)[1];
if (readdirSync(out + 'assets').filter((f) => f.endsWith('.js')).length !== 1) throw new Error('la build pubblicata deve avere un solo file JavaScript');
const css = /href="\.\/(assets\/[^"]+\.css)"/.exec(html)[1];
files[js] = js;
writeFileSync(out + 'neuroatlas.html', `<title>NeuroAtlas</title>\n<meta name="theme-color" content="#0f172a">\n<style>${readFileSync(out + css, 'utf8')}</style>\n<div id="root"></div>\n<script type="module" src="${js}"></script>\n`);
writeFileSync(out + 'files.json', JSON.stringify(files));
console.log(Object.keys(files).length, 'files');
