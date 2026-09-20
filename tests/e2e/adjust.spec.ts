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
    setCalibration(photoId: string, calibration: unknown): Promise<void>;
    setShots(photoId: string, shots: unknown): Promise<void>;
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
  await card.getByTestId('view-target').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/photos/${photoId}`));

  // 2. Select P9 and delete it: 9 identified of 10, total 67, missing 1.
  await page.locator('[data-testid="shot"][data-shot-id="P9"]').click();
  await expect(page.getByTestId('shot-inspector')).toBeVisible();
  await page.getByTestId('delete-shot').click();

  const remaining = FIXTURE.shots.filter((shot) => shot.id !== 'P9');
  const expectedHeadline = targetHeadline(
    analyzeTarget({ template: 'precision', categorization: FIXTURE.categorization, shots: remaining }),
  );
  // REV-39 (M20): the missing round is a miss and scores 0 — a definite total, never a range.
  expect(expectedHeadline).toBe('67 / 100 · 1 miss · X 1');
  await expect(page.getByTestId('live-headline')).toHaveText(expectedHeadline);
  await expect(page.getByTestId('adjust-shot-count')).toContainText('9 shots');

  // 3. Save: the card shows the definite total and the rounds-scored-as-miss note.
  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);
  await expect(card.getByTestId('target-headline')).toHaveText(expectedHeadline, { timeout: 30_000 });
  await expect(card.getByTestId('reason-list')).toContainText("1 round(s) weren't found and are scored as misses.");

  // 4. Adjust again and put a shot back near (-30.1, -28.4).
  await card.getByTestId('view-target').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/photos/${photoId}`));
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
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);
  await expect(card.getByTestId('status-chip')).toHaveAttribute('data-status', 'analyzed', { timeout: 30_000 });
  await expect(card.getByTestId('reason-list')).toHaveCount(0);
  await expect(card.getByTestId('target-headline')).not.toContainText('–');
});

test('adjust: the alignment mode edits the calibration and saves it as manual', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);

  await page.getByTestId('mode-alignment').click();
  await expect(page.getByTestId('alignment-handles')).toBeVisible();
  await expect(page.getByTestId('ring-polyline')).toHaveCount(5);

  await page.getByTestId('cal-cx').fill('600');
  await page.getByTestId('cal-angle').fill('10');
  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);

  const analysis = await getAnalysis(page, photoId);
  expect(analysis.calibration?.cx).toBe(600);
  expect(analysis.calibration?.angleDeg).toBe(10);
  expect(analysis.calibration?.source).toBe('manual');
  expect(analysis.pipeline.alignment.method).toBe('manual');
});

/** Drops a tray marker (or any element) at an image-px point on the stage, with a real pointer drag. */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function centreOf(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(testId).first().boundingBox();
  if (box === null) throw new Error(`${testId} has no box`);
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // A drag only works on points the pointer can actually reach.
  const viewport = page.viewportSize();
  if (viewport !== null) {
    expect(centre.y, `${testId} must be in the viewport to be dragged`).toBeGreaterThan(0);
    expect(centre.y).toBeLessThan(viewport.height);
  }
  return centre;
}

