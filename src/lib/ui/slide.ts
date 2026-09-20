// REV-75: the slide-to-confirm gesture's arithmetic, kept out of the component. Pure.

/** How long the handle must be held at the far end before the action happens. */
export const SLIDE_HOLD_MS = 1000;
/** The handle counts as "at the end" from this fraction of its travel. */
export const SLIDE_END_FRACTION = 0.97;

/** How far along the track the handle is, 0 to 1, for a pointer at `clientX`, keeping the handle under the finger's start point. */
export function slideFraction(clientX: number, grabOffsetPx: number, trackLeft: number, trackWidth: number, handleWidth: number): number {
  const travel = trackWidth - handleWidth;
  if (travel <= 0) return 0;
  const x = clientX - trackLeft - grabOffsetPx;
  return Math.min(1, Math.max(0, x / travel));
}

export function atEnd(fraction: number): boolean {
  return fraction >= SLIDE_END_FRACTION;
}
