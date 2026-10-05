import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerSummaryScheduler } from '@/lib/pipeline/hooks';
import {
  CoachContextDuplicateError,
  CoachContextEmptyError,
  addCoachContext,
  deviceLocalDate,
  getCoachContext,
  prepareCoachAttach,
  removeCoachContext,
  type CoachAttachPreview,
} from '@/lib/services/coach-context';
import { createSession, deleteSession } from '@/lib/services/sessions';
import type { ServiceContext } from '@/lib/services/context';

import { COACH_DAY, syntheticCoachFile, syntheticCoachText } from '../../helpers/coach-context';
import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';

const utcDate = (utc: string) => utc.slice(0, 10);

async function previewFor(ctx: ServiceContext, sessionId: string, text = syntheticCoachText()): Promise<CoachAttachPreview> {
  const result = await prepareCoachAttach(ctx, sessionId, text, utcDate);
  if (!result.ok) throw new Error(result.problem);
  return result.preview;
}

let scheduled: string[] = [];
beforeEach(() => {
  scheduled = [];
  registerSummaryScheduler((id) => scheduled.push(id));
});
afterEach(() => registerSummaryScheduler(() => {}));

describe('the `at` → local date conversion (§5 step 4, §7: the phone timezone at attach time)', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  it('a click at 01:19 UTC on the 29th is still the 28th west of UTC', () => {
    process.env.TZ = 'America/Edmonton';
    expect(deviceLocalDate('2026-09-29T01:19:00.000Z')).toBe('2026-09-28');
    expect(deviceLocalDate('2026-09-29T01:19Z')).toBe('2026-09-28');
  });

  it('and already the 29th east of UTC', () => {
    process.env.TZ = 'Europe/Oslo';
    expect(deviceLocalDate('2026-09-29T01:19:00.000Z')).toBe('2026-09-29');
    expect(deviceLocalDate('2026-09-28T22:30:00.000Z')).toBe('2026-09-29');
  });

  it('the default matcher uses it: the late-UTC click joins the 28th session in a western timezone', async () => {
    process.env.TZ = 'America/Edmonton';
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { sessionDate: COACH_DAY });
    const result = await prepareCoachAttach(ctx, session.id, syntheticCoachText());
    expect(result.ok && result.preview.zero.map((z) => z.record.at)).toEqual(['2026-09-29T01:19:00.000Z', '2026-09-28T15:05:00.000Z']);
    db.close();
  });
});

describe('prepareCoachAttach (§5 steps 2-4)', () => {
  it('matches metal and wind by sessionDate and writes nothing', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { sessionDate: COACH_DAY });
    const preview = await previewFor(ctx, session.id);
    expect(preview.metal).toHaveLength(4);
    expect(preview.metal.every((m) => m.record.sessionDate === COACH_DAY)).toBe(true);
    expect(preview.wind.map((w) => w.record.note)).toEqual(['none']);
    expect(preview.zero.map((z) => z.record.at)).toEqual(['2026-09-28T15:05:00.000Z']);
    expect(preview.empty).toBe(false);
    expect(await getCoachContext(ctx, session.id)).toBeNull();
    db.close();
  });

  it('a refused file names why and writes nothing', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { sessionDate: COACH_DAY });
    const result = await prepareCoachAttach(ctx, session.id, syntheticCoachText({ patch: { formatVersion: 3 } }), utcDate);
    expect(result).toMatchObject({ ok: false, reason: 'wrong-version' });
    expect(await db.count('coachContext')).toBe(0);
    db.close();
  });

  it('fingerprints are stable: the same records parsed twice, or reordered, give the same ones', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { sessionDate: COACH_DAY });
    const first = await previewFor(ctx, session.id);
    const again = await previewFor(ctx, session.id);
    const file = syntheticCoachFile();
    const reordered = JSON.stringify({
      ...file,
      metalSessions: (file.metalSessions as Array<Record<string, unknown>>).map((m) => Object.fromEntries(Object.entries(m).reverse())),
    });
    const third = await previewFor(ctx, session.id, reordered);
    const fps = (p: CoachAttachPreview) => [...p.metal, ...p.zero, ...p.wind].map((r) => r.fingerprint);
    expect(fps(again)).toEqual(fps(first));
    expect(fps(third)).toEqual(fps(first));
    expect(fps(first).every((f) => /^[0-9a-f]{64}$/.test(f))).toBe(true);
    db.close();
  });

  it('a fingerprint never depends on the session it is attached to', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const a = await createSession(ctx, { sessionDate: COACH_DAY });
    const b = await createSession(ctx, { sessionDate: COACH_DAY });
    const fps = (p: CoachAttachPreview) => p.metal.map((r) => r.fingerprint);
    expect(fps(await previewFor(ctx, b.id))).toEqual(fps(await previewFor(ctx, a.id)));
    db.close();
  });

  it('a date with no records is an empty preview, and Add refuses it', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const session = await createSession(ctx, { sessionDate: '2026-08-01' });
    const preview = await previewFor(ctx, session.id);
    expect(preview.empty).toBe(true);
    await expect(addCoachContext(ctx, preview)).rejects.toThrow(CoachContextEmptyError);
    expect(await db.count('coachContext')).toBe(0);
    db.close();
  });
});

