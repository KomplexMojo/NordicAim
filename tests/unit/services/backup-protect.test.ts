import { describe, expect, it } from 'vitest';

import { decryptBackup, encryptedBackupHeader, isEncryptedBackup } from '@/lib/backup/encrypt';
import { verifyBackupFile } from '@/lib/backup/verify';
import { buildBackupFile } from '@/lib/services/backup';
import { isStampPassphrase, setPassphrase, WrongPassphraseError } from '@/lib/services/provenance';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';

const PASS = 'correct horse battery';
const ITER = 1000;

describe('protected backups (backup.md §2d, REV-151, issue #44)', () => {
  it('encrypts with the stamp passphrase; the file restores only after decrypting with it', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-01T12:00:00.000Z' });
    const settings = await setPassphrase(ctx, PASS, ITER);

    const made = await buildBackupFile(ctx, 'test', undefined, { passphrase: PASS, iterations: ITER });
    expect(made.protected).toBe(true);
    expect(made.fileName).toMatch(/\.json\.gz\.enc$/);
    expect(await isEncryptedBackup(made.blob)).toBe(true);
    expect((await encryptedBackupHeader(made.blob)).keyFingerprint).toBe(settings.keyFingerprint);
    // As it is, the file is not a readable backup; decrypted, it verifies.
    expect((await verifyBackupFile(made.blob)).ok).toBe(false);
    expect((await verifyBackupFile(await decryptBackup(made.blob, PASS))).ok).toBe(true);
    db.close();
  });

  it('refuses a passphrase that is not the stamp passphrase, before building anything', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-01T12:00:00.000Z' });
    await setPassphrase(ctx, PASS, ITER);
    expect(await isStampPassphrase(ctx, 'some other passphrase', ITER)).toBe(false);
    await expect(buildBackupFile(ctx, 'test', undefined, { passphrase: 'some other passphrase', iterations: ITER })).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    db.close();
  });

  it('with no stamp passphrase set up, a protected backup cannot be made; an ordinary one still can', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-01T12:00:00.000Z' });
    await expect(buildBackupFile(ctx, 'test', undefined, { passphrase: PASS, iterations: ITER })).rejects.toBeInstanceOf(WrongPassphraseError);
    const plain = await buildBackupFile(ctx, 'test');
    expect(plain.protected).toBe(false);
    expect(await isEncryptedBackup(plain.blob)).toBe(false);
    db.close();
  });
});
