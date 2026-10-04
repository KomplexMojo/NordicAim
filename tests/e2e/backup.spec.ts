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
  // REV-158: photos are stored without their location, and the dialog says so.
  await expect(page.getByTestId('backup-confirm-dialog')).toContainText('so the file holds no locations.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-confirm').click()]);
  expect(download.suggestedFilename()).toMatch(/^nordic-aim-backup-\d{4}-\d{2}-\d{2}\.json\.gz$/);
  const backupPath = testInfo.outputPath('backup.json.gz');
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
  const bytes = readFileSync(backupPath);
  const cutPath = testInfo.outputPath('cut.json.gz');
  writeFileSync(cutPath, bytes.subarray(0, bytes.length - 100));
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
  // REV-126: the working copies and thumbnails were not in the file; the restore made them again, at their recorded size.
  await expect(page.getByTestId('backup-message')).toContainText('made again from the originals');
  const rebuilt = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('asa');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = <T,>(store: string, query?: IDBValidKey): Promise<T> =>
      new Promise((resolve, reject) => {
        const req = query === undefined ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(query);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      });
    const photos = await get<Array<{ id: string; working: { widthPx: number; heightPx: number } }>>('photos');
    const out: Array<{ want: string; got: string; thumb: boolean }> = [];
    for (const p of photos) {
      const working = await get<{ bytes: ArrayBuffer } | undefined>('blobs', `photo:${p.id}:working`);
      const thumb = await get<{ bytes: ArrayBuffer } | undefined>('blobs', `photo:${p.id}:thumb`);
      const bitmap = working === undefined ? null : await createImageBitmap(new Blob([working.bytes]));
      out.push({ want: `${p.working.widthPx}x${p.working.heightPx}`, got: bitmap === null ? 'missing' : `${bitmap.width}x${bitmap.height}`, thumb: thumb !== undefined });
    }
    db.close();
    return out;
  });
  expect(rebuilt.length).toBeGreaterThan(0);
  for (const r of rebuilt) expect(r).toEqual({ want: r.want, got: r.want, thumb: true });

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
  // REV-125: the name carries the athlete and the key fingerprint.
  const fp = fingerprint.match(/[0-9A-F]{8}/)![0];
  expect(download.suggestedFilename()).toMatch(new RegExp(`^nordic-aim-backup-jane-doe-${fp}-\\d{4}-\\d{2}-\\d{2}\\.json\\.gz$`));
  const backupPath = testInfo.outputPath('backup.json.gz');
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

test('back up chosen sessions: one session in a smaller, clearly named file that does not count as the backup (REV-143)', async ({ page }, testInfo) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const first = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  await page.goto('/#/settings');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.getByTestId('backup-now').click();
  await expect(page.getByTestId('backup-scope-all')).toBeChecked();
  await expect(page.getByTestId('backup-confirm')).toHaveText('Create backup');

  await page.getByTestId('backup-scope-chosen').check();
  await expect(page.getByTestId('backup-session-check')).toHaveCount(2);
  await expect(page.getByTestId('backup-confirm')).toBeDisabled();
  await page.locator(`[data-testid="backup-session-check"][data-session-id="${first}"]`).check();
  await expect(page.getByTestId('backup-confirm')).toHaveText('Back up 1 session');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-confirm').click()]);
  expect(download.suggestedFilename()).toMatch(/^nordic-aim-backup-\d{4}-\d{2}-\d{2}-1-session\.json\.gz$/);
  const path = testInfo.outputPath('one-session.json.gz');
  await download.saveAs(path);
  await expect(page.getByTestId('backup-message')).toContainText('Backup made: 1 session,');
  await expect(page.getByTestId('backup-message')).toContainText('does not count as your backup');
  // The reminder and the last-backup line wait for a backup of everything.
  await expect(page.getByTestId('last-backup')).toHaveText('No backup yet.');

  // Choosing it for a restore says what it is.
  await page.getByTestId('restore-file').setInputFiles(path);
  await expect(page.getByTestId('restore-preview')).toContainText('It holds 1 sessions');
  await expect(page.getByTestId('restore-preview')).toContainText('backup of chosen sessions');
});

