import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

// REV-63 / issue #13: back up everything to one file, lose the data, restore it.

type HookWindow = Window & { __asaTest?: { loadDemo(): Promise<string>; waitForIdle(): Promise<void> } };

test.setTimeout(240_000);

test('back up, wipe the database, restore: the session and its scores come back; a cut-off file is refused', async ({ page }, testInfo) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  // The reminder shows because nothing is backed up yet.
  await page.goto('/#/');
  await expect(page.getByTestId('backup-reminder')).toBeVisible();

  await page.goto('/#/settings');
  await expect(page.getByTestId('last-backup')).toHaveText('No backup yet.');
  // Force the download path: the share sheet is the phone's, and a browser test cannot drive it.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.getByTestId('backup-now').click();
  await expect(page.getByTestId('backup-confirm-dialog')).toContainText('GPS');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-confirm').click()]);
  expect(download.suggestedFilename()).toMatch(/^nordic-aim-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = testInfo.outputPath('backup.json');
  await download.saveAs(backupPath);
  await expect(page.getByTestId('backup-message')).toContainText(/Backup made: 1 sessions?, \d+ photos/);
  await expect(page.getByTestId('last-backup')).toContainText('1 sessions');
  await page.goto('/#/');
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  // Lose everything (the Home Screen icon removed, or website data cleared).
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('asa');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = Array.from(db.objectStoreNames);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const s of stores) tx.objectStore(s).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByTestId('session-list')).toHaveCount(0);

  // A cut-off copy is refused and writes nothing.
  const text = readFileSync(backupPath, 'utf-8');
  const cutPath = testInfo.outputPath('cut.json');
  writeFileSync(cutPath, text.slice(0, text.length - 100));
  await page.goto('/#/settings');
  await page.getByTestId('restore-file').setInputFiles(cutPath);
  await expect(page.getByTestId('restore-problem')).toContainText(/cut short|damaged/);
  await expect(page.getByTestId('restore-go')).toHaveCount(0);

  // The real file restores.
  await page.getByTestId('restore-file').setInputFiles(backupPath);
  await expect(page.getByTestId('restore-preview')).toContainText('This backup checks out');
  await expect(page.getByTestId('restore-counts')).toContainText('New: 1');
  await page.getByTestId('restore-go').click();
  await expect(page.getByTestId('backup-message')).toContainText('Restored');

  await page.goto(`/#/sessions/${sid}/results`);
  await expect(page.getByTestId('target-card').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('target-card').first().getByTestId('target-headline')).toBeVisible();

  // Restoring the same file again changes nothing.
  await page.goto('/#/settings');
  await page.getByTestId('restore-file').setInputFiles(backupPath);
  await expect(page.getByTestId('restore-counts')).toContainText('New: 0');
  await expect(page.getByTestId('restore-counts')).toContainText('identical: 1');
});
