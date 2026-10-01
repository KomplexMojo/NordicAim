// M27/M28 (issue #97, docs/spec/goals.md): the Goals tab — the same view/range filters as Patterns and Analysis,
// one chart per metric, and up/down arrow buttons beside each chart that step a horizontal goal line, saved
// immediately and stamped with the clock (never overwritten — M28 tried a numeric entry, then a drag-a-star
// gesture, before settling on this stepper after the owner's review of both earlier builds).

import { expect, test } from '@playwright/test';

test.setTimeout(240_000);

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listGoals(): Promise<Array<{ view: string; metric: string; value: number; setAt: string }>>;
  };
};

test('the Goals tab is the fourth tab, navigates, and is marked active', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('tab-bar').getByRole('link', { name: 'Goals' })).toBeVisible();

  for (const tab of ['tab-shooting', 'tab-analysis', 'tab-patterns', 'tab-goals']) {
    const box = await page.getByTestId(tab).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.getByTestId('tab-goals').click();
  await expect(page).toHaveURL(/#\/goals$/);
  await expect(page.getByTestId('tab-goals')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('tab-shooting')).not.toHaveAttribute('aria-current', 'page');
});

test('with nothing recorded, the view says so and nothing errors', async ({ page }) => {
  await page.goto('/#/goals');
  for (const id of ['precision-prone', 'precision-standing']) {
    await page.getByTestId(`goals-view-${id}`).click();
    await expect(page.getByText('No sessions here yet.')).toBeVisible();
  }
});

test('Sight in and Confirm are not offered as goal views; a URL naming one falls back to Precision prone', async ({ page }) => {
  await page.goto('/#/goals');
  await expect(page.getByTestId('goals-view-sight-in')).toHaveCount(0);
  await expect(page.getByTestId('goals-view-confirm')).toHaveCount(0);
  await expect(page.getByTestId('goals-view-precision-prone')).toBeVisible();
  await expect(page.getByTestId('goals-view-precision-standing')).toBeVisible();

  await page.goto('/#/goals?view=confirm&range=all');
  await expect(page.getByTestId('goals-view-precision-prone')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('goals-counts')).toContainText('Precision prone');
});

test('the up/down buttons set a goal that persists across reload and draws a horizontal line; more taps append', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/goals');
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();
  await expect(page.getByTestId('goals-counts')).toHaveText('Precision prone: 1 session');

  const chart = page.getByTestId('goal-score');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('data-has-goal', 'false');
  await expect(page.getByTestId('goal-score-value')).toHaveText('No goal');
  await expect(page.getByTestId('goal-score-indicator')).toHaveCount(0);
  await expect(page.getByTestId('goal-score-step')).toHaveCount(0);

  await page.getByTestId('goal-score-up').click();
  await expect(chart).toHaveAttribute('data-has-goal', 'true');
  await expect(page.getByTestId('goal-score-indicator')).toHaveCount(1);
  await expect(page.getByTestId('goal-score-step')).toHaveCount(1);
  const firstValueText = await page.getByTestId('goal-score-value').textContent();
  expect(firstValueText).toMatch(/^Goal: \d+%$/);

  // It survives a reload, having been written to storage rather than just component state.
  await page.reload();
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText(firstValueText!);

  // A few more taps append new log entries rather than editing the first one.
  await page.getByTestId('goal-score-up').click();
  await page.getByTestId('goal-score-up').click();
  // The write is async (IndexedDB, then a live-query refetch), so wait for the DOM rather than reading it cold.
  await expect(page.getByTestId('goal-score-value')).not.toHaveText(firstValueText!);

  const entries = await page.evaluate(() => (window as HookWindow).__asaTest!.listGoals());
  const scoreGoals = entries.filter((e) => e.view === 'precision-prone' && e.metric === 'score');
  expect(scoreGoals).toHaveLength(3);
  expect(new Set(scoreGoals.map((e) => e.setAt)).size).toBe(3);
  expect(scoreGoals.map((e) => e.value)).toEqual([...scoreGoals.map((e) => e.value)].sort((a, b) => a - b));

  // The down button steps the other way.
  const beforeDown = await page.getByTestId('goal-score-value').textContent();
  await page.getByTestId('goal-score-down').click();
  await expect(page.getByTestId('goal-score-value')).not.toHaveText(beforeDown!);
});

test('goals saved by earlier builds (Confirm, Sight in, MPI) do not break reading or setting goals', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  // The owner's own phone holds entries like these, written before Goals narrowed its views and metrics.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('asa');
        open.onsuccess = () => {
          const tx = open.result.transaction('goals', 'readwrite');
          tx.objectStore('goals').put({
            schemaVersion: 1,
            key: 'app',
            entries: [
              { id: '11111111-1111-4111-8111-111111111111', view: 'confirm', metric: 'score', value: 90, setAt: '2026-09-29T12:00:00.000Z' },
              { id: '22222222-2222-4222-8222-222222222222', view: 'sight-in', metric: 'mpiX', value: 1, setAt: '2026-09-29T12:00:00.000Z' },
            ],
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );

  await page.goto('/#/goals');
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText('No goal');
  await page.getByTestId('goal-score-up').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText(/^Goal: \d+%$/);
  await expect(page.getByTestId('goal-score-indicator')).toHaveCount(1);

  // The old entries are kept (the log is append-only), just never shown.
  const entries = await page.evaluate(() => (window as HookWindow).__asaTest!.listGoals());
  expect(entries).toHaveLength(3);
});

test('the buttons are plain, native buttons: Tab and Enter/Space work with no custom keyboard code', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/goals');
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();

  await expect(page.getByTestId('goal-group-value')).toHaveText('No goal');
  await page.getByTestId('goal-group-up').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('goal-group-value')).not.toHaveText('No goal');

  const entries = await page.evaluate(() => (window as HookWindow).__asaTest!.listGoals());
  expect(entries.filter((e) => e.view === 'precision-prone' && e.metric === 'group')).toHaveLength(1);
});

test('with three or more sessions, the chart draws the same least-squares trend line Analysis does', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
    await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  }

  await page.goto('/#/goals');
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();
  await expect(page.getByTestId('goals-counts')).toHaveText('Precision prone: 3 sessions');
  await expect(page.getByTestId('goal-score-line')).toHaveCount(1);
  await expect(page.getByTestId('goal-score-slope')).toContainText('Trend:');
});

test('MPI is not goal-able: only Score, Group size and Accuracy (RMS) get a chart', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/goals');
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();

  await expect(page.getByTestId('goal-score')).toBeVisible();
  await expect(page.getByTestId('goal-group')).toBeVisible();
  await expect(page.getByTestId('goal-rms')).toBeVisible();
  await expect(page.getByTestId('goal-mpiX')).toHaveCount(0);
  await expect(page.getByTestId('goal-mpiY')).toHaveCount(0);

  // Analysis keeps MPI — only Goals narrowed its metric set.
  await page.goto('/#/analysis');
  await page.getByTestId('analysis-range-all').click();
  await page.getByTestId('analysis-view-precision-prone').click();
  await expect(page.getByTestId('trend-mpiX')).toBeVisible();
});

test('the tab bar stays at four targets, each at least 44 px, with Goals visible alongside the others', async ({ page }) => {
  await page.goto('/#/goals');
  const bar = page.getByTestId('tab-bar');
  await expect(bar.locator('li')).toHaveCount(4);
  for (const name of ['Sessions', 'Analysis', 'Patterns', 'Goals']) {
    await expect(bar.getByRole('link', { name })).toBeVisible();
  }
});
