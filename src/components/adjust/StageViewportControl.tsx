import { Button } from '@/components/ui/button';

import { MAX_ZOOM, MIN_ZOOM } from './use-stage-viewport';

/**
 * REV-96: the stage's one zoom control, on the picture — zoom out, the zoom, zoom in, Fit. Its own pointer events never reach the
 * stage, so pressing it can never add a shot. Split out of `ImageStage.tsx` (issue #24).
 */
export function StageViewportControl({
  zoom,
  canFit,
  onZoomOut,
  onZoomIn,
  onFit,
}: {
  zoom: number;
  canFit: boolean;
  onZoomOut(): void;
  onZoomIn(): void;
  onFit(): void;
}) {
  return (
    <div
      className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/55 p-1 text-white"
      data-testid="viewport-control"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <Button variant="ghost" className="size-11 text-lg text-white hover:bg-white/20 hover:text-white" data-testid="zoom-out" aria-label="Zoom out" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM}>
        −
      </Button>
      <span className="min-w-10 text-center text-xs tabular-nums" data-testid="zoom-label">
        {zoom.toFixed(1)}x
      </span>
      <Button variant="ghost" className="size-11 text-lg text-white hover:bg-white/20 hover:text-white" data-testid="zoom-in" aria-label="Zoom in" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM}>
        +
      </Button>
      <Button variant="ghost" className="h-11 px-2 text-xs text-white hover:bg-white/20 hover:text-white" data-testid="zoom-fit" aria-label="Fit the whole photo" onClick={onFit} disabled={!canFit}>
        Fit
      </Button>
    </div>
  );
}
