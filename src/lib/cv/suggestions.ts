// M21 step 1 / REV-40: suggested holes. Detection measures every candidate it discards; the few
// plausible ones near the target are offered in Adjust as hollow dashed markers, and one tap makes a
// manual shot. Pure: no DOM, no clock, no randomness.
//
// A suggestion is NOT a detection. It is derived on demand from the worker's discarded candidates and
// is never written to IndexedDB, never part of `analysis.shots`, and absent from scoring and from every
// diagram. Counting one before the user taps it is exactly the 37.9% precision REV-40 measured and
// rejected (DESIGN-REVISIONS 2026-09-18).

import type { Shot } from '@/lib/domain/analysis';

import {
  SUGGEST_ELONGATION_MAX,
  SUGGEST_ELONGATION_WEIGHT,
  SUGGEST_MAX,
  SUGGEST_RADIAL_MAX_MM,
  SUGGEST_RADIAL_WEIGHT,
  SUGGEST_STROKE_MIN_MM,
} from './constants';
import type { RejectedCandidate, RejectionReason, ShotCandidate } from './holes';

/**
 * M21 step 1: the only discard reasons a suggestion can come from. `area` is noise, `numeral` a masked
 * printed numeral and `outside-sheet` a hole off the paper, so those are never offered.
 */
export const SUGGESTIBLE_REASONS: ReadonlySet<RejectionReason> = new Set<RejectionReason>(['glyph', 'paper', 'mark-score']);

/** M21 step 1: `score − 0.004 × radialMm − 0.03 × elongation`. Higher is more plausible. */
export function suggestionRank(candidate: Pick<ShotCandidate, 'score' | 'radialMm' | 'elongation'>): number {
  return (
    candidate.score - SUGGEST_RADIAL_WEIGHT * candidate.radialMm - SUGGEST_ELONGATION_WEIGHT * candidate.elongation
  );
}

/** Whether a discarded candidate passes REV-40's rule (reason, radius, elongation, stroke). */
export function isSuggestible(candidate: RejectedCandidate): boolean {
  return (
    SUGGESTIBLE_REASONS.has(candidate.reason) &&
    candidate.radialMm <= SUGGEST_RADIAL_MAX_MM &&
    candidate.elongation <= SUGGEST_ELONGATION_MAX &&
    candidate.strokeRadiusMm >= SUGGEST_STROKE_MIN_MM
  );
}

/**
 * M21 step 1. The best `SUGGEST_MAX` discarded candidates by rank, returned as plain candidates (the
 * `reason` is dropped: it is how the detector felt, not something the user needs). Ties are broken by
 * radial distance, then x, then y, so the order never depends on the input order.
 *
 * `holeDiameterMm` is part of the signature the milestone names; the rule's thresholds are absolute
 * millimetres measured at the .22 hole size, so it is not read today.
 */
export function suggestShots(rejected: RejectedCandidate[], holeDiameterMm: number): ShotCandidate[] {
  void holeDiameterMm;
  return rejected
    .filter(isSuggestible)
    .map((candidate) => ({ candidate, rank: suggestionRank(candidate) }))
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        a.candidate.radialMm - b.candidate.radialMm ||
        a.candidate.xMm - b.candidate.xMm ||
        a.candidate.yMm - b.candidate.yMm,
    )
    .slice(0, SUGGEST_MAX)
    .map(({ candidate }) => {
      const suggestion: ShotCandidate & { reason?: RejectionReason } = { ...candidate };
      delete suggestion.reason;
      return suggestion;
    });
}

/** Where a suggestion sits, which is all Adjust needs to draw it and turn it into a shot. */
export interface SuggestedHole {
  xMm: number;
  yMm: number;
}

/**
 * The suggestions still worth showing: any within `sameHoleMm` of a shot on screen is already
 * accounted for (the user tapped it, or placed a shot there by hand), so it disappears. Derived on every
 * render — deleting that shot again brings its suggestion back.
 */
export function visibleSuggestions<T extends SuggestedHole>(suggestions: T[], shots: SuggestedHole[], sameHoleMm: number): T[] {
  return suggestions.filter(
    (suggestion) => !shots.some((shot) => Math.hypot(shot.xMm - suggestion.xMm, shot.yMm - suggestion.yMm) < sameHoleMm),
  );
}

/**
 * REV-40: one tap on a suggestion makes a manual shot of multiplicity 1 at its position. The
 * suggestion itself is not stored anywhere; it stops showing because the new shot now covers it.
 */
export function shotFromSuggestion(suggestion: SuggestedHole, id: string): Shot {
  return {
    id,
    xMm: suggestion.xMm,
    yMm: suggestion.yMm,
    multiplicity: 1,
    positionOverrides: null,
    source: 'manual',
    confidence: null,
    cluster: false,
    possibleOverlap: false,
  };
}