/** Brings the stage (and the tray beside it) back into view after the inspector scrolled the page. */
async function scrollStageIntoView(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId('image-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
}

test('adjust: a parked marker dragged onto the target places the missing round (M17 step 1)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);

  // No tray while all 10 declared rounds are accounted for (M17 step 1: `unplaced === 0` hides it).
  await expect(page.getByTestId('unplaced-tray')).toHaveCount(0);

  // Remove P9, leaving one declared round with no hole: one parked marker.
  await page.locator('[data-testid="shot"][data-shot-id="P9"]').click();
  await page.getByTestId('delete-shot').click();
  await expect(page.getByTestId('unplaced-tray')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('unplaced-marker')).toHaveCount(1);
  await expect(page.getByTestId('live-preview')).toContainText("1 round(s) weren't found and are scored as misses.");

  // Drag it onto the hole the app is missing.
  const saved = await getAnalysis(page, photoId);
  const calibration = saved.calibration!;
  await scrollStageIntoView(page);
  const g = await stageGeometry(page);
  const drop = toCss(g, mmToPx({ xMm: -30.1, yMm: -28.4 }, calibration));
  expect(onScreen(g, drop)).toBe(true);
  await dragTo(page, await centreOf(page, 'unplaced-marker'), drop);

  // The shot exists, so the tray count (which is derived) falls to zero and the tray disappears.
  await expect(page.getByTestId('adjust-shot-count')).toContainText('10 shots');
  await expect(page.getByTestId('unplaced-tray')).toHaveCount(0);
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'analyzed');

  // It is a manual shot of multiplicity 1 (M17 step 1).
  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);
  const after = await getAnalysis(page, photoId);
  // 9 fixture holes (one of them x2 = 10 units), minus P9, plus the one just placed.
  expect(after.shots).toHaveLength(FIXTURE.shots.length);
  const fixtureIds = new Set(FIXTURE.shots.map((shot) => shot.id));
  const placed = after.shots.filter((shot) => !fixtureIds.has(shot.id));
  expect(placed).toHaveLength(1);
  expect(placed[0]!.source).toBe('manual');
  expect(placed[0]!.multiplicity).toBe(1);

  const card = page.locator(`[data-testid="target-card"][data-photo-id="${photoId}"]`);
  await expect(card.getByTestId('status-chip')).toHaveAttribute('data-status', 'analyzed', { timeout: 30_000 });
  await expect(card.locator('[data-reason="rounds-unaccounted"]')).toHaveCount(0);
  await expect(card.locator('[data-reason="rounds-scored-as-miss"]')).toHaveCount(0);
});

test('adjust: a placed shot dragged onto the tray is removed (M17 step 1)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);

  // Delete one shot the ordinary way so the tray is on screen to drag onto.
  await page.locator('[data-testid="shot"][data-shot-id="P9"]').click();
  await page.getByTestId('delete-shot').click();
  await expect(page.getByTestId('unplaced-tray')).toHaveAttribute('data-count', '1');

  // Shots overlap, so press on one whose own hit circle is actually on top at its centre.
  await scrollStageIntoView(page);
  let grabbed: { id: string; multiplicity: number; from: { x: number; y: number } } | null = null;
  for (const candidate of FIXTURE.shots) {
    if (candidate.id === 'P9') continue;
    const b = await page.locator(`[data-testid="shot"][data-shot-id="${candidate.id}"]`).boundingBox();
    if (b === null) continue;
    const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const onTop = await page.evaluate(
      (pt) => document.elementFromPoint(pt.x, pt.y)?.closest('[data-shot-id]')?.getAttribute('data-shot-id') ?? null,
      from,
    );
    if (onTop === candidate.id) {
      grabbed = { id: candidate.id, multiplicity: candidate.multiplicity, from };
      break;
    }
  }
  if (grabbed === null) throw new Error('no shot is grabbable at its own centre');
  const unitsLeft = 10 - 1 - grabbed.multiplicity;

  const shot = page.locator(`[data-testid="shot"][data-shot-id="${grabbed.id}"]`);
  await dragTo(page, grabbed.from, await centreOf(page, 'unplaced-tray'));

  await expect(shot).toHaveCount(0);
  await expect(page.getByTestId('adjust-shot-count')).toContainText(`${unitsLeft} shots`);
  // The tray count is derived, so removing a round puts a marker back: 10 declared - 8 units.
  await expect(page.getByTestId('unplaced-tray')).toHaveAttribute('data-count', String(10 - unitsLeft));
});

