import { expect, test } from '@playwright/test';

// REV-62 / issue #14: review text can be minimised, the label keeps the key fact, and the choice sticks.

type HookWindow = Window & { __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> } };

test.setTimeout(240_000);

test('collapsing the metrics keeps the group size in the label, survives a reload, and expands again', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sid}/results`);

  const card = page.getByTestId('target-card').first();
  const toggle = card.getByTestId('panel-toggle-metrics');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByTestId('metrics-list')).toBeVisible();

  const box = await toggle.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(card.getByTestId('metrics-list')).toBeHidden();
  await expect(card.getByTestId('panel-summary-metrics')).toContainText(/Group size .* mm/);

  await page.reload();
  await expect(page.getByTestId('target-card').first().getByTestId('panel-toggle-metrics')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('target-card').first().getByTestId('metrics-list')).toBeHidden();

  await page.getByTestId('target-card').first().getByTestId('panel-toggle-metrics').click();
  await expect(page.getByTestId('target-card').first().getByTestId('metrics-list')).toBeVisible();
});

test('the Garmin steps start collapsed, and the diagnostics data panel opens on demand', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sid}/results`);
  const garmin = page.getByTestId('panel-toggle-garmin');
  await expect(garmin).toHaveAttribute('aria-expanded', 'false');
  await garmin.click();
  await expect(page.getByText('Open the Garmin Connect app.')).toBeVisible();

  await page.goto('/#/diagnostics');
  const data = page.getByTestId('panel-toggle-diag-data');
  await expect(data).toHaveAttribute('aria-expanded', 'false');
  await expect(data).toContainText(/\d+ sessions?/);
  await data.click();
  await expect(page.getByTestId('data-counts')).toBeVisible();
});
