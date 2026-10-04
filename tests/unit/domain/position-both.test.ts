// REV-153 (issue #25): there is no `both` position; data stored with it is read as prone.

import { describe, expect, it } from 'vitest';

import { TargetAnalysis } from '@/lib/domain/analysis';
import { Categorization, upgradeBothCategorization } from '@/lib/domain/photo';

describe('upgradeBothCategorization (REV-153)', () => {
  it('reads an old both target as prone, its rounds summed', () => {
    expect(Categorization.parse({ template: 'precision', position: 'both', roundsProne: 5, roundsStanding: 5 })).toEqual({
      template: 'precision',
      position: 'prone',
      roundsProne: 10,
      roundsStanding: null,
    });
  });

  it('keeps the rounds missing when none were entered, and treats one missing side as 0', () => {
    expect(upgradeBothCategorization({ template: 'sighting', position: 'both', roundsProne: null, roundsStanding: null })).toMatchObject({
      position: 'prone',
      roundsProne: null,
      roundsStanding: null,
    });
    expect(upgradeBothCategorization({ template: 'sighting', position: 'both', roundsProne: null, roundsStanding: 4 })).toMatchObject({
      roundsProne: 4,
      roundsStanding: null,
    });
  });

  it('leaves every other categorization as it is', () => {
    const standing = { template: 'precision', position: 'standing', roundsProne: null, roundsStanding: 10 };
    expect(upgradeBothCategorization(standing)).toBe(standing);
    expect(upgradeBothCategorization(null)).toBeNull();
    expect(() => Categorization.parse({ ...standing, position: 'kneeling' })).toThrow();
  });
});

describe('TargetAnalysis.computed for an old both result (REV-153)', () => {
  const computed = TargetAnalysis.shape.computed;

  it('reads as not yet computed, so the target is scored again', () => {
    expect(computed.parse({ engineVersion: '1', result: { position: 'both' } })).toBeNull();
  });

  it('keeps an empty result empty', () => {
    expect(computed.parse(null)).toBeNull();
  });
});
