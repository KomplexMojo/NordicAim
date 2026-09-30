import { describe, expect, it } from 'vitest';

import { discRadiusMm } from '@/lib/scoring/characterize-result';

// Owner, 2026-09-30: the sighting "miss" radius depends on the shot's own position (the 45 mm prone zone or the
// 115 mm standing zone, docs/spec/shooting-issues.md's `q`), not always the standing zone (== the whole disc).
describe('discRadiusMm (docs/spec/shooting-issues.md, owner 2026-09-30)', () => {
  it('precision: the black aiming disc, every position alike', () => {
    expect(discRadiusMm('precision')).toBeCloseTo(56.2, 5);
    expect(discRadiusMm('precision', 'prone')).toBeCloseTo(56.2, 5);
    expect(discRadiusMm('precision', 'standing')).toBeCloseTo(56.2, 5);
  });

  it('sighting: the prone zone (22.5 mm) when prone', () => {
    expect(discRadiusMm('sighting', 'prone')).toBeCloseTo(22.5, 5);
  });

  it('sighting: the standing zone (57.5 mm, the disc\'s own outer edge) when standing', () => {
    expect(discRadiusMm('sighting', 'standing')).toBeCloseTo(57.5, 5);
  });

  it('sighting: an unknown position falls back to the tighter prone zone', () => {
    expect(discRadiusMm('sighting')).toBeCloseTo(22.5, 5);
    expect(discRadiusMm('sighting', null)).toBeCloseTo(22.5, 5);
  });
});
