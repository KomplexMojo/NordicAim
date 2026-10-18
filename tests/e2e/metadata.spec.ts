import { expect, test, type Page } from '@playwright/test';

async function createSessionViaHome(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const match = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url());
  if (!match?.[1]) throw new Error(`no session id in ${page.url()}`);
  return match[1];
}

async function captureWithFakeCamera(page: Page, sessionId: string, fake: 'precision' | 'sighting', kind: string) {
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=${fake}`);
  await expect(page.getByText('FAKE CAMERA')).toBeVisible();
  await page.getByRole('radio', { name: kind, exact: true }).click();
  if (fake === 'precision') await expect(page.locator('.overlay-ring')).toBeVisible();
  else await expect(page.locator('.overlay-anchor')).toBeVisible();

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
  await captureWithFakeCamera(page, sessionId, 'precision', 'Prone');

  // REV-161: Done opens adjust-all; Edit details is the metadata screen.
  await page.goto(`/#/sessions/${sessionId}/metadata`);

  const card = page.getByTestId('photo-metadata-card');
  await expect(card).toHaveCount(1);
  // Issue #79: capture set its type and rounds, so the card starts collapsed to one row; Edit opens it.
  await expect(card).toHaveAttribute('data-expanded', 'false');
  await expect(card.getByTestId('photo-card-summary')).toHaveText('Prone · 10 rounds');
  await expect(card.getByRole('radio', { name: 'Prone', exact: true })).toHaveCount(0);
  await card.getByTestId('photo-card-toggle').click();
  await expect(card).toHaveAttribute('data-expanded', 'true');
  // One choice says what was shot (REV-79); there is no separate template, position or "Both".
  await expect(card.getByRole('radio', { name: 'Prone', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByRole('radio', { name: 'Both', exact: true })).toHaveCount(0);
  const roundsProneInput = card.locator('input[id$="-rounds-prone"]');
  await expect(roundsProneInput).toHaveValue('10');

  // Step 2: change to Precision standing -> the standing rounds field appears at its default.
  await card.getByRole('radio', { name: 'Standing', exact: true }).click();
  const roundsStandingInput = card.locator('input[id$="-rounds-standing"]');
  await expect(roundsStandingInput).toBeVisible();
  await expect(roundsStandingInput).toHaveValue('10');
  await expect(roundsProneInput).toHaveCount(0);

  // Step 3: leave and come back — the change persisted.
  await page.goto('/#/');
  await page.goto(`/#/sessions/${sessionId}/metadata`);
  const cardAgain = page.getByTestId('photo-metadata-card');
  await cardAgain.getByTestId('photo-card-toggle').click();
  await expect(cardAgain.getByRole('radio', { name: 'Standing', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Step 4: Analyze navigates to results.
  const analyze = page.getByTestId('analyze-button');
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
});

test('metadata screen: Analyze is disabled until the imported photo is categorized', async ({ page }) => {
  // REV-162: Home Import lands on metadata with empty categorization.
  await page.goto('/#/');
  await page.getByTestId('new-session-input').setInputFiles('docs/reference/IMG_5057-sighting.jpg');
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/metadata/, { timeout: 60_000 });

  const card = page.getByTestId('photo-metadata-card');
  await expect(card).toHaveCount(1);
  const analyzeButton = page.getByTestId('analyze-button');
  await expect(analyzeButton).toBeDisabled();
  await expect(page.getByTestId('photo-incomplete-hint')).toBeVisible();

  await card.getByRole('radio', { name: 'Sight in', exact: true }).click();

  await expect(analyzeButton).toBeEnabled({ timeout: 10000 });
});

test('the metadata screen has no Session options (REV-48: the backing lives in Settings / capture)', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await captureWithFakeCamera(page, sessionId, 'precision', 'Prone');

  await page.goto(`/#/sessions/${sessionId}/metadata`);

  await expect(page.getByTestId('photo-metadata-card')).toHaveCount(1);
  await expect(page.getByTestId('analyze-button')).toHaveText('Analyze 1 target');
  await expect(page.getByTestId('session-options-toggle')).toHaveCount(0);
  await expect(page.getByText('Session options')).toHaveCount(0);
  await expect(page.getByTestId('backing-mode-trigger')).toHaveCount(0);
});
