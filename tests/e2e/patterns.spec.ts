import { expect, test } from '@playwright/test';

// REV-64 / issue #19: the Patterns screen overlays every recorded shot per kind of target.

type HookWindow = Window & { __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> } };

test.setTimeout(240_000);

test('with nothing recorded, every view says so and nothing errors', async ({ page }) => {
  await page.goto('/#/patterns');
  await expect(page.getByTestId('patterns-counts')).toHaveText('0 shots · 0 targets · 0 sessions');
  await expect(page.getByTestId('patterns-summary')).toContainText('No shots here yet.');
  await expect(page.getByTestId('patterns-drawing').locator('svg')).toBeVisible();
});

test('two demo sessions overlay on the right views, the range filter and the drawing agree, and Home links here', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
    await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  }

  await page.goto('/#/');
  await page.getByTestId('tab-patterns').click();
  await expect(page).toHaveURL(/#\/patterns$/);
  // Owner, 2026-09-30: Patterns opens on the latest session by default; widen to see both demo sessions.
  await page.getByTestId('pattern-range-all').click();

  // One sighting target per demo session: both are each session's first, so Sight in holds both and Confirm none.
  await page.getByTestId('pattern-view-sight-in').click();
  await expect(page.getByTestId('patterns-counts')).toContainText('2 targets · 2 sessions');
  // Issue #58: the header carries the results cards' own mark for the view.
  await expect(page.getByTestId('patterns-view-mark')).toHaveAttribute('data-view', 'sight-in');
  await expect(page.getByTestId('patterns-view-mark').locator('.sighting-role-symbol[data-role="sight-in"]')).toHaveCount(1);
  const sightShots = Number(await page.getByTestId('patterns-drawing').getAttribute('data-shots'));
  expect(sightShots).toBeGreaterThan(0);
  await expect(page.getByTestId('patterns-drawing').locator('.pattern-dot')).toHaveCount(sightShots);

  await page.getByTestId('pattern-view-confirm').click();
  await expect(page.getByTestId('patterns-counts')).toHaveText('0 shots · 0 targets · 0 sessions');

  // Precision shots are split between prone and standing without loss.
  let precision = 0;
  for (const id of ['precision-prone', 'precision-standing']) {
    await page.getByTestId(`pattern-view-${id}`).click();
    await expect(page.getByTestId('patterns-view-mark')).toHaveAttribute('data-view', id);
    await expect(
      page.getByTestId('patterns-view-mark').locator(`.position-silhouette[data-position="${id.replace('precision-', '')}"]`),
    ).toHaveCount(1);
    const shots = Number(await page.getByTestId('patterns-drawing').getAttribute('data-shots'));
    await expect(page.getByTestId('patterns-drawing').locator('.pattern-dot')).toHaveCount(shots);
    precision += shots;
  }
  expect(precision).toBeGreaterThan(0);

  // REV-156: the last 3 sessions keep both demo sessions, and the sentence says it is every one there is.
  await page.getByTestId('pattern-view-sight-in').click();
  await page.getByTestId('pattern-range-3').click();
  await expect(page.getByTestId('patterns-drawing')).toHaveAttribute('data-shots', String(sightShots));
  await expect(page.getByTestId('pattern-showing')).toHaveText('Showing all 2 of your sessions.');

  await page.getByTestId('frame-zoom-in').click();
  await expect(page.getByTestId('zoom-frame')).not.toHaveAttribute('data-zoom', '1');
  await page.getByTestId('frame-zoom-fit').click();
  await expect(page.getByTestId('zoom-frame')).toHaveAttribute('data-zoom', '1');
});
