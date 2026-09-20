import { expect, test } from '@playwright/test';

// REV-67: a sighting target is Sight in or Confirm by the owner's choice, and Patterns follows it.

type HookWindow = Window & { __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> } };

test.setTimeout(240_000);

test('the role toggle on a sighting card is remembered, only sighting cards have it, and Patterns follows it', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sid}/results`);

  const sighting = page.getByTestId('target-card').filter({ hasText: 'Sighting' });
  const precision = page.getByTestId('target-card').filter({ hasText: 'Precision' });
  await expect(precision.getByTestId('sighting-role')).toHaveCount(0);

  // A lone sighting target is inferred to be the initial sight-in.
  await expect(sighting.getByTestId('sighting-role-sight-in')).toHaveAttribute('data-state', 'on');

  await sighting.getByTestId('sighting-role-confirm').click();
  await expect(sighting.getByTestId('sighting-role-confirm')).toHaveAttribute('data-state', 'on');
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.reload();
  await expect(page.getByTestId('target-card').filter({ hasText: 'Sighting' }).getByTestId('sighting-role-confirm')).toHaveAttribute(
    'data-state',
    'on',
  );

  await page.goto('/#/patterns');
  await page.getByTestId('pattern-view-sight-in').click();
  await expect(page.getByTestId('patterns-counts')).toHaveText('0 shots · 0 targets · 0 sessions');
  await page.getByTestId('pattern-view-confirm').click();
  await expect(page.getByTestId('patterns-counts')).toContainText('1 target · 1 session');
});
