import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const content = fileURLToPath(new URL('../../content', import.meta.url));

// Versione dei modelli: cambia quando cambia il manifest, così la cache offline non serve modelli vecchi.
const manifestPath = fileURLToPath(new URL('./public/models/manifest.json', import.meta.url));
const modelsVersion = existsSync(manifestPath) ? createHash('sha1').update(readFileSync(manifestPath)).digest('hex').slice(0, 10) : 'dev';
// La pagina pubblicata dentro Claude deve essere un solo file JavaScript.
const singleFile = process.env.VITE_MODEL_FORMAT === 'json';

export default defineConfig({
  define: { __MODELS_VERSION__: JSON.stringify(modelsVersion) },
  build: { chunkSizeWarningLimit: 1600, rolldownOptions: { output: singleFile ? { codeSplitting: false } : {} } },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@content': content, '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { fs: { allow: ['../..'] } },
  test: { environment: 'node' },
});
