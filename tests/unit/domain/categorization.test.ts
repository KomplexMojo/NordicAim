import { describe, expect, it } from 'vitest';

import {
  IncompleteCategorizationError,
  declaredRounds,
  declaredRoundsOrNull,
  emptyCategorization,
  isCategorizationComplete,
} from '@/lib/domain/categorization';

describe('categorization', () => {
  it('emptyCategorization: all null', () => {
    expect(emptyCategorization()).toEqual({
      template: null,
      position: null,
      roundsProne: null,
      roundsStanding: null,
    });
  });

  it('isCategorizationComplete requires rounds for the declared position(s)', () => {
    expect(isCategorizationComplete(emptyCategorization())).toBe(false);
    expect(
      isCategorizationComplete({ template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null }),
    ).toBe(true);
    expect(
      isCategorizationComplete({ template: 'precision', position: 'prone', roundsProne: null, roundsStanding: null }),
    ).toBe(false);
    expect(
      isCategorizationComplete({ template: 'precision', position: 'both', roundsProne: 5, roundsStanding: null }),
    ).toBe(false);
  });

  it('declaredRounds: prone', () => {
    expect(
      declaredRounds({ template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null }),
    ).toBe(10);
  });

  it('declaredRounds: standing', () => {
    expect(
      declaredRounds({ template: 'precision', position: 'standing', roundsProne: null, roundsStanding: 10 }),
    ).toBe(10);
  });

  it('declaredRounds: both 3/2 -> 5', () => {
    expect(
      declaredRounds({ template: 'precision', position: 'both', roundsProne: 3, roundsStanding: 2 }),
    ).toBe(5);
  });

  it('declaredRounds: standing with null rounds throws IncompleteCategorizationError', () => {
    expect(() =>
      declaredRounds({ template: 'precision', position: 'standing', roundsProne: null, roundsStanding: null }),
    ).toThrow(IncompleteCategorizationError);
  });

  it('declaredRoundsOrNull: the same count when the categorization is complete', () => {
    expect(
      declaredRoundsOrNull({ template: 'precision', position: 'both', roundsProne: 3, roundsStanding: 2 }),
    ).toBe(5);
  });

  it('declaredRoundsOrNull: null instead of a throw when it is incomplete', () => {
    expect(
      declaredRoundsOrNull({ template: 'precision', position: 'standing', roundsProne: null, roundsStanding: null }),
    ).toBeNull();
    expect(
      declaredRoundsOrNull({ template: null, position: null, roundsProne: null, roundsStanding: null }),
    ).toBeNull();
  });
});
