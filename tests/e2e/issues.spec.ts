import { expect, test } from '@playwright/test';

// REV-74/REV-77: collapsible metric cards on the target screen, and the shooting-issue overlays (Patterns only).

type HookWindow = Window & {
  __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void>; listPhotos(id: string): Promise<Array<{ id: string; categorization: { template: string | null } }>> };
};

test.setTimeout(240_000);

async function openPrecision(page: import('@playwright/test').Page) {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const photos = await page.evaluate((s) => (window as HookWindow).__asaTest!.listPhotos(s), sid);
  const precision = photos.find((p) => p.categorization.template === 'precision')!;
  await page.goto(`/#/sessions/${sid}/photos/${precision.id}`);
  await expect(page.getByTestId('diagram-full')).toBeVisible({ timeout: 30_000 });
}

test('the metrics and photo cards on the target screen collapse, keeping the key fact on the label', async ({ page }) => {
  await openPrecision(page);
  const toggle = page.locator('[data-testid^="panel-toggle-subset-"]').first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-testid^="panel-summary-subset-"]').first()).toContainText('/ 100');

  const photo = page.getByTestId('panel-toggle-photo-facts');
  await expect(photo).toHaveAttribute('aria-expanded', 'false');
  await photo.click();
  await expect(page.getByTestId('photo-facts')).toContainText('Lighting');
});

test('the Patterns drawing takes the same overlays', async ({ page }) => {
  await page.goto('/#/patterns');
  await page.getByTestId('panel-toggle-issues').click();
  await page.getByTestId('issue-toggle-scattered').click();
  await expect(page.getByTestId('patterns-drawing').locator('.issue-region')).toHaveCount(1);
});

test('the shooting-issue overlays are only on Patterns, and the target screen has none', async ({ page }) => {
  await openPrecision(page);
  await expect(page.getByTestId('issue-panel')).toHaveCount(0);

  await page.goto('/#/patterns');
  await page.getByTestId('panel-toggle-issues').click();
  await page.getByTestId('issue-toggle-tight').click();
  await page.getByTestId('issue-toggle-scattered').click();
  const drawing = page.getByTestId('patterns-drawing');
  await expect(drawing.locator('.issue-overlay')).toHaveCount(2);
  const radius = async (id: string) => Number(await drawing.locator(`[data-issue="${id}"] circle`).first().getAttribute('r'));
  expect(await radius('tight')).toBeLessThan(await radius('scattered'));
  await page.getByTestId('issue-toggle-tight').click();
  await expect(drawing.locator('[data-issue="tight"]')).toHaveCount(0);
  await page.getByTestId('issue-clear').click();
  await expect(drawing.locator('.issue-region')).toHaveCount(0);
});

test('Patterns can show the latest session or this week only', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
    await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  }
  await page.goto('/#/patterns');
  await page.getByTestId('pattern-view-sight-in').click();
  await expect(page.getByTestId('patterns-counts')).toContainText('2 sessions');
  await page.getByTestId('pattern-range-last').click();
  await expect(page.getByTestId('patterns-counts')).toContainText('1 session');
  // The demo sessions are dated today, so this week keeps both.
  await page.getByTestId('pattern-range-week').click();
  await expect(page.getByTestId('patterns-counts')).toContainText('2 sessions');
});
