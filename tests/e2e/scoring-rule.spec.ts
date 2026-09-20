import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

// REV-56 / issue #4: the scoring rule is a Settings choice, and changing it re-scores stored sessions.

type HookWindow = Window & {
  __asaTest?: {
    loadDemo(): Promise<string>;
    waitForIdle(): Promise<void>;
    listPhotos(id: string): Promise<Array<{ id: string; categorization: { template: string | null } }>>;
    setShots(photoId: string, shots: unknown): Promise<void>;
  };
};

const precisionFixture = JSON.parse(
  readFileSync(path.resolve('fixtures/reference/sample-shots-precision.json'), 'utf-8'),
) as { shots: Array<{ xMm: number; yMm: number }> };

test.setTimeout(240_000);

test('choosing a scoring rule in Settings re-scores a stored session, and choosing gauge again restores it', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sessionId = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  const precisionHeadline = () =>
    page.getByTestId('target-card').filter({ hasText: 'Precision' }).getByTestId('target-headline');

  // The demo target scores the same under every rule (none of its shots sit in the band where they disagree),
  // so put one there: 7.05 mm out is a 10 by gauge touch (7.05 - 2.8 = 4.25 <= 5.2) but a 9 by centre (> 5.2).
  const photos = await page.evaluate((sid) => (window as HookWindow).__asaTest!.listPhotos(sid), sessionId);
  const precisionPhoto = photos.find((p) => p.categorization.template === 'precision')!;
  const shots = precisionFixture.shots.map((s, i) => (i === 0 ? { ...s, xMm: 7.05, yMm: 0 } : s));
  await page.evaluate(({ id, shots }) => (window as HookWindow).__asaTest!.setShots(id, shots), { id: precisionPhoto.id, shots });
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(precisionHeadline()).toBeVisible({ timeout: 30_000 });
  const gaugeScore = (await precisionHeadline().textContent())!; // gauge, the default

  // Centre in ring is stricter: a shot only credited by touching a line drops a ring.
  await page.goto('/#/settings');
  await expect(page.getByTestId('scoring-rule-gauge')).toBeChecked();
  await page.getByTestId('scoring-rule-centre').check();
  await expect(page.getByText(/Re-scored \d+ targets? in 1 session/)).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect.poll(async () => precisionHeadline().textContent(), { timeout: 30_000 }).not.toBe(gaugeScore);

  // The choice sticks across a reload, and gauge puts the score back.
  await page.goto('/#/settings');
  await expect(page.getByTestId('scoring-rule-centre')).toBeChecked();
  await page.getByTestId('scoring-rule-gauge').check();
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto(`/#/sessions/${sessionId}/results`);
  await expect(precisionHeadline()).toHaveText(gaugeScore, { timeout: 30_000 });
});

/** The stored visible size, read from IndexedDB: a value commits on Enter and is written asynchronously, so a reload
 *  straight after Enter can beat the write. Wait for the store, as settings.spec.ts does for the hole size. */
async function storedVisibleHoleMm(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('asa');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('settings', 'readonly').objectStore('settings').get('app');
          get.onsuccess = () => {
            const row = get.result as { visibleHoleDiameterMm?: number } | undefined;
            db.close();
            resolve(row?.visibleHoleDiameterMm ?? null);
          };
          get.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
}

test('the visible hole size only appears for the visible rule, and refuses values out of range', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByTestId('visible-hole-input')).toHaveCount(0);

  await page.getByTestId('scoring-rule-visible').check();
  const input = page.getByTestId('visible-hole-input');
  await expect(input).toHaveValue('4.5');

  await input.fill('9');
  await expect(page.getByTestId('visible-hole-error')).toBeVisible();
  await input.fill('4');
  await input.press('Enter');
  await expect.poll(() => storedVisibleHoleMm(page)).toBe(4);
  await page.reload();
  await page.getByTestId('scoring-rule-visible').waitFor();
  await expect(page.getByTestId('visible-hole-input')).toHaveValue('4');
});
