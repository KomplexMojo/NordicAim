import { describe, expect, it } from 'vitest';

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE, getTemplate, ringRadiusMm } from '@/lib/defaults/templates';

describe('templates', () => {
  it('ringDiameterMm formula: 10.4 + 16 * (10 - n)', () => {
    for (let n = 1; n <= 10; n++) {
      const key = n as keyof typeof PRECISION_TEMPLATE.ringDiameterMm;
      expect(PRECISION_TEMPLATE.ringDiameterMm[key]).toBeCloseTo(10.4 + 16 * (10 - n), 10);
    }
  });

  it('getTemplate returns the matching template', () => {
    expect(getTemplate('sighting')).toBe(SIGHTING_TEMPLATE);
    expect(getTemplate('precision')).toBe(PRECISION_TEMPLATE);
  });

  it('ringRadiusMm halves the ring diameter', () => {
    expect(ringRadiusMm(10)).toBeCloseTo(5.2, 10);
    expect(ringRadiusMm(1)).toBeCloseTo(77.2, 10);
  });
});
