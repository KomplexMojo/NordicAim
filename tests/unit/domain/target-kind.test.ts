import { describe, expect, it } from 'vitest';

import { suggestSeason } from '@/lib/domain/season';
import { categorizationForKind, isTargetKind, kindOfCategorization, kindTemplate, TARGET_KINDS } from '@/lib/domain/target-kind';

describe('target kinds (REV-79)', () => {
  it('has four kinds, none of them both-position', () => {
    expect(TARGET_KINDS).toEqual(['sight-in', 'confirm', 'precision-prone', 'precision-standing']);
    for (const k of TARGET_KINDS) expect(categorizationForKind(k).position).not.toBe('both');
  });

  it('each kind sets template, position, default rounds and role', () => {
    expect(categorizationForKind('sight-in')).toMatchObject({ template: 'sighting', position: 'prone', roundsProne: 10, sightingRole: 'sight-in' });
    expect(categorizationForKind('confirm')).toMatchObject({ template: 'sighting', position: 'prone', roundsProne: 5, sightingRole: 'confirm' });
    expect(categorizationForKind('precision-prone')).toMatchObject({ template: 'precision', position: 'prone', roundsProne: 10 });
    expect(categorizationForKind('precision-standing')).toMatchObject({ template: 'precision', position: 'standing', roundsStanding: 10, roundsProne: null });
    expect(kindTemplate('confirm')).toBe('sighting');
    expect(kindTemplate('precision-standing')).toBe('precision');
  });

  it('reads the kind back, and shows nothing for a target stored with both positions', () => {
    for (const k of TARGET_KINDS) {
      const c = categorizationForKind(k);
      expect(kindOfCategorization(c, c.sightingRole ?? null)).toBe(k);
    }
    expect(kindOfCategorization({ template: 'precision', position: 'both' }, null)).toBeNull();
    expect(kindOfCategorization({ template: null, position: null }, null)).toBeNull();
    expect(isTargetKind('confirm')).toBe(true);
    expect(isTargetKind('both')).toBe(false);
  });
});

describe('suggestSeason (REV-79)', () => {
  it('follows the calendar months', () => {
    expect(suggestSeason('2026-12-01')).toBe('winter');
    expect(suggestSeason('2026-01-15T10:00:00')).toBe('winter');
    expect(suggestSeason('2026-04-30')).toBe('spring');
    expect(suggestSeason('2026-07-04')).toBe('summer');
    expect(suggestSeason('2026-09-20')).toBe('fall');
    expect(suggestSeason('2026-11-30')).toBe('fall');
    expect(suggestSeason(null)).toBeNull();
    expect(suggestSeason('nonsense')).toBeNull();
  });
});
