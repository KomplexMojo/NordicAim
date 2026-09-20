// M22 (REV-47, REV-48): the three main screens on a bottom tab bar, and the Settings screen — the backing
// sheet for every session, hole size and About.

import { expect, test, type Page } from '@playwright/test';

interface HookAnalysis {
  pipeline: {
    stageA: string;
    error: string | null;
    detection: { method: string; backing: string; fallbackReason: string | null };
  };
}

type HookWindow = Window & {
  __asaTest?: {
    listPhotos(sessionId: string): Promise<Array<{ id: string }>>;
    getAnalysis(photoId: string): Promise<HookAnalysis | null>;
    waitForIdle(): Promise<void>;
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

async function expectActive(page: Page, tab: 'shooting' | 'settings' | 'diagnostics') {
  for (const id of ['shooting', 'settings', 'diagnostics']) {
    const link = page.getByTestId(`tab-${id}`);
    if (id === tab) await expect(link).toHaveAttribute('aria-current', 'page');
    else await expect(link).not.toHaveAttribute('aria-current', 'page');
  }
}

test('the three tabs navigate and mark the active one', async ({ page }) => {
  await page.goto('/#/');
  const bar = page.getByTestId('tab-bar');
  await expect(bar).toBeVisible();
  await expectActive(page, 'shooting');

  // Each target is at least 44 px (AGENTS.md style).
  for (const id of ['shooting', 'settings', 'diagnostics']) {
    const box = await page.getByTestId(`tab-${id}`).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }

  await bar.getByRole('link', { name: 'Settings' }).click();
  await page.waitForURL(/#\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expectActive(page, 'settings');

  await bar.getByRole('link', { name: 'Diagnostics' }).click();
  await page.waitForURL(/#\/diagnostics$/);
  await expectActive(page, 'diagnostics');

  await bar.getByRole('link', { name: 'Sessions' }).click();
  await page.waitForURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'NordicAim' })).toBeVisible();
  await expectActive(page, 'shooting');
});

test('no tab bar on the capture screens; Shooting is active on a session screen', async ({ page }) => {
  const sessionId = await createSessionViaHome(page);
  await expect(page.getByRole('button', { name: 'Shutter' })).toBeVisible();
  await expect(page.getByTestId('tab-bar')).toHaveCount(0);

  await page.goto(`/#/sessions/${sessionId}/metadata`);
  await expect(page.getByRole('heading', { name: 'Add metadata' })).toBeVisible();
  await expectActive(page, 'shooting');

  // Settings → Photograph backing card is full screen too.
  await page.goto('/#/settings');
  await page.getByTestId('photograph-card').click();
  await page.waitForURL(/#\/settings\/backing-card/);
  await expect(page.getByTestId('card-mode-title')).toBeVisible();
  await expect(page.getByTestId('tab-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForURL(/#\/settings$/);
  await expect(page.getByTestId('tab-bar')).toBeVisible();
});

test('backing sheet: a card photo sets the colour for every session, and Clear removes it', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('backing-mode-trigger')).toHaveText('Auto');
  await expect(page.getByTestId('backing-source')).toHaveText('No colour measured yet');

  await page.getByTestId('card-photo-input').setInputFiles('fixtures/reference/backing-card-orange.png');
  await expect(page.getByTestId('backing-source')).toHaveText('Colour from your card photo', { timeout: 15000 });
  await expect(page.getByTestId('backing-swatch')).toHaveCSS('background-color', 'rgb(255, 106, 31)');

  await page.reload();
  await expect(page.getByTestId('backing-source')).toHaveText('Colour from your card photo');

  await page.getByTestId('clear-backing').click();
  await expect(page.getByTestId('backing-source')).toHaveText('No colour measured yet');
  await page.reload();
  await expect(page.getByTestId('backing-source')).toHaveText('No colour measured yet');
});

/**
 * The stored hole size, read straight from IndexedDB (`asa` / `settings` / key `app`). A value is committed
 * on Enter or blur and written asynchronously, so a reload straight after Enter can race the write; wait for
 * the store before reloading. (The race made this test flaky under full-suite load; the app was fine.)
 */
async function storedHoleDiameterMm(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('asa');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('settings', 'readonly').objectStore('settings').get('app');
          get.onsuccess = () => {
            const row = get.result as { profileOverrides?: { holeDiameterMm?: number } } | undefined;
            db.close();
            resolve(row?.profileOverrides?.holeDiameterMm ?? null);
          };
          get.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
}

test('hole size: a new value is kept, and Reset returns 5.6', async ({ page }) => {
  await page.goto('/#/settings');
  const input = page.getByTestId('hole-diameter-input');
  await expect(input).toHaveValue('5.6');

  await input.fill('7.6');
  await input.press('Enter');
  await expect.poll(() => storedHoleDiameterMm(page)).toBe(7.6);
  await page.reload();
  await expect(page.getByTestId('hole-diameter-input')).toHaveValue('7.6');

  // Out of range is refused and not stored.
  await page.getByTestId('hole-diameter-input').fill('20');
  await expect(page.getByTestId('hole-diameter-error')).toBeVisible();
  await page.getByTestId('hole-diameter-input').press('Enter');

  // The refused value never reached the store.
  expect(await storedHoleDiameterMm(page)).toBe(7.6);

  await page.getByTestId('hole-diameter-reset').click();
  await expect(page.getByTestId('hole-diameter-input')).toHaveValue('5.6');
  await expect.poll(() => storedHoleDiameterMm(page)).toBe(5.6);
  await page.reload();
  await expect(page.getByTestId('hole-diameter-input')).toHaveValue('5.6');
});

test('About shows the app name and the build', async ({ page }) => {
  await page.goto('/#/settings');
  // M15's AppHeader also shows "NordicAim", so scope this to the page's own About section.
  await expect(page.getByRole('main').getByText('NordicAim')).toBeVisible();
  await expect(page.getByTestId('build-version')).not.toHaveText('');
});

test('Coloured in Settings reaches A5: the photo analyzed afterwards records a forced colour backing', async ({ page }) => {
  // OpenCV (~10 MB of wasm) loads in the worker on the first Stage A job.
  test.setTimeout(180_000);

  await page.goto('/#/settings');
  await page.getByTestId('backing-mode-trigger').click();
  await page.getByRole('option', { name: 'Coloured backing' }).click();
  await expect(page.getByTestId('backing-mode-trigger')).toHaveText('Coloured backing');

  const sessionId = await createSessionViaHome(page);
  await page.goto(`/#/sessions/${sessionId}/capture?fakeCamera=precision`);
  await expect(page.getByText('FAKE CAMERA')).toBeVisible();
  await page.getByRole('radio', { name: 'Precision prone', exact: true }).click();
  const shutter = page.getByRole('button', { name: 'Shutter' });
  await expect(shutter).toBeEnabled({ timeout: 15000 });
  await shutter.click();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByTestId('capture-count')).toHaveText('1 captured', { timeout: 15000 });

  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  expect(photos).toHaveLength(1);
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  const analysis = await page.evaluate((pid) => (window as HookWindow).__asaTest!.getAnalysis(pid), photos[0]!.id);

  expect(analysis?.pipeline.error).toBeNull();
  expect(analysis?.pipeline.stageA).toBe('done');
  // The setting reached the worker: the colour path was forced (backing-sheet.md §3). The fake camera's target
  // has no real backing, so the colour path may fall back to the standard detector, and says so.
  expect(analysis?.pipeline.detection.backing).toBe('forced');
  if (analysis?.pipeline.detection.method === 'standard') {
    expect(analysis.pipeline.detection.fallbackReason).not.toBeNull();
  }
});

test('the Glossary starts collapsed and lists MOA with its formula when opened (REV-66)', async ({ page }) => {
  await page.goto('/#/settings');
  const toggle = page.getByTestId('panel-toggle-glossary');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const moa = page.locator('[data-testid="glossary-entry"][data-term="MOA"]');
  await expect(moa).toContainText('minutes of angle');
  await expect(moa).toContainText('atan');
  await expect(page.locator('[data-testid="glossary-entry"][data-term="MPI"]')).toBeVisible();
});

test('Settings → Athlete keeps the name and ski club (REV-99)', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByTestId('athlete-name').fill('  Jane   Doe ');
  await page.getByTestId('athlete-club').fill('Caledonia Nordic Ski Club');
  await page.getByTestId('athlete-club').blur();
  await expect(page.getByTestId('athlete-stamp')).toContainText('not set');
  await page.reload();
  await expect(page.getByTestId('athlete-name')).toHaveValue('Jane Doe');
  await expect(page.getByTestId('athlete-club')).toHaveValue('Caledonia Nordic Ski Club');
});
