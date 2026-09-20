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

test('the target screen and Patterns show observed patterns, worked out over all the shots (REV-88)', async ({ page }) => {
  await openPrecision(page);
  // Worked out when the analysis was saved, on the target's own screen.
  const onTarget = page.getByTestId('observed-patterns');
  await expect(onTarget).toBeVisible();
  await expect(onTarget.getByTestId('characteristics')).toContainText('Group size');
  await expect(onTarget.getByTestId('characteristics')).toContainText('MOA');

  // There is no overlay panel of fixed regions any more.
  await expect(page.getByTestId('issue-panel')).toHaveCount(0);

  await page.goto('/#/patterns');
  await page.getByTestId('pattern-view-precision-prone').click();
  const pooled = page.getByTestId('observed-patterns');
  await expect(pooled).toBeVisible();
  await expect(pooled).toContainText('all');
  await expect(pooled.getByTestId('characteristics')).toContainText('Mean radius');
  await expect(page.getByTestId('patterns-drawing').locator('.issue-region')).toHaveCount(0);
});

test('Settings has a Shooter section for the trigger hand, and the choice is kept', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('handedness-right')).toBeChecked();
  await page.getByTestId('handedness-left').check();
  await expect(page.getByTestId('handedness-left')).toBeChecked();
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('asa');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const value = await new Promise<{ handedness?: string } | undefined>((resolve) => {
      const get = db.transaction('settings').objectStore('settings').get('app');
      get.onsuccess = () => resolve(get.result as { handedness?: string } | undefined);
    });
    db.close();
    return value?.handedness === 'left';
  });
  await page.reload();
  await expect(page.getByTestId('handedness-left')).toBeChecked();
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
