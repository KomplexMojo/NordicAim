import { describe, expect, it } from 'vitest';

import { assignPositions } from '@/lib/scoring/split';
import { expandUnits } from '@/lib/scoring/units';
import type { Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';

function shot(overrides: Partial<Shot>): Shot {
  return {
    id: 's',
    xMm: 0,
    yMm: 0,
    multiplicity: 1,
    positionOverrides: null,
    source: 'manual',
    confidence: null,
    cluster: false,
    possibleOverlap: false,
    ...overrides,
  };
}

describe('scoring/split assignPositions', () => {
  it('prone: every unit gets prone', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 1 }), shot({ id: 'b', xMm: 2, yMm: 2 })];
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null };
    const positioned = assignPositions(expandUnits(shots), categorization);
    expect(positioned.every((u) => u.position === 'prone')).toBe(true);
  });

  it('standing: every unit gets standing', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 1 })];
    const categorization: Categorization = { template: 'precision', position: 'standing', roundsProne: null, roundsStanding: 10 };
    const positioned = assignPositions(expandUnits(shots), categorization);
    expect(positioned.every((u) => u.position === 'standing')).toBe(true);
  });
});
