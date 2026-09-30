import { describe, expect, it } from 'vitest';

import { discRadiusMm } from '@/lib/scoring/characterize-result';

// Owner, 2026-09-30: the "miss" radius depends on the shot's own position (docs/spec/shooting-issues.md's `q`), not
// always the standing zone (== sighting's whole disc; precision has no prone zone of its own, so prone borrows
// ring 8's radius as the closest match to sighting's 22.5 mm prone zone).
describe('discRadiusMm (docs/spec/shooting-issues.md, owner 2026-09-30)', () => {
  it('precision: the black aiming disc when standing', () => {
    expect(discRadiusMm('precision', 'standing')).toBeCloseTo(56.2, 5);
  });

  it('precision: ring 8\'s radius when prone', () => {
    expect(discRadiusMm('precision', 'prone')).toBeCloseTo(21.2, 5);
  });

  it('precision: an unknown position falls back to ring 8, the tighter of the two', () => {
    expect(discRadiusMm('precision')).toBeCloseTo(21.2, 5);
    expect(discRadiusMm('precision', null)).toBeCloseTo(21.2, 5);
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
