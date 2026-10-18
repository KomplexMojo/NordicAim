// REV-162: Capture and Import each always start a fresh session dated today (with (2)/(3) when needed).

import { expect, test } from '@playwright/test';

test('Import puts library photos in a fresh session; Capture also mints a new session (REV-162)', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const first = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url())![1]!;

  await page.goto('/#/');
  await expect(page.getByRole('button', { name: 'Capture' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('new-session')).toHaveText('Import');
  await page.getByTestId('new-session-input').setInputFiles(['public/dev-fixtures/precision.jpg', 'public/dev-fixtures/sighting.jpg']);
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/metadata/, { timeout: 60_000 });
  const imported = /#\/sessions\/([0-9a-f-]+)\/metadata/.exec(page.url())![1]!;
  expect(imported).not.toBe(first);
  await expect(page.getByLabel('Session name')).toHaveValue(/^Session \d{4}-\d{2}-\d{2} \(2\)$/);

  // Home lists both; Capture mints a third session rather than continuing either.
  await page.goto('/#/');
  const list = page.getByTestId('session-list');
  await expect(list.locator(`a[href*="${imported}"]`)).toBeVisible();
  await expect(list.locator(`a[href*="${first}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const third = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url())![1]!;
  expect(third).not.toBe(first);
  expect(third).not.toBe(imported);
});
