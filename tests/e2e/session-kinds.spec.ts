// Issue #73 (REV-139): each Home row shows its targets' kinds as marks, and the count is still read out.

import { expect, test } from '@playwright/test';

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
  };
};

test("a session's row shows one mark per target kind, in the fixed kind order", async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto('/#/');

  const row = page.getByTestId('session-list').locator(`a[href*="${sessionId}"]`);
  const marks = row.getByTestId('session-kind-mark');
  // The demo session: one sighting target (its sight-in) and one precision target.
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toHaveAttribute('data-kind', 'sight-in');
  await expect(marks.nth(1)).toHaveAttribute('data-kind', /^precision-(prone|standing)$/);
  await expect(row.getByTestId('session-kinds')).toHaveAttribute('aria-label', /^2 targets: sight in, precision (prone|standing)$/);
});
