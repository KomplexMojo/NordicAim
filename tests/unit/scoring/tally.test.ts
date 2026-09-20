import { describe, expect, it } from 'vitest';

import { tallyRows } from '@/lib/scoring/tally';

describe('tallyRows (REV-84)', () => {
  it('lists rings 10 to 0, each with its shots and ring × shots points, and the sum', () => {
    // 1×10, 1×9, 2×8, 2×7, 3×6, 1×5 = 10 + 9 + 16 + 14 + 18 + 5 = 72 (the demo precision target)
    const tally = [0, 0, 0, 0, 0, 1, 3, 2, 2, 1, 1];
    const { rows, total } = tallyRows(tally);
    expect(rows.map((r) => r.ring)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(rows.find((r) => r.ring === 8)).toEqual({ ring: 8, shots: 2, points: 16 });
    expect(rows.find((r) => r.ring === 4)).toEqual({ ring: 4, shots: 0, points: 0 });
    expect(total).toBe(72);
  });

  it('missing entries count as no shots, and ring 0 adds nothing', () => {
    const { rows, total } = tallyRows([4]);
    expect(rows.find((r) => r.ring === 0)).toEqual({ ring: 0, shots: 4, points: 0 });
    expect(total).toBe(0);
  });
});
