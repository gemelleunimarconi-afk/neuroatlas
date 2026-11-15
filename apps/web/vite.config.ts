import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const content = fileURLToPath(new URL('../../content', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@content': content, '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { fs: { allow: ['../..'] } },
  test: { environment: 'node' },
});
