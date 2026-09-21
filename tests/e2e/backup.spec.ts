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

  // The delete screen knows about the backup (REV-117): it no longer says there is none.
  await page.locator(`[data-testid="session-delete"][data-session-id="${sid}"]`).click();
  await expect(page.getByTestId('delete-backup-note')).toContainText('holds this session as it is now');
  await page.getByTestId('delete-cancel').click();

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

test('a restore brings the settings and preferences back too, and asks for the passphrase again (REV-115)', async ({ page }, testInfo) => {
  await page.goto('/#/settings');
  await page.getByTestId('athlete-name').fill('Jane Doe');
  await page.getByTestId('athlete-club').fill('Caledonia Nordic Ski Club');
  await page.getByTestId('athlete-club').blur();
  await page.getByTestId('handedness-left').check();
  await page.getByTestId('scoring-rule-centre').check();
  await page.getByTestId('athlete-passphrase').fill('correct horse battery staple');
  await page.getByTestId('set-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('Key set', { timeout: 30_000 });
  const fingerprint = (await page.getByTestId('key-fingerprint').textContent())!;
  await page.evaluate(() => window.localStorage.setItem('asa.panel.glossary', 'open'));

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.getByTestId('backup-now').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-confirm').click()]);
  const backupPath = testInfo.outputPath('backup.json');
  await download.saveAs(backupPath);
  await expect(page.getByTestId('backup-message')).toContainText('Backup made');

  // Change everything, drop the preference and the key (a new phone has neither).
  await page.getByTestId('athlete-name').fill('Someone Else');
  await page.getByTestId('athlete-name').blur();
  await page.getByTestId('handedness-right').check();
  await page.getByTestId('scoring-rule-gauge').check();
  await page.evaluate(async () => {
    window.localStorage.removeItem('asa.panel.glossary');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('asa');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('secrets', 'readwrite');
      tx.objectStore('secrets').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.getByTestId('restore-file').setInputFiles(backupPath);
  await page.getByTestId('restore-go').click();
  await expect(page.getByTestId('backup-message')).toContainText('settings and preferences came back');
  await expect(page.getByTestId('backup-message')).toContainText('passphrase');

  // The screen shows the restored values without a reload.
  await expect(page.getByTestId('athlete-name')).toHaveValue('Jane Doe');
  await expect(page.getByTestId('athlete-club')).toHaveValue('Caledonia Nordic Ski Club');
  await expect(page.getByTestId('handedness-left')).toBeChecked();
  await expect(page.getByTestId('scoring-rule-centre')).toBeChecked();
  await expect(page.getByTestId('key-fingerprint')).toHaveText(fingerprint);
  await expect(page.getByTestId('unlock-passphrase')).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('asa.panel.glossary'))).toBe('open');

  // The same passphrase unlocks stamping again.
  await page.getByTestId('athlete-passphrase').fill('correct horse battery staple');
  await page.getByTestId('unlock-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('Unlocked', { timeout: 30_000 });
});
