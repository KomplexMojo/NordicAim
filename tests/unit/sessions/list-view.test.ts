import { describe, expect, it } from 'vitest';

import { matchesSession, sessionTimeLabel, sortSessions } from '@/lib/sessions/list-view';

describe('session list view (REV-93)', () => {
  it('reads the start time as HH:MM local', () => {
    const iso = new Date(2026, 8, 20, 7, 5).toISOString();
    expect(sessionTimeLabel({ createdAt: iso })).toBe('07:05');
    expect(sessionTimeLabel({ createdAt: 'nonsense' })).toBe('');
  });

  it('matches every query word against name or date, ignoring case', () => {
    const s = { name: 'Session 2026-09-20', sessionDate: '2026-09-20' };
    expect(matchesSession(s, '')).toBe(true);
    expect(matchesSession(s, 'session 09-20')).toBe(true);
    expect(matchesSession(s, 'SESSION')).toBe(true);
    expect(matchesSession(s, 'zzz')).toBe(false);
    expect(matchesSession(s, '2026-10')).toBe(false);
  });

  it('sorts by sessionDate, newest first by default, oldest first when asked', () => {
    const a = { id: 'a', sessionDate: '2026-09-22', createdAt: '2026-09-22T20:11:00.000Z' };
    const b = { id: 'b', sessionDate: '2026-09-28', createdAt: '2026-09-28T20:34:00.000Z' };
    const c = { id: 'c', sessionDate: '2026-09-21', createdAt: '2026-09-21T20:57:00.000Z' };
    const d = { id: 'd', sessionDate: '2026-09-26', createdAt: '2026-09-26T13:20:00.000Z' };

    expect(sortSessions([a, b, c, d], 'desc').map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(sortSessions([a, b, c, d], 'asc').map((s) => s.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('breaks a same-day tie by createdAt, and never mutates the input', () => {
    const early = { id: 'early', sessionDate: '2026-09-26', createdAt: '2026-09-26T09:00:00.000Z' };
    const late = { id: 'late', sessionDate: '2026-09-26', createdAt: '2026-09-26T18:00:00.000Z' };
    const input = [early, late];

    expect(sortSessions(input, 'desc').map((s) => s.id)).toEqual(['late', 'early']);
    expect(sortSessions(input, 'asc').map((s) => s.id)).toEqual(['early', 'late']);
    expect(input).toEqual([early, late]);
  });
});
