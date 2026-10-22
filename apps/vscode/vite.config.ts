import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: file('./webview'), base: './', publicDir: file('../../packages/core/public'),
  plugins: [react(), tailwindcss()], resolve: { alias: { '@': file('../../packages/core/src') } },
  build: { outDir: file('./dist/webview'), emptyOutDir: true, manifest: true, target: 'chrome120', chunkSizeWarningLimit: 2000 },
});
