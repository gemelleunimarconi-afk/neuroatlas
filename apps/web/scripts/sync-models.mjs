// Copies the pipeline output (GLB + manifest) into public/models so Vite can serve it.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
const src = new URL('../../../assets-pipeline/build/', import.meta.url).pathname;
const dst = new URL('../public/models/', import.meta.url).pathname;
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src + 'models')) cpSync(src + 'models/' + f, dst + f);
cpSync(src + 'manifest.json', dst + 'manifest.json');
console.log('models synced to public/models');
