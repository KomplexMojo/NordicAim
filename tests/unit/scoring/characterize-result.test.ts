import { describe, expect, it } from 'vitest';

import { withCharacteristics } from '@/lib/scoring/characterize-result';
import type { AnalysisResult } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { hitsZone } from '@/lib/scoring/sighting';

// Owner, 2026-10-01 (Option A): the "miss" zone is the real biathlon hit zone for the shot's position — 45 mm prone,
// 115 mm standing — on every template, with the scoring rule's touch (docs/spec/shooting-issues.md's `q`). It used
// to be ring 8 (prone) and the black disc (standing) on the precision sheet.
describe('hitsZone (docs/spec/shooting-issues.md, owner 2026-10-01)', () => {
  it('prone: the 22.5 mm radius plus half the hole, inclusive', () => {
    expect(hitsZone(25.3, 'prone', 5.6)).toBe(true);
    expect(hitsZone(25.31, 'prone', 5.6)).toBe(false);
  });

  it('standing: the 57.5 mm radius plus half the hole, inclusive', () => {
    expect(hitsZone(60.3, 'standing', 5.6)).toBe(true);
    expect(hitsZone(60.31, 'standing', 5.6)).toBe(false);
  });

  it('follows the scoring rule\'s hole size: 0 (centre in ring) reads the zone edge itself', () => {
    expect(hitsZone(22.5, 'prone', 0)).toBe(true);
    expect(hitsZone(22.51, 'prone', 0)).toBe(false);
  });
});

describe('withCharacteristics', () => {
  it('reads the subset and the combined subset against the target\'s own position\'s zone (REV-153)', () => {
    const unit = (xMm: number) => ({ xMm, yMm: 0 });
    // Shots at 10 mm (inside prone's 25.3) and 40 mm (outside prone, inside standing's 60.3).
    const units = [unit(10), unit(40)];
    const result = (key: 'prone' | 'standing') =>
      ({ template: 'precision', subsets: [{ key, units }], all: { key: 'all', units } }) as unknown as AnalysisResult;
    const prone = withCharacteristics(result('prone'), { position: 'prone' } as Categorization, 'right', 5.6);
    expect(prone.subsets[0]!.characteristics?.outsideShare).toBe(0.5);
    expect(prone.all.characteristics?.outsideShare).toBe(0.5);
    const standing = withCharacteristics(result('standing'), { position: 'standing' } as Categorization, 'right', 5.6);
    expect(standing.subsets[0]!.characteristics?.outsideShare).toBe(0);
    expect(standing.all.characteristics?.outsideShare).toBe(0);
  });
});