test('the backup reminder can be dismissed, and comes back once a new session is recorded (issue #92)', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  const sid = await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto('/#/');
  await expect(page.getByTestId('backup-reminder')).toBeVisible();

  await page.getByTestId('backup-reminder-dismiss').click();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  // Dismissed everywhere, and after a reload.
  await page.goto(`/#/sessions/${sid}/results`);
  await expect(page.getByTestId('summary-card')).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('summary-card')).toBeVisible();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  // A new session since the dismissal brings it back.
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());
  await page.goto('/#/');
  await page.reload();
  await expect(page.getByTestId('backup-reminder')).toBeVisible();
  // Settings → Back up now is still right there.
  await page.goto('/#/settings');
  await expect(page.getByTestId('backup-now')).toBeVisible();
});

test('a backup protected with the stamp passphrase is encrypted and opens only with it (issue #44)', async ({ page }, testInfo) => {
  const PASS = 'correct horse battery';
  await page.goto('/#/');
  await page.waitForFunction(() => (window as HookWindow).__asaTest !== undefined);
  await page.evaluate(() => (window as HookWindow).__asaTest!.loadDemo());
  await page.evaluate(() => (window as HookWindow).__asaTest!.waitForIdle());

  // Without a stamp passphrase the switch is there but off and unavailable.
  await page.goto('/#/settings');
  await page.getByTestId('backup-now').click();
  await expect(page.getByTestId('backup-protect-toggle')).toBeDisabled();
  await expect(page.getByTestId('backup-protect')).toContainText('Set up an athlete stamp passphrase');
  await page.keyboard.press('Escape');

  await page.getByTestId('athlete-passphrase').fill(PASS);
  await page.getByTestId('set-passphrase').click();
  await expect(page.getByTestId('passphrase-message')).toContainText('Key set', { timeout: 30_000 });

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.getByTestId('backup-now').click();
  await expect(page.getByTestId('backup-protect-toggle')).not.toBeChecked(); // off by default
  await page.getByTestId('backup-protect-toggle').check();
  await expect(page.getByTestId('backup-confirm')).toBeDisabled();
  // A passphrase that isn't the stamp passphrase is caught before anything is made.
  await page.getByTestId('backup-protect-passphrase').fill('not my stamp passphrase');
  await page.getByTestId('backup-confirm').click();
  await expect(page.getByTestId('backup-protect-error')).toContainText("isn't your stamp passphrase", { timeout: 30_000 });
  await page.getByTestId('backup-protect-passphrase').fill(PASS);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-confirm').click()]);
  expect(download.suggestedFilename()).toMatch(/\.json\.gz\.enc$/);
  const path = testInfo.outputPath('protected.enc');
  await download.saveAs(path);
  await expect(page.getByTestId('backup-message')).toContainText('Protected with your stamp passphrase');
  // Nothing readable inside: not gzip, not JSON.
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('NAEB');
  expect(bytes.toString('latin1')).not.toContain('nordic-aim-backup"');

  // Restore asks for the passphrase; a wrong one opens nothing, the right one shows the usual check.
  await page.getByTestId('restore-file').setInputFiles(path);
  await expect(page.getByTestId('restore-unlock')).toBeVisible();
  await expect(page.getByTestId('restore-preview')).toHaveCount(0);
  await page.getByTestId('restore-passphrase').fill('the wrong passphrase');
  await page.getByTestId('restore-unlock-go').click();
  await expect(page.getByTestId('restore-problem')).toContainText('does not open this backup', { timeout: 30_000 });
  await page.getByTestId('restore-passphrase').fill(PASS);
  await page.getByTestId('restore-unlock-go').click();
  await expect(page.getByTestId('restore-preview')).toContainText('This backup checks out', { timeout: 30_000 });
  await expect(page.getByTestId('restore-unlock')).toHaveCount(0);
});
