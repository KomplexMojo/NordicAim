// M21 step 4 (REV-42): the session review walks a session's photos — needing attention first — with the
// Adjust editor embedded, and Confirm saves as it goes.

import { expect, test, type Page } from '@playwright/test';

import type { Shot } from '../../src/lib/domain/analysis';

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<Array<{ id: string; status: string }>>;
    getAnalysis(photoId: string): Promise<{ calibration: { anchorDiameterMm: number } | null; shots: Shot[] } | null>;
    setShots(photoId: string, shots: unknown): Promise<void>;
  };
};

// `loadDemo` ingests two real JPEGs, and each review step asks the worker for suggestions.
test.setTimeout(240_000);

function listPhotos(page: Page, sessionId: string) {
  return page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
}

function getAnalysis(page: Page, photoId: string) {
  return page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), photoId);
}

test('review: walks the session needing-attention first, Confirm advances and saves edits (M21 step 4)', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  // Find the two demo photos by their anchor size, then give the sighting sheet no shots so it is the one
  // that needs attention (no-shots-found) and must come first.
  const photos = await listPhotos(page, sessionId);
  expect(photos).toHaveLength(2);
  let sightingId = '';
  let precisionId = '';
  for (const photo of photos) {
    const analysis = await getAnalysis(page, photo.id);
    if (analysis?.calibration?.anchorDiameterMm === 115) sightingId = photo.id;
    else precisionId = photo.id;
  }
  expect(sightingId).not.toBe('');
  expect(precisionId).not.toBe('');
  await page.evaluate((pid) => (window as HookWindow).__asaTest!.setShots(pid, []), sightingId);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const statuses = await listPhotos(page, sessionId);
  expect(statuses.find((p) => p.id === sightingId)?.status).toBe('needs-attention');
  expect(statuses.find((p) => p.id === precisionId)?.status).not.toBe('needs-attention');
  const precisionBefore = await getAnalysis(page, precisionId);

  // Entered from the session's results screen.
  await page.goto(`/#/sessions/${sessionId}/results`);
  await page.getByTestId('review-session-link').click();
  await page.waitForURL(new RegExp(`#/review/${sessionId}`));

  // Step 1: the photo needing attention, with the embedded Adjust editor. Confirm with no edits only moves on.
  await expect(page.getByTestId('review-step')).toHaveAttribute('data-photo-id', sightingId);
  await expect(page.getByTestId('review-progress')).toHaveText('Photo 1 of 2');
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('live-preview')).toBeVisible();
  await page.getByTestId('review-confirm').click();

  // Step 2: the other photo. Delete a shot and Confirm: that saves through saveAdjustments.
  await expect(page.getByTestId('review-step')).toHaveAttribute('data-photo-id', precisionId);
  await expect(page.getByTestId('review-progress')).toHaveText('Photo 2 of 2');
  await expect(page.getByTestId('review-headline')).not.toHaveText('No score yet');
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  await page.locator('[data-shot-id="P9"]').click();
  await page.getByTestId('delete-shot').click();
  await expect(page.getByTestId('review-headline')).toContainText('1 miss');
  await page.getByTestId('review-confirm').click();

  // The final step lists what changed and links back to results.
  await expect(page.getByTestId('review-summary')).toBeVisible();
  const rows = page.getByTestId('review-summary-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-photo-id', sightingId);
  await expect(rows.nth(0)).toHaveAttribute('data-outcome', 'unchanged');
  await expect(rows.nth(1)).toHaveAttribute('data-photo-id', precisionId);
  await expect(rows.nth(1)).toHaveAttribute('data-outcome', 'saved');

  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const precisionAfter = await getAnalysis(page, precisionId);
  expect(precisionAfter?.shots.map((s) => s.id)).toEqual(precisionBefore!.shots.filter((s) => s.id !== 'P9').map((s) => s.id));
  const sightingAfter = await getAnalysis(page, sightingId);
  expect(sightingAfter?.shots).toEqual([]);

  await page.getByTestId('review-done').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
});
