import { Slider } from '@/components/ui/slider';
import { MAX_OUTER_DIAMETER_FRACTION, MIN_OUTER_DIAMETER_FRACTION } from '@/lib/capture/prefs-browser';

interface SizeSliderProps {
  value: number;
  onChange(value: number): void;
}

/** capture-overlay.md §1.4: outer diameter as a fraction (0.50–0.95) of the viewfinder's short side. */
export function SizeSlider({ value, onChange }: SizeSliderProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span id="size-slider-label" className="shrink-0">
        Size
      </span>
      <Slider
        className="h-11 flex-1"
        min={MIN_OUTER_DIAMETER_FRACTION}
        max={MAX_OUTER_DIAMETER_FRACTION}
        step={0.01}
        value={[value]}
        aria-labelledby="size-slider-label"
        onValueChange={(values) => {
          const v = values[0];
          if (v === undefined) return;
          onChange(Math.min(MAX_OUTER_DIAMETER_FRACTION, Math.max(MIN_OUTER_DIAMETER_FRACTION, v)));
        }}
      />
      <span className="w-10 shrink-0 text-right tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}
