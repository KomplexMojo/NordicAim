import { expect, test, type Page } from '@playwright/test';

import type { Shot } from '../../src/lib/domain/analysis';

interface HookAnalysis {
  calibration: { anchorDiameterMm: number } | null;
  shots: Shot[];
}

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<Array<{ id: string }>>;
    getAnalysis(photoId: string): Promise<HookAnalysis | null>;
    setShots(photoId: string, shots: unknown): Promise<void>;
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

async function waitForIdle(page: Page): Promise<void> {
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
}

async function getAnalysis(page: Page, photoId: string): Promise<HookAnalysis> {
  const analysis = await page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), photoId);
  if (analysis === null) throw new Error(`no analysis for ${photoId}`);
  return analysis;
}

/** The demo session's precision sheet, found by its anchor size (112.4 mm) rather than by index (shared
 * with adjust.spec.ts's own copy of this helper). */
async function precisionPhotoId(page: Page, sessionId: string): Promise<string> {
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  for (const photo of photos) {
    const analysis = await getAnalysis(page, photo.id);
    if (analysis.calibration?.anchorDiameterMm === 112.4) return photo.id;
  }
  throw new Error('no precision photo in the demo session');
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

  await page.getByTestId('photo-view-compare').click({ timeout: 30_000 });
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

  await page.getByTestId('photo-view-compare').click({ timeout: 30_000 });
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

/**
 * M24 Tests (third bullet), REV-49, issues #4/#6/#8: the target detail diagram must mark a unit that
 * was credited only by the touch rule (rendering-composite.md §3 item 7a). Moves P1 to a radial
 * distance of 7.05 mm — the milestone's own precision vector (`scoring/precision.ts` `isTouchCredited`,
 * geometry-scoring §4): it scores ring 10 only because the 5.6 mm hole's edge reaches the 10.4 mm ring,
 * not because the unit's own centre is inside it.
 */
test('target: a touch-credited unit draws the dashed ring and footer note (M24, REV-49)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);

  const before = await getAnalysis(page, photoId);
  const shots = before.shots.map((shot) => (shot.id === 'P1' ? { ...shot, xMm: 7.05, yMm: 0 } : shot));
  await page.evaluate(([pid, s]) => (window as HookWindow).__asaTest!.setShots(pid, s), [photoId, shots] as const);
  await waitForIdle(page);

  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await expect(page.getByTestId('target-detail-title')).toBeVisible({ timeout: 30_000 });

  const diagram = page.getByTestId('diagram-full');
  await expect(diagram).toBeVisible({ timeout: 30_000 });
  await expect(diagram.locator('circle.touch-credit')).toHaveCount(1);
  await expect(diagram).toContainText('scored by touching the line');
});
