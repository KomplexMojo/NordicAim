import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { FRAME_MAX, FRAME_MIN, stepFrameZoom } from '@/lib/ui/zoom-steps';

interface ZoomFrameProps {
  children: ReactNode;
  /** Height limit of the scrolling box while zoomed. */
  maxHeight?: string;
}

/**
 * REV-97: the one zoom control for a picture that is not the photo editor (the target diagram, the Patterns drawing): − level +
 * Fit on the picture's corner, keyboard + − 0 when focused. Zooming widens the picture inside a scrolling box; a tap never zooms.
 */
export function ZoomFrame({ children, maxHeight = '70vh' }: ZoomFrameProps) {
  const [level, setLevel] = useState(FRAME_MIN);
  const zoomed = level > FRAME_MIN;
  return (
    <div
      className="relative"
      data-testid="zoom-frame"
      data-zoom={level}
      tabIndex={0}
      aria-label="Picture. Plus and minus zoom, 0 fits it to the width."
      onKeyDown={(e) => {
        if (e.key === '+' || e.key === '=') setLevel(stepFrameZoom(level, 'in'));
        else if (e.key === '-' || e.key === '_') setLevel(stepFrameZoom(level, 'out'));
        else if (e.key === '0') setLevel(FRAME_MIN);
        else return;
        e.preventDefault();
      }}
    >
      <div className={zoomed ? 'overflow-auto' : ''} style={zoomed ? { maxHeight } : undefined}>
        <div style={{ width: `${level * 100}%` }}>{children}</div>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/55 p-1 text-white">
        <Button variant="ghost" className="size-11 text-lg text-white hover:bg-white/20 hover:text-white" data-testid="frame-zoom-out" aria-label="Zoom out" disabled={level <= FRAME_MIN} onClick={() => setLevel(stepFrameZoom(level, 'out'))}>
          −
        </Button>
        <span className="min-w-10 text-center text-xs tabular-nums" data-testid="frame-zoom-label">
          {level.toFixed(1)}x
        </span>
        <Button variant="ghost" className="size-11 text-lg text-white hover:bg-white/20 hover:text-white" data-testid="frame-zoom-in" aria-label="Zoom in" disabled={level >= FRAME_MAX} onClick={() => setLevel(stepFrameZoom(level, 'in'))}>
          +
        </Button>
        <Button variant="ghost" className="h-11 px-2 text-xs text-white hover:bg-white/20 hover:text-white" data-testid="frame-zoom-fit" aria-label="Fit to width" disabled={!zoomed} onClick={() => setLevel(FRAME_MIN)}>
          Fit
        </Button>
      </div>
    </div>
  );
}
