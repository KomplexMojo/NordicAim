import { describe, expect, it } from 'vitest';

import { initialAnalysis } from '@/lib/domain/analysis';
import { getAnalysisRecord, putAnalysisRecord, deleteAnalysisRecord } from '@/lib/store/analyses-repo';
import { CorruptRecordError } from '@/lib/store/errors';

import { openTestDb } from '../../helpers/db';

const P1 = '11111111-1111-4111-8111-111111111111';
const NOPE = '99999999-9999-4999-8999-999999999999';

describe('analyses-repo', () => {
  it('round-trips an analysis', async () => {
    const db = await openTestDb();
    const analysis = initialAnalysis(P1, '2026-09-05T00:00:00.000Z');
    await putAnalysisRecord(db, analysis);
    expect(await getAnalysisRecord(db, P1)).toEqual(analysis);
    db.close();
  });

  it('returns null for a missing analysis', async () => {
    const db = await openTestDb();
    expect(await getAnalysisRecord(db, NOPE)).toBeNull();
    db.close();
  });

  it('deletes an analysis', async () => {
    const db = await openTestDb();
    const analysis = initialAnalysis(P1, '2026-09-05T00:00:00.000Z');
    await putAnalysisRecord(db, analysis);
    await deleteAnalysisRecord(db, P1);
    expect(await getAnalysisRecord(db, P1)).toBeNull();
    db.close();
  });

  it('throws CorruptRecordError for an invalid record', async () => {
    const db = await openTestDb();
    await db.put('analyses', { photoId: P1 } as never);
    await expect(getAnalysisRecord(db, P1)).rejects.toThrow(CorruptRecordError);
    db.close();
  });
});
