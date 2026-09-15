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
    ...overrides,
  };
}

describe('scoring/split assignPositions', () => {
  it('prone: every unit gets prone', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 1 }), shot({ id: 'b', xMm: 2, yMm: 2 })];
    const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null };
    const positioned = assignPositions(expandUnits(shots), categorization, shots);
    expect(positioned.every((u) => u.position === 'prone')).toBe(true);
  });

  it('standing: every unit gets standing', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 1 })];
    const categorization: Categorization = { template: 'precision', position: 'standing', roundsProne: null, roundsStanding: 10 };
    const positioned = assignPositions(expandUnits(shots), categorization, shots);
    expect(positioned.every((u) => u.position === 'standing')).toBe(true);
  });

  it('both, S=2, roundsProne=3: geometry-scoring.md §7 vector', () => {
    // A(r=3), B(r=30), C(r=10), D(r=45, k=2) -> radialMm from (x,0)
    const shots = [
      shot({ id: 'A', xMm: 3, yMm: 0 }),
      shot({ id: 'B', xMm: 30, yMm: 0 }),
      shot({ id: 'C', xMm: 10, yMm: 0 }),
      shot({ id: 'D', xMm: 45, yMm: 0, multiplicity: 2 }),
    ];
    const categorization: Categorization = { template: 'precision', position: 'both', roundsProne: 3, roundsStanding: 2 };
    const positioned = assignPositions(expandUnits(shots), categorization, shots);

    const key = (u: { shotId: string; unitIndex: number }) => `${u.shotId}#${u.unitIndex}`;
    const standing = positioned.filter((u) => u.position === 'standing').map(key).sort();
    const prone = positioned.filter((u) => u.position === 'prone').map(key).sort();
    expect(standing).toEqual(['D#0', 'D#1']);
    expect(prone).toEqual(['A#0', 'B#0', 'C#0']);
  });

  it('both: ties break by shotId ascending then unitIndex ascending', () => {
    // Two shots at the same radialMm; S=1 -> only the first by tie-break order goes standing.
    const shots = [shot({ id: 'z', xMm: 10, yMm: 0 }), shot({ id: 'a', xMm: 0, yMm: 10 })];
    const categorization: Categorization = { template: 'precision', position: 'both', roundsProne: 1, roundsStanding: 1 };
    const positioned = assignPositions(expandUnits(shots), categorization, shots);
    const standing = positioned.find((u) => u.position === 'standing')!;
    expect(standing.shotId).toBe('a');
  });

  it('both: per-unit positionOverrides win over the sort-based assignment', () => {
    const shots: Shot[] = [
      shot({ id: 'A', xMm: 45, yMm: 0, positionOverrides: ['prone'] }), // would sort into standing (largest radial)
      shot({ id: 'B', xMm: 1, yMm: 0 }),
    ];
    const categorization: Categorization = { template: 'precision', position: 'both', roundsProne: 1, roundsStanding: 1 };
    const positioned = assignPositions(expandUnits(shots), categorization, shots);
    const a = positioned.find((u) => u.shotId === 'A')!;
    expect(a.position).toBe('prone');
  });

  it('both: standingCount is capped at N when roundsStanding exceeds the unit count', () => {
    const shots = [shot({ id: 'a', xMm: 1, yMm: 0 })];
    const categorization: Categorization = { template: 'precision', position: 'both', roundsProne: 1, roundsStanding: 5 };
    const positioned = assignPositions(expandUnits(shots), categorization, shots);
    expect(positioned).toEqual([expect.objectContaining({ position: 'standing' })]);
  });
});
