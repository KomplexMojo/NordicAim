import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // offline.spec.ts needs the production build's service worker (playwright.offline.config.ts,
  // `pnpm test:e2e:offline`) — the dev server this config runs against has none.
  testIgnore: 'offline.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3874',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: 'pnpm dev:test',
    url: 'http://127.0.0.1:3874',
    reuseExistingServer: !process.env.CI,
  },
});
