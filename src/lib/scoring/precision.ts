// geometry-scoring.md §4. Precision (touch-rule) scoring for a single unit.

import { BIATHLON_50M } from '../defaults/biathlon';
import { PRECISION_TEMPLATE } from '../defaults/templates';

export const EPS = 1e-9;

export interface RingScore {
  ring: number; // 0 (miss) .. 10
  isX: boolean;
}

type RingKey = keyof typeof PRECISION_TEMPLATE.ringDiameterMm;

/**
 * Touch rule: a unit scores the highest ring n (10..1) for which `radialMm - h <= ringDiameterMm[n]/2`
 * (h = holeDiameterMm/2), inclusive within EPS. No matching ring scores 0. X (inner ten) additionally
 * requires `radialMm - h <= innerTenDiameterMm/2`; X always also scores 10.
 *
 * geometry-scoring.md §4 writes the call form as `scoreRing(radialMm)`; `holeDiameterMm` defaults to
 * `BIATHLON_50M.holeDiameterMm` so the spec's unary call form works, while still allowing a caller
 * (e.g. a custom profile) to pass a different hole diameter explicitly.
 */
export function scoreRing(radialMm: number, holeDiameterMm: number = BIATHLON_50M.holeDiameterMm): RingScore {
  const h = holeDiameterMm / 2;
  const netRadius = radialMm - h;

  for (let n = 10; n >= 1; n--) {
    const ringRadiusMm = PRECISION_TEMPLATE.ringDiameterMm[n as RingKey] / 2;
    if (netRadius <= ringRadiusMm + EPS) {
      const isX = n === 10 && netRadius <= PRECISION_TEMPLATE.innerTenDiameterMm / 2 + EPS;
      return { ring: n, isX };
    }
  }
  return { ring: 0, isX: false };
}

/**
 * rendering-composite.md §3 item 7a (M24, REV-49): whether the ring `scoreRing` credited was reached
 * only because the hole's edge touches its line — the unit's centre (`radialMm`) itself lies outside
 * that ring's own solid circle (`ringDiameterMm[ring]/2`). A miss (`ring === 0`) is never touch-credited.
 * Uses the same `ringDiameterMm` constants as `scoreRing`, not a second copy of the thresholds.
 */
export function isTouchCredited(radialMm: number, ring: number): boolean {
  if (ring <= 0) return false;
  const ringRadiusMm = PRECISION_TEMPLATE.ringDiameterMm[ring as RingKey] / 2;
  return radialMm > ringRadiusMm + EPS;
}
