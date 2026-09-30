// M27/M28 (issue #97, docs/spec/goals.md): the Goals tab — the same view/range filters as Patterns and Analysis,
// one chart per metric, and a draggable star to set a goal whose value is stamped with the clock and never
// overwritten (M28 replaced M27's numeric entry with this drag-on-the-chart gesture, per the owner's own review).

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

test('dragging the star on the chart sets a goal that persists across reload and shows on the chart; dragging again appends', async ({ page }) => {
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
  await expect(page.getByTestId('goal-score-star')).toHaveCount(0);
  await expect(page.getByTestId('goal-score-step')).toHaveCount(0);

  // Press near the top of the plot, hold (a live preview shows while the pointer is down), then release.
  const plotBox = (await page.getByTestId('goal-score-plot').boundingBox())!;
  await page.mouse.move(plotBox.x + plotBox.width / 2, plotBox.y + plotBox.height * 0.2);
  await page.mouse.down();
  await expect(page.getByTestId('goal-score-preview')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('goal-score-preview')).toHaveCount(0);
  await expect(chart).toHaveAttribute('data-has-goal', 'true');
  await expect(page.getByTestId('goal-score-star')).toHaveCount(1);
  await expect(page.getByTestId('goal-score-step')).toHaveCount(1);
  const firstValueText = await page.getByTestId('goal-score-value').textContent();
  expect(firstValueText).toMatch(/^Goal: \d+%$/);

  // It survives a reload, having been written to storage rather than just component state.
  await page.reload();
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();
  await expect(page.getByTestId('goal-score-value')).toHaveText(firstValueText!);

  // Dragging to a very different Y appends a new log entry rather than editing the old one.
  const plotBox2 = (await page.getByTestId('goal-score-plot').boundingBox())!;
  await page.mouse.move(plotBox2.x + plotBox2.width / 2, plotBox2.y + plotBox2.height * 0.95);
  await page.mouse.down();
  await page.mouse.move(plotBox2.x + plotBox2.width / 2, plotBox2.y + plotBox2.height * 0.05, { steps: 4 });
  await page.mouse.up();
  // The write is async (IndexedDB, then a live-query refetch), so wait for the DOM rather than reading it cold.
  await expect(page.getByTestId('goal-score-value')).not.toHaveText(firstValueText!);

  const entries = await page.evaluate(() => (window as HookWindow).__asaTest!.listGoals());
  const scoreGoals = entries.filter((e) => e.view === 'precision-prone' && e.metric === 'score');
  expect(scoreGoals).toHaveLength(2);
  expect(new Set(scoreGoals.map((e) => e.setAt)).size).toBe(2);
});

test('the keyboard: arrow keys preview a value on the focused plot, Enter saves it, Escape cancels without saving', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/goals');
  await page.getByTestId('goals-range-all').click();
  await page.getByTestId('goals-view-precision-prone').click();

  const plot = page.getByTestId('goal-group-plot');
  await plot.focus();

  // Escape after a couple of nudges leaves no goal behind.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('goal-group-preview')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('goal-group-preview')).toHaveCount(0);
  await expect(page.getByTestId('goal-group-value')).toHaveText('No goal');

  // Enter saves the previewed value. Re-focus first: some browsers blur a focused element on Escape.
  await plot.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('goal-group-preview')).toBeVisible();
  const previewText = await page.getByTestId('goal-group-preview').textContent();
  await page.keyboard.press('Enter');
  // The write is async (IndexedDB, then a live-query refetch): the preview clears locally right away, but wait for
  // the saved value itself before reading it, rather than a stale "No goal" left over from before the refetch.
  await expect(page.getByTestId('goal-group-value')).not.toHaveText('No goal');
  const savedText = await page.getByTestId('goal-group-value').textContent();
  expect(savedText).toBe(`Goal: ${previewText!.replace('Setting: ', '')}`);

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

  // MPI charts plot a signed position rather than a magnitude, so they draw no trend line (REV-133).
  await expect(page.getByTestId('goal-mpiX-line')).toHaveCount(0);
});

test('the tab bar stays at four targets, each at least 44 px, with Goals visible alongside the others', async ({ page }) => {
  await page.goto('/#/goals');
  const bar = page.getByTestId('tab-bar');
  await expect(bar.locator('li')).toHaveCount(4);
  for (const name of ['Sessions', 'Analysis', 'Patterns', 'Goals']) {
    await expect(bar.getByRole('link', { name })).toBeVisible();
  }
});
