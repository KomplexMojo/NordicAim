// REV-141: a session's date and its default name.

import { describe, expect, it } from 'vitest';

import { defaultSessionName, isValidSessionDate, nameForNewDate } from '@/lib/domain/session-date';

describe('isValidSessionDate', () => {
  it('accepts a real day from 2000 up to today', () => {
    expect(isValidSessionDate('2026-09-29', '2026-09-29')).toBe(true);
    expect(isValidSessionDate('2024-02-29', '2026-09-29')).toBe(true);
    expect(isValidSessionDate('2000-01-01', '2026-09-29')).toBe(true);
  });

  it('refuses the future, impossible days, the distant past and anything not YYYY-MM-DD', () => {
    expect(isValidSessionDate('2026-09-30', '2026-09-29')).toBe(false);
    expect(isValidSessionDate('2025-02-29', '2026-09-29')).toBe(false);
    expect(isValidSessionDate('2026-13-01', '2026-09-29')).toBe(false);
    expect(isValidSessionDate('1999-12-31', '2026-09-29')).toBe(false);
    expect(isValidSessionDate('', '2026-09-29')).toBe(false);
    expect(isValidSessionDate('29/09/2026', '2026-09-29')).toBe(false);
  });
});

describe('nameForNewDate', () => {
  it('moves a default name with the date and keeps a typed one', () => {
    expect(defaultSessionName('2026-09-29')).toBe('Session 2026-09-29');
    expect(nameForNewDate('Session 2026-09-29', '2026-09-29', '2026-09-20')).toBe('Session 2026-09-20');
    expect(nameForNewDate('Club race', '2026-09-29', '2026-09-20')).toBe('Club race');
    expect(nameForNewDate('Session 2026-09-01', '2026-09-29', '2026-09-20')).toBe('Session 2026-09-01');
  });
});
