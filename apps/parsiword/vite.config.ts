import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const host = process.env.TAURI_DEV_HOST;
export default defineConfig({
  root: file('./'), publicDir: file('../../packages/core/public'),
  base: process.env.VITE_BASE_PATH || './', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': file('../../packages/core/src') } }, clearScreen: false,
  build: {
    outDir: file('../../dist'), emptyOutDir: true, target: ['chrome87', 'safari16.4'],
    rolldownOptions: { input: { main: file('./index.html'), en: file('./en/index.html') } },
  },
  server: { port: 1420, strictPort: true, host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }, fs: { allow: [file('../../')] },
  },
});
