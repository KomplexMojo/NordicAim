// Issue #107: New always starts a fresh session from the photo library, even when today already has a session; Capture
// then continues the session created last today.

import { expect, test } from '@playwright/test';

test('New puts library photos in a fresh session and goes to the metadata step', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const todays = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url())![1]!;

  await page.goto('/#/');
  await expect(page.getByRole('button', { name: "Capture (today's session)" })).toBeVisible();
  await page.getByTestId('new-session-input').setInputFiles(['public/dev-fixtures/precision.jpg', 'public/dev-fixtures/sighting.jpg']);
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/metadata/, { timeout: 60_000 });
  const fresh = /#\/sessions\/([0-9a-f-]+)\/metadata/.exec(page.url())![1]!;
  expect(fresh).not.toBe(todays);
  await expect(page.getByLabel('Session name')).toHaveValue(/^Session \d{4}-\d{2}-\d{2} \(2\)$/);

  // Home lists both, and Capture continues the newest session of the day.
  await page.goto('/#/');
  const list = page.getByTestId('session-list');
  await expect(list.locator(`a[href*="${fresh}"]`)).toBeVisible();
  await expect(list.locator(`a[href*="${todays}"]`)).toBeVisible();
  await page.getByRole('button', { name: "Capture (today's session)" }).click();
  await page.waitForURL(new RegExp(`#/sessions/${fresh}/capture`));
});
