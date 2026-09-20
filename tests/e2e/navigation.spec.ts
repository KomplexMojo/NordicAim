import { expect, test, type Page } from '@playwright/test';

// Owner, 2026-09-19: "if I go in and view the details of an image and realize that the shots are not
// correct, I have to go backwards in order to adjust them … I don't want the user to have to click three
// or four buttons to go back and forth".

type HookWindow = Window & { __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void>; listPhotos(id: string): Promise<Array<{ id: string }>> } };

test.setTimeout(240_000);

async function demoSession(page: Page): Promise<{ sessionId: string; photoId: string }> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  return { sessionId, photoId: photos[0]!.id };
}

test('target detail reaches Adjust in one tap, and Save comes back to the target', async ({ page }) => {
  const { sessionId, photoId } = await demoSession(page);

  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}`);
  await page.getByTestId('detail-adjust').click();
  await page.waitForURL(new RegExp(`/photos/${photoId}/adjust`));

  // The way back names where it goes, and Save returns there rather than to the results list.
  await expect(page.getByTestId('adjust-back')).toHaveText('Back to target');
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('save-adjustments').click();
  await page.waitForURL(new RegExp(`/photos/${photoId}$`));
  await expect(page.getByTestId('target-detail-title')).toBeVisible();
});

test('Adjust opened from the results list still returns to the results list', async ({ page }) => {
  const { sessionId } = await demoSession(page);

  await page.goto(`/#/sessions/${sessionId}/results`);
  await page.getByTestId('adjust-shots').first().click();
  await page.waitForURL(/\/adjust/);
  await expect(page.getByTestId('adjust-back')).toHaveText('Back to results');
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('save-adjustments').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
});

test('adding more photos is one tap from results, and the session parent is one tap up', async ({ page }) => {
  const { sessionId } = await demoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);

  await expect(page.getByTestId('results-back')).toHaveText('All sessions');
  await page.getByTestId('add-photos-link').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/capture`));
});

test('the tab bar is the only Home link on screens that have it', async ({ page }) => {
  const { sessionId } = await demoSession(page);
  for (const path of [`#/sessions`, `#/diagnostics`, `#/sessions/${sessionId}/results`]) {
    await page.goto(`/${path}`);
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('tab-shooting')).toBeVisible();
  }
});
