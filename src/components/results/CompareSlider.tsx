import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { compareLayerStyle, type CompareMode } from '@/lib/render/diagram-overlay';

interface CompareSliderProps {
  /** Object URL of the working photo, or `null` when the blob is gone (M17 step 4). */
  photoUrl: string | null;
  imageSize: { widthPx: number; heightPx: number };
  /** `renderDiagramOverlaySvg` output: the diagram in this photo's own pixel space. */
  overlaySvg: string;
}

/**
 * M17 step 3 (REV-30). The photo and the diagram it produced in one box: all the way left is the
 * whole diagram, all the way right is the whole photo, and in between the boundary wipes across so
 * the drawn rings can be checked against the printed ones. The *fade* toggle swaps the clip for an
 * opacity dissolve (REV-30's second option).
 *
 * With no photo stored the box shows the diagram alone and says so (step 4).
 */
export function CompareSlider({ photoUrl, imageSize, overlaySvg }: CompareSliderProps) {
  const [value, setValue] = useState(0);
  const [mode, setMode] = useState<CompareMode>('wipe');
  const sliderId = useId();
  const style = compareLayerStyle(mode, photoUrl === null ? 0 : value);

  return (
    <section
      className="flex flex-col gap-2"
      data-testid="compare-slider"
      data-compare-mode={mode}
      data-compare-value={photoUrl === null ? 0 : value}
    >
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: `${imageSize.widthPx} / ${imageSize.heightPx}` }}
      >
        {photoUrl !== null && (
          <img
            src={photoUrl}
            alt="The photo this analysis was made from"
            className="absolute inset-0 size-full object-contain"
            data-testid="compare-photo"
            draggable={false}
          />
        )}
        <div
          className="pointer-events-none absolute inset-0 [&>svg]:size-full"
          data-testid="compare-overlay"
          data-clip-path={style.clipPath}
          data-opacity={style.opacity}
          style={{ clipPath: style.clipPath, opacity: style.opacity }}
          dangerouslySetInnerHTML={{ __html: overlaySvg }}
        />
        {photoUrl !== null && mode === 'wipe' && value > 0 && value < 1 && (
          <div
            className="pointer-events-none absolute inset-y-0 w-[2px] bg-white/80"
            data-testid="compare-handle"
            style={{ left: `${style.boundaryFraction * 100}%` }}
          />
        )}
      </div>

      {photoUrl === null ? (
        <p className="text-sm text-muted-foreground" data-testid="compare-no-photo">
          No photo stored for this target, so there is nothing to compare the diagram against.
        </p>
      ) : (
        <>
          <label htmlFor={sliderId} className="text-sm text-muted-foreground">
            Diagram ↔ Photo
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={value}
            data-testid="compare-range"
            aria-label="Diagram ↔ Photo"
            className="h-11 w-full"
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <Button
            variant="outline"
            className="h-11"
            data-testid="compare-mode"
            aria-pressed={mode === 'fade'}
            onClick={() => setMode(mode === 'wipe' ? 'fade' : 'wipe')}
          >
            {mode === 'wipe' ? 'Fade instead of wipe' : 'Wipe instead of fade'}
          </Button>
        </>
      )}
    </section>
  );
}