describe('Add, re-attach and Remove (§5 steps 6-7)', () => {
  it('Add writes the matched records under the session, asks for the summary again, and never touches the session record', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-05T10:00:00.000Z' });
    const session = await createSession(ctx, { sessionDate: COACH_DAY });
    const before = await db.get('sessions', session.id);
    const preview = await previewFor(ctx, session.id);
    const written = await addCoachContext(ctx, preview);
    expect(written).toMatchObject({ sessionId: session.id, attachedAt: '2026-10-05T10:00:00.000Z' });
    expect(await getCoachContext(ctx, session.id)).toEqual(written);
    expect(written.metal).toEqual(preview.metal);
    expect(await db.get('sessions', session.id)).toEqual(before);
    expect(scheduled).toEqual([session.id]);
    db.close();
  });

  it('refuses the whole Add on a collision with a different session, naming it, and writes nothing', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const a = await createSession(ctx, { name: 'Morning range', sessionDate: COACH_DAY });
    const b = await createSession(ctx, { name: 'Evening range', sessionDate: COACH_DAY });
    await addCoachContext(ctx, await previewFor(ctx, a.id));
    const stored = await getCoachContext(ctx, a.id);

    const err = await addCoachContext(ctx, await previewFor(ctx, b.id)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CoachContextDuplicateError);
    expect((err as CoachContextDuplicateError).otherSessionId).toBe(a.id);
    expect((err as Error).message).toContain('“Morning range” (2026-09-28)');
    expect(await getCoachContext(ctx, b.id)).toBeNull();
    expect(await getCoachContext(ctx, a.id)).toEqual(stored);
    db.close();
  });

  it('one colliding record is enough to refuse a batch that is otherwise new', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const a = await createSession(ctx, { sessionDate: COACH_DAY });
    const b = await createSession(ctx, { sessionDate: COACH_DAY });
    const onlyWind = syntheticCoachFile({ patch: { metalSessions: [], zeroAdjustments: [] } });
    await addCoachContext(ctx, await previewFor(ctx, a.id, JSON.stringify(onlyWind)));
    const file = syntheticCoachFile();
    (file.metalSessions as Array<Record<string, unknown>>).forEach((m) => (m.comboGroup = 'fresh'));
    await expect(addCoachContext(ctx, await previewFor(ctx, b.id, JSON.stringify(file)))).rejects.toThrow(CoachContextDuplicateError);
    expect(await getCoachContext(ctx, b.id)).toBeNull();
    db.close();
  });

  it('re-attaching to the same session replaces its entry, never merges', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-10-05T10:00:00.000Z' });
    const session = await createSession(ctx, { sessionDate: COACH_DAY });
    await addCoachContext(ctx, await previewFor(ctx, session.id));

    const smaller = syntheticCoachFile();
    smaller.metalSessions = (smaller.metalSessions as unknown[]).slice(0, 1);
    smaller.windConditions = [];
    const later = makeTestContext(db, { nowIso: '2026-10-06T10:00:00.000Z' });
    const replaced = await addCoachContext(later, await previewFor(later, session.id, JSON.stringify(smaller)));

    const stored = await getCoachContext(ctx, session.id);
    expect(stored).toEqual(replaced);
    expect(stored?.metal).toHaveLength(1);
    expect(stored?.wind).toHaveLength(0);
    expect(stored?.attachedAt).toBe('2026-10-06T10:00:00.000Z');
    expect(await db.count('coachContext')).toBe(1);
    db.close();
  });

  it('Remove clears the entry, freeing its records to attach elsewhere', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const a = await createSession(ctx, { sessionDate: COACH_DAY });
    const b = await createSession(ctx, { sessionDate: COACH_DAY });
    await addCoachContext(ctx, await previewFor(ctx, a.id));
    scheduled = [];

    await removeCoachContext(ctx, a.id);
    expect(await getCoachContext(ctx, a.id)).toBeNull();
    expect(scheduled).toEqual([a.id]);
    await expect(addCoachContext(ctx, await previewFor(ctx, b.id))).resolves.toMatchObject({ sessionId: b.id });
    db.close();
  });

  it('deleting a session takes its coach context with it', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db);
    const a = await createSession(ctx, { sessionDate: COACH_DAY });
    const b = await createSession(ctx, { sessionDate: COACH_DAY });
    await addCoachContext(ctx, await previewFor(ctx, a.id));
    await deleteSession(ctx, a.id);
    expect(await db.count('coachContext')).toBe(0);
    await expect(addCoachContext(ctx, await previewFor(ctx, b.id))).resolves.toMatchObject({ sessionId: b.id });
    db.close();
  });
});
