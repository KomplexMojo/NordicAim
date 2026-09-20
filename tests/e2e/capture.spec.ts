import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

interface HookPhoto {
  origin: string;
  capture: {
    overlayTemplate: string | null;
    outerDiameterFraction: number | null;
    frameWidthPx: number;
    frameHeightPx: number;
    calibrationPriorFramePx: { cx: number; cy: number; radiusPx: number; source: string; anchorDiameterMm: number } | null;
  } | null;
  categorization: { template: string | null; position: string | null; roundsProne: number | null; roundsStanding: number | null; sightingRole?: string | null };
  id: string;
}

interface HookAnalysis {
  pipeline: { stageA: string; stageB: string };
}

type HookWindow = Window & {
  __asaTest?: {
    listPhotos(sessionId: string): Promise<HookPhoto[]>;
    getAnalysis(photoId: string): Promise<HookAnalysis | null>;
  };
};

async function createSessionViaHome(page: Page): Promise<string> {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start & capture' }).click();
  await page.waitForURL(/#\/sessions\/[0-9a-f-]+\/capture/);
  const match = /#\/sessions\/([0-9a-f-]+)\/capture/.exec(page.url());
  if (!match?.[1]) throw new Error(`no session id in ${page.url()}`);
  return match[1];
}

async function listPhotos(page: Page, sessionId: string): Promise<HookPhoto[]> {
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  return page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
}

async function getAnalysis(page: Page, photoId: string): Promise<HookAnalysis | null> {
  return page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), photoId);
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

test('precision + prone: fake camera capture is stored with its overlay prior, then Done shows 1 photo', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await captureWithFakeCamera(page, sessionId, 'precision', 'Precision prone');

  const photos = await listPhotos(page, sessionId);
  expect(photos).toHaveLength(1);
  const photo = photos[0]!;
  expect(photo.origin).toBe('camera-overlay');
  expect(photo.capture?.overlayTemplate).toBe('precision');
  expect(photo.capture?.outerDiameterFraction).toBe(0.85);
  expect(photo.capture?.frameWidthPx).toBe(1080);
  expect(photo.capture?.frameHeightPx).toBe(1920);
  const prior = photo.capture?.calibrationPriorFramePx;
  expect(prior).not.toBeNull();
  // The overlay is centred in the cover-fit viewfinder, so the prior's centre is the frame centre.
  expect(prior!.cx).toBeCloseTo(540, 3);
  expect(prior!.cy).toBeCloseTo(960, 3);
  expect(prior!.source).toBe('overlay');
  expect(prior!.anchorDiameterMm).toBe(112.4);
  expect(photo.categorization).toEqual({ template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null });

  // M10: the runner starts Stage A as soon as the photo is stored, so it may already be past 'pending'.
  const analysis = await getAnalysis(page, photo.id);
  expect(['pending', 'running', 'done']).toContain(analysis?.pipeline.stageA);

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(new RegExp(`#/sessions/${sessionId}/metadata`));
  await expect(page.getByTestId('metadata-photo-count')).toHaveText('1 photo');
});

test('sight in: prone, ten rounds, role stored; confirm: five rounds (REV-79)', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await captureWithFakeCamera(page, sessionId, 'sighting', 'Sight in');

  const photos = await listPhotos(page, sessionId);
  expect(photos).toHaveLength(1);
  const photo = photos[0]!;
  expect(photo.capture?.overlayTemplate).toBe('sighting');
  expect(photo.capture?.calibrationPriorFramePx?.anchorDiameterMm).toBe(115);
  expect(photo.categorization).toEqual({ template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null, sightingRole: 'sight-in' });

  // The next target in the same session, marked Confirm at capture.
  await page.getByRole('radio', { name: 'Confirm', exact: true }).click();
  const shutter = page.getByRole('button', { name: 'Shutter' });
  await expect(shutter).toBeEnabled({ timeout: 15000 });
  await shutter.click();
  await expect(page.locator('.review-anchor')).toBeVisible();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByTestId('capture-count')).toHaveText('2 captured', { timeout: 15000 });
  const both = await listPhotos(page, sessionId);
  expect(both.map((p) => p.categorization.sightingRole).sort()).toEqual(['confirm', 'sight-in']);
  expect(both.find((p) => p.categorization.sightingRole === 'confirm')!.categorization.roundsProne).toBe(5);
});

test('import from Photos shows the overlay review screen, then Keep stores it with origin import', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=sighting`);
  await page.getByRole('radio', { name: 'Sight in', exact: true }).click();

  await page.getByTestId('import-input').setInputFiles(path.resolve('docs/reference/IMG_5057-sighting.jpg'));
  await expect(page.getByTestId('capture-review')).toBeVisible();
  await expect(page.getByTestId('review-header')).toHaveText('Imported photo');
  await expect(page.getByTestId('review-loaded')).toHaveText('Loaded');
  await expect(page.getByTestId('capture-review').locator('.overlay-anchor')).toBeVisible();

  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByTestId('capture-review')).toBeHidden();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });

  const photos = await listPhotos(page, sessionId);
  expect(photos).toHaveLength(1);
  expect(photos[0]!.origin).toBe('import');
  expect(photos[0]!.capture).toBeNull();
});

test('import two: "Imported photo 1 of 2", Discard the first, Keep the second → exactly one stored', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=sighting`);
  await page.getByRole('radio', { name: 'Sight in', exact: true }).click();

  await page.getByTestId('import-input').setInputFiles([
    path.resolve('docs/reference/IMG_5057-sighting.jpg'),
    path.resolve('docs/reference/IMG_5057-sighting.jpg'),
  ]);
  await expect(page.getByTestId('review-header')).toHaveText('Imported photo 1 of 2');
  await expect(page.getByTestId('review-loaded')).toHaveText('Loaded');
  await page.getByRole('button', { name: 'Discard' }).click();

  await expect(page.getByTestId('review-header')).toHaveText('Imported photo 2 of 2');
  await expect(page.getByTestId('review-loaded')).toHaveText('Loaded');
  await page.getByRole('button', { name: 'Keep' }).click();

  await expect(page.getByTestId('capture-review')).toBeHidden();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });
  const photos = await listPhotos(page, sessionId);
  expect(photos).toHaveLength(1);
  expect(photos[0]!.origin).toBe('import');
});
