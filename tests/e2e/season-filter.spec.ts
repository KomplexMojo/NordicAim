// REV-154 (issue #29): the season filter row on Home, Patterns, Analysis and Goals.

import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

type HookWindow = Window & { __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> } };

test('one season row on every screen; a season with nothing recorded empties it, and the choice stays in the address', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  // The demo photos count in the season of their capture date (else the session's date, today): read it back.
  const season = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('asa');
      r.onsuccess = () => resolve(r.result);
    });
    const [photo] = await new Promise<Array<{ captureTime: { local: string | null } }>>((resolve) => {
      const r = db.transaction('photos').objectStore('photos').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    const month = Number((photo?.captureTime.local ?? new Date().toISOString()).slice(5, 7));
    return ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'][month - 1]!;
  });
  const other = season === 'summer' ? 'winter' : 'summer';

  await page.goto('/#/');
  for (const id of ['all', 'winter', 'spring', 'summer', 'fall']) {
    const box = await page.getByTestId(`home-season-${id}`).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId('home-season-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('session-list').getByRole('listitem')).toHaveCount(1);
  await page.getByTestId(`home-season-${other}`).click();
  await expect(page).toHaveURL(new RegExp(`season=${other}`));
  await expect(page.getByTestId('session-list')).toHaveCount(0);
  await page.getByTestId(`home-season-${season}`).click();
  await expect(page.getByTestId('session-list').getByRole('listitem')).toHaveCount(1);

  await page.goto(`/#/patterns?view=precision-prone&range=all&season=${other}`);
  await expect(page.getByTestId(`pattern-season-${other}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('patterns-drawing')).toHaveAttribute('data-shots', '0');
  await page.getByTestId('pattern-season-all').click();
  await expect(page.getByTestId('patterns-drawing')).not.toHaveAttribute('data-shots', '0');
  // Changing the view keeps the season.
  await page.getByTestId(`pattern-season-${season}`).click();
  await page.getByTestId('pattern-view-sight-in').click();
  await expect(page).toHaveURL(new RegExp(`season=${season}`));

  await page.goto(`/#/analysis?view=precision-prone&range=all&season=${other}`);
  await expect(page.getByTestId('analysis-counts')).toContainText('0 sessions');
  await page.getByTestId(`analysis-season-${season}`).click();
  await expect(page.getByTestId('analysis-counts')).toContainText('1 session');

  await page.goto(`/#/goals?season=${other}`);
  await expect(page.getByTestId('goals-counts')).toContainText('0 sessions');
  await page.getByTestId('goals-season-all').click();
  await expect(page.getByTestId('goals-counts')).toHaveText('Precision prone: 1 session');
  await expect(page).not.toHaveURL(/season=/);
});
