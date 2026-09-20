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

test('the result card picture opens the target, where the photo is editable on the same screen (REV-73)', async ({ page }) => {
  const { sessionId } = await demoSession(page);

  await page.goto(`/#/sessions/${sessionId}/results`);
  // No View / Adjust buttons: the picture is the link.
  await expect(page.getByTestId('adjust-shots')).toHaveCount(0);
  await page.getByTestId('view-target').first().click();
  await page.waitForURL(/\/photos\/[^/]+$/);
  await expect(page.getByTestId('target-detail-title')).toBeVisible();

  // The photo section edits in place, and Save stays on the target.
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  const url = page.url();
  await page.getByTestId('save-adjustments').click();
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('target-detail-title')).toBeVisible();

  // The swipe (wipe) comparison is part of the editor, not a separate view.
  await expect(page.getByTestId('photo-view-compare')).toHaveCount(0);
  await expect(page.getByTestId('compare-slider')).toBeVisible();
  await expect(page.getByTestId('fade-range')).toBeVisible();
  await expect(page.getByTestId('swipe-range')).toBeVisible();
});

test('the old adjust address goes to the target screen', async ({ page }) => {
  const { sessionId, photoId } = await demoSession(page);
  await page.goto(`/#/sessions/${sessionId}/photos/${photoId}/adjust`);
  await expect(page).toHaveURL(new RegExp(`/photos/${photoId}$`));
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
