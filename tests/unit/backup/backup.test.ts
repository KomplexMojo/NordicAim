import { describe, expect, it } from 'vitest';

import { createBackup } from '@/lib/backup/create';
import { backupDue } from '@/lib/backup/due';
import { applyRestore, planRestore } from '@/lib/backup/restore';
import { verifyBackup } from '@/lib/backup/verify';
import { createSession } from '@/lib/services/sessions';
import { ingestPhoto } from '@/lib/services/ingest';
import type { AppDb } from '@/lib/store/db';

import { openTestDb } from '../../helpers/db';
import { emptyCategorization, jpegBlob, makeTestContext } from '../../helpers/fixtures';
import { stubImageTools } from '../../helpers/stub-image-tools';

async function seeded() {
  const db = await openTestDb();
  const ctx = makeTestContext(db);
  const session = await createSession(ctx, { name: 'Range day' });
  const photo = await ingestPhoto(
    ctx,
    {
      sessionId: session.id,
      blob: jpegBlob(),
      origin: 'import',
      originalFilename: 'a.jpg',
      clientLocal: '2026-09-05T12:00:00',
      clientOffset: '-07:00',
      capture: null,
      categorization: emptyCategorization(),
    },
    stubImageTools(),
  );
  return { db, ctx, session, photo };
}

async function dump(db: AppDb) {
  const blobs: Record<string, string> = {};
  for (const key of (await db.getAllKeys('blobs')) as string[]) {
    const b = (await db.get('blobs', key))!;
    blobs[key] = `${b.contentType}:${Array.from(new Uint8Array(b.bytes)).join(',')}`;
  }
  return {
    sessions: await db.getAll('sessions'),
    photos: await db.getAll('photos'),
    analyses: await db.getAll('analyses'),
    settings: await db.getAll('settings'),
    blobs,
  };
}

const NOW = '2026-09-19T12:00:00.000Z';

async function backupText(db: AppDb): Promise<string> {
  return (await createBackup(db, { appBuild: 'test', nowIso: NOW })).blob.text();
}

