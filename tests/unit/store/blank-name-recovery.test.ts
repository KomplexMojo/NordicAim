import { describe, expect, it } from 'vitest';

import { updateSession } from '@/lib/services/sessions';
import { getSessionRecord, listSessionRecords, putSessionRecord } from '@/lib/store/sessions-repo';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';
import { makeSession } from '../../helpers/records';

/**
 * Owner, 2026-09-19. Clearing the session-name field to retype it made the metadata screen's auto-save
 * store `name: ""`, which fails the schema's `min(1)`. The record became unreadable, so the session list
 * threw, the home screen showed nothing and Start & capture did nothing — with every session still stored.
 */
async function seedBlankName() {
  const db = await openTestDb();
  const session = { ...makeSession({ name: 'Dropping Biathlon' }), sessionDate: '2026-09-19' };
  await db.put('sessions', { ...session, name: '' } as never); // what the auto-save wrote
  return { db, id: session.id };
}

describe('a session whose name was blanked (owner report 2026-09-19)', () => {
  it('reads back with the default name instead of being unreadable', async () => {
    const { db, id } = await seedBlankName();
    const session = await getSessionRecord(db, id);
    expect(session?.name).toBe('Session 2026-09-19');
    db.close();
  });

  it('still appears in the session list', async () => {
    const { db, id } = await seedBlankName();
    expect((await listSessionRecords(db)).map((s) => s.id)).toEqual([id]);
    db.close();
  });

  it('a blank name is never saved: the current name is kept', async () => {
    const { db, id } = await seedBlankName();
    const ctx = makeTestContext(db);
    await updateSession(ctx, id, { name: '   ' });
    expect((await getSessionRecord(db, id))?.name).toBe('Session 2026-09-19');
    await updateSession(ctx, id, { name: '  Dropping Biathlon  ' });
    expect((await getSessionRecord(db, id))?.name).toBe('Dropping Biathlon');
    db.close();
  });

  it('the store refuses to write a record it could not read back', async () => {
    const db = await openTestDb();
    const session = makeSession({ name: 'Real' });
    await expect(putSessionRecord(db, { ...session, name: '' })).rejects.toThrow(/Refused to save/);
    db.close();
  });
});
