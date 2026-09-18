import { expect, test, type Page } from '@playwright/test';

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
  };
};

// `loadDemo` ingests two real JPEGs and waits for any in-flight Stage A job (OpenCV is ~10 MB of wasm).
test.setTimeout(240_000);

async function loadDemoSession(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  return sessionId;
}

/** Opens the precision target's detail screen (M12 step 4's route, unchanged by M17). */
async function openPrecisionTarget(page: Page, sessionId: string): Promise<void> {
  await page.goto(`/#/sessions/${sessionId}/results`);
  const precisionCard = page.getByTestId('target-card').filter({ hasText: '72 / 100 · X 1' });
  await expect(precisionCard).toHaveCount(1, { timeout: 30_000 });
  await precisionCard.getByTestId('view-target').click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/photos\/[0-9a-f-]+$/);
  // The results list uses the same testids, so wait until the detail screen has actually rendered.
  await expect(page.getByTestId('target-detail-title')).toBeVisible({ timeout: 30_000 });
}

test('target: the compare slider wipes the diagram across the photo (M17 step 3)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await openPrecisionTarget(page, sessionId);

  const slider = page.getByTestId('compare-slider');
  await expect(slider).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('compare-photo')).toBeVisible();

  // The diagram overlay is drawn in the photo's own pixel space, on top of the photo.
  const overlay = page.getByTestId('compare-overlay');
  await expect(overlay.locator('svg.diagram-overlay')).toHaveCount(1);
  await expect(overlay.locator('.overlay-ring')).toHaveCount(5); // capture-overlay §3.1 precision set

  // Default 0: the whole diagram.
  const range = page.getByTestId('compare-range');
  await expect(range).toHaveValue('0');
  await expect(overlay).toHaveAttribute('data-clip-path', 'inset(0 0% 0 0)');

  // It is a real <input type="range">, so the keyboard drives it (M17 step 3).
  await range.focus();
  await range.press('End');
  await expect(range).toHaveValue('1');
  await expect(overlay).toHaveAttribute('data-clip-path', 'inset(0 100% 0 0)');
  // …and the clip really is applied, not just recorded.
  expect(await overlay.evaluate((el) => getComputedStyle(el).clipPath)).toContain('100%');

  await range.press('Home');
  await expect(range).toHaveValue('0');
  await expect(overlay).toHaveAttribute('data-clip-path', 'inset(0 0% 0 0)');
});

test('target: the fade mode drives the opacity instead of the clip (REV-30)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await openPrecisionTarget(page, sessionId);

  const overlay = page.getByTestId('compare-overlay');
  await expect(overlay).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('compare-mode').click();
  await expect(page.getByTestId('compare-slider')).toHaveAttribute('data-compare-mode', 'fade');

  await expect(overlay).toHaveAttribute('data-opacity', '1');
  const range = page.getByTestId('compare-range');
  await range.focus();
  await range.press('End');
  await expect(range).toHaveValue('1');
  await expect(overlay).toHaveAttribute('data-opacity', '0');
  await expect(overlay).toHaveAttribute('data-clip-path', 'none');
  expect(await overlay.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
});

test('target: the rest of the detail screen is unchanged (M12 step 4)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await openPrecisionTarget(page, sessionId);

  await expect(page.getByTestId('target-headline')).toHaveText('72 / 100 · X 1', { timeout: 30_000 });
  await expect(page.getByTestId('diagram-full')).toBeVisible();
  await expect(page.getByTestId('tally-row-8')).toContainText('x2');
  await expect(page.getByTestId('photo-facts')).toBeVisible();
  await expect(page.getByTestId('zoom-toggle')).toBeVisible();
});
