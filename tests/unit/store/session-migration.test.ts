// backing-sheet.md §3, M19 step 1: a session stored before REV-38 loads, validates and saves as v2.

import { describe, expect, it } from 'vitest';

import { getSessionRecord, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings, putSettings } from '@/lib/store/settings-repo';
import { defaultAppSettings } from '@/lib/domain/settings';

import { openTestDb } from '../../helpers/db';

const S1 = '11111111-1111-4111-8111-111111111111';

/** Exactly what data-model §2 stored before REV-38. */
function storedV1(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: S1,
    name: 'Session 2026-09-05',
    sessionDate: '2026-09-05',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    photoIds: ['0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d'],
    analyzeRequestedAt: null,
    artifacts: [],
    shares: [],
    notes: 'wind from the left',
  };
}

describe('session schema migration (v1 -> v2)', () => {
  it('reads a v1 row as v2 with backingMode auto and backing null, unchanged otherwise', async () => {
    const db = await openTestDb();
    // Written straight into the store, the way a build before REV-38 left it.
    await db.put('sessions', storedV1() as never);

    const loaded = await getSessionRecord(db, S1);
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(2);
    expect(loaded!.backingMode).toBe('auto');
    expect(loaded!.backing).toBeNull();
    const { schemaVersion, ...v1Rest } = storedV1();
    void schemaVersion;
    expect(loaded).toMatchObject(v1Rest);

    // ...and saving it back keeps it readable, now as a real v2 row.
    await putSessionRecord(db, loaded!);
    const raw = await db.get('sessions', S1);
    expect((raw as { schemaVersion: number }).schemaVersion).toBe(2);
    expect(await getSessionRecord(db, S1)).toEqual(loaded);
    db.close();
  });

  it('reads a settings row written before REV-38, defaulting the backing fields', async () => {
    const db = await openTestDb();
    const { lastBackingMode, lastBacking, ...old } = defaultAppSettings();
    void lastBackingMode;
    void lastBacking;
    await db.put('settings', old as never);

    const settings = await getSettings(db);
    expect(settings.lastBackingMode).toBe('auto');
    expect(settings.lastBacking).toBeNull();

    await putSettings(db, settings);
    expect(await getSettings(db)).toEqual(settings);
    db.close();
  });
});
