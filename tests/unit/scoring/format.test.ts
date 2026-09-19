import { describe, expect, it } from 'vitest';

import { formatAngular, formatMm } from '@/lib/scoring/format';

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
