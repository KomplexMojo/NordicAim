import { describe, expect, it } from 'vitest';

import { expandUnits } from '@/lib/scoring/units';
import type { Shot } from '@/lib/domain/analysis';

function shot(overrides: Partial<Shot>): Shot {
  return {
    id: 's1',
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

describe('scoring/units expandUnits', () => {
  it('expands a shot with multiplicity 1 into a single unit', () => {
    const units = expandUnits([shot({ id: 'a', xMm: 3, yMm: 4 })]);
    expect(units).toEqual([{ shotId: 'a', unitIndex: 0, xMm: 3, yMm: 4, radialMm: 5 }]);
  });

  it('expands a shot with multiplicity k into k identical-coordinate units, unitIndex 0..k-1', () => {
    const units = expandUnits([shot({ id: 'b', xMm: -1, yMm: 1, multiplicity: 3 })]);
    expect(units).toEqual([
      { shotId: 'b', unitIndex: 0, xMm: -1, yMm: 1, radialMm: Math.SQRT2 },
      { shotId: 'b', unitIndex: 1, xMm: -1, yMm: 1, radialMm: Math.SQRT2 },
      { shotId: 'b', unitIndex: 2, xMm: -1, yMm: 1, radialMm: Math.SQRT2 },
    ]);
  });

  it('radialMm is measured from the target centre, not from any other reference', () => {
    const units = expandUnits([shot({ id: 'c', xMm: 6, yMm: 8 })]);
    expect(units[0]!.radialMm).toBe(10);
  });

  it('concatenates units from multiple shots in order', () => {
    const units = expandUnits([shot({ id: 'a', multiplicity: 2 }), shot({ id: 'b', multiplicity: 1 })]);
    expect(units.map((u) => `${u.shotId}#${u.unitIndex}`)).toEqual(['a#0', 'a#1', 'b#0']);
  });

  it('empty input yields no units', () => {
    expect(expandUnits([])).toEqual([]);
  });
});
