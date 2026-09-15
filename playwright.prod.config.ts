import { defineConfig, devices } from '@playwright/test';

// End-to-end checks against the PRODUCTION build (`vite build` + `vite preview`).
// The dev server skips the CSP and bundling differences that only exist in the deployed app, so bugs like
// OpenCV failing under the CSP are only visible here.
export default defineConfig({
  testDir: './tests/e2e-prod',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
