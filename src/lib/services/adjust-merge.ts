// analysis-pipeline §8 / M13 step 4, M21: which shots the user changed, and merging a re-detection with the shots kept by hand.
// Split out of `services/adjust.ts` (issue #24); pure.

import type { Shot } from '@/lib/domain/analysis';
import { samePositionMm } from '@/lib/geometry/reproject';

function sameOverrides(a: Shot['positionOverrides'], b: Shot['positionOverrides']): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Two shots are the same edit-wise when nothing the user can change differs. */
function unchanged(previous: Shot, next: Shot): boolean {
  return (
    samePositionMm(previous, next) &&
    previous.multiplicity === next.multiplicity &&
    previous.cluster === next.cluster &&
    sameOverrides(previous.positionOverrides, next.positionOverrides)
  );
}

/**
 * M13 step 4: "every shot added or modified → `source 'manual'`; untouched auto shots stay `auto`".
 * An untouched shot is returned exactly as it was stored, so neither its source nor its confidence
 * moves; anything new or edited becomes `manual` with no confidence.
 */
export function markManualShots(previous: Shot[], next: Shot[]): Shot[] {
  const before = new Map(previous.map((shot) => [shot.id, shot]));
  return next.map((shot) => {
    const stored = before.get(shot.id);
    if (stored !== undefined && unchanged(stored, shot)) return stored;
    return { ...shot, source: 'manual' as const, confidence: null };
  });
}

/**
 * REV-46: how close, in hole diameters, a detection must be to a manual shot to be the same hole. The same
 * tolerance M16 R4 uses to match detections to the owner's taps (MATCH_HOLE_DIAMETERS), because a tap is by
 * eye. Deliberately under one diameter: two genuinely overlapping holes sit 0.5-1 diameter apart, and
 * swallowing the second would drop a real shot.
 */
export const SAME_HOLE_DIAMETERS = 0.8;

export function sameHole(a: Shot, b: Shot, holeDiameterMm: number): boolean {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm) < SAME_HOLE_DIAMETERS * holeDiameterMm;
}

/** A detected shot whose id collides with a kept manual one is renamed, so ids stay unique. */
export function withUniqueIds(shots: Shot[], taken: Shot[]): Shot[] {
  const used = new Set(taken.map((shot) => shot.id));
  return shots.map((shot) => {
    let id = shot.id;
    let n = 2;
    while (used.has(id)) {
      id = `${shot.id}-${n}`;
      n += 1;
    }
    used.add(id);
    return id === shot.id ? shot : { ...shot, id };
  });
}
