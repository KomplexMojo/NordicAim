import { expect, test, type Page } from '@playwright/test';

interface HookSession {
  id: string;
  artifacts: Array<{ id: string }>;
  shares: Array<{ id: string; artifactId: string; method: string }>;
}

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    getSession(sessionId: string): Promise<HookSession | null>;
  };
};

// `loadDemo` ingests two real JPEGs and waits for any in-flight Stage A job (OpenCV is ~10 MB of wasm);
// the summary image then needs its own 1500ms debounce plus a render/rasterise pass on top of that.
test.setTimeout(240_000);

async function loadDemoSession(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  return sessionId;
}

async function getSession(page: Page, sessionId: string): Promise<HookSession | null> {
  return page.evaluate((sid) => (window as HookWindow).__asaTest!.getSession(sid), sessionId);
}

test('summary: the summary image appears and loads at its drawn size (rendering-composite.md §5, REV-51)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);

  const image = page.getByTestId('summary-image');
  await expect(image).toBeVisible({ timeout: 30_000 });

  const dims = await image.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
  // REV-51: always the four fixed positions (1440) under the 120 header; the demo's 1 sighting + 1 precision
  // leave a 4-line band (targets, scoring, and one line each): 100 + 34 * 4 + 64 = 300. Both demo targets score the same
  // under every rule, so there are no comparison lines.
  expect(dims).toEqual({ w: 1440, h: 120 + 1440 + 300 });
});

test('summary: Share downloads a file named *-shooting-analysis.png and records one ShareRecord', async ({ page }) => {
  // Force the download branch (rendering-composite.md §7 step 3): WebKit's real `navigator.share` opens
  // the OS share sheet even under Playwright, which has no UI to dismiss in an automated run. Disabling
  // `canShare` exercises exactly the same `shareArtifact` fallback path a desktop browser without file
  // sharing takes, and is what this test's "Playwright download event" assertion needs to be deterministic.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'canShare', { value: undefined, configurable: true });
  });

  const sessionId = await loadDemoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('summary-image')).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('summary-share').click()]);
  expect(download.suggestedFilename()).toMatch(/-shooting-analysis\.png$/);

  await expect
    .poll(async () => {
      const session = await getSession(page, sessionId);
      return session?.shares.length ?? 0;
    })
    .toBe(1);

  const session = await getSession(page, sessionId);
  expect(session?.shares[0]?.method).toBe('download');
  expect(session?.shares[0]?.artifactId).toBe(session?.artifacts[session.artifacts.length - 1]?.id);
});

test('summary: changing declared rounds rebuilds the summary (new artifact id)', async ({ page }) => {
  const sessionId = await loadDemoSession(page);
  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(page.getByTestId('summary-image')).toBeVisible({ timeout: 30_000 });

  const before = await getSession(page, sessionId);
  const beforeId = before?.artifacts[before.artifacts.length - 1]?.id;
  expect(beforeId).toBeDefined();

  await page.goto(`/#/sessions/${sessionId}/metadata`);
  // Capture order: sighting first, precision second (analysis-pipeline §10).
  const sightingMetadataCard = page.getByTestId('photo-metadata-card').nth(0);
  const roundsProne = sightingMetadataCard.locator('input[id$="-rounds-prone"]');
  await expect(roundsProne).toHaveValue('10', { timeout: 30_000 });
  await roundsProne.fill('11');
  await roundsProne.blur();

  await page.goto(`/#/sessions/${sessionId}/results`);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await expect
    .poll(
      async () => {
        const after = await getSession(page, sessionId);
        return after?.artifacts[after.artifacts.length - 1]?.id;
      },
      { timeout: 30_000 },
    )
    .not.toBe(beforeId);
});
