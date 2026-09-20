import { describe, expect, it } from 'vitest';

import { isNewer, parseVersionFile } from '@/lib/app/update-check';

describe('update check (REV-101)', () => {
  it('reads the sha from version.json and rejects anything else', () => {
    expect(parseVersionFile('{"sha":"abc1234","builtAt":"2026-09-20T00:00:00Z"}')).toBe('abc1234');
    expect(parseVersionFile('{"sha":"nope"}')).toBeNull();
    expect(parseVersionFile('{"sha":42}')).toBeNull();
    expect(parseVersionFile('<html>')).toBeNull();
    expect(parseVersionFile('')).toBeNull();
  });

  it('is newer only for a different valid sha; dev builds and missing data never claim it', () => {
    expect(isNewer('abc1234', 'def5678')).toBe(true);
    expect(isNewer('abc1234', 'abc1234')).toBe(false);
    expect(isNewer('abc1234', 'abc1234ffffff')).toBe(false); // a longer form of the same build
    expect(isNewer('dev', 'def5678')).toBe(false);
    expect(isNewer('abc1234', null)).toBe(false);
    expect(isNewer('abc1234', 'zzzzzzz')).toBe(false);
  });
});
