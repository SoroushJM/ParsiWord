import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:1420', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    ...(process.env.PW_WEBKIT ? [{ name: 'webkit', use: { ...devices['iPhone 13'] } }] : []),
  ],
  webServer: { command: 'npm run dev -- --host 0.0.0.0', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
});
