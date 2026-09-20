// geometry-scoring.md §3 (REV-56). The one place the scoring rule is applied.
//
// All three rules are the same formula — a unit scores the highest ring or zone whose boundary satisfies
// `radialMm - h <= boundary` — with a different effective hole radius `h`. Every scoring function already
// takes a hole *diameter*, so a rule is simply the diameter handed to them.

import type { AppSettings, ScoringRule } from '@/lib/domain/settings';

/**
 * The diameter scoring should treat a hole as.
 *  - `gauge`   — the physical hole (official gauge touch): today's rule.
 *  - `centre`  — 0: only the centre of the hole counts, so nothing is ever credited by touching a line.
 *  - `visible` — the owner's visible-hole size.
 *
 * **Detection never uses this**: it looks for the physical hole, whatever rule scores it.
 */
export function scoringHoleDiameterMm(
  rule: ScoringRule,
  holeDiameterMm: number,
  visibleHoleDiameterMm: number,
): number {
  if (rule === 'centre') return 0;
  if (rule === 'visible') return visibleHoleDiameterMm;
  return holeDiameterMm;
}

/** {@link scoringHoleDiameterMm} for the stored settings — what every scoring caller hands `analyzeTarget`. */
export function scoringDiameterFromSettings(settings: AppSettings): number {
  return scoringHoleDiameterMm(settings.scoringRule, settings.profileOverrides.holeDiameterMm, settings.visibleHoleDiameterMm);
}
