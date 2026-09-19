import { describe, expect, it } from 'vitest';

import { listSessionRecords, listSessionRecordsWithProblems } from '@/lib/store/sessions-repo';
import { listPhotoRecords, listPhotosBySession } from '@/lib/store/photos-repo';
import { storedDataReport, exportAllRecords } from '@/lib/store/export-browser';

import { openTestDb } from '../../helpers/db';
import { makePhoto, makeSession } from '../../helpers/records';

/**
 * Owner, 2026-09-19: "the entire application stops working and all of the sessions that I have done are
 * lost". One unreadable record made every list throw, so the home screen showed nothing and Quick start
 * did nothing — while the data was still in the database the whole time.
 */
async function seedWithOneBadRecord() {
  const db = await openTestDb();
  const good = makeSession({ name: 'Real session' });
  await db.put('sessions', good);
  // What a record written by a NEWER build looks like to this one.
  await db.put('sessions', { ...makeSession({ name: 'From a newer build' }), schemaVersion: 99 } as never);
  const photo = makePhoto({ sessionId: good.id });
  await db.put('photos', photo);
  await db.put('photos', { ...makePhoto({ sessionId: good.id }), status: 'not-a-status' } as never);
  return { db, good, photo };
}

describe('one unreadable record never hides the rest', () => {
  it('the session list returns the readable sessions instead of throwing', async () => {
    const { db, good } = await seedWithOneBadRecord();
    const sessions = await listSessionRecords(db);
    expect(sessions.map((s) => s.id)).toEqual([good.id]);
    db.close();
  });

  it('and reports the unreadable one, naming the field', async () => {
    const { db } = await seedWithOneBadRecord();
    const { sessions, unreadable } = await listSessionRecordsWithProblems(db);
    expect(sessions).toHaveLength(1);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]!.reason).toContain('schemaVersion');
    db.close();
  });

  it('the photo lists skip a bad record, so the pipeline still plans over the others', async () => {
    const { db, good, photo } = await seedWithOneBadRecord();
    expect((await listPhotoRecords(db)).map((p) => p.id)).toEqual([photo.id]);
    expect((await listPhotosBySession(db, good.id)).map((p) => p.id)).toEqual([photo.id]);
    db.close();
  });

  it('Diagnostics counts every stored record, readable or not, and says why', async () => {
    const { db } = await seedWithOneBadRecord();
    const report = await storedDataReport(db);
    expect(report.sessions).toBe(2); // both are still stored
    expect(report.photos).toBe(2);
    expect(report.unreadable.map((u) => u.store).sort()).toEqual(['photos', 'sessions']);
    expect(report.unreadable.find((u) => u.store === 'sessions')?.reason).toContain('schemaVersion');
    db.close();
  });

  it('the export carries every record exactly as stored, including the unreadable ones', async () => {
    const { db } = await seedWithOneBadRecord();
    const dump = JSON.parse(await exportAllRecords(db)) as { sessions: Array<{ schemaVersion: number }>; photos: unknown[] };
    expect(dump.sessions).toHaveLength(2);
    expect(dump.sessions.some((s) => s.schemaVersion === 99)).toBe(true);
    expect(dump.photos).toHaveLength(2);
    db.close();
  });
});
