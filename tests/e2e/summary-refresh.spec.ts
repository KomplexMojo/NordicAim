import { expect, test, type Page } from '@playwright/test';

// Owner report 2026-09-19: "I shot a single target, took a picture and then added more pictures after the fact,
// and the session summary wasn't updated." Real photos often end `needs-attention` (a capped detection raises
// `extra-candidates-dropped`), the summary image only takes `analyzed` targets, and saving shots in Adjust never
// cleared that warning — so a corrected target stayed out of the summary for good, silently.

interface HookCategorization {
  template: string | null;
  position: string | null;
  roundsProne: number | null;
  roundsStanding: number | null;
}

interface HookPhoto {
  id: string;
  status: string;
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
    addWarning(photoId: string, warning: string): Promise<void>;
  };
};

// OpenCV (~10 MB wasm) loads in the worker, and this runs two real Stage A/B pipelines plus a
// summary-image render.
test.setTimeout(240_000);

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

async function latestArtifactId(page: Page, sessionId: string): Promise<string | null> {
  const s = await page.evaluate((sid) => (window as HookWindow).__asaTest!.getSession(sid), sessionId);
  return s?.artifacts.at(-1)?.id ?? null;
}

async function analyzeFromMetadata(page: Page, sessionId: string): Promise<void> {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));
  const analyze = page.getByTestId('analyze-button');
  await expect(analyze).toBeEnabled({ timeout: 60_000 });
  await analyze.click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
}

test('summary: a target added later joins the summary, including after it is fixed in Adjust', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);

  // 1. One target, analyzed, summary built.
  await captureWithFakeCamera(page, sessionId, 'precision', 'Precision', 'Prone');
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });
  await analyzeFromMetadata(page, sessionId);
  await expect(page.getByTestId('summary-image')).toBeVisible({ timeout: 30_000 });
  const first = await latestArtifactId(page, sessionId);
  expect(first).not.toBeNull();

  // 2. Add a second target afterwards: results -> metadata -> Add more photos -> capture -> analyze.
  await page.goto(`/#/sessions/${sessionId}/metadata`);
  await page.getByRole('button', { name: 'Add more photos' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/capture`));
  await captureWithFakeCamera(page, sessionId, 'sighting', 'Sighting', 'Prone');
  await expect(page.getByTestId('capture-count')).toHaveText('2 captured', { timeout: 15000 });
  await analyzeFromMetadata(page, sessionId);
  await expect(page.getByTestId('target-card')).toHaveCount(2);
  await expect.poll(() => latestArtifactId(page, sessionId), { timeout: 30_000 }).not.toBe(first);
  const second = await latestArtifactId(page, sessionId);

  // 3. As real CV often does: the new target's detection was capped, so it needs attention and is left out.
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  const sighting = photos.find((p) => p.categorization.template === 'sighting')!;
  await page.evaluate(
    ({ pid }) => (window as HookWindow).__asaTest!.addWarning(pid, 'extra-candidates-dropped'),
    { pid: sighting.id },
  );
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  // The summary now says it is leaving that target out, instead of looking stale.
  await expect(page.getByTestId('summary-left-out')).toContainText('1 target needs attention', { timeout: 30_000 });

  // 4. The owner checks it in Adjust and saves. That confirms the capped set, so it joins the summary.
  await page.goto(`/#/sessions/${sessionId}/photos/${sighting.id}/adjust`);
  await expect(page.getByTestId('image-stage')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('save-adjustments').click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/results`));
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  // Wait for the positive outcome first: a bare "note absent" check would pass during the moment the
  // target is being re-scored, before its final status lands.
  await expect
    .poll(
      async () => {
        const now = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
        return now.find((p) => p.id === sighting.id)?.status ?? null;
      },
      { timeout: 30_000 },
    )
    .toBe('analyzed');
  await expect.poll(() => latestArtifactId(page, sessionId), { timeout: 30_000 }).not.toBe(second);
  await expect(page.getByTestId('summary-image')).toBeVisible();
  await expect(page.getByTestId('summary-left-out')).toHaveCount(0);
});
