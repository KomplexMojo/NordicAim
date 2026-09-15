// geometry-scoring.md §3. Expand each Shot (multiplicity k) into k identical-coordinate units.

import type { Shot } from '../domain/analysis';

export interface ExpandedUnit {
  shotId: string;
  unitIndex: number;
  xMm: number;
  yMm: number;
  radialMm: number;
}

/** radialMm is measured from the target centre (0,0), not from the MPI. */
export function expandUnits(shots: Shot[]): ExpandedUnit[] {
  const units: ExpandedUnit[] = [];
  for (const shot of shots) {
    for (let unitIndex = 0; unitIndex < shot.multiplicity; unitIndex++) {
      units.push({
        shotId: shot.id,
        unitIndex,
        xMm: shot.xMm,
        yMm: shot.yMm,
        radialMm: Math.hypot(shot.xMm, shot.yMm),
      });
    }
  }
  return units;
}
