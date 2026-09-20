import { expect, test, type Page } from '@playwright/test';

// REV-94 (#34): the editor says Modified from the first touch, Save is idle when nothing changed, leaving with edits asks first,
// and one click after an alignment change re-detects.

type HookAnalysis = {
  calibration: { cx: number; source: string } | null;
  shots: Array<{ id: string; source: string }>;
};
type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(sessionId: string): Promise<Array<{ id: string }>>;
    getAnalysis(photoId: string): Promise<HookAnalysis | null>;
  };
};

test.setTimeout(240_000);

async function openPrecisionTarget(page: Page): Promise<{ sessionId: string; photoId: string; cx: number; shots: number }> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  for (const photo of photos) {
    const a = await page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), photo.id);
    if (a?.shots.some((s) => s.id === 'P9')) {
      await page.goto(`/#/sessions/${sessionId}/photos/${photo.id}`);
      await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
      return { sessionId, photoId: photo.id, cx: a.calibration!.cx, shots: a.shots.length };
    }
  }
  throw new Error('no precision target with shot P9');
}

test('idle until touched, Modified from the first edit, back to Analyzed after Save', async ({ page }) => {
  await openPrecisionTarget(page);
  await expect(page.getByTestId('save-state')).toHaveText('No unsaved changes');
  await expect(page.getByTestId('save-adjustments')).toBeDisabled();
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'analyzed');

  await page.locator('[data-testid="shot"][data-shot-id="P9"]').click();
  await page.getByTestId('delete-shot').click();
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'modified');
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
  await expect(page.getByTestId('save-adjustments')).toBeEnabled();
  // Shots only: a plain Save, no re-run offered.
  await expect(page.getByTestId('save-adjustments')).toHaveText('Save');
  await expect(page.getByTestId('save-only')).toHaveCount(0);

  await page.getByTestId('save-adjustments').click();
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await expect(page.getByTestId('save-state')).toHaveText('No unsaved changes');
  await expect(page.getByTestId('save-adjustments')).toBeDisabled();
  await expect(page.getByTestId('live-status')).not.toHaveAttribute('data-status', 'modified');
});

test('an alignment nudge is Modified, and undoing it returns to unmodified without a Save', async ({ page }) => {
  const { cx } = await openPrecisionTarget(page);
  await page.getByTestId('mode-alignment').click();
  await page.getByTestId('cal-cx').fill(String(Math.round(cx + 9)));
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-status', 'modified');
  await expect(page.getByTestId('save-adjustments')).toHaveText('Save and re-analyze');
  await expect(page.getByTestId('save-only')).toBeVisible();

  await page.getByTestId('cal-cx').fill(String(cx));
  await expect(page.getByTestId('save-state')).toHaveText('No unsaved changes');
  await expect(page.getByTestId('live-status')).not.toHaveAttribute('data-status', 'modified');
});

test('leaving with unsaved edits asks first; Stay keeps them, Leave discards them', async ({ page }) => {
  const { sessionId } = await openPrecisionTarget(page);
  await page.locator('[data-testid="shot"][data-shot-id="P9"]').click();
  await page.getByTestId('delete-shot').click();
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');

  await page.getByRole('link', { name: /Back to results/ }).click();
  await expect(page.getByTestId('unsaved-dialog')).toBeVisible();
  await page.getByTestId('unsaved-stay').click();
  await expect(page.getByTestId('unsaved-dialog')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');

  await page.getByRole('link', { name: /Back to results/ }).click();
  await page.getByTestId('unsaved-leave').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
});

test('leaving without edits does not ask', async ({ page }) => {
  const { sessionId } = await openPrecisionTarget(page);
  await page.getByRole('link', { name: /Back to results/ }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await expect(page.getByTestId('unsaved-dialog')).toHaveCount(0);
});

test('one click after an alignment change saves and re-detects', async ({ page }) => {
  const { photoId, cx, shots } = await openPrecisionTarget(page);
  await page.getByTestId('mode-alignment').click();
  await page.getByTestId('cal-cx').fill(String(Math.round(cx + 7)));
  await page.getByTestId('save-adjustments').click();
  await expect(page.getByText('Saved and re-analyzed with your alignment and shots.')).toBeVisible({ timeout: 120_000 });
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const after = await page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), photoId);
  expect(after!.calibration!.source).toBe('manual');
  expect(after!.calibration!.cx).toBe(Math.round(cx + 7));
  expect(after!.shots.length).toBeGreaterThan(0);
  expect(shots).toBeGreaterThan(0);
  await expect(page.getByTestId('save-state')).toHaveText('No unsaved changes');
});
