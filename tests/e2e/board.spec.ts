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

/** One "phone": five automatic prone targets, a name and club, and a stamp passphrase that signs its submission. */
async function readyPhone(page: import('@playwright/test').Page, name: string, club: string): Promise<void> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 5; i++) await automaticDemoTarget(page);
  await identify(page, name, club);
}

/** A name, a club and a stamp passphrase, with no targets. */
async function identify(page: import('@playwright/test').Page, name: string, club: string): Promise<void> {
  await page.goto('/#/settings');
  await page.getByTestId('athlete-name').fill(name);
  await page.getByTestId('athlete-club').fill(club);
  await page.getByTestId('athlete-club').blur();
  await page.getByTestId('athlete-passphrase').fill(`${name} correct horse battery staple`);
  await page.getByTestId('set-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('Key set', { timeout: 30_000 });
  // Headless Chromium has no share sheet, so a share is a download, which the test can pick up.
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
}

test('two phones: one shares its signed submission, the other previews and imports it; importing twice changes nothing', async ({ browser }, testInfo) => {
  const bob = await (await browser.newContext()).newPage();
  await readyPhone(bob, 'Bob Berg', 'North SC');
  await bob.goto('/#/board');
  await bob.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const [download] = await Promise.all([bob.waitForEvent('download'), bob.getByTestId('board-share-mine').click()]);
  expect(download.suggestedFilename()).toMatch(/^nordic-aim-submission-bob-berg-\d{4}-\d{2}-\d{2}\.json$/);
  const bobFile = testInfo.outputPath('bob.json');
  await download.saveAs(bobFile);

  const ann = await (await browser.newContext()).newPage();
  await ann.goto('/#/board');
  // Nothing to submit yet, but a board can still be imported.
  await expect(ann.getByTestId('board-share-mine')).toBeDisabled();
  await expect(ann.getByTestId('board-empty')).toBeVisible();
  await ann.getByTestId('board-import-input').setInputFiles(bobFile);
  await expect(ann.getByTestId('board-import-review')).toContainText('1 submission: 1 new shooter, 0 updated, 0 already on your board.');
  await ann.getByTestId('board-import-apply').click();
  await expect(ann.getByTestId('board-row')).toHaveCount(1);
  await expect(ann.getByTestId('board-row-name')).toHaveText('Bob Berg');
  await expect(ann.getByTestId('board-row-average')).toHaveAttribute('aria-label', 'Average 66%');
  // The top scorer's place is the trophy.
  await expect(ann.getByTestId('board-row').first().getByTestId('board-top-trophy')).toBeVisible();

  await ann.getByTestId('board-import-input').setInputFiles(bobFile);
  await expect(ann.getByTestId('board-import-review')).toContainText('0 new shooters, 0 updated, 1 already on your board');

  // Only prone was submitted; Bob is not on the standing board.
  await ann.getByTestId('board-view-precision-standing').click();
  await expect(ann.getByTestId('board-empty')).toBeVisible();

  // Clearing asks first; Cancel keeps the board, the second tap empties it.
  await ann.getByTestId('board-view-precision-prone').click();
  await ann.getByTestId('board-clear').click();
  await expect(ann.getByTestId('board-clear-confirm')).toContainText('Remove the 1 shooter');
  await ann.getByTestId('board-clear-cancel').click();
  await expect(ann.getByTestId('board-row')).toHaveCount(1);
  await ann.getByTestId('board-clear').click();
  await ann.getByTestId('board-clear-apply').click();
  await expect(ann.getByTestId('board-empty')).toBeVisible();
  await expect(ann.getByTestId('board-clear')).toHaveCount(0);
});

test('a submission changed after signing is rejected on import', async ({ page }, testInfo) => {
  await readyPhone(page, 'Cy Dahl', '');
  await page.goto('/#/board');
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('board-share-mine').click()]);
  const original = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf-8')) as { name: string; publicKey: string };
  // The same shooter's own submission is never added to their own board; send it to a fresh phone, renamed.
  const forged = testInfo.outputPath('forged.json');
  await (await import('node:fs/promises')).writeFile(forged, JSON.stringify({ ...original, name: 'Not Cy' }));
  const other = await (await page.context().browser()!.newContext()).newPage();
  await other.goto('/#/board');
  await other.getByTestId('board-import-input').setInputFiles(forged);
  await expect(other.getByTestId('board-import-review')).toContainText("1 rejected (signature doesn't match)");
  await expect(other.getByTestId('board-import-apply')).toBeDisabled();
});

test('challenges are hidden for now: no Challenge button and no Hide challenged', async ({ browser }, testInfo) => {
  const bob = await (await browser.newContext()).newPage();
  await readyPhone(bob, 'Bob Berg', 'North SC');
  await bob.goto('/#/board');
  await bob.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const [bobDownload] = await Promise.all([bob.waitForEvent('download'), bob.getByTestId('board-share-mine').click()]);
  const bobFile = testInfo.outputPath('bob.json');
  await bobDownload.saveAs(bobFile);

  const ann = await (await browser.newContext()).newPage();
  await ann.goto('/#/');
  await identify(ann, 'Ann Lee', 'South SC');
  await ann.goto('/#/board');
  await ann.getByTestId('board-import-input').setInputFiles(bobFile);
  await ann.getByTestId('board-import-apply').click();

  const row = ann.getByTestId('board-row').first();
  await row.locator('summary').click();
  await expect(row.getByTestId('board-row-target')).toHaveCount(5);
  await expect(row.getByTestId('challenge-open')).toHaveCount(0);
  await expect(ann.getByTestId('board-hide-challenged')).toHaveCount(0);
  await expect(ann.getByTestId('board-hide-flagged')).toBeVisible();
});
