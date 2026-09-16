import { expect, test, type Page } from '@playwright/test';

interface HookPhoto {
  id: string;
}

interface HookAnalysis {
  calibration: { cx: number; cy: number; radiusPx: number; source: string } | null;
  pipeline: {
    stageA: string;
    stageB: string;
    error: string | null;
    alignment: { method: string; confidence: number | null };
    templateHint: { template: string; confidence: number } | null;
    sharpness: number | null;
  };
}

type HookWindow = Window & {
  __asaTest?: {
    listPhotos(sessionId: string): Promise<HookPhoto[]>;
    getAnalysis(photoId: string): Promise<HookAnalysis | null>;
    waitForIdle(): Promise<void>;
  };
};

// OpenCV (~10 MB of wasm) loads in the worker on the first Stage A job.
test.setTimeout(180_000);

async function createSessionViaHome(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const match = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url());
  if (!match?.[1]) throw new Error(`no session id in ${page.url()}`);
  return match[1];
}

test('Stage A reviews and aligns a captured precision target', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);

  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=precision`);
  await expect(page.getByText('FAKE CAMERA')).toBeVisible();
  await page.getByRole('radio', { name: 'Precision', exact: true }).click();
  await page.getByRole('radio', { name: 'Prone', exact: true }).click();

  const shutter = page.getByRole('button', { name: 'Shutter' });
  await expect(shutter).toBeEnabled({ timeout: 15000 });
  await shutter.click();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });

  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  expect(photos).toHaveLength(1);

  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  const analysis = await page.evaluate(
    (pid) => (window as HookWindow).__asaTest!.getAnalysis(pid),
    photos[0]!.id,
  );

  expect(analysis?.pipeline.error).toBeNull();
  expect(analysis?.pipeline.stageA).toBe('done');
  expect(['cv', 'overlay']).toContain(analysis?.pipeline.alignment.method);
  expect(analysis?.calibration).not.toBeNull();
  expect(analysis?.calibration?.radiusPx).toBeGreaterThan(0);
  expect(analysis?.pipeline.sharpness).not.toBeNull();
  expect(analysis?.pipeline.templateHint).not.toBeNull();
});
