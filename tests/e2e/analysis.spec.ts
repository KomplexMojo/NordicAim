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
  await page.getByTestId('analysis-view-sight-in').click();
  await expect(page.getByTestId('analysis-counts')).toHaveText('Sight in: 2 sessions · 2 targets');
  for (const id of ['score', 'group', 'mpiX', 'mpiY']) {
    await expect(page.getByTestId(`trend-${id}`)).toHaveAttribute('data-points', '2');
  }
  await expect(page.getByTestId('trend-score')).toContainText('Hit rate');
  await expect(page.getByTestId('trend-mpiX-zero')).toHaveCount(1);

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
