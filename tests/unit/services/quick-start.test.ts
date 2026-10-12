import { describe, expect, it } from 'vitest';

import { createSession, listSessions } from '@/lib/services/sessions';
import { createNewSession, newSessionName, quickStart, quickStartLabel } from '@/lib/services/quick-start';

import { openTestDb } from '../../helpers/db';
import { makeTestContext } from '../../helpers/fixtures';

describe('quickStartLabel', () => {
  it('reads "Start & capture" when no session has today\'s local date', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    const label = quickStartLabel([], now);
    expect(label).toBe('Start & capture');
  });

  it('reads "Capture (today\'s session)" when a session with sessionDate = today already exists', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sessions = [
      {
        schemaVersion: 3 as const,
        id: 'x',
        name: 'Session',
        sessionDate: today,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        photoIds: [],
        analyzeRequestedAt: null,
        artifacts: [],
        shares: [],
        notes: '',
      },
    ];
    expect(quickStartLabel(sessions, now)).toBe("Capture (today's session)");
  });
});

describe('quickStart', () => {
  it('creates a session on the first call, then reuses it on later calls the same day', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-06T15:00:00.000Z' });
    const paths: string[] = [];
    const navigate = (path: string) => paths.push(path);

    const first = await quickStart(ctx, navigate);
    const second = await quickStart(ctx, navigate);

    expect(second.id).toBe(first.id);
    const all = await listSessions(ctx);
    expect(all).toHaveLength(1);
    expect(paths).toEqual([`/sessions/${first.id}/capture`, `/sessions/${first.id}/capture`]);
    db.close();
  });

  it('does not reuse a session from a different local date', async () => {
    const db = await openTestDb();
    const yesterday = makeTestContext(db, { nowIso: '2026-09-05T15:00:00.000Z' });
    const yesterdaySession = await createSession(yesterday, { sessionDate: '2026-09-05' });

    const today = makeTestContext(db, { nowIso: '2026-09-06T15:00:00.000Z' });
    const paths: string[] = [];
    const todaySession = await quickStart(today, (path) => paths.push(path));

    expect(todaySession.id).not.toBe(yesterdaySession.id);
    db.close();
  });
});

describe('newSessionName / createNewSession (issue #107)', () => {
  it('numbers a second and third session on the same day', () => {
    const named = (name: string) => ({ name }) as Parameters<typeof newSessionName>[0][number];
    expect(newSessionName([], '2026-10-12')).toBe('Session 2026-10-12');
    expect(newSessionName([named('Session 2026-10-12')], '2026-10-12')).toBe('Session 2026-10-12 (2)');
    expect(newSessionName([named('Session 2026-10-12'), named('Session 2026-10-12 (2)')], '2026-10-12')).toBe(
      'Session 2026-10-12 (3)',
    );
    expect(newSessionName([named('Session 2026-10-11')], '2026-10-12')).toBe('Session 2026-10-12');
  });

  it('always creates a fresh session, even when today already has one; quick start then opens the newest', async () => {
    const db = await openTestDb();
    const ctx = makeTestContext(db, { nowIso: '2026-09-06T15:00:00.000Z' });
    const first = await quickStart(ctx, () => {});
    const later = makeTestContext(db, { nowIso: '2026-09-06T16:00:00.000Z' });
    const fresh = await createNewSession(later);

    expect(fresh.id).not.toBe(first.id);
    expect(fresh.sessionDate).toBe(first.sessionDate);
    expect(fresh.name).toBe(`${first.name} (2)`);
    expect(await listSessions(ctx)).toHaveLength(2);
    expect((await quickStart(later, () => {})).id).toBe(fresh.id);
  });
});
