import { expect, test, type Page } from '@playwright/test';

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
  };
};

// `loadDemo` ingests two real JPEGs and waits for any in-flight Stage A job (OpenCV is ~10 MB of wasm)
// before it seeds the fixture data, and the last test runs the whole capture → Analyze journey.
test.setTimeout(240_000);

/** analysis-pipeline §10: the demo session, with fixture shots and calibrations, already analyzed. */
async function loadDemoSession(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  return sessionId;
}

async function waitForIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
}

async function createSessionViaHome(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const match = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url());
  if (!match?.[1]) throw new Error(`no session id in ${page.url()}`);
  return match[1];
}

test('results: the demo session scores both reference targets', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);

  const cards = page.getByTestId('target-card');
  await expect(cards).toHaveCount(2, { timeout: 30_000 });

  // geometry-scoring §9.1 / §9.2 headlines (rendering-composite `targetHeadline`).
  await expect(page.getByTestId('target-headline').nth(0)).toHaveText('9/10 hits @ 45 mm');
  await expect(page.getByTestId('target-headline').nth(1)).toHaveText('72 / 100 · X 1');

  const chips = page.getByTestId('status-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveText('Analyzed');
  await expect(chips.nth(1)).toHaveText('Analyzed');

  // The cell diagram from Stage B is drawn inline on each card.
  await expect(page.getByTestId('diagram-cell')).toHaveCount(2);
});

test('results: the demo precision target analyses without too-many-shots (REV-28)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('target-card')).toHaveCount(2, { timeout: 30_000 });

  // The fixture is a 10-round precision sheet with 10 identified units: nothing to cap, nothing to
  // over-count, so neither reason may appear on either card.
  await expect(page.locator('[data-reason="too-many-shots"]')).toHaveCount(0);
  await expect(page.locator('[data-reason="extra-candidates-dropped"]')).toHaveCount(0);
  await expect(page.getByTestId('status-chip').nth(1)).toHaveText('Analyzed');
});

test('results: View opens the target detail with the precision tally', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);

  const precisionCard = page.getByTestId('target-card').filter({ hasText: '72 / 100 · X 1' });
  await expect(precisionCard).toHaveCount(1, { timeout: 30_000 });
  await precisionCard.getByTestId('view-target').click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/photos\/[0-9a-f-]+$/);

  // geometry-scoring §9.1 tally: {10:1, 9:1, 8:2, 7:2, 6:3, 5:1}.
  await expect(page.getByTestId('tally-row-8')).toContainText('x2');
  await expect(page.getByTestId('tally-row-6')).toContainText('x3');
});

test('results: raising the declared rounds scores the extra rounds as misses (REV-39)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);

  await page.goto(`/#/sessions/${sessionId}/metadata`);
  // Capture order: sighting first, precision second (analysis-pipeline §10).
  const precisionMetadataCard = page.getByTestId('photo-metadata-card').nth(1);
  const roundsProne = precisionMetadataCard.locator('input[id$="-rounds-prone"]');
  await expect(roundsProne).toHaveValue('10', { timeout: 30_000 });
  await roundsProne.fill('12');
  await roundsProne.blur();
  await page.waitForTimeout(300);

  await page.goto(`/#/sessions/${sessionId}/results`);
  await waitForIdle(page);

  const precisionCard = page.getByTestId('target-card').nth(1);
  await expect(precisionCard.getByTestId('reason-list')).toContainText(
    "2 round(s) weren't found and are scored as misses.",
    { timeout: 30_000 },
  );
  // 10 identified of 12 declared: a definite 72 / 120, the 2 missing rounds scoring 0 (geometry-scoring §8).
  await expect(precisionCard.getByTestId('target-headline')).toHaveText('72 / 120 · 2 misses · X 1');
  await expect(precisionCard.getByTestId('range-line')).toHaveCount(0);
});

test('results: capture → Analyze reaches a terminal status', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);

  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=precision`);
  await expect(page.getByText('FAKE CAMERA')).toBeVisible();
  await page.getByRole('radio', { name: 'Precision', exact: true }).click();
  await page.getByRole('radio', { name: 'Prone', exact: true }).click();

  const shutter = page.getByRole('button', { name: 'Shutter' });
  await expect(shutter).toBeEnabled({ timeout: 15_000 });
  await shutter.click();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));

  const analyze = page.getByTestId('analyze-button');
  await expect(analyze).toBeEnabled({ timeout: 15_000 });
  await analyze.click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));

  // The real CV pipeline runs here; the card must settle on a terminal status, whatever it scored.
  await expect(page.getByTestId('status-chip')).toHaveAttribute('data-status', /analyzed|needs-attention/, {
    timeout: 180_000,
  });
});
