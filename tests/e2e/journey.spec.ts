import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// M15 step 5: the whole MVP flow end to end — capture two targets with the fake camera, add metadata,
// analyze, watch both cards finish, then swap in the golden precision shots (a flow check, not a CV
// accuracy check — pipeline.spec.ts and cv-eval cover accuracy) and confirm the summary image and share.

interface HookCategorization {
  template: string | null;
  position: string | null;
  roundsProne: number | null;
  roundsStanding: number | null;
}

interface HookPhoto {
  id: string;
  categorization: HookCategorization;
}

interface HookSession {
  id: string;
  artifacts: Array<{ id: string }>;
  shares: Array<{ id: string; artifactId: string; method: string }>;
}

type HookWindow = Window & {
  __asaTest?: {
    listPhotos(sessionId: string): Promise<HookPhoto[]>;
    waitForIdle(): Promise<void>;
    setShots(photoId: string, shots: unknown): Promise<void>;
    getSession(sessionId: string): Promise<HookSession | null>;
  };
};

// OpenCV (~10 MB wasm) loads in the worker, and this runs two real Stage A/B pipelines plus a
// summary-image render.
test.setTimeout(240_000);

const precisionFixture = JSON.parse(
  readFileSync(path.resolve('fixtures/reference/sample-shots-precision.json'), 'utf-8'),
) as { shots: unknown[] };

async function createSessionViaHome(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const match = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url());
  if (!match?.[1]) throw new Error(`no session id in ${page.url()}`);
  return match[1];
}

async function captureWithFakeCamera(
  page: Page,
  sessionId: string,
  fake: 'precision' | 'sighting',
  template: string,
  position: string,
): Promise<void> {
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=${fake}`);
  await expect(page.getByText('FAKE CAMERA')).toBeVisible();
  await page.getByRole('radio', { name: template, exact: true }).click();
  await page.getByRole('radio', { name: position, exact: true }).click();

  const shutter = page.getByRole('button', { name: 'Shutter' });
  await expect(shutter).toBeEnabled({ timeout: 15000 });
  await shutter.click();
  await expect(page.getByTestId('capture-review')).toBeVisible();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByTestId('capture-review')).toBeHidden();
}

test('journey: capture two targets, add metadata, analyze, and reach a shareable summary (M15 step 5)', async ({
  page,
}) => {
  const sessionId = await createSessionViaHome(page);

  // 1. Start & capture → fake precision (Prone) and fake sighting (Both 5/5).
  await captureWithFakeCamera(page, sessionId, 'precision', 'Precision', 'Prone');
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });

  await captureWithFakeCamera(page, sessionId, 'sighting', 'Sighting', 'Both');
  await expect(page.getByTestId('capture-count')).toHaveText('2 captured', { timeout: 15000 });

  // 2. Done → metadata → Analyze → waitForIdle.
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));
  await expect(page.getByTestId('metadata-photo-count')).toHaveText('2 photos');

  const analyzeButton = page.getByRole('button', { name: /^Analyze \d+ targets?$/ });
  await expect(analyzeButton).toBeEnabled({ timeout: 60_000 });
  await analyzeButton.click();

  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  // 3. Both cards reach a terminal status (not still needs-metadata/processing/ready).
  const cards = page.getByTestId('target-card');
  await expect(cards).toHaveCount(2);
  for (const status of await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-status')))) {
    expect(['analyzed', 'needs-attention', 'failed']).toContain(status);
  }

  // 4. Replace the precision photo's shots with the golden fixture (a flow check, not CV accuracy) →
  // waitForIdle → precision headline "72 / 100 · X 1".
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  const precisionPhoto = photos.find((p) => p.categorization.template === 'precision');
  if (!precisionPhoto) throw new Error('no precision photo in session');

  await page.evaluate(
    ({ photoId, shots }) => (window as HookWindow).__asaTest!.setShots(photoId, shots),
    { photoId: precisionPhoto.id, shots: precisionFixture.shots },
  );
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  const precisionCard = page.getByTestId('target-card').filter({ hasText: 'Precision' });
  await expect(precisionCard.getByTestId('target-headline')).toHaveText('72 / 100 · X 1', { timeout: 30_000 });

  // 5. Summary image visible → Share → download event.
  // Force the download branch (see summary.spec.ts): WebKit's real `navigator.share` opens the OS
  // share sheet even under Playwright, which has no UI to dismiss in an automated run.
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, 'canShare', { value: undefined, configurable: true });
  });

  const summaryImage = page.getByTestId('summary-image');
  await expect(summaryImage).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('summary-share').click()]);
  expect(download.suggestedFilename()).toMatch(/-shooting-analysis\.png$/);

  const session = await page.evaluate((sid) => (window as HookWindow).__asaTest!.getSession(sid), sessionId);
  expect(session?.shares.length).toBeGreaterThanOrEqual(1);
});
