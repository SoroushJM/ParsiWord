import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig(base, {
  testMatch: ['responsive-tables.spec.ts', 'sample-library.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:1422' },
  webServer: { command: 'pnpm exec vite preview --host 127.0.0.1 --port 1422 --strictPort', url: 'http://127.0.0.1:1422', reuseExistingServer: false },
});
