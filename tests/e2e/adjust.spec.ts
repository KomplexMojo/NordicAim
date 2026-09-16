import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import type { Shot } from '../../src/lib/domain/analysis';
import type { Calibration, Categorization } from '../../src/lib/domain/photo';
import { mmToPx } from '../../src/lib/geometry/transform';
import { targetHeadline } from '../../src/lib/render/text-lines';
import { analyzeTarget } from '../../src/lib/scoring/analyze';

interface HookAnalysis {
  calibration: (Calibration & { anchorDiameterMm: number }) | null;
  shots: Shot[];
  pipeline: { alignment: { method: string }; stageB: string };
}

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<Array<{ id: string }>>;
    getAnalysis(photoId: string): Promise<HookAnalysis | null>;
  };
};

// `loadDemo` ingests two real JPEGs and waits for any in-flight Stage A job (OpenCV is ~10 MB of wasm).
test.setTimeout(240_000);

/** geometry-scoring §9.1: the golden precision shots the demo session is seeded with. */
const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../fixtures/reference/sample-shots-precision.json', import.meta.url)), 'utf-8'),
) as { categorization: Categorization; shots: Shot[] };

/** M13 Pitfalls: a tap within 22 CSS px of a shot grabs that shot, so an "add" tap must clear it. */
const SHOT_HIT_RADIUS_CSS = 22;
const SAFE_GAP_CSS = 26;

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

/** The demo session's precision sheet, found by its anchor size (112.4 mm) rather than by index. */
async function precisionPhotoId(page: Page, sessionId: string): Promise<string> {
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  for (const photo of photos) {
    const analysis = await getAnalysis(page, photo.id);
    if (analysis.calibration?.anchorDiameterMm === 112.4) return photo.id;
  }
  throw new Error('no precision photo in the demo session');
}

interface Geometry {
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  ox: number;
  oy: number;
}

/** The stage only has a real transform once its container has been measured (ResizeObserver). */
async function readyStage(page: Page) {
  const stage = page.getByTestId('image-stage');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  return stage;
}

async function stageGeometry(page: Page): Promise<Geometry> {
  const stage = await readyStage(page);
  const box = await stage.boundingBox();
  if (box === null) throw new Error('the image stage has no box');
  return {
    box,
    scale: Number(await stage.getAttribute('data-scale')),
    ox: Number(await stage.getAttribute('data-offset-x')),
    oy: Number(await stage.getAttribute('data-offset-y')),
  };
}

function toCss(g: Geometry, p: { x: number; y: number }): { x: number; y: number } {
  return { x: g.box.x + g.ox + p.x * g.scale, y: g.box.y + g.oy + p.y * g.scale };
}

function onScreen(g: Geometry, css: { x: number; y: number }): boolean {
  const margin = 12;
  return (
    css.x >= g.box.x + margin &&
    css.x <= g.box.x + g.box.width - margin &&
    css.y >= g.box.y + margin &&
    css.y <= g.box.y + g.box.height - margin
  );
}

function nearestShotCss(g: Geometry, css: { x: number; y: number }, others: Array<{ x: number; y: number }>): number {
  return Math.min(
    ...others.map((o) => {
      const p = toCss(g, o);
      return Math.hypot(p.x - css.x, p.y - css.y);
    }),
  );
}

/**
 * Taps the stage at an image-px point. Zooms in first if the point sits inside another shot's 22 CSS px
 * hit radius, which would select that shot instead of adding one.
 */
