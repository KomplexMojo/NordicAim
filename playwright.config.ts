import { defineConfig, devices } from '@playwright/test';

// Cloud sessions ship a Chromium build older than the pinned Playwright expects; the SessionStart hook
// (.claude/hooks/session-start.sh) points this at it. Unset everywhere else, so nothing changes locally or in CI.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

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
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}) },
    },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: 'pnpm dev:test',
    url: 'http://127.0.0.1:3874',
    reuseExistingServer: !process.env.CI,
  },
});
