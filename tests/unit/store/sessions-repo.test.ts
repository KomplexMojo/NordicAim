import { describe, expect, it } from 'vitest';

import type { BiathlonSession } from '@/lib/domain/session';
import { getSessionRecord, listSessionRecords, putSessionRecord, deleteSessionRecord } from '@/lib/store/sessions-repo';
import { CorruptRecordError } from '@/lib/store/errors';

import { openTestDb } from '../../helpers/db';

const S1 = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOPE = '99999999-9999-4999-8999-999999999999';

function session(overrides: Partial<BiathlonSession> = {}): BiathlonSession {
  return {
    schemaVersion: 1,
    id: S1,
    name: 'Session 2026-09-05',
    sessionDate: '2026-09-05',
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    photoIds: [],
    analyzeRequestedAt: null,
    artifacts: [],
    shares: [],
    notes: '',
    ...overrides,
  };
}

describe('sessions-repo', () => {
  it('round-trips a session', async () => {
    const db = await openTestDb();
    await putSessionRecord(db, session());
    const got = await getSessionRecord(db, S1);
    expect(got).toEqual(session());
    db.close();
  });

  it('returns null for a missing session', async () => {
    const db = await openTestDb();
    expect(await getSessionRecord(db, NOPE)).toBeNull();
    db.close();
  });

  it('deletes a session', async () => {
    const db = await openTestDb();
    await putSessionRecord(db, session());
    await deleteSessionRecord(db, S1);
    expect(await getSessionRecord(db, S1)).toBeNull();
    db.close();
  });

  it('lists sessions ordered by updatedAt descending', async () => {
    const db = await openTestDb();
    await putSessionRecord(db, session({ id: A, updatedAt: '2026-09-05T00:00:00.000Z' }));
    await putSessionRecord(db, session({ id: B, updatedAt: '2026-09-07T00:00:00.000Z' }));
    await putSessionRecord(db, session({ id: C, updatedAt: '2026-09-06T00:00:00.000Z' }));
    const got = await listSessionRecords(db);
    expect(got.map((s) => s.id)).toEqual([B, C, A]);
    db.close();
  });

  it('throws CorruptRecordError for an invalid record', async () => {
    const db = await openTestDb();
    await db.put('sessions', { id: S1, name: 'bad' } as unknown as BiathlonSession);
    await expect(getSessionRecord(db, S1)).rejects.toThrow(CorruptRecordError);
    db.close();
  });
});
