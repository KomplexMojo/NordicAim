// REV-97: zoom levels for a scrollable picture (target diagram, Patterns drawing). Pure.

export const FRAME_MIN = 1;
export const FRAME_MAX = 4;
export const FRAME_STEP = 1.5;

export function clampFrameZoom(level: number): number {
  return Math.min(FRAME_MAX, Math.max(FRAME_MIN, level));
}

export function stepFrameZoom(level: number, direction: 'in' | 'out'): number {
  return clampFrameZoom(direction === 'in' ? level * FRAME_STEP : level / FRAME_STEP);
}
