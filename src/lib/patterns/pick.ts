// Issue #72 (REV-140): from a point on Patterns or Analysis back to the targets behind it. Pure.

import type { PatternPoint } from './collect';

/** One target a tap can open: where it lives, and how many of the picked shots are on it. */
export interface TargetRef {
  sessionId: string;
  photoId: string;
  sessionDate: string;
  sessionStamp: string;
  shots: number;
}

/**
 * The targets with a shot within `radiusMm` of (xMm, yMm), nearest first; each target once, however many of its shots are
 * under the tap. Two sessions' targets under one finger are both listed.
 */
export function pickTargets(points: readonly PatternPoint[], xMm: number, yMm: number, radiusMm: number): TargetRef[] {
  const hits = new Map<string, TargetRef & { nearest: number }>();
  for (const p of points) {
    const d = Math.hypot(p.xMm - xMm, p.yMm - yMm);
    if (d > radiusMm) continue;
    const hit = hits.get(p.photoId);
    if (hit === undefined) {
      hits.set(p.photoId, { sessionId: p.sessionId, photoId: p.photoId, sessionDate: p.sessionDate, sessionStamp: p.sessionStamp, shots: 1, nearest: d });
    } else {
      hit.shots += 1;
      hit.nearest = Math.min(hit.nearest, d);
    }
  }
  return [...hits.values()]
    .sort((a, b) => a.nearest - b.nearest || a.photoId.localeCompare(b.photoId))
    .map((h) => ({ sessionId: h.sessionId, photoId: h.photoId, sessionDate: h.sessionDate, sessionStamp: h.sessionStamp, shots: h.shots }));
}

/** A tap's hit radius: 22 CSS px (a 44 px target), in drawing units. */
export const TAP_RADIUS_CSS_PX = 22;

/** `#/sessions/:sid/photos/:pid`, the target screen (analysis-pipeline §1). */
export function targetPath(ref: Pick<TargetRef, 'sessionId' | 'photoId'>): string {
  return `/sessions/${ref.sessionId}/photos/${ref.photoId}`;
}
