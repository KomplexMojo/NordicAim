import { describe, expect, it } from 'vitest';

import { formatAngular, formatFractionalScore, formatMm } from '@/lib/scoring/format';

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

describe('scoring/format formatMm and formatAngular (rendering-composite.md §3 item 10)', () => {
  it('mm render at 1 decimal', () => {
    expect(formatMm(41.881)).toBe('41.9');
    expect(formatMm(27.681)).toBe('27.7');
    expect(formatMm(0)).toBe('0.0');
  });

  it('MOA/MRAD render at 2 decimals', () => {
    expect(formatAngular(2.880832)).toBe('2.88');
    expect(formatAngular(0.83762)).toBe('0.84');
    expect(formatAngular(1.904512)).toBe('1.90');
  });

  it('unavailable values render as an em dash', () => {
    expect(formatMm(null)).toBe('—');
    expect(formatAngular(null)).toBe('—');
  });
});
