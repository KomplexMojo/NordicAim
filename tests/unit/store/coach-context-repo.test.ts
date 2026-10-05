import { describe, expect, it } from 'vitest';

import type { AttachedCoachContext } from '@/lib/domain/coach-context';
import {
  deleteCoachContext,
  findFingerprintCollision,
  getCoachContext,
  listCoachContextSessionIds,
  putCoachContext,
} from '@/lib/store/coach-context-repo';
import { CorruptRecordError, UnwritableRecordError } from '@/lib/store/errors';

import { openTestDb } from '../../helpers/db';
import { COACH_DAY } from '../../helpers/coach-context';

const fp = (c: string) => c.repeat(64);

function entry(sessionId: string, fingerprints: { metal?: string[]; wind?: string[]; zero?: string[] } = {}): AttachedCoachContext {
  return {
    schemaVersion: 1,
    sessionId,
    attachedAt: '2026-10-05T10:00:00.000Z',
    source: { app: '545-coach', appVersion: '0.0.0-test', exportedAt: '2026-10-01T08:00:00.000Z' },
    conventions: { discOrder: 'a', zeroClicks: 'b', windDirection: 'c', windStrength: 'd' },
    metal: (fingerprints.metal ?? []).map((fingerprint) => ({
      fingerprint,
      record: { sessionDate: COACH_DAY, position: 'prone', discHits: [true, true, false, true, true], comboGroup: 'g', hitRate: 0.8, targetZone: null, race: null },
    })),
    zero: (fingerprints.zero ?? []).map((fingerprint) => ({
      fingerprint,
      record: { at: '2026-09-28T15:05:00.000Z', verticalClicks: 1, horizontalClicks: 0, note: null },
    })),
    wind: (fingerprints.wind ?? []).map((fingerprint) => ({ fingerprint, record: { sessionDate: COACH_DAY, speedKph: null, direction: null, note: 'none' } })),
  };
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('coach-context repo (M29, data-model.md §6)', () => {
  it('puts, gets and deletes by sessionId', async () => {
    const db = await openTestDb();
    expect(await getCoachContext(db, A)).toBeNull();
    const row = entry(A, { metal: [fp('a')], wind: [fp('b')] });
    await putCoachContext(db, row);
    expect(await getCoachContext(db, A)).toEqual(row);
    expect(await listCoachContextSessionIds(db)).toEqual([A]);

    const tx = db.transaction(['coachContext'], 'readwrite');
    await deleteCoachContext(tx, A);
    await tx.done;
    expect(await getCoachContext(db, A)).toBeNull();
    db.close();
  });

  it('refuses to write a row it could not read back, and names a stored one it cannot read', async () => {
    const db = await openTestDb();
    await expect(putCoachContext(db, { ...entry(A), metal: [{ fingerprint: 'nope', record: entry(A, { metal: [fp('a')] }).metal[0]!.record }] })).rejects.toThrow(
      UnwritableRecordError,
    );
    await db.put('coachContext', { sessionId: B, schemaVersion: 1 } as never);
    await expect(getCoachContext(db, B)).rejects.toThrow(CorruptRecordError);
    db.close();
  });

  it('the cross-session scan finds a planted collision in another session', async () => {
    const db = await openTestDb();
    await putCoachContext(db, entry(A, { metal: [fp('a'), fp('b')], zero: [fp('c')] }));
    expect(await findFingerprintCollision(db, new Set([fp('9'), fp('c')]), B)).toEqual({ sessionId: A, fingerprint: fp('c') });
    db.close();
  });

  it('misses a non-colliding record, and never counts the session being attached to', async () => {
    const db = await openTestDb();
    await putCoachContext(db, entry(A, { metal: [fp('a')], wind: [fp('d')] }));
    expect(await findFingerprintCollision(db, new Set([fp('e'), fp('f')]), B)).toBeNull();
    expect(await findFingerprintCollision(db, new Set([fp('a'), fp('d')]), A)).toBeNull();
    expect(await findFingerprintCollision(db, new Set(), B)).toBeNull();
    db.close();
  });

  it('still finds a collision past an unreadable row', async () => {
    const db = await openTestDb();
    await db.put('coachContext', { sessionId: B, metal: 'garbage' } as never);
    await putCoachContext(db, entry(A, { wind: [fp('d')] }));
    expect(await findFingerprintCollision(db, new Set([fp('d')]), '33333333-3333-4333-8333-333333333333')).toEqual({ sessionId: A, fingerprint: fp('d') });
    db.close();
  });
});