describe('backup (REV-63)', () => {
  it('round-trips everything into an empty database, checksums verifying', async () => {
    const { db, session } = await seeded();
    const text = await backupText(db);
    const verified = await verifyBackup(text);
    if (!verified.ok) throw new Error(verified.problem);
    expect(verified.backup.file.manifest.counts.sessions).toBe(1);
    expect(verified.backup.file.manifest.sessions[0]).toMatchObject({ id: session.id, name: 'Range day', photos: 1 });

    const fresh = await openTestDb();
    const plan = await planRestore(fresh, verified.backup);
    expect(plan.sessions.new).toBe(1);
    await applyRestore(fresh, verified.backup, plan, 'keep');
    expect(await dump(fresh)).toEqual(await dump(db));
    db.close();
    fresh.close();
  });

  it('refuses a truncated file, an edited image, a wrong count and a foreign file, naming the failure', async () => {
    const { db } = await seeded();
    const text = await backupText(db);

    const cut = await verifyBackup(text.slice(0, text.length - 40));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.problem).toMatch(/cut short|damaged/);

    const parsed = JSON.parse(text);
    parsed.blobs[0].base64 = parsed.blobs[0].base64.slice(0, 20) + 'AAAA' + parsed.blobs[0].base64.slice(24);
    const edited = await verifyBackup(JSON.stringify(parsed));
    expect(edited.ok).toBe(false);
    if (!edited.ok) expect(edited.problem).toMatch(/checksum|bytes/);

    const parsed2 = JSON.parse(text);
    parsed2.records.sessions.pop();
    const counted = await verifyBackup(JSON.stringify(parsed2));
    expect(counted.ok).toBe(false);
    if (!counted.ok) expect(counted.problem).toMatch(/manifest lists 1 sessions/);

    const foreign = await verifyBackup('{"hello":1}');
    expect(foreign.ok).toBe(false);
    db.close();
  });

  it('writes nothing when a restore fails part-way', async () => {
    const { db } = await seeded();
    const verified = await verifyBackup(await backupText(db));
    if (!verified.ok) throw new Error(verified.problem);
    const fresh = await openTestDb();
    const plan = await planRestore(fresh, verified.backup);
    // A record IndexedDB cannot store (a function is not cloneable) fails the last write, after the sessions were put.
    verified.backup.file.records.analyses.push({ photoId: 'poison', broken: () => 1 });
    plan.verdicts.set('analyses:poison', 'new');
    const before = await dump(fresh);
    await expect(applyRestore(fresh, verified.backup, plan, 'keep')).rejects.toBeDefined();
    expect(await dump(fresh)).toEqual(before);
    db.close();
    fresh.close();
  });

  it('is idempotent: restoring what is already present changes nothing', async () => {
    const { db } = await seeded();
    const verified = await verifyBackup(await backupText(db));
    if (!verified.ok) throw new Error(verified.problem);
    const before = await dump(db);
    const plan = await planRestore(db, verified.backup);
    expect(plan.sessions).toEqual({ new: 0, same: 1, different: 0 });
    expect(plan.blobs.new + plan.blobs.different).toBe(0);
    const report = await applyRestore(db, verified.backup, plan, 'replace');
    expect(report.written).toBe(0);
    expect(await dump(db)).toEqual(before);
    db.close();
  });

  it('a different record under the same id is kept by default and replaced only when asked', async () => {
    const { db, session } = await seeded();
    const verified = await verifyBackup(await backupText(db));
    if (!verified.ok) throw new Error(verified.problem);
    await db.put('sessions', { ...(await db.get('sessions', session.id))!, name: 'Edited later' });

    const plan = await planRestore(db, verified.backup);
    expect(plan.sessions.different).toBe(1);
    await applyRestore(db, verified.backup, plan, 'keep');
    expect((await db.get('sessions', session.id))!.name).toBe('Edited later');
    await applyRestore(db, verified.backup, plan, 'replace');
    expect((await db.get('sessions', session.id))!.name).toBe('Range day');
    db.close();
  });

  it('keeps a record the schema would reject, exactly as stored', async () => {
    const { db, session } = await seeded();
    await db.put('sessions', { ...(await db.get('sessions', session.id))!, name: '' });
    const verified = await verifyBackup(await backupText(db));
    if (!verified.ok) throw new Error(verified.problem);
    const fresh = await openTestDb();
    await applyRestore(fresh, verified.backup, await planRestore(fresh, verified.backup), 'keep');
    expect((await fresh.get('sessions', session.id))!.name).toBe('');
    db.close();
    fresh.close();
  });
});

describe('backupDue', () => {
  const day = 86_400_000;
  const now = Date.parse('2026-09-19T12:00:00Z');
  it('is never due with no sessions, always due if never backed up', () => {
    expect(backupDue({ lastBackupAt: null, backupReminderDays: 14 }, now, 0)).toBe(false);
    expect(backupDue({ lastBackupAt: null, backupReminderDays: 14 }, now, 1)).toBe(true);
  });
  it('is due only after the reminder period', () => {
    const at = (d: number) => new Date(now - d * day).toISOString();
    expect(backupDue({ lastBackupAt: at(13), backupReminderDays: 14 }, now, 1)).toBe(false);
    expect(backupDue({ lastBackupAt: at(15), backupReminderDays: 14 }, now, 1)).toBe(true);
    expect(backupDue({ lastBackupAt: at(3), backupReminderDays: 1 }, now, 1)).toBe(true);
  });
});