async function tapImagePoint(
  page: Page,
  target: { x: number; y: number },
  others: Array<{ x: number; y: number }>,
): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const g = await stageGeometry(page);
    const css = toCss(g, target);
    if (nearestShotCss(g, css, others) >= SAFE_GAP_CSS && onScreen(g, css)) break;
    if (!onScreen(g, css)) {
      // Zoomed in far enough that the point scrolled out of the stage: step back once.
      const zoomOut = page.getByTestId('zoom-out');
      if (await zoomOut.isEnabled()) {
        await zoomOut.click();
        await page.waitForTimeout(150);
      }
      break;
    }
    await page.getByTestId('zoom-in').click();
    await page.waitForTimeout(150);
  }

  const g = await stageGeometry(page);
  const css = toCss(g, target);
  expect(onScreen(g, css)).toBe(true);
  expect(nearestShotCss(g, css, others)).toBeGreaterThan(SHOT_HIT_RADIUS_CSS);
  await page.mouse.click(css.x, css.y);
}

test('adjust: deleting a shot rescored live, saved, and put back again', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  await page.goto(`/#/sessions/${sessionId}/results`);

  const card = page.locator(`[data-testid="target-card"][data-photo-id="${photoId}"]`);
  await expect(card).toHaveCount(1, { timeout: 30_000 });

  // 1. Adjust shots on the precision target.
  await card.getByTestId('adjust-shots').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/photos/${photoId}/adjust`));

  // 2. Select P9 and delete it: 9 identified of 10, total 67, missing 1.
  await page.locator('[data-shot-id="P9"]').click();
  await expect(page.getByTestId('shot-inspector')).toBeVisible();
  await page.getByTestId('delete-shot').click();

  const remaining = FIXTURE.shots.filter((shot) => shot.id !== 'P9');
  const expectedHeadline = targetHeadline(
    analyzeTarget({ template: 'precision', categorization: FIXTURE.categorization, shots: remaining }),
  );
  // Pessimistic adds the lowest remaining ring (6), optimistic adds 10 (geometry-scoring §8.1).
  expect(expectedHeadline).toBe('73–77 / 100 · X 1');
  await expect(page.getByTestId('live-headline')).toHaveText(expectedHeadline);
  await expect(page.getByTestId('adjust-shot-count')).toContainText('9 shots');

  // 3. Save: the card shows the range and the rounds-unaccounted reason.
  await page.getByTestId('save-adjustments').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await waitForIdle(page);
  await expect(card.getByTestId('target-headline')).toHaveText(expectedHeadline, { timeout: 30_000 });
  await expect(card.getByTestId('reason-list')).toContainText('1 round(s) not found');

  // 4. Adjust again and put a shot back near (-30.1, -28.4).
  await card.getByTestId('adjust-shots').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/photos/${photoId}/adjust`));
  const saved = await getAnalysis(page, photoId);
  const calibration = saved.calibration!;
  await tapImagePoint(
    page,
    mmToPx({ xMm: -30.1, yMm: -28.4 }, calibration),
    saved.shots.map((shot) => mmToPx(shot, calibration)),
  );

  await expect(page.getByTestId('adjust-shot-count')).toContainText('10 shots');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'analyzed');

  await page.getByTestId('save-adjustments').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await waitForIdle(page);
  await expect(card.getByTestId('status-chip')).toHaveAttribute('data-status', 'analyzed', { timeout: 30_000 });
  await expect(card.getByTestId('reason-list')).toHaveCount(0);
  await expect(card.getByTestId('target-headline')).not.toContainText('–');
});

test('adjust: the alignment mode edits the calibration and saves it as manual', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}/adjust`);

  await page.getByTestId('mode-alignment').click();
  await expect(page.getByTestId('alignment-handles')).toBeVisible();
  await expect(page.getByTestId('ring-polyline')).toHaveCount(5);

  await page.getByTestId('cal-cx').fill('600');
  await page.getByTestId('cal-angle').fill('10');
  await page.getByTestId('save-adjustments').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await waitForIdle(page);

  const analysis = await getAnalysis(page, photoId);
  expect(analysis.calibration?.cx).toBe(600);
  expect(analysis.calibration?.angleDeg).toBe(10);
  expect(analysis.calibration?.source).toBe('manual');
  expect(analysis.pipeline.alignment.method).toBe('manual');
});
