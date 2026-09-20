import { expect, test, type Page } from '@playwright/test';

// M15 step 6 (playwright.offline.config.ts): against the production build with the service worker
// precache, load once online to install it, then go fully offline and confirm the app still works —
// `loadDemo`, results with scores, the summary image, and the diagnostics `cv-worker` check.

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
  };
};

// The service worker precache includes the ~10 MB OpenCV wasm chunk (pitfalls: "verify it in the build
// output"), so the first install and the first offline Stage A/B run both take a while.
test.setTimeout(240_000);

async function waitForServiceWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.ready.then((r) => r.active !== null));
}

test('offline: the app installs a service worker and still runs fully offline', async ({ page, context, browserName }) => {
  // Headless WebKit in this sandbox throws "encountered an internal error" on ANY navigation
  // (`reload()` or `goto()`) once `context.setOffline(true)` is set — a Playwright/WebKit
  // simulated-offline limitation, not an app bug (the identical flow passes on mobile-chromium, and the
  // owner's own airplane-mode check on a real iPhone, M15 Acceptance item 1, covers Safari/WebKit).
  test.skip(browserName === 'webkit', 'context.setOffline + navigation is unsupported in headless WebKit here');

  // 1. load #/ → wait for navigator.serviceWorker.ready (installs the precache while still online).
  await page.goto('/#/');
  await waitForServiceWorkerReady(page);
  // The service worker only starts controlling the page from its NEXT navigation (registerType
  // 'autoUpdate' skips waiting, but the current document was still fetched over the network); load once
  // more online so the reload under §2 is actually served from the SW rather than racing the network.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'NordicAim' })).toBeVisible();

  // 2. go offline → reload.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'NordicAim' })).toBeVisible();

  // 3. loadDemo → results with scores and the summary image render offline.
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('target-headline').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('summary-image')).toBeVisible({ timeout: 60_000 });

  // 4. the diagnostics cv-worker check passes offline.
  await page.goto('/#/diagnostics');
  const row = page.getByRole('row', { name: /\bcv-worker\b/ });
  await expect
    .poll(async () => (await row.innerText()).replace(/\s+/g, ' '), { timeout: 60_000 })
    .toMatch(/cv-worker pass\b/);

  await context.setOffline(false);
});
