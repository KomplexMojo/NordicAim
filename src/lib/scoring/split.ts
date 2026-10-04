// geometry-scoring.md §7. Position assignment: every unit takes the target's position (REV-153).

import type { ShotPosition } from '../domain/enums';
import type { Categorization } from '../domain/photo';
import type { ExpandedUnit } from './units';

export interface PositionedUnit extends ExpandedUnit {
  position: ShotPosition;
}

/**
 * geometry-scoring.md §7. REV-153 (issue #25): every target is shot in one position, so every unit takes it. (The old `both` split —
 * the farthest `roundsStanding` units standing, with per-unit overrides — is gone; a stored `both` target reads as prone.)
 * `Shot.positionOverrides` is no longer read.
 */
export function assignPositions(units: ExpandedUnit[], categorization: Categorization): PositionedUnit[] {
  const position: ShotPosition = categorization.position ?? 'prone';
  return units.map((u) => ({ ...u, position }));
}
