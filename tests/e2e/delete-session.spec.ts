import { expect, test } from '@playwright/test';

// REV-61 / issue #18: deleting a session takes three deliberate steps and removes everything attached to it.

type HookWindow = Window & {
  __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> };
};

test.setTimeout(240_000);

test('a session is deleted only after three steps and its exact name; cancelling deletes nothing', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const doomedId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const keptId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  expect(keptId).not.toBe(doomedId);

  // Home is the one screen that lists every session, and Delete is on it (REV-72).
  await page.goto('/#/');
  const doomedDelete = page.locator(`[data-testid="session-delete"][data-session-id="${doomedId}"]`);
  await expect(doomedDelete).toBeVisible();
  const rowsBefore = await page.getByTestId('session-delete').count();
  expect(rowsBefore).toBeGreaterThanOrEqual(2);

  // Cancel at step 1 deletes nothing.
  const dialog = page.getByTestId('delete-session-dialog');
  await doomedDelete.click();
  await expect(dialog).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('delete-counts')).toContainText(/photo/);
  await page.getByTestId('delete-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('session-delete')).toHaveCount(rowsBefore);

  // Cancel at step 2 (go back, then out) deletes nothing.
  await doomedDelete.click();
  await page.getByTestId('delete-continue-1').click();
  await expect(dialog).toHaveAttribute('data-step', '2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('session-delete')).toHaveCount(rowsBefore);

  // The full path: the destructive button stays disabled until the exact phrase is typed.
  await doomedDelete.click();
  await page.getByTestId('delete-continue-1').click();
  await page.getByTestId('delete-continue-2').click();
  await expect(dialog).toHaveAttribute('data-step', '3');
  const confirm = page.getByTestId('delete-confirm');
  const phrase = (await page.getByTestId('delete-phrase').textContent())!;
  await expect(confirm).toBeDisabled();
  await page.getByTestId('delete-phrase-input').fill(`${phrase} `);
  await expect(confirm).toBeDisabled();
  await page.getByTestId('delete-phrase-input').fill(phrase.toLowerCase() === phrase ? phrase.toUpperCase() : phrase.toLowerCase());
  await expect(confirm).toBeDisabled();
  await page.getByTestId('delete-phrase-input').fill(phrase);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(doomedDelete).toHaveCount(0);
  await expect(page.getByTestId('session-delete')).toHaveCount(rowsBefore - 1);
  await expect(page.locator(`[data-testid="session-delete"][data-session-id="${keptId}"]`)).toBeVisible();

  // Gone from Home too, and the other session still opens with its results.
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByTestId('session-list').locator('a[href*="' + doomedId + '"]')).toHaveCount(0);
  await page.goto(`/#/sessions/${keptId}/results`);
  await expect(page.getByTestId('target-card').first()).toBeVisible({ timeout: 30_000 });
});

test('there is no separate Sessions screen: the old address lands on Home, which lists every session', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  }
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/sessions');
  await expect(page).toHaveURL(/#\/$/);
  // All seven, not just the most recent few, each with Delete.
  await expect(page.getByTestId('session-delete')).toHaveCount(7);
  await expect(page.getByTestId('open-patterns')).toBeVisible();
});
