// M21 Tests: `suggestShots` (REV-40) and the pure helpers Adjust uses to show and accept suggestions.

import { describe, expect, it } from 'vitest';

import {
  SUGGEST_ELONGATION_MAX,
  SUGGEST_MAX,
  SUGGEST_RADIAL_MAX_MM,
  SUGGEST_STROKE_MIN_MM,
} from '@/lib/cv/constants';
import type { RejectedCandidate, RejectionReason } from '@/lib/cv/holes';
import {
  isSuggestible,
  shotFromSuggestion,
  suggestionRank,
  suggestShots,
  visibleSuggestions,
} from '@/lib/cv/suggestions';
import { Shot } from '@/lib/domain/analysis';

const HOLE_MM = 5.6;

function rejected(overrides: Partial<RejectedCandidate> = {}): RejectedCandidate {
  const xMm = overrides.xMm ?? 20;
  const yMm = overrides.yMm ?? 0;
  return {
    xMm,
    yMm,
    radialMm: Math.hypot(xMm, yMm),
    surface: 'paper',
    score: 0.9,
    areaMm2: 25,
    elongation: 1.5,
    strokeRadiusMm: 1.2,
    coreContrast: 50,
    surround: 0.1,
    cluster: false,
    confidence: 0.9,
    multiplicity: 1,
    reason: 'glyph',
    ...overrides,
  };
}

describe('the REV-40 constants (M21 step 1)', () => {
  it('are the measured values', () => {
    expect(SUGGEST_RADIAL_MAX_MM).toBe(60);
    expect(SUGGEST_ELONGATION_MAX).toBe(6);
    expect(SUGGEST_STROKE_MIN_MM).toBe(0.7);
    expect(SUGGEST_MAX).toBe(3);
  });
});

describe('suggestShots (M21 step 1, REV-40)', () => {
  it('never suggests a candidate rejected for area', () => {
    expect(suggestShots([rejected({ reason: 'area' })], HOLE_MM)).toEqual([]);
  });

  it('never suggests a numeral or an off-sheet candidate either', () => {
    const reasons: RejectionReason[] = ['area', 'numeral', 'outside-sheet'];
    expect(suggestShots(reasons.map((reason) => rejected({ reason })), HOLE_MM)).toEqual([]);
  });

  it('offers each of the glyph, paper and mark-score reasons', () => {
    const reasons: RejectionReason[] = ['glyph', 'paper', 'mark-score'];
    for (const reason of reasons) expect(suggestShots([rejected({ reason })], HOLE_MM)).toHaveLength(1);
  });

  it('drops a candidate at 75 mm radial', () => {
    expect(suggestShots([rejected({ xMm: 75, yMm: 0 })], HOLE_MM)).toEqual([]);
  });

  it('keeps one at 55 mm with elongation 5 and stroke 0.9', () => {
    const candidate = rejected({ xMm: 0, yMm: -55, elongation: 5, strokeRadiusMm: 0.9 });
    const out = suggestShots([candidate], HOLE_MM);
    expect(out).toHaveLength(1);
    expect(out[0]!.xMm).toBe(0);
    expect(out[0]!.yMm).toBe(-55);
  });

  it('applies each bound inclusively and rejects just past it', () => {
    expect(isSuggestible(rejected({ xMm: 60, yMm: 0 }))).toBe(true);
    expect(isSuggestible(rejected({ xMm: 60.01, yMm: 0 }))).toBe(false);
    expect(isSuggestible(rejected({ elongation: 6 }))).toBe(true);
    expect(isSuggestible(rejected({ elongation: 6.01 }))).toBe(false);
    expect(isSuggestible(rejected({ strokeRadiusMm: 0.7 }))).toBe(true);
    expect(isSuggestible(rejected({ strokeRadiusMm: 0.69 }))).toBe(false);
  });

  it('ranks by score − 0.004 × radialMm − 0.03 × elongation', () => {
    expect(suggestionRank({ score: 0.9, radialMm: 50, elongation: 2 })).toBeCloseTo(0.9 - 0.2 - 0.06, 12);
  });

  it('returns the 3 best of 10 eligible candidates, best first', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => rejected({ xMm: 10 + i, yMm: 0, score: 0.5 + i * 0.05 }));
    const out = suggestShots(candidates, HOLE_MM);
    expect(out).toHaveLength(3);
    const ranks = candidates.map((c) => ({ x: c.xMm, rank: suggestionRank(c) })).sort((a, b) => b.rank - a.rank);
    expect(out.map((c) => c.xMm)).toEqual(ranks.slice(0, 3).map((r) => r.x));
    expect(out.map((c) => c.xMm)).toEqual([19, 18, 17]);
  });

  it('orders ties deterministically, whatever the input order', () => {
    // Same rank (same score, radius and elongation) at four positions on the 30 mm circle.
    const tied = [rejected({ xMm: 0, yMm: 30 }), rejected({ xMm: -30, yMm: 0 }), rejected({ xMm: 30, yMm: 0 }), rejected({ xMm: 0, yMm: -30 })];
    const a = suggestShots(tied, HOLE_MM);
    const b = suggestShots([...tied].reverse(), HOLE_MM);
    expect(a).toEqual(b);
    expect(a.map((c) => [c.xMm, c.yMm])).toEqual([
      [-30, 0],
      [0, -30],
      [0, 30],
    ]);
  });

  it('drops the rejection reason, and does not modify its input', () => {
    const input = [rejected()];
    const out = suggestShots(input, HOLE_MM);
    expect(out[0]).not.toHaveProperty('reason');
    expect(input[0]!.reason).toBe('glyph');
  });
});

describe('Adjust suggestions (M21 step 2)', () => {
  const suggestions = [
    { id: 's1', xMm: 10, yMm: 0 },
    { id: 's2', xMm: -20, yMm: 5 },
  ];

  it('tapping a suggestion adds one manual shot of multiplicity 1 and removes that suggestion', () => {
    const shots: Shot[] = [];
    const tapped = suggestions[0]!;
    const next = [...shots, shotFromSuggestion(tapped, 'new-1')];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ xMm: 10, yMm: 0, multiplicity: 1, source: 'manual', positionOverrides: null });
    expect(Shot.parse(next[0])).toEqual(next[0]);
    // The new shot covers it, so only the other suggestion is still shown.
    expect(visibleSuggestions(suggestions, next, 0.8 * HOLE_MM).map((s) => s.id)).toEqual(['s2']);
  });

  it('hides a suggestion within 0.8 hole diameters of any shot, and shows it again when that shot goes', () => {
    const near = shotFromSuggestion({ xMm: 10 + 0.8 * HOLE_MM - 0.01, yMm: 0 }, 'near');
    expect(visibleSuggestions(suggestions, [near], 0.8 * HOLE_MM).map((s) => s.id)).toEqual(['s2']);
    const farEnough = shotFromSuggestion({ xMm: 10 + 0.8 * HOLE_MM, yMm: 0 }, 'far');
    expect(visibleSuggestions(suggestions, [farEnough], 0.8 * HOLE_MM).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(visibleSuggestions(suggestions, [], 0.8 * HOLE_MM)).toEqual(suggestions);
  });
});
