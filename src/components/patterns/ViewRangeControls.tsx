import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ViewMark } from './ViewMark';
import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, PATTERN_VIEW_LABEL, type PatternRange, type PatternView } from '@/lib/patterns/collect';

// patterns.md §3, broadest to most recent: the order the slider moves through, left to right. "Latest session" sits
// on the right, since that's this session, and dragging left goes back in time (owner, 2026-09-30).
const RANGE_ORDER: readonly PatternRange[] = ['all', '90', '30', '14', '7', 'last'];
// The slider's own tick text (owner, 2026-09-30): short enough at six stops to stay easy to read and to tap. "Last" for
// the latest session (owner, 2026-10-02: "1" read as one day back), then how many days back, then "All" for all time
// (owner, 2026-10-02, in place of "-∞"). `PATTERN_RANGE_LABEL` (the full word, e.g. "14 days") is still the accessible
// name and what the coach image and its sentence use.
const RANGE_TICK_LABEL: Record<PatternRange, string> = { last: 'Last', '7': '-7', '14': '-14', '30': '-30', '90': '-90', all: 'All' };
const RANGE_STEPS = RANGE_ORDER.map((id) => ({ id, tick: RANGE_TICK_LABEL[id], label: PATTERN_RANGE_LABEL[id] }));
const LAST_STEP = RANGE_STEPS.length - 1;

interface ViewRangeControlsProps {
  view: PatternView;
  range: PatternRange;
  onView(view: PatternView): void;
  onRange(range: PatternRange): void;
  /** `pattern` on Patterns, `analysis` on Analysis: the test ids are `<prefix>-view-<id>` and `<prefix>-range-<id>`. */
  testIdPrefix: string;
}

interface ViewSwitchProps<V extends PatternView> {
  view: V;
  onView(view: V): void;
  /** The test ids are `<prefix>-view-<id>`. */
  testIdPrefix: string;
  /** Which views to offer, in order: all four on Patterns and Analysis; Goals passes only the two precision views. */
  views: readonly V[];
}

/** Issue #90: the four-view row's short names; the full name stays the accessible name. */
const SHORT_VIEW_LABEL: Record<PatternView, string> = {
  'sight-in': 'Sight in',
  confirm: 'Confirm',
  'precision-prone': 'Prone',
  'precision-standing': 'Standing',
};

/**
 * patterns.md §1: the view buttons on their own — Goals uses these without the date range (goals.md §3). Issue #90: each view is a
 * compact button, its mark over a short name, so the chart or drawing leads the screen; all four fit one row on Patterns and
 * Analysis, and Goals' two use the same look (owner, 2026-10-01).
 */
export function ViewSwitch<V extends PatternView>({ view, onView, testIdPrefix, views }: ViewSwitchProps<V>) {
  return (
    <div role="group" aria-label="Target type" className={cn('grid gap-2', views.length > 2 ? 'grid-cols-4' : 'grid-cols-2')}>
      {views.map((id) => (
        <Button
          key={id}
          variant={id === view ? 'default' : 'outline'}
          className="h-14 flex-col gap-1 px-1 text-xs"
          aria-pressed={id === view}
          aria-label={PATTERN_VIEW_LABEL[id]}
          data-testid={`${testIdPrefix}-view-${id}`}
          onClick={() => onView(id)}
        >
          <ViewMark kind={id} />
          {SHORT_VIEW_LABEL[id]}
        </Button>
      ))}
    </div>
  );
}

// The track sits inset 1rem from the row (`inset-x-4`); the thumb is 2.25rem across (`size-9`) and, like every
// native range input, its centre travels only between one radius in from each end of the track, never over the
// track's own edges. A tick at a linear 0–100% position would drift away from the thumb's actual centre everywhere
// but the midpoint (REV-145, owner-reported), so ticks are placed with the same 1rem + radius inset instead.
const TRACK_INSET_REM = 1;
const THUMB_RADIUS_REM = 1.125;

/** Where the thumb's centre sits, in CSS `calc()`, for a step at `fraction` (0–1) along the track. */
function thumbCenterX(fraction: number): string {
  const inset = TRACK_INSET_REM + THUMB_RADIUS_REM;
  return `calc(${inset}rem + (100% - ${2 * inset}rem) * ${fraction})`;
}

/**
 * patterns.md §1, §3 and analysis.md §1 (REV-123): the four views, and the date range as a six-stop slider
 * ("Latest session" last, on the right), the same controls on Patterns and on Analysis.
 */
export function ViewRangeControls({ view, range, onView, onRange, testIdPrefix }: ViewRangeControlsProps) {
  const rangeIndex = Math.max(
    0,
    RANGE_STEPS.findIndex((s) => s.id === range),
  );
  // The visible thumb/tick position tracks its own state so a drag or a tap moves it right away, instead of
  // waiting a render on `range`'s round trip through the address bar (react-router's `setSearchParams`).
  // Resetting it here, during render, when `rangeIndex` has moved on its own (React's documented pattern for
  // adjusting state from a prop) keeps it in sync without an effect's extra render.
  const [priorRangeIndex, setPriorRangeIndex] = useState(rangeIndex);
  const [index, setIndex] = useState(rangeIndex);
  if (rangeIndex !== priorRangeIndex) {
    setPriorRangeIndex(rangeIndex);
    setIndex(rangeIndex);
  }

  function moveTo(i: number) {
    const step = RANGE_STEPS[i];
    if (step === undefined) return;
    setIndex(i);
    onRange(step.id);
  }

  return (
    <>
      <ViewSwitch view={view} onView={onView} testIdPrefix={testIdPrefix} views={PATTERN_VIEWS} />
      <div className="flex flex-col gap-1">
        <div className="relative h-11">
          <div className="pointer-events-none absolute inset-x-4 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `${TRACK_INSET_REM}rem`, width: `calc(${thumbCenterX(index / LAST_STEP)} - ${TRACK_INSET_REM}rem)` }}
          />
          <input
            type="range"
            aria-hidden="true"
            tabIndex={-1}
            min={0}
            max={LAST_STEP}
            step={1}
            value={index}
            onChange={(event) => moveTo(Number(event.target.value))}
            className={cn(
              'absolute inset-x-4 top-0 h-11 cursor-pointer appearance-none bg-transparent',
              '[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent',
              '[&::-moz-range-track]:h-11 [&::-moz-range-track]:bg-transparent',
              '[&::-webkit-slider-thumb]:size-9 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md',
              '[&::-moz-range-thumb]:size-9 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md',
            )}
          />
        </div>
        <div role="group" aria-label="Date range" className="relative h-11">
          {RANGE_STEPS.map((step, i) => (
            <button
              key={step.id}
              type="button"
              aria-pressed={i === index}
              aria-label={step.label}
              data-testid={`${testIdPrefix}-range-${step.id}`}
              onClick={() => moveTo(i)}
              className={cn(
                'absolute top-0 flex h-11 w-10 items-center justify-center text-sm tabular-nums',
                i === index ? 'font-semibold text-primary' : 'text-muted-foreground',
              )}
              style={{ left: thumbCenterX(i / LAST_STEP), transform: 'translateX(-50%)' }}
            >
              {step.tick}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
