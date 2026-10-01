// Issue #42 (leaderboard.md): the Board tab previews what this phone would submit (best 5 per position, of all time), and a
// hand-corrected target shows its automatic score beside the owner's.

import { expect, test } from '@playwright/test';

test.setTimeout(240_000);

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<Array<{ id: string; categorization: { template: string | null } }>>;
    getAnalysis(photoId: string): Promise<{ shots: Array<Record<string, unknown> & { xMm: number; yMm: number }> } | null>;
    markAutomatic(photoId: string): Promise<void>;
    setShots(photoId: string, shots: unknown): Promise<void>;
  };
};

/** Loads the demo session and makes its precision target read as found by the app; returns its session and photo ids. */
async function automaticDemoTarget(page: import('@playwright/test').Page): Promise<{ sessionId: string; photoId: string }> {
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  const photoId = photos.find((p) => p.categorization.template === 'precision')!.id;
  await page.evaluate((pid) => (window as HookWindow).__asaTest!.markAutomatic(pid), photoId);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  return { sessionId, photoId };
}

test('the Board is the fifth tab; with no targets it says how many it needs', async ({ page }) => {
  await page.goto('/#/');
  await page.getByTestId('tab-board').click();
  await expect(page).toHaveURL(/#\/board$/);
  await expect(page.getByTestId('tab-board')).toHaveAttribute('aria-current', 'page');
  const box = await page.getByTestId('tab-board').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('board-preview-summary')).toHaveText('0 of 5 precision prone targets: 5 more to submit.');
  await page.getByTestId('board-view-precision-standing').click();
  await expect(page.getByTestId('board-preview-summary')).toHaveText('0 of 5 precision standing targets: 5 more to submit.');
});

test('five prone targets make a submission; a hand correction is marked, and flagged past 10 points', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);

  const first = await automaticDemoTarget(page);
  await page.goto('/#/board');
  await expect(page.getByTestId('board-preview-summary')).toHaveText('1 of 5 precision prone targets: 4 more to submit.');
  await expect(page.getByTestId('board-preview-target')).toHaveCount(1);
  await expect(page.getByTestId('board-preview-target')).toContainText('66%'); // the demo target read as detected: its x2 hole counts once, so one round is a miss
  await expect(page.getByTestId('mark-edited')).toHaveCount(0);

  for (let i = 0; i < 4; i++) await automaticDemoTarget(page);
  await page.goto('/#/board');
  await expect(page.getByTestId('board-preview')).toHaveAttribute('data-complete', 'true');
  await expect(page.getByTestId('board-preview-summary')).toHaveText('Average 66% · your best 5 of 5 targets');
  await expect(page.getByTestId('board-preview-target')).toHaveCount(5);

  // Correct the first target by hand: its nine holes dead centre score 90, 24 points above the automatic 66.
  const analysis = await page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), first.photoId);
  const centred = analysis!.shots.map((s) => ({ ...s, xMm: 0, yMm: 0 }));
  await page.evaluate(([pid, shots]) => (window as HookWindow).__asaTest!.setShots(pid as string, shots), [first.photoId, centred] as const);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/board');
  const top = page.getByTestId('board-preview-target').first();
  await expect(top).toContainText('90%');
  await expect(top.getByTestId('mark-edited')).toBeVisible();
  await expect(top.getByTestId('mark-flagged')).toBeVisible();
  await expect(page.getByTestId('board-preview-summary')).toHaveText('Average 71% · your best 5 of 5 targets');

  // The target screen says the same, and its back link returns to the Board.
  await top.click();
  await expect(page.getByTestId('correction-note')).toContainText('automatic 66% → yours 90% (+24)');
  await expect(page.getByTestId('correction-flag')).toBeVisible();
  await page.getByTestId('target-back').click();
  await expect(page).toHaveURL(/#\/board\?view=precision-prone$/);
});