describe('provenance key and backup (REV-100)', () => {
  it('the salt and fingerprint travel in the backup; the key and the passphrase do not, and a restore plus the passphrase unlocks it', async () => {
    const { db, ctx } = await seeded();
    const { setPassphrase, loadProvenanceKey, unlockPassphrase } = await import('@/lib/services/provenance');
    const settings = await setPassphrase(ctx, 'correct horse battery', 1000);
    const key = await loadProvenanceKey(ctx);
    const text = await (await createBackup(db, { appBuild: 'test', nowIso: '2026-09-05T12:00:00.000Z' })).blob.text();
    expect(text).toContain(settings.athleteSalt!);
    expect(text).toContain(settings.keyFingerprint!);
    expect(text).not.toContain('correct horse');
    expect(text).not.toContain('keyB64');

    // A fresh phone: restore the settings, no key yet.
    const fresh = makeTestContext(await openTestDb());
    await fresh.db.put('settings', settings);
    expect(await loadProvenanceKey(fresh)).toBeNull();
    await unlockPassphrase(fresh, 'correct horse battery', 1000);
    expect(Array.from((await loadProvenanceKey(fresh))!)).toEqual(Array.from(key!));
  });
});

describe('a complete restore (REV-115)', () => {
  it('restores the settings row even under "keep", over a phone that already has its own', async () => {
    const { db, ctx } = await seeded();
    const { setAthlete, setHandedness } = await import('@/lib/services/settings');
    await setAthlete(ctx, { name: 'Jane Doe', club: 'Caledonia Nordic Ski Club' });
    await setHandedness(ctx, 'left');
    const text = await backupText(db);
    const verified = await verifyBackup(text);
    if (!verified.ok) throw new Error(verified.problem);

    const fresh = makeTestContext(await openTestDb());
    await setAthlete(fresh, { name: 'Someone Else', club: 'Other Club' });
    const plan = await planRestore(fresh.db, verified.backup);
    expect(plan.settings.different).toBe(1);
    await applyRestore(fresh.db, verified.backup, plan, 'keep');
    const { getSettings } = await import('@/lib/store/settings-repo');
    const restored = await getSettings(fresh.db);
    expect([restored.athleteName, restored.athleteClub, restored.handedness]).toEqual(['Jane Doe', 'Caledonia Nordic Ski Club', 'left']);
  });

  it('carries the app preferences, keeps only well-formed asa.* entries, and an older backup without them still verifies', async () => {
    const { db } = await seeded();
    const prefs = [
      { key: 'asa.panel.glossary', value: 'open' },
      { key: 'asa.capture.abc', value: '{"kind":"confirm"}' },
    ];
    const text = await (await createBackup(db, { appBuild: 'test', nowIso: NOW, preferences: prefs })).blob.text();
    const verified = await verifyBackup(text);
    if (!verified.ok) throw new Error(verified.problem);
    expect(verified.backup.file.preferences).toEqual(prefs);

    // Tampered entries: a foreign key and a non-string value are dropped.
    const parsed = JSON.parse(text) as { preferences: unknown[] };
    parsed.preferences.push({ key: 'other.thing', value: 'x' }, { key: 'asa.bad', value: 5 });
    const filtered = await verifyBackup(JSON.stringify(parsed));
    if (!filtered.ok) throw new Error(filtered.problem);
    expect(filtered.backup.file.preferences).toEqual(prefs);

    // A backup from before REV-115 has no preferences at all.
    delete (parsed as { preferences?: unknown }).preferences;
    const older = await verifyBackup(JSON.stringify(parsed));
    if (!older.ok) throw new Error(older.problem);
    expect(older.backup.file.preferences).toEqual([]);
  });

  it('collects and re-applies localStorage preferences', async () => {
    const { collectPreferences, applyPreferences } = await import('@/lib/backup/preferences-browser');
    const data = new Map<string, string>([
      ['asa.panel.backup', 'closed'],
      ['unrelated', 'x'],
    ]);
    const fake = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    (globalThis as unknown as { window: unknown }).window = { localStorage: fake };
    try {
      expect(collectPreferences()).toEqual([{ key: 'asa.panel.backup', value: 'closed' }]);
      data.clear();
      expect(applyPreferences([{ key: 'asa.panel.backup', value: 'closed' }, { key: 'evil', value: 'y' }])).toBe(1);
      expect(data.get('asa.panel.backup')).toBe('closed');
      expect(data.has('evil')).toBe(false);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});

