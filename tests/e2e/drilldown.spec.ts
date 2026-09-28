// Issue #72 (REV-140): from a point on Analysis or a dot on Patterns to the target behind it, and back to the same view.

import { expect, test, type Page } from '@playwright/test';

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
  };
};

async function twoDemoSessions(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
    await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  }
}

test('Analysis: a tapped point offers its session’s target, which opens and comes back to the same view', async ({ page }) => {
  await twoDemoSessions(page);
  await page.goto('/#/analysis');
  await page.getByTestId('analysis-range-90').click();
  await expect(page).toHaveURL(/#\/analysis\?view=sight-in&range=90$/);

  await page.getByTestId('trend-score-point').first().click();
  const panel = page.getByTestId('trend-score-targets');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('trend-score-targets-open')).toHaveCount(1);
  await panel.getByTestId('trend-score-targets-open').click();

  await expect(page).toHaveURL(/#\/sessions\/[^/]+\/photos\/[^/?]+$/);
  await expect(page.getByTestId('target-back')).toHaveText('Back to Analysis');
  await page.getByTestId('target-back').click();
  await expect(page).toHaveURL(/#\/analysis\?view=sight-in&range=90$/);
  await expect(page.getByTestId('analysis-range-90')).toHaveAttribute('aria-pressed', 'true');
});

test('Patterns: tapping a dot lists its target; Open target goes there and Back returns to Patterns', async ({ page }) => {
  await twoDemoSessions(page);
  await page.goto('/#/patterns?view=sight-in&range=all');

  // A tap on empty paper finds nothing.
  const drawing = page.getByTestId('patterns-drawing');
  await drawing.click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('patterns-targets')).toContainText('No shot there');

  await drawing.locator('circle.pattern-dot').first().click({ force: true });
  const panel = page.getByTestId('patterns-targets');
  await expect(panel.getByTestId('patterns-targets-open').first()).toBeVisible();
  await panel.getByTestId('patterns-targets-open').first().click();

  await expect(page).toHaveURL(/#\/sessions\/[^/]+\/photos\/[^/?]+$/);
  await expect(page.getByTestId('target-back')).toHaveText('Back to Patterns');
  await page.getByTestId('target-back').click();
  await expect(page).toHaveURL(/#\/patterns\?view=sight-in&range=all$/);
});

test('a target opened from its session still goes back to the results', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sid}/results`);
  await page.locator(`a[href*="/sessions/${sid}/photos/"]`).first().click();
  await expect(page.getByTestId('target-back')).toHaveText('Back to results');
});
