// M13 step 1 / M17 step 1: the Adjust stage's gesture vocabulary and its plain geometry. Split out of `ImageStage.tsx`
// (issue #24).

/** A press that never moves further than this is a tap, not a drag. */
export const TAP_SLOP_CSS = 6;
export const MIN_RADIUS_PX = 10;

export interface Point {
  x: number;
  y: number;
}

/** What the pointer that went down is doing: panning, dragging a shot or its grab tag, moving a handle, or pinching. */
export type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; startPan: Point; moved: boolean; suggestionId?: string }
  | { kind: 'shot'; pointerId: number; id: string }
  | { kind: 'tag'; pointerId: number; id: string; dx: number; dy: number }
  | { kind: 'handle'; pointerId: number; handle: 'centre' | 'radius' }
  | { kind: 'pinch'; startDist: number; startZoom: number; anchorCss: Point; anchorImage: Point };

/** One axis of the pan, kept so the photo never leaves a gap at an edge (and stays centred while it is smaller). */
export function clampAxis(pan: number, originAtZoom: number, content: number, container: number): number {
  if (content <= container) return (container - content) / 2 - originAtZoom;
  return Math.min(-originAtZoom, Math.max(container - content - originAtZoom, pan));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
