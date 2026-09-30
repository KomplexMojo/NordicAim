// M27 (issue #97, docs/spec/goals.md): the Goals tab — the same view/range filters as Patterns and Analysis, one
// chart per metric, and a numeric way to set a goal whose value is stamped with the clock and never overwritten.

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
  for (const id of ['sight-in', 'confirm', 'precision-prone', 'precision-standing']) {
    await page.getByTestId(`goals-view-${id}`).click();
    await expect(page.getByText('No sessions here yet.')).toBeVisible();
  }
});

test('a chart shows demo data; setting a goal persists across reload and shows on the chart; changing it appends', async ({ page }) => {
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
  await expect(page.getByTestId('goal-score-line')).toHaveCount(0);

  // Set the first goal.
  await page.getByTestId('goal-score-set').click();
  await page.getByTestId('goal-score-input').fill('70');
  await page.getByTestId('goal-score-save').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText('Goal: 70%');
  await expect(chart).toHaveAttribute('data-has-goal', 'true');
  await expect(page.getByTestId('goal-score-line')).toHaveCount(1);

  // It survives a reload, having been written to storage rather than just component state.
  await page.reload();
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText('Goal: 70%');

  // Changing it opens pre-filled with the current value, and appends a new log entry rather than editing the old one.
  await page.getByTestId('goal-score-set').click();
  await expect(page.getByTestId('goal-score-input')).toHaveValue('70');
  await page.getByTestId('goal-score-input').fill('85');
  await page.getByTestId('goal-score-save').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText('Goal: 85%');

  const entries = await page.evaluate(() => (window as HookWindow).__asaTest!.listGoals());
  const scoreGoals = entries.filter((e) => e.view === 'precision-prone' && e.metric === 'score');
  expect(scoreGoals).toHaveLength(2);
  expect(scoreGoals.map((e) => e.value).sort((a, b) => a - b)).toEqual([70, 85]);
  expect(new Set(scoreGoals.map((e) => e.setAt)).size).toBe(2);
});

test('the tab bar stays at four targets, each at least 44 px, with Goals visible alongside the others', async ({ page }) => {
  await page.goto('/#/goals');
  const bar = page.getByTestId('tab-bar');
  await expect(bar.locator('li')).toHaveCount(4);
  for (const name of ['Sessions', 'Analysis', 'Patterns', 'Goals']) {
    await expect(bar.getByRole('link', { name })).toBeVisible();
  }
});
