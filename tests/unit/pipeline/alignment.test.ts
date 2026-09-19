import { describe, expect, it } from 'vitest';

import { chooseAlignment } from '@/lib/pipeline/alignment';
import type { Calibration } from '@/lib/domain/photo';

const prior: Calibration = {
  cx: 600,
  cy: 800,
  radiusPx: 274.493,
  axisRatio: 1,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'overlay',
  confidence: null,
  perspective: null,
};

const measured: Calibration = {
  cx: 620,
  cy: 830,
  radiusPx: 260,
  axisRatio: 0.93,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'auto',
  confidence: 0.97,
  perspective: null,
};

describe('chooseAlignment (analysis-pipeline §3)', () => {
  it('uses the detection when it sits inside the prior gate', () => {
    const out = chooseAlignment({ prior, detection: { calibration: measured, confidence: 0.97, outsidePrior: false } });

    expect(out.method).toBe('cv');
    expect(out.calibration).toEqual({ ...measured, source: 'auto', confidence: 0.97 });
    expect(out.confidence).toBe(0.97);
    expect(out.warnings).toEqual([]);
  });

  it("keeps the sheet's measured tilt with the detection (REV-44)", () => {
    const tilted: Calibration = { ...measured, perspective: { p: 1.2e-4, q: -6.1e-4 } };
    const out = chooseAlignment({ prior, detection: { calibration: tilted, confidence: 0.97, outsidePrior: false } });
    expect(out.calibration?.perspective).toEqual({ p: 1.2e-4, q: -6.1e-4 });
  });

  it('a prior fallback is always square on (REV-44)', () => {
    const out = chooseAlignment({ prior, detection: null });
    expect(out.calibration?.perspective).toBeNull();
  });

  it('still uses a detection outside the prior gate, with alignment-uncertain (REV-25)', () => {
    const out = chooseAlignment({ prior, detection: { calibration: measured, confidence: 0.91, outsidePrior: true } });

    expect(out.method).toBe('cv');
    expect(out.calibration?.cx).toBe(measured.cx);
    expect(out.calibration?.source).toBe('auto');
    expect(out.confidence).toBe(0.91);
    expect(out.warnings).toEqual(['alignment-uncertain']);
  });

  it('uses the detection even with no prior at all', () => {
    const out = chooseAlignment({ prior: null, detection: { calibration: measured, confidence: 0.88, outsidePrior: false } });

    expect(out.method).toBe('cv');
    expect(out.warnings).toEqual([]);
  });

  it('falls back to the prior when nothing was detected', () => {
    const out = chooseAlignment({ prior, detection: null });

    expect(out.method).toBe('overlay');
    expect(out.calibration).toEqual({ ...prior, source: 'overlay', confidence: null });
    expect(out.confidence).toBeNull();
    expect(out.warnings).toEqual(['alignment-uncertain']);
  });

  it('reports none when there is neither a prior nor a detection', () => {
    const out = chooseAlignment({ prior: null, detection: null });

    expect(out).toEqual({ calibration: null, method: 'none', confidence: null, warnings: [] });
  });
});
