// REV-123 (issue #57, analysis.md): the Analysis screen — trends over time, one data point per session, with the same views
// and date ranges as Patterns, opened from the header beside Patterns.

import { expect, test } from '@playwright/test';

test.setTimeout(240_000);

type HookWindow = Window & {
  __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> };
};

test('with nothing recorded, every view says so and nothing errors', async ({ page }) => {
  await page.goto('/#/analysis');
  for (const id of ['sight-in', 'confirm', 'precision-prone', 'precision-standing']) {
    await page.getByTestId(`analysis-view-${id}`).click();
    await expect(page.getByText('No sessions here yet.')).toBeVisible();
  }
});

test('two demo sessions give one point per session on each chart, the ranges filter them, and the header links here', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
    await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  }

  // The header's Analysis icon sits beside Patterns.
  await expect(page.getByTestId('open-patterns')).toBeVisible();
  await page.getByTestId('open-analysis').click();
  await expect(page).toHaveURL(/#\/analysis$/);
  await expect(page.getByTestId('open-analysis')).toHaveAttribute('aria-current', 'page');

  // Sight in: each demo session's first sighting target, so two sessions.
  // REV-130: each view button carries its kind's mark.
  await expect(page.getByTestId('analysis-view-confirm').getByTestId('view-mark')).toHaveAttribute('data-kind', 'confirm');
  await page.getByTestId('analysis-view-sight-in').click();
  await expect(page.getByTestId('analysis-counts')).toHaveText('Sight in: 2 sessions · 2 targets');
  for (const id of ['score', 'group', 'rms', 'mpiX', 'mpiY']) {
    await expect(page.getByTestId(`trend-${id}`)).toHaveAttribute('data-points', '2');
  }
  await expect(page.getByTestId('trend-score')).toContainText('Hit rate');
  await expect(page.getByTestId('trend-mpiX-zero')).toHaveCount(1);
  // REV-129: two sessions are not a trend.
  await expect(page.getByTestId('trend-score-line')).toHaveCount(0);
  await expect(page.getByTestId('trend-score-slope')).toHaveCount(0);

  // Tapping a point reads it out.
  const readout = page.getByTestId('trend-group-readout');
  await expect(readout).toHaveText(/MOA$/);
  await page.getByTestId('trend-group-point').first().click();
  await expect(readout).toHaveText(/MOA$/);

  // Precision: the score is the average ring.
  await page.getByTestId('analysis-view-precision-prone').click();
  await expect(page.getByTestId('trend-score')).toContainText('Score');
  await expect(page.getByTestId('trend-score')).toHaveAttribute('data-points', '2');

  // Confirm: none in the demo.
  await page.getByTestId('analysis-view-confirm').click();
  await expect(page.getByText('No sessions here yet.')).toBeVisible();

  // The latest session alone is one point, and the screen says a trend needs two.
  await page.getByTestId('analysis-view-sight-in').click();
  await page.getByTestId('analysis-range-last').click();
  await expect(page.getByTestId('analysis-counts')).toHaveText('Sight in: 1 session · 1 target');
  await expect(page.getByTestId('analysis-one-session')).toBeVisible();
  await expect(page.getByTestId('trend-group')).toHaveAttribute('data-points', '1');

  // The data table carries every value as text.
  await page.getByTestId('analysis-range-all').click();
  await page.getByTestId('analysis-table').locator('summary').click();
  await expect(page.getByTestId('analysis-table').locator('tbody tr')).toHaveCount(2);
});

test('the coach image: made from the range, previewed, then shared as one PNG', async ({ page }) => {
  // The download branch of shareArtifact, as in summary.spec.ts: no share sheet to dismiss in an automated run.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/analysis');
  await expect(page.getByTestId('share-trends-image')).toHaveCount(0);
  await page.getByTestId('make-trends-image').click();
  const preview = page.getByTestId('trends-image-preview');
  await expect(preview).toBeVisible({ timeout: 60_000 });
  // The preview is the stored PNG at the sheet's width.
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1440);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-trends-image').click()]);
  expect(download.suggestedFilename()).toMatch(/^nordicaim-trends-\d{4}-\d{2}-\d{2}\.png$/);

  // A different range starts a fresh card: the old preview does not carry over.
  await page.getByTestId('analysis-range-30').click();
  await expect(page.getByTestId('trends-image-preview')).toHaveCount(0);
});