test('adjust: re-aligning keeps every shot on its hole, and Re-analyze uses the new alignment (REV-46)', async ({
  page,
}) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  const before = await getAnalysis(page, photoId);
  const cal0 = before.calibration!;
  // Without shots the "stays on its hole" check below would pass vacuously.
  expect(before.shots.length).toBeGreaterThan(3);
  // Where each hole is in the photo. Re-aligning moves the rings, never the holes.
  const holesPx = before.shots.map((shot) => mmToPx(shot, cal0));

  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);
  await page.getByTestId('mode-alignment').click();
  await page.getByTestId('cal-cx').fill(String(Math.round(cal0.cx + 24)));
  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);

  const saved = await getAnalysis(page, photoId);
  expect(saved.calibration?.cx).toBe(Math.round(cal0.cx + 24));
  expect(saved.shots).toHaveLength(before.shots.length);
  saved.shots.forEach((shot, i) => {
    const now = mmToPx(shot, saved.calibration!);
    expect(now.x).toBeCloseTo(holesPx[i]!.x, 2);
    expect(now.y).toBeCloseTo(holesPx[i]!.y, 2);
    // Following a re-alignment is not an edit: each shot keeps the source it had.
    expect(shot.source).toBe(before.shots[i]!.source);
  });

  // Re-analyze from a second re-alignment: the detection must run against the alignment on screen.
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);
  await page.getByTestId('mode-alignment').click();
  const cx2 = Math.round(cal0.cx - 12);
  await page.getByTestId('cal-cx').fill(String(cx2));
  await page.getByTestId('reanalyze').click();
  await expect(page.getByText('Re-analyzed with your alignment and shots.')).toBeVisible({ timeout: 120_000 });
  await waitForIdle(page);

  const after = await getAnalysis(page, photoId);
  expect(after.calibration?.cx).toBe(cx2);
  expect(after.calibration?.source).toBe('manual');
});

test('adjust: a manual edit keeps the sheet\'s tilt and Reset alignment clears it (REV-44)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  const before = await getAnalysis(page, photoId);
  // The demo seeds its calibrations as manual, so Stage A never measures a tilt for it (the measurement
  // itself is unit-tested); give the stored calibration one, the shape Stage A would store.
  const tilt = { p: 1.2e-4, q: -6.1e-4 };
  await page.evaluate(
    ([pid, cal]) => (window as HookWindow).__asaTest!.setCalibration(pid, cal),
    [photoId, { ...before.calibration!, perspective: tilt }] as const,
  );
  await waitForIdle(page);

  // A manual edit to the ellipse keeps the measured tilt.
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);
  await page.getByTestId('mode-alignment').click();
  await expect(page.getByTestId('cal-reset-alignment')).toBeEnabled();
  await page.getByTestId('cal-cx').fill(String(Math.round(before.calibration!.cx + 5)));
  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);
  const edited = await getAnalysis(page, photoId);
  expect(edited.calibration?.source).toBe('manual');
  expect(edited.calibration?.cx).toBe(Math.round(before.calibration!.cx + 5));
  expect(edited.calibration?.perspective).toEqual(tilt);

  // Re-analyze with the tilt: A5's rectification takes the perspective warp in the real worker.
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);
  await page.getByTestId('reanalyze').click();
  await expect(page.getByText('Re-analyzed with your alignment and shots.')).toBeVisible({ timeout: 120_000 });
  await waitForIdle(page);
  const reanalyzed = await getAnalysis(page, photoId);
  expect(reanalyzed.calibration?.perspective).toEqual(tilt);
  expect(reanalyzed.shots.length).toBeGreaterThan(0);

  // Reset alignment clears it, and a tilt-only change is saved like any other alignment change.
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);
  await page.getByTestId('mode-alignment').click();
  await page.getByTestId('cal-reset-alignment').click();
  await expect(page.getByTestId('cal-reset-alignment')).toBeDisabled();
  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);
  const reset = await getAnalysis(page, photoId);
  expect(reset.calibration?.perspective).toBeNull();
  expect(reset.calibration?.cx).toBe(edited.calibration?.cx);
  expect(reset.calibration?.source).toBe('manual');
});

