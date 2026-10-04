// REV-157 (issue #99): the athlete's picture in Settings → Athlete — made small and square, with no photo metadata, kept,
// and removable.

import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const PHOTO_WITH_EXIF = fileURLToPath(new URL('../../fixtures/reference/exif-sample.jpg', import.meta.url));

test('add a picture from a photo with EXIF: kept as a small JPEG with none of it; it stays after a reload, and Remove brings back the initials', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('athlete-name').fill('Ann Lee');
  await page.getByTestId('athlete-name').blur();
  const preview = page.getByTestId('athlete-picture-preview');
  await expect(preview).toHaveAttribute('data-kind', 'initials');
  await expect(preview).toHaveText('AL');

  await page.getByTestId('athlete-picture-input').setInputFiles(PHOTO_WITH_EXIF);
  await expect(preview).toHaveAttribute('data-kind', 'picture');
  const src = (await preview.getAttribute('src'))!;
  expect(src.startsWith('data:image/jpeg;base64,')).toBe(true);
  const bytes = Buffer.from(src.slice('data:image/jpeg;base64,'.length), 'base64');
  expect(bytes.byteLength).toBeLessThanOrEqual(8 * 1024);
  expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
  const size = await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size).toEqual([96, 96]);

  await page.reload();
  await expect(page.getByTestId('athlete-picture-preview')).toHaveAttribute('data-kind', 'picture');
  await page.getByTestId('athlete-picture-remove').click();
  await expect(page.getByTestId('athlete-picture-preview')).toHaveAttribute('data-kind', 'initials');
  await expect(page.getByTestId('athlete-picture-choose')).toHaveText('Add picture');
});

test('a file that is not a photo says so and keeps the initials', async ({ page }, testInfo) => {
  const notPhoto = testInfo.outputPath('notes.txt');
  await (await import('node:fs/promises')).writeFile(notPhoto, 'not a photo');
  await page.goto('/#/settings');
  await page.getByTestId('athlete-picture-input').setInputFiles(notPhoto);
  await expect(page.getByTestId('athlete-picture-error')).toHaveText("That photo can't be opened. Try another one.");
  await expect(page.getByTestId('athlete-picture-preview')).toHaveAttribute('data-kind', 'initials');
});
