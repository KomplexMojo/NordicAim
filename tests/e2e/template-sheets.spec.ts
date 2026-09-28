// M26 (REV-121, template-reference.md §2–§4): the Settings screen's Target sheets — the shipped default for each
// template, a user's own sheet from a photo of a blank sheet (only its circles are kept), refused photos (a used sheet,
// the other template), and Restore default.

import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

test('target sheets: both templates start on the shipped default', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('sheet-source-sighting')).toHaveText('Default');
  await expect(page.getByTestId('sheet-source-precision')).toHaveText('Default');
  await expect(page.getByTestId('restore-sheet-precision')).toHaveCount(0);
  // The default thumbnail is the same-origin asset, and it loads.
  const loaded = await page
    .getByTestId('sheet-row-precision')
    .locator('img')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(loaded).toBe(true);
});

test('target sheets: a used sheet is refused because it has holes, and stores nothing', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('sheet-photo-input-precision').setInputFiles('docs/reference/IMG_5132-precision.jpg');
  await expect(page.getByTestId('sheet-refused-precision')).toHaveText(/has holes in it/, { timeout: 60000 });
  await expect(page.getByTestId('sheet-source-precision')).toHaveText('Default');
});

test('target sheets: a blank sheet is stored as your sheet, kept across a reload, and Restore default removes it', async ({ page }) => {
  await page.goto('/#/settings');
  // A blank precision sheet: the shipped default image itself.
  await page.getByTestId('sheet-photo-input-precision').setInputFiles('public/templates/precision-reference.jpg');
  await expect(page.getByTestId('sheet-source-precision')).toHaveText(/^Your sheet · \d{4}-\d{2}-\d{2}$/, { timeout: 15000 });
  await expect(page.getByTestId('sheet-source-sighting')).toHaveText('Default');

  await page.reload();
  await expect(page.getByTestId('sheet-source-precision')).toHaveText(/^Your sheet/);

  await page.getByTestId('restore-sheet-precision').click();
  await expect(page.getByTestId('sheet-source-precision')).toHaveText('Default');
  await page.reload();
  await expect(page.getByTestId('sheet-source-precision')).toHaveText('Default');
});

test('target sheets: a photo of the other template is refused and stores nothing', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('sheet-photo-input-precision').setInputFiles('docs/reference/IMG_5057-sighting.jpg');
  await expect(page.getByTestId('sheet-refused-precision')).toHaveText(/The rings weren't found/, { timeout: 60000 });
  await expect(page.getByTestId('sheet-source-precision')).toHaveText('Default');
});

test('target sheets: Photograph sheet opens the full-screen sheet mode, and Cancel returns', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('photograph-sheet-sighting').click();
  await page.waitForURL(/#\/settings\/template-sheet\/sighting/);
  await expect(page.getByTestId('sheet-mode-title')).toHaveText('Blank sighting sheet');
  await expect(page.getByTestId('tab-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForURL(/#\/settings$/);
  await expect(page.getByTestId('tab-bar')).toBeVisible();
});

test('target sheets: each template row downloads its printable US Letter PDF (issue #67)', async ({ page }) => {
  await page.goto('/#/settings');
  for (const template of ['sighting', 'precision'] as const) {
    const link = page.getByTestId(`download-sheet-${template}`);
    await expect(link).toHaveText('Download printable sheet (PDF)');
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    expect(download.suggestedFilename()).toBe(`nordicaim-${template}-letter.pdf`);
    const path = await download.path();
    expect(readFileSync(path).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }
});
