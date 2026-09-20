import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// M15 Tests: axe on home, metadata, results, target detail, adjust, diagnostics → no serious or
// critical violations.

interface HookPhoto {
  id: string;
}

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<HookPhoto[]>;
  };
};

test.setTimeout(240_000);

const SEVERE = new Set(['serious', 'critical']);

async function assertNoSevereViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((v) => SEVERE.has(v.impact ?? ''));
  expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
}

async function loadDemoSession(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  return sessionId;
}

test('a11y: home', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Nordic Aim' })).toBeVisible();
  await assertNoSevereViolations(page);
});

test('a11y: diagnostics', async ({ page }) => {
  await page.goto('/#/diagnostics');
  await page.getByTestId('panel-toggle-diag-checks').click({ timeout: 15000 });
  await expect(page.locator('tr[data-check-id="indexeddb"]')).toBeVisible({ timeout: 15000 });
  await assertNoSevereViolations(page);
});

test('a11y: metadata, results, target detail, adjust', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  const photoId = photos[0]?.id;
  if (!photoId) throw new Error('no photo in demo session');

  await page.goto(`/#/sessions/${sessionId}/metadata`);
  await expect(page.getByTestId('metadata-photo-count')).toBeVisible();
  await assertNoSevereViolations(page);

  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('target-card').first()).toBeVisible({ timeout: 30_000 });
  await assertNoSevereViolations(page);

  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await expect(page.getByTestId('target-detail-title')).toBeVisible({ timeout: 30_000 });
  await assertNoSevereViolations(page);

  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await expect(page.getByTestId('image-stage')).toBeVisible({ timeout: 30_000 });
  await assertNoSevereViolations(page);
});
