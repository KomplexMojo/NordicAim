import { defineConfig, devices } from '@playwright/test';

// Cloud sessions ship a Chromium build older than the pinned Playwright expects; the SessionStart hook
// (.claude/hooks/session-start.sh) points this at it. Unset everywhere else, so nothing changes locally or in CI.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

// M15 step 6: the PRODUCTION build (service worker precache included), but with the fake camera and
// `window.__asaTest` turned on for this build only, so `offline.spec.ts` can drive `loadDemo()` without
// a real camera — the Pages workflow must never set VITE_FAKE_CAMERA (analysis-pipeline.md pitfalls).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'offline.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
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
    command: 'pnpm build && pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { VITE_FAKE_CAMERA: '1' },
  },
});
