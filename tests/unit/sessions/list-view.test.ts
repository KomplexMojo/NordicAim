import { describe, expect, it } from 'vitest';

import { matchesSession, sessionTimeLabel } from '@/lib/sessions/list-view';

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
});
