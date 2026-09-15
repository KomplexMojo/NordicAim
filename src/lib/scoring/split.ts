// geometry-scoring.md §7. Position assignment for prone/standing/both.

import type { Shot } from '../domain/analysis';
import type { ShotPosition } from '../domain/enums';
import type { Categorization } from '../domain/photo';
import type { ExpandedUnit } from './units';

export interface PositionedUnit extends ExpandedUnit {
  position: ShotPosition;
}

/** Tie-break for equal radialMm: shotId ascending (string compare), then unitIndex ascending. */
function compareTieBreak(a: ExpandedUnit, b: ExpandedUnit): number {
  if (a.shotId !== b.shotId) return a.shotId < b.shotId ? -1 : 1;
  return a.unitIndex - b.unitIndex;
}

/**
 * geometry-scoring.md §7. `prone`/`standing` categorizations assign every unit that position.
 * `both` sorts units by radialMm descending (tie-break above); the first `min(roundsStanding, N)`
 * units are `standing`, the rest `prone`. Per-unit `Shot.positionOverrides[unitIndex]` (when not
 * null) wins over the sort-based assignment.
 *
 * geometry-scoring.md §7 names the third parameter `overrides`; it is passed here as the full `Shot[]`
 * (rather than a pre-extracted overrides map) because `positionOverrides` is keyed by `unitIndex`
 * within each shot, so the shot's `id` is needed alongside it to look an override up per unit.
 */
export function assignPositions(units: ExpandedUnit[], categorization: Categorization, overrides: Shot[]): PositionedUnit[] {
  if (categorization.position === 'prone' || categorization.position === 'standing') {
    const position = categorization.position;
    return units.map((u) => ({ ...u, position }));
  }

  const standingRounds = categorization.roundsStanding ?? 0;
  const sorted = [...units].sort((a, b) => b.radialMm - a.radialMm || compareTieBreak(a, b));
  const standingCount = Math.min(standingRounds, sorted.length);
  const standingKeys = new Set(sorted.slice(0, standingCount).map((u) => `${u.shotId}#${u.unitIndex}`));
  const shotsById = new Map(overrides.map((s) => [s.id, s]));

  return units.map((u) => {
    let position: ShotPosition = standingKeys.has(`${u.shotId}#${u.unitIndex}`) ? 'standing' : 'prone';
    const override = shotsById.get(u.shotId)?.positionOverrides?.[u.unitIndex] ?? null;
    if (override !== null && override !== undefined) position = override;
    return { ...u, position };
  });
}
