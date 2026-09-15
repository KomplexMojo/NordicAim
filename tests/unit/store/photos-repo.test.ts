import { describe, expect, it } from 'vitest';

import type { TargetPhoto } from '@/lib/domain/photo';
import { getPhotoRecord, listPhotosBySession, putPhotoRecord, deletePhotoRecord } from '@/lib/store/photos-repo';
import { CorruptRecordError } from '@/lib/store/errors';

import { openTestDb } from '../../helpers/db';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOPE = '99999999-9999-4999-8999-999999999999';

function photo(overrides: Partial<TargetPhoto> = {}): TargetPhoto {
  return {
    schemaVersion: 1,
    id: P1,
    sessionId: S1,
    origin: 'import',
    originalFormat: 'jpeg',
    originalFilename: null,
    importedAt: '2026-09-05T00:00:00.000Z',
    capture: null,
    exif: null,
    captureTime: { local: null, offset: null, utc: null, source: 'import-time' },
    working: { widthPx: 100, heightPx: 100, scaleFromOriginal: 1 },
    imageStats: null,
    lightingSuggestion: { label: 'unknown', confidence: 0, reasons: [] },
    lighting: 'unknown',
    lightingConfirmed: false,
    categorization: { template: null, position: null, roundsProne: null, roundsStanding: null },
    notes: null,
    status: 'needs-metadata',
    reasons: [],
    ...overrides,
  };
}

describe('photos-repo', () => {
  it('round-trips a photo', async () => {
    const db = await openTestDb();
    await putPhotoRecord(db, photo());
    expect(await getPhotoRecord(db, P1)).toEqual(photo());
    db.close();
  });

  it('returns null for a missing photo', async () => {
    const db = await openTestDb();
    expect(await getPhotoRecord(db, NOPE)).toBeNull();
    db.close();
  });

  it('deletes a photo', async () => {
    const db = await openTestDb();
    await putPhotoRecord(db, photo());
    await deletePhotoRecord(db, P1);
    expect(await getPhotoRecord(db, P1)).toBeNull();
    db.close();
  });

  it('lists photos by sessionId via the by-sessionId index', async () => {
    const db = await openTestDb();
    await putPhotoRecord(db, photo({ id: P1, sessionId: S1 }));
    await putPhotoRecord(db, photo({ id: P2, sessionId: S2 }));
    await putPhotoRecord(db, photo({ id: P3, sessionId: S1 }));
    const got = await listPhotosBySession(db, S1);
    expect(got.map((p) => p.id).sort()).toEqual([P1, P3].sort());
    db.close();
  });

  it('throws CorruptRecordError for an invalid record', async () => {
    const db = await openTestDb();
    await db.put('photos', { id: P1 } as unknown as TargetPhoto);
    await expect(getPhotoRecord(db, P1)).rejects.toThrow(CorruptRecordError);
    db.close();
  });
});
