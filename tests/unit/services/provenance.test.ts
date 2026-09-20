import { beforeEach, describe, expect, it } from 'vitest';

import { unlockPassphrase, loadProvenanceKey, setPassphrase, WeakPassphraseError, WrongPassphraseError } from '@/lib/services/provenance';
import { clearProvenanceKey } from '@/lib/store/secrets-repo';
import { getSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';

const FAST = 1000;

describe('provenance service (REV-100)', () => {
  let ctx: ReturnType<typeof makeTestContext>;
  beforeEach(async () => {
    ctx = makeTestContext(await openTestDb());
  });

  it('rejects a short passphrase and stores nothing', async () => {
    await expect(setPassphrase(ctx, 'too short', FAST)).rejects.toBeInstanceOf(WeakPassphraseError);
    expect(await loadProvenanceKey(ctx)).toBeNull();
  });

  it('sets a key: the salt and fingerprint go to settings, the key to secrets, the passphrase nowhere', async () => {
    const settings = await setPassphrase(ctx, 'correct horse battery', FAST);
    expect(settings.keyFingerprint).toMatch(/^[0-9A-F]{8}$/);
    expect(settings.athleteSalt).not.toBeNull();
    expect((await loadProvenanceKey(ctx))!.length).toBe(32);
    expect(JSON.stringify(await getSettings(ctx.db))).not.toContain('correct horse');
  });

  it('after a restore (no key on the phone) the same passphrase unlocks it and a wrong one does not', async () => {
    await setPassphrase(ctx, 'correct horse battery', FAST);
    const before = await loadProvenanceKey(ctx);
    await clearProvenanceKey(ctx.db);
    expect(await loadProvenanceKey(ctx)).toBeNull();

    await expect(unlockPassphrase(ctx, 'wrong passphrase here', FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(await loadProvenanceKey(ctx)).toBeNull();

    await unlockPassphrase(ctx, 'correct horse battery', FAST);
    expect(Array.from((await loadProvenanceKey(ctx))!)).toEqual(Array.from(before!));
  });

  it('a new passphrase re-keys: a different salt and fingerprint', async () => {
    const a = await setPassphrase(ctx, 'correct horse battery', FAST);
    const b = await setPassphrase(ctx, 'another long passphrase', FAST);
    expect(b.athleteSalt).not.toBe(a.athleteSalt);
    expect(b.keyFingerprint).not.toBe(a.keyFingerprint);
  });
});
