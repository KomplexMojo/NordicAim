// M21 step 4 (REV-42): the session review pass. A pure ordering helper, a pure "did the user change
// anything" test, and the one service call that loads a session's photos in review order. The review
// adds no editing of its own — it embeds Adjust and saves through `saveAdjustments`.

import type { Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { isTargetPhoto } from '@/lib/domain/backing';
import type { Calibration, TargetPhoto } from '@/lib/domain/photo';
import { samePositionMm } from '@/lib/geometry/reproject';
import { listPhotosBySession } from '@/lib/store/photos-repo';
import { getSessionRecord } from '@/lib/store/sessions-repo';

import type { ServiceContext } from './context';

export type ReviewOrderable = Pick<TargetPhoto, 'id' | 'status' | 'captureTime' | 'importedAt'>;

/** Ascending by `captureTime.utc` (null last), then `importedAt`, then id — so the order is total. */
export function byCaptureTime(a: ReviewOrderable, b: ReviewOrderable): number {
  const au = a.captureTime.utc;
  const bu = b.captureTime.utc;
  if (au !== bu) {
    if (au === null) return 1;
    if (bu === null) return -1;
    return au < bu ? -1 : 1;
  }
  if (a.importedAt !== b.importedAt) return a.importedAt < b.importedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * M21 step 4: `needs-attention` photos first (analysis-pipeline §4), then the rest, each group by capture
 * time. Pure: no clock, and the input is not modified.
 */
export function reviewOrder<T extends ReviewOrderable>(photos: T[]): T[] {
  const attention = photos.filter((p) => p.status === 'needs-attention').sort(byCaptureTime);
  const rest = photos.filter((p) => p.status !== 'needs-attention').sort(byCaptureTime);
  return [...attention, ...rest];
}

function samePerspective(a: Calibration['perspective'], b: Calibration['perspective']): boolean {
  if (a === null || b === null) return a === b;
  return a.p === b.p && a.q === b.q;
}

/** Whether two calibrations are the same alignment (every field the user can move). */
export function sameCalibration(a: Calibration, b: Calibration): boolean {
  return (
    a.cx === b.cx &&
    a.cy === b.cy &&
    a.radiusPx === b.radiusPx &&
    a.axisRatio === b.axisRatio &&
    a.angleDeg === b.angleDeg &&
    a.anchorDiameterMm === b.anchorDiameterMm &&
    samePerspective(a.perspective, b.perspective)
  );
}

function sameShot(a: Shot, b: Shot): boolean {
  const overrides =
    a.positionOverrides === null || b.positionOverrides === null
      ? a.positionOverrides === b.positionOverrides
      : a.positionOverrides.length === b.positionOverrides.length &&
        a.positionOverrides.every((value, i) => value === b.positionOverrides?.[i]);
  return (
    a.id === b.id &&
    samePositionMm(a, b) &&
    a.multiplicity === b.multiplicity &&
    a.source === b.source &&
    a.cluster === b.cluster &&
    overrides
  );
}

/**
 * M21 step 4: whether the Adjust draft differs from where it started, so Confirm knows whether to save.
 * `start` is what Adjust opened with — the stored alignment and shots, or, for a photo whose target was
 * never found, the fallback alignment `adjustStartCalibration` drew. Comparing with the start rather
 * than the stored record means an untouched fallback is never saved as a manual alignment.
 */
/**
 * What a Save from Adjust (or a Review confirm with edits) sends: the shots on screen, and the alignment
 * on screen when there was none stored, when the user moved it, **or when the stored one was only a
 * guess** — analysis-pipeline §4 rule 9: `method: 'overlay'` means no disc was found and the rings sit
 * where the owner aimed. The owner has now seen those rings over the photo and saved, which confirms them
 * (owner report 2026-09-19: "after I … make the shot adjustments … and save them, it doesn't show them as
 * fixed"). Before, a shots-only save left the guess in place and the photo at needs-attention for good.
 */
export function adjustSavePatch(
  analysis: Pick<TargetAnalysis, 'calibration' | 'pipeline'>,
  calibration: Calibration,
  shots: Shot[],
): { calibration?: Calibration; shots: Shot[] } {
  const stored = analysis.calibration;
  const send =
    stored === null || !sameCalibration(stored, calibration) || analysis.pipeline.alignment.method === 'overlay';
  return { ...(send ? { calibration } : {}), shots };
}

export function hasAdjustEdits(
  start: { calibration: Calibration; shots: Shot[] },
  draft: { calibration: Calibration; shots: Shot[] },
): boolean {
  if (!sameCalibration(start.calibration, draft.calibration)) return true;
  if (start.shots.length !== draft.shots.length) return true;
  return draft.shots.some((shot, i) => !sameShot(start.shots[i] as Shot, shot));
}

/** The session's target photos in review order, or `null` when the session does not exist. */
export async function loadReviewPhotos(ctx: ServiceContext, sessionId: string): Promise<TargetPhoto[] | null> {
  const session = await getSessionRecord(ctx.db, sessionId);
  if (session === null) return null;
  const photos = await listPhotosBySession(ctx.db, sessionId);
  const inSession = new Set(session.photoIds);
  // backing-sheet.md §3: card photos are not targets and are never reviewed.
  return reviewOrder(photos.filter((p) => inSession.has(p.id) && isTargetPhoto(p)));
}
