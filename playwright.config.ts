import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:1420', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 0.0.0.0', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
});
