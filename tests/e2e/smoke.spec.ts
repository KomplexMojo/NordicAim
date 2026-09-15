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
  'heic-decode',
  'standalone',
  'user-agent',
];

test('home page shows the heading and a diagnostics link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Biathlete Harness' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Diagnostics' })).toBeVisible();
});

test('diagnostics page runs every check', async ({ page }) => {
  await page.goto('/#/diagnostics');

  for (const id of CHECK_IDS) {
    await expect(page.locator(`tr[data-check-id="${id}"]`)).toBeVisible({ timeout: 15000 });
  }

  for (const id of ['indexeddb', 'cv-worker', 'svg-raster']) {
    await expect(page.locator(`tr[data-check-id="${id}"]`)).toHaveAttribute('data-status', 'pass');
  }

  await expect(page.locator('tr[data-check-id="heic-decode"]')).toBeVisible();
});
