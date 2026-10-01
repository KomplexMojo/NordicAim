import { expect, test } from '@playwright/test';

const CHECK_IDS = [
  'secure-context',
  'camera-api',
  'share-files',
  'storage-persist',
  'storage-estimate',
  'wake-lock',
  'offscreen-canvas',
  'indexeddb',
  'cv-worker',
  'svg-raster',
  'diagram-raster',
  'heic-decode',
  'ingest-pipeline',
  'standalone',
  'user-agent',
];

test('home page shows the heading, the Sessions / Analysis / Patterns tabs and the Settings gear (REV-47, REV-136)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NordicAim' })).toBeVisible();
  for (const name of ['Sessions', 'Analysis', 'Patterns']) {
    await expect(page.getByTestId('tab-bar').getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByTestId('app-header').getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('diagnostics page runs every check', async ({ page }) => {
  await page.goto('/#/diagnostics');
  await page.getByTestId('panel-toggle-diag-checks').click({ timeout: 15000 });

  for (const id of CHECK_IDS) {
    await expect(page.locator(`tr[data-check-id="${id}"]`)).toBeVisible({ timeout: 15000 });
  }

  for (const id of ['indexeddb', 'cv-worker', 'svg-raster', 'diagram-raster', 'ingest-pipeline']) {
    await expect(page.locator(`tr[data-check-id="${id}"]`)).toHaveAttribute('data-status', 'pass');
  }

  await expect(page.locator('tr[data-check-id="heic-decode"]')).toBeVisible();
});

test('framed by another page, the app shows only a notice and none of its controls (issue #47)', async ({ page, baseURL }) => {
  // A page served on the same origin frames it (Chromium won't let about:blank frame a local address); framing is framing either way.
  await page.route(`${baseURL}/framing-test.html`, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<iframe id="f" src="${baseURL}/#/settings" style="width:400px;height:600px"></iframe>` }),
  );
  await page.goto('/framing-test.html');
  const frame = page.frameLocator('#f');
  await expect(frame.getByTestId('framed-notice')).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByRole('link', { name: 'Open NordicAim on its own' })).toHaveAttribute('target', '_top');
  await expect(frame.getByTestId('backup-now')).toHaveCount(0);
  await expect(frame.getByTestId('tab-bar')).toHaveCount(0);
  // On its own, the app is untouched.
  await page.goto('/#/settings');
  await expect(page.getByTestId('backup-now')).toBeVisible();
  await expect(page.getByTestId('framed-notice')).toHaveCount(0);
});
