// backing-sheet.md §3a, data-model §2, §5 (REV-48, M22): records stored by earlier builds — a v1 session
// from before REV-38, v2 sessions and a settings row as REV-38 (M19) left them, and backing-card photos —
// load, validate and migrate without losing a measured colour. Every case starts from a fixture of the
// old shape written straight into the store.

import { describe, expect, it } from 'vitest';

import type { BackingSheet, ColourSignature } from '@/lib/domain/backing';
import { defaultAppSettings } from '@/lib/domain/settings';
import { getAnalysisRecord, putAnalysisRecord } from '@/lib/store/analyses-repo';
import { getBlob, putBlob } from '@/lib/store/blobs-repo';
import { diagramCellSvgKey, photoThumbKey, photoWorkingKey } from '@/lib/store/blob-keys';
import type { AppDb } from '@/lib/store/db';
import { migrateBackingToSettings } from '@/lib/store/migrate-backing';
import { getPhotoRecord, putPhotoRecord } from '@/lib/store/photos-repo';
import { getSessionRecord, listSessionRecords, putSessionRecord } from '@/lib/store/sessions-repo';
import { getSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';
import { makeAnalysis, makePhoto } from '../../helpers/records';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const S3 = '33333333-3333-4333-8333-333333333333';
const CARD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ORANGE: ColourSignature = { hueDeg: 15.9, hueSpreadDeg: 2.4, satP10: 0.73, valP10: 0.85, samples: 70610 };
const PINK: ColourSignature = { hueDeg: 330, hueSpreadDeg: 5, satP10: 0.6, valP10: 0.8, samples: 5000 };

/** Exactly what data-model §2 stored before REV-38. */
function storedV1(id = S1): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
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

/** A session as REV-38 (M19) stored it: schema 2 with its own backing. */
function storedV2(id: string, updatedAt: string, backingMode: string, backing: BackingSheet | null): Record<string, unknown> {
  return { ...storedV1(id), schemaVersion: 2, updatedAt, backingMode, backing };
}

/** The settings row as REV-38 stored it: `lastBackingMode` / `lastBacking`. */
function storedRev38Settings(lastBackingMode: string, lastBacking: BackingSheet | null): Record<string, unknown> {
  const { backingMode, backing, ...rest } = defaultAppSettings();
  void backingMode;
  void backing;
  return { ...rest, persistRequested: true, lastBackingMode, lastBacking };
}

function card(colour: ColourSignature | null, cardPhotoId: string | null = CARD): BackingSheet {
  return { kind: 'coloured', source: 'card', cardPhotoId, colour };
}

const blob = { bytes: new ArrayBuffer(4), contentType: 'image/jpeg', sizeBytes: 4, createdAt: '2026-09-05T00:00:00.000Z' };

async function putRaw(db: AppDb, store: 'sessions' | 'settings', value: Record<string, unknown>): Promise<void> {
  await db.put(store, value as never);
}

describe('session schema migration on read (backing-sheet.md §3a step 3)', () => {
  it('reads a v1 row as v3, unchanged otherwise, and saves it back as v3', async () => {
    const db = await openTestDb();
    await putRaw(db, 'sessions', storedV1());

    const loaded = await getSessionRecord(db, S1);
    expect(loaded).not.toBeNull();
    const { schemaVersion, ...v1Rest } = storedV1();
    void schemaVersion;
    expect(loaded).toEqual({ ...v1Rest, schemaVersion: 3 });

    await putSessionRecord(db, loaded!);
    expect(((await db.get('sessions', S1)) as { schemaVersion: number }).schemaVersion).toBe(3);
    db.close();
  });

  it('reads a v2 row as v3 without its backing fields', async () => {
    const db = await openTestDb();
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-05T00:00:00.000Z', 'coloured', card(ORANGE)));
    const loaded = await getSessionRecord(db, S1);
    expect(loaded?.schemaVersion).toBe(3);
    expect(loaded).not.toHaveProperty('backingMode');
    expect(loaded).not.toHaveProperty('backing');
    db.close();
  });
});

describe('settings migration (data-model §5, backing-sheet.md §3a step 1)', () => {
  it('reads a REV-38 row with its values copied to backingMode / backing', async () => {
    const db = await openTestDb();
    await putRaw(db, 'settings', storedRev38Settings('coloured', card(ORANGE, null)));
    const settings = await getSettings(db);
    expect(settings.backingMode).toBe('coloured');
    expect(settings.backing).toEqual(card(ORANGE, null));
    expect(settings.persistRequested).toBe(true);
    db.close();
  });

  it('reads a row from before REV-38 as Auto with no backing', async () => {
    const db = await openTestDb();
    const { backingMode, backing, ...old } = defaultAppSettings();
    void backingMode;
    void backing;
    await putRaw(db, 'settings', old);
    const settings = await getSettings(db);
    expect(settings.backingMode).toBe('auto');
    expect(settings.backing).toBeNull();
    db.close();
  });

  it('migrateBackingToSettings rewrites the stored row with the new names', async () => {
    const db = await openTestDb();
    await putRaw(db, 'settings', storedRev38Settings('none', null));
    await migrateBackingToSettings(db);
    const raw = (await db.get('settings', 'app')) as unknown as Record<string, unknown>;
    expect(raw.backingMode).toBe('none');
    expect(raw.backing).toBeNull();
    expect(raw).not.toHaveProperty('lastBackingMode');
    expect(raw).not.toHaveProperty('lastBacking');
    db.close();
  });
});

describe('migrateBackingToSettings (backing-sheet.md §3a)', () => {
  it('lifts the most recently updated session backing into empty settings and upgrades every session', async () => {
    const db = await openTestDb();
    await putRaw(db, 'settings', storedRev38Settings('auto', null));
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-01T00:00:00.000Z', 'auto', card(PINK, null)));
    await putRaw(db, 'sessions', storedV2(S2, '2026-09-10T00:00:00.000Z', 'coloured', card(ORANGE)));
    await putRaw(db, 'sessions', storedV1(S3));

    const report = await migrateBackingToSettings(db);

    expect(report).toEqual({ sessionsUpgraded: 3, lifted: true, cardPhotosDeleted: 0 });
    const settings = await getSettings(db);
    expect(settings.backingMode).toBe('coloured');
    // The card photo is not kept (REV-48), so its id never reaches settings.
    expect(settings.backing).toEqual(card(ORANGE, null));
    for (const id of [S1, S2, S3]) {
      const raw = (await db.get('sessions', id)) as unknown as Record<string, unknown>;
      expect(raw.schemaVersion).toBe(3);
      expect(raw).not.toHaveProperty('backing');
    }
    expect(await listSessionRecords(db)).toHaveLength(3);
    db.close();
  });

  it('settings already has a backing — the session\'s is not lifted over it', async () => {
    const db = await openTestDb();
    await putRaw(db, 'settings', storedRev38Settings('auto', card(PINK, null)));
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-10T00:00:00.000Z', 'coloured', card(ORANGE)));

    const report = await migrateBackingToSettings(db);

    expect(report.lifted).toBe(false);
    const settings = await getSettings(db);
    expect(settings.backingMode).toBe('auto');
    expect(settings.backing).toEqual(card(PINK, null));
    db.close();
  });

  it('lifts into a database that never stored a settings row', async () => {
    const db = await openTestDb();
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-10T00:00:00.000Z', 'auto', card(ORANGE)));
    await migrateBackingToSettings(db);
    const settings = await getSettings(db);
    expect(settings.backing?.colour).toEqual(ORANGE);
    expect(settings.backingMode).toBe('auto');
    expect(settings.profileOverrides.holeDiameterMm).toBe(5.6);
    db.close();
  });

  it('a backing-card photo is deleted after its colour is lifted', async () => {
    const db = await openTestDb();
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-10T00:00:00.000Z', 'coloured', card(ORANGE)));
    const target = makePhoto({ sessionId: S1 });
    const cardPhoto = makePhoto({ id: CARD, sessionId: S1, origin: 'backing-card' });
    for (const photo of [target, cardPhoto]) {
      await putPhotoRecord(db, photo);
      await putAnalysisRecord(db, makeAnalysis(photo.id));
      await putBlob(db, photoWorkingKey(photo.id), blob);
      await putBlob(db, photoThumbKey(photo.id), blob);
      await putBlob(db, diagramCellSvgKey(photo.id), blob);
    }

    const report = await migrateBackingToSettings(db);

    expect(report.cardPhotosDeleted).toBe(1);
    expect((await getSettings(db)).backing?.colour).toEqual(ORANGE);
    expect(await getPhotoRecord(db, CARD)).toBeNull();
    expect(await getAnalysisRecord(db, CARD)).toBeNull();
    expect(await getBlob(db, photoWorkingKey(CARD))).toBeNull();
    expect(await getBlob(db, photoThumbKey(CARD))).toBeNull();
    expect(await getBlob(db, diagramCellSvgKey(CARD))).toBeNull();
    // The session's targets are untouched.
    expect(await getPhotoRecord(db, target.id)).not.toBeNull();
    expect(await getAnalysisRecord(db, target.id)).not.toBeNull();
    expect(await getBlob(db, photoWorkingKey(target.id))).not.toBeNull();
    expect(await getBlob(db, diagramCellSvgKey(target.id))).not.toBeNull();
    db.close();
  });

  it('marks nothing pending: no analysis is touched', async () => {
    const db = await openTestDb();
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-10T00:00:00.000Z', 'coloured', card(ORANGE)));
    const target = makePhoto({ sessionId: S1 });
    await putPhotoRecord(db, target);
    const analysis = makeAnalysis(target.id, { stageA: 'done', stageB: 'done' });
    await putAnalysisRecord(db, analysis);

    await migrateBackingToSettings(db);

    expect(await getAnalysisRecord(db, target.id)).toEqual(analysis);
    db.close();
  });

  it('is a no-op on a database already migrated', async () => {
    const db = await openTestDb();
    await putRaw(db, 'settings', storedRev38Settings('coloured', card(ORANGE, null)));
    await putRaw(db, 'sessions', storedV2(S1, '2026-09-10T00:00:00.000Z', 'coloured', card(PINK)));
    await migrateBackingToSettings(db);
    const settings = await getSettings(db);

    expect(await migrateBackingToSettings(db)).toEqual({ sessionsUpgraded: 0, lifted: false, cardPhotosDeleted: 0 });
    expect(await getSettings(db)).toEqual(settings);
    db.close();
  });

  it('on a fresh database writes nothing', async () => {
    const db = await openTestDb();
    expect(await migrateBackingToSettings(db)).toEqual({ sessionsUpgraded: 0, lifted: false, cardPhotosDeleted: 0 });
    expect(await db.get('settings', 'app')).toBeUndefined();
    db.close();
  });
});
