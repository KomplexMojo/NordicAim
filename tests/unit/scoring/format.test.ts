import { describe, expect, it } from 'vitest';

import { formatFractionalScore } from '@/lib/scoring/format';

describe('scoring/format formatFractionalScore', () => {
  it('whole numbers render with 1 decimal (geometry-scoring.md §8.1 vector: "averaged 84.0")', () => {
    expect(formatFractionalScore(72)).toBe('72.0');
    expect(formatFractionalScore(0)).toBe('0.0');
    expect(formatFractionalScore(84.0)).toBe('84.0');
  });

  it('fractional values render with exactly 1 decimal', () => {
    expect(formatFractionalScore(3.3333333)).toBe('3.3');
  });
});
