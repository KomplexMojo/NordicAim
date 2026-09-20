import { expect, test, type Page } from '@playwright/test';

async function createSessionViaHome(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const match = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url());
  if (!match?.[1]) throw new Error(`no session id in ${page.url()}`);
  return match[1];
}

async function captureWithFakeCamera(page: Page, sessionId: string, fake: 'precision' | 'sighting', kind: string) {
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=${fake}`);
  await expect(page.getByText('FAKE CAMERA')).toBeVisible();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  await expect(page.locator('.overlay-anchor')).toBeVisible();

  const shutter = page.getByRole('button', { name: 'Shutter' });
  await expect(shutter).toBeEnabled({ timeout: 15000 });
  await shutter.click();
  await expect(page.locator('.review-anchor')).toBeVisible();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });
  await expect(page.getByTestId('capture-review')).toBeHidden();
}

test('metadata screen: prefilled card, changing the target type resets rounds, persists, and Analyze navigates to results', async ({
  page,
}) => {
  const sessionId = await createSessionViaHome(page);
  await captureWithFakeCamera(page, sessionId, 'precision', 'Precision prone');

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));

  const card = page.getByTestId('photo-metadata-card');
  await expect(card).toHaveCount(1);
  // One choice says what was shot (REV-79); there is no separate template, position or "Both".
  await expect(card.getByRole('radio', { name: 'Precision prone', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('radio', { name: 'Both', exact: true })).toHaveCount(0);
  const roundsProneInput = card.locator('input[id$="-rounds-prone"]');
  await expect(roundsProneInput).toHaveValue('10');

  // Step 2: change to Precision standing -> the standing rounds field appears at its default.
  await card.getByRole('radio', { name: 'Precision standing', exact: true }).click();
  const roundsStandingInput = card.locator('input[id$="-rounds-standing"]');
  await expect(roundsStandingInput).toHaveValue('10');

  await roundsStandingInput.fill('3');
  await roundsStandingInput.blur();
  // Give updatePhotoMetadata a moment to commit before reloading.
  await page.waitForTimeout(300);

  await page.reload();
  await expect(page.getByTestId('photo-metadata-card').locator('input[id$="-rounds-standing"]')).toHaveValue('3', {
    timeout: 10000,
  });

  // Step 4: Analyze navigates to results.
  await page.getByTestId('analyze-button').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));

  // Step 5: back home, the quick-start button now reads "today's session".
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: "Capture (today's session)" })).toBeVisible();
});

test('metadata screen: Analyze is disabled until the imported photo is categorized', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);

  // Import straight away, before picking a template/position, so the categorization starts empty
  // (capture-overlay §1.2's remembered prefs are still unset for this brand-new session).
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=precision`);
  await page.getByTestId('import-input').setInputFiles('docs/reference/IMG_5057-sighting.jpg');
  await expect(page.getByTestId('capture-review')).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));

  const card = page.getByTestId('photo-metadata-card');
  await expect(card).toHaveCount(1);
  const analyzeButton = page.getByTestId('analyze-button');
  await expect(analyzeButton).toBeDisabled();
  await expect(page.getByTestId('photo-incomplete-hint')).toBeVisible();

  await card.getByRole('radio', { name: 'Sight in', exact: true }).click();

  await expect(analyzeButton).toBeEnabled({ timeout: 10000 });
});

test('the metadata screen has no Session options (REV-48: the backing lives in Settings)', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await captureWithFakeCamera(page, sessionId, 'precision', 'Precision prone');

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));

  await expect(page.getByTestId('photo-metadata-card')).toHaveCount(1);
  await expect(page.getByTestId('analyze-button')).toHaveText('Analyze 1 target');
  await expect(page.getByTestId('session-options-toggle')).toHaveCount(0);
  await expect(page.getByText('Session options')).toHaveCount(0);
  await expect(page.getByTestId('backing-mode-trigger')).toHaveCount(0);
});
