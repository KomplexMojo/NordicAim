import { expect, test } from '@playwright/test';

// Regression guard for the 2026-09-15 iPhone report: in the production build the CSP blocked OpenCV.js
// initialisation (embind uses new Function), so `cv-worker` failed with "|this| is not a Promise".

test('production build ships the CSP', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
});

test('diagnostics: OpenCV worker and core capabilities pass under the production CSP', async ({ page }) => {
  await page.goto('/#/diagnostics');
  // The checks table sits in a panel that starts collapsed (REV-73 era); open it to read the rows.
  await page.getByTestId('panel-toggle-diag-checks').click({ timeout: 15000 });
  for (const id of ['cv-worker', 'svg-raster', 'indexeddb', 'ingest-pipeline']) {
    const row = page.getByRole('row', { name: new RegExp(`\\b${id}\\b`) });
    await expect
      .poll(async () => (await row.innerText()).replace(/\s+/g, ' '), { timeout: 45_000 })
      .toMatch(new RegExp(`${id} pass\\b`));
  }
});
