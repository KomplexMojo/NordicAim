import { describe, expect, it } from 'vitest';

import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { AppSettings, defaultAppSettings } from '@/lib/domain/settings';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { scoringDiameterFromSettings, scoringHoleDiameterMm } from '@/lib/scoring/rule';

// REV-56 / issue #4. The owner's precision target: paper showed one 10 and four 9s, the app three 10s.
// These are that target's three innermost shots, scored by hand first (issue #4's table):
//   gauge  (h 2.8):  3.55 - 2.8 = 0.75, 7.05 - 2.8 = 4.25, 7.67 - 2.8 = 4.87 -> all inside the 5.2 mm line -> 10, 10, 10
//   centre (h 0):    3.55 <= 5.2 -> 10;  7.05 and 7.67 are past 5.2 but inside 13.2 -> 9, 9
//   visible (4.5):   7.05 - 2.25 = 4.80 <= 5.2 -> 10;  7.67 - 2.25 = 5.42 > 5.2 -> 9   (10, 10, 9)
const RADII = [3.55, 7.05, 7.67];
const categorization: Categorization = { template: 'precision', position: 'prone', roundsProne: 3, roundsStanding: null };

function shotAt(id: string, radialMm: number): Shot {
  return { id, xMm: radialMm, yMm: 0, multiplicity: 1, positionOverrides: null, source: 'auto', confidence: null, cluster: false, possibleOverlap: false };
}

function ringsUnder(diameterMm: number): number[] {
  const profile = { ...BIATHLON_50M, holeDiameterMm: diameterMm } as typeof BIATHLON_50M;
  const result = analyzeTarget({ template: 'precision', categorization, shots: RADII.map((r, i) => shotAt(`s${i}`, r)), profile });
  return result.all.units.map((u) => u.ring as number);
}

describe('scoringHoleDiameterMm (REV-56)', () => {
  it('gauge uses the physical hole, centre uses none, visible uses its own size', () => {
    expect(scoringHoleDiameterMm('gauge', 5.6, 4.5)).toBe(5.6);
    expect(scoringHoleDiameterMm('centre', 5.6, 4.5)).toBe(0);
    expect(scoringHoleDiameterMm('visible', 5.6, 4.5)).toBe(4.5);
  });

  it('follows the physical hole size only under gauge', () => {
    expect(scoringHoleDiameterMm('gauge', 6.2, 4.5)).toBe(6.2);
    expect(scoringHoleDiameterMm('visible', 6.2, 4.5)).toBe(4.5);
    expect(scoringHoleDiameterMm('centre', 6.2, 4.5)).toBe(0);
  });

  it('reads the stored settings', () => {
    expect(scoringDiameterFromSettings(defaultAppSettings())).toBe(5.6); // the default rule is gauge: no behaviour change
    expect(scoringDiameterFromSettings({ ...defaultAppSettings(), scoringRule: 'centre' })).toBe(0);
  });
});

describe('the owner\'s target under each rule (issue #4)', () => {
  it('official gauge touch: 10, 10, 10 — today\'s rule, unchanged', () => {
    expect(ringsUnder(scoringHoleDiameterMm('gauge', 5.6, 4.5))).toEqual([10, 10, 10]);
  });
  it('centre in ring: 10, 9, 9 — one 10, as on the paper', () => {
    expect(ringsUnder(scoringHoleDiameterMm('centre', 5.6, 4.5))).toEqual([10, 9, 9]);
  });
  it('visible hole touch at 4.5 mm: 10, 10, 9', () => {
    expect(ringsUnder(scoringHoleDiameterMm('visible', 5.6, 4.5))).toEqual([10, 10, 9]);
  });
  it('visible hole touch moves with its size', () => {
    expect(ringsUnder(3.0)).toEqual([10, 9, 9]); // 7.05 - 1.5 = 5.55 > 5.2
    expect(ringsUnder(5.6)).toEqual([10, 10, 10]); // the full hole is gauge
  });
});

describe('older settings rows read back (REV-56)', () => {
  it('a row from before the scoring rule gets the defaults', () => {
    const { scoringRule, visibleHoleDiameterMm, ...old } = defaultAppSettings();
    void scoringRule;
    void visibleHoleDiameterMm;
    const parsed = AppSettings.parse(old);
    expect(parsed.scoringRule).toBe('gauge');
    expect(parsed.visibleHoleDiameterMm).toBe(4.5);
  });

  it('refuses a visible hole size outside 2-5.6 mm', () => {
    expect(AppSettings.safeParse({ ...defaultAppSettings(), visibleHoleDiameterMm: 8 }).success).toBe(false);
    expect(AppSettings.safeParse({ ...defaultAppSettings(), visibleHoleDiameterMm: 1 }).success).toBe(false);
  });
});