/**
 * M21 step 2 (REV-40). The demo's seeded alignment leaves no suggestion on either sheet, so the alignment
 * is moved 80 px down first: measured in Node (`detectShotsWithBacking`) the detector then discards three
 * ring-sized marks inside 60 mm that the rule offers. What they are does not matter here — the test is
 * that a suggestion is drawn, a tap turns it into exactly one manual shot, and nothing else is stored.
 */
test('adjust: a suggested hole becomes a manual shot with one tap and nothing else is stored (M21)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  const photoId = await precisionPhotoId(page, sessionId);
  const before = await getAnalysis(page, photoId);
  const shifted = { ...before.calibration!, cy: before.calibration!.cy + 80 };
  await page.evaluate(([pid, cal]) => (window as HookWindow).__asaTest!.setCalibration(pid, cal), [photoId, shifted] as const);
  // One round short, so the new shot visibly changes the score (the miss goes).
  const nine = before.shots.filter((shot) => shot.id !== 'P9');
  await page.evaluate(([pid, shots]) => (window as HookWindow).__asaTest!.setShots(pid, shots), [photoId, nine] as const);
  await waitForIdle(page);

  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await readyStage(page);
  // The worker measures them after the page opens.
  const suggestions = page.getByTestId('suggested-hole');
  await expect(suggestions.first()).toBeAttached({ timeout: 120_000 });
  const offered = await suggestions.count();
  expect(offered).toBeGreaterThan(0);
  expect(offered).toBeLessThanOrEqual(3);
  await expect(page.getByTestId('toggle-suggestions')).toBeVisible();

  const headlineBefore = await page.getByTestId('live-headline').textContent();
  expect(headlineBefore).toContain('1 miss');

  // Tap one whose own hit circle is on top at its centre (a shot could sit over it).
  await scrollStageIntoView(page);
  let tapped: { id: string; at: { x: number; y: number } } | null = null;
  for (let i = 0; i < offered; i += 1) {
    const el = suggestions.nth(i);
    const box = await el.boundingBox();
    const id = await el.getAttribute('data-suggestion-id');
    if (box === null || id === null) continue;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const onTop = await page.evaluate(
      (pt) => document.elementFromPoint(pt.x, pt.y)?.closest('[data-suggestion-id]')?.getAttribute('data-suggestion-id') ?? null,
      at,
    );
    if (onTop === id) {
      tapped = { id, at };
      break;
    }
  }
  if (tapped === null) throw new Error('no suggestion is tappable at its own centre');
  await page.mouse.click(tapped.at.x, tapped.at.y);

  // One manual shot more, that suggestion gone, and the live score moved.
  await expect(page.getByTestId('adjust-shot-count')).toContainText('10 shots');
  await expect(page.locator(`[data-suggestion-id="${tapped.id}"]`)).toHaveCount(0);
  await expect(page.getByTestId('live-headline')).not.toHaveText(headlineBefore ?? '');

  // The layer can be hidden entirely.
  if ((await suggestions.count()) > 0) {
    await page.getByTestId('toggle-suggestions').click();
    await expect(suggestions).toHaveCount(0);
  }

  await page.getByTestId('save-adjustments').click();
  // REV-73: Save stays on the target; go to the results to look at the effect.
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);
  const after = await getAnalysis(page, photoId);
  // Exactly one shot was added: the tapped suggestion. The others were never stored.
  expect(after.shots).toHaveLength(nine.length + 1);
  const known = new Set(nine.map((shot) => shot.id));
  const added = after.shots.filter((shot) => !known.has(shot.id));
  expect(added).toHaveLength(1);
  expect(added[0]!.source).toBe('manual');
  expect(added[0]!.multiplicity).toBe(1);
  expect(JSON.stringify(after)).not.toContain('suggestion');
});
