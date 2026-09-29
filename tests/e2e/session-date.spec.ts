// REV-141: Start & capture gives a new session today's date; the metadata screen changes it to an earlier day, and the
// results screen puts Edit metadata beside Review session.

import { expect, test } from '@playwright/test';

/** The browser's local date, `YYYY-MM-DD`, as the app sees it. */
async function localToday(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

test('a new session is dated today, and the metadata screen moves it to an earlier day', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const sid = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url())![1]!;
  const today = await localToday(page);

  await page.goto(`/#/sessions/${sid}/metadata`);
  const date = page.getByTestId('session-date');
  await expect(date).toHaveValue(today);
  await expect(date).toHaveAttribute('max', today);
  await expect(page.getByLabel('Session name')).toHaveValue(`Session ${today}`);

  // A future day is not saved.
  await date.fill('2999-01-01');
  await expect(page.getByTestId('session-date-help')).toContainText('today or earlier');

  await date.fill('2026-09-01');
  await expect(page.getByLabel('Session name')).toHaveValue('Session 2026-09-01');

  // Home files it under the new day, and a fresh Start & capture makes a new session for today.
  await page.goto('/#/');
  const row = page.getByTestId('session-list').locator(`a[href*="${sid}"]`);
  await expect(row).toContainText('Session 2026-09-01');
  await expect(row.getByTestId('session-when')).toContainText('2026-09-01');
  await expect(page.getByRole('button', { name: 'Start & capture' })).toBeVisible();

  // It survives a reload.
  await page.goto(`/#/sessions/${sid}/metadata`);
  await expect(page.getByTestId('session-date')).toHaveValue('2026-09-01');
});

test('results: Edit metadata sits beside Review session, both with icons', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as Window & { __asaTest?: unknown }).__asaTest !== undefined);
  const sid = await page.evaluate(() =>
    (window as Window & { __asaTest?: { loadDemo(): Promise<string> } }).__asaTest!.loadDemo(),
  );
  await page.goto(`/#/sessions/${sid}/results`);

  const review = page.getByTestId('review-session-link');
  const edit = page.getByTestId('edit-metadata-link');
  await expect(review).toBeVisible();
  await expect(edit).toHaveText('Edit metadata');
  await expect(review.locator('svg').first()).toBeVisible();
  await expect(edit.locator('svg')).toBeVisible();
  // Side by side: the same row, each at least 44 px tall.
  const [r, e] = [await review.boundingBox(), await edit.boundingBox()];
  expect(Math.abs((r?.y ?? 0) - (e?.y ?? 1))).toBeLessThan(2);
  expect(e!.x).toBeGreaterThan(r!.x);
  expect(Math.min(r!.height, e!.height)).toBeGreaterThanOrEqual(44);

  await edit.click();
  await expect(page).toHaveURL(new RegExp(`#/sessions/${sid}/metadata$`));
});
