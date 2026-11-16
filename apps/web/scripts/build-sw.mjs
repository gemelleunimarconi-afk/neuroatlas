// Genera il service worker (Workbox) dopo `vite build`: interfaccia in precache, modelli 3D in cache alla prima richiesta.
import { generateSW } from 'workbox-build';

const { count, size, warnings } = await generateSW({
  globDirectory: new URL('../dist/', import.meta.url).pathname,
  globPatterns: ['index.html', 'assets/*.{js,css}', '*.svg', '*.webmanifest', 'models/manifest.json'],
  swDest: new URL('../dist/sw.js', import.meta.url).pathname,
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: 'index.html',
  runtimeCaching: [{
    // I modelli hanno un parametro di versione nell'URL: una versione nuova occupa una voce nuova e le vecchie scadono.
    urlPattern: ({ url }) => url.pathname.includes('/models/') && url.pathname.endsWith('.glb'),
    handler: 'CacheFirst',
    options: { cacheName: 'neuroatlas-models', expiration: { maxEntries: 90, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } },
  }],
});
for (const w of warnings) console.warn(w);
console.log(`service worker: ${count} file in precache, ${(size / 1024).toFixed(0)} KB`);
