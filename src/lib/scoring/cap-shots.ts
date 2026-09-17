// M16 step 4 / REV-28: "never report more shots than the declared rounds". Pure — no Date.now(), no
// randomness, no DOM (AGENTS.md determinism rule).
//
// Detection does not know how many rounds were fired, so the cap lives here and is applied by
// Stage A (once the categorization is complete) and again by Stage B after metadata, so the rule
// always holds by the time anything is scored or drawn.

import type { Shot } from '@/lib/domain/analysis';

/**
 * A shot plus, optionally, the blob area it was measured from. `Shot` (data-model §4) carries no
 * area, so the area tie-break below only applies when a caller supplies one — see M16's Open
 * questions.
 */
export type CappableShot = Shot & { areaMm2?: number };

export interface CapShotsResult<T extends CappableShot> {
  /** The shots that survive, in their original order — a kept shot is never renumbered. */
  kept: T[];
  dropped: T[];
}

/**
 * Best first: higher confidence, then larger area, then closer to the centre, then id, so the
 * ranking is total and deterministic for any two shots.
 */
function ranked<T extends CappableShot>(a: T, b: T): number {
  return (
    (b.confidence ?? 0) - (a.confidence ?? 0) ||
    (b.areaMm2 ?? 0) - (a.areaMm2 ?? 0) ||
    Math.hypot(a.xMm, a.yMm) - Math.hypot(b.xMm, b.yMm) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * REV-28. Keeps at most `declared` shots: when there are more, the best `declared` survive and the
 * rest are dropped (the caller reports `extra-candidates-dropped`).
 *
 * Shots the owner placed by hand are never dropped and never reordered (analysis-pipeline §8): only
 * `auto` shots compete for what is left of the budget.
 */
export function capShots<T extends CappableShot>(shots: T[], declared: number): CapShotsResult<T> {
  if (shots.length <= declared) return { kept: [...shots], dropped: [] };

  const manual = shots.filter((shot) => shot.source === 'manual');
  const budget = Math.max(0, declared - manual.length);
  const survivors = new Set(shots.filter((shot) => shot.source !== 'manual').sort(ranked).slice(0, budget));

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const shot of shots) {
    if (shot.source === 'manual' || survivors.has(shot)) kept.push(shot);
    else dropped.push(shot);
  }
  return { kept, dropped };
}
