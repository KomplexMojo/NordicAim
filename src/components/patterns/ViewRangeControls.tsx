import { Button } from '@/components/ui/button';
import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, PATTERN_VIEW_LABEL, type PatternRange, type PatternView } from '@/lib/patterns/collect';

const PATTERN_RANGES = (Object.keys(PATTERN_RANGE_LABEL) as PatternRange[]).map((id) => ({ id, label: PATTERN_RANGE_LABEL[id] }));

interface ViewRangeControlsProps {
  view: PatternView;
  range: PatternRange;
  onView(view: PatternView): void;
  onRange(range: PatternRange): void;
  /** `pattern` on Patterns, `analysis` on Analysis: the test ids are `<prefix>-view-<id>` and `<prefix>-range-<id>`. */
  testIdPrefix: string;
}

/**
 * patterns.md §1, §3 and analysis.md §1 (REV-123): the four views and the date ranges, the same buttons on Patterns and on
 * Analysis.
 */
export function ViewRangeControls({ view, range, onView, onRange, testIdPrefix }: ViewRangeControlsProps) {
  return (
    <>
      <div role="group" aria-label="Target type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PATTERN_VIEWS.map((id) => (
          <Button
            key={id}
            variant={id === view ? 'default' : 'outline'}
            className="h-11"
            aria-pressed={id === view}
            data-testid={`${testIdPrefix}-view-${id}`}
            onClick={() => onView(id)}
          >
            {PATTERN_VIEW_LABEL[id]}
          </Button>
        ))}
      </div>
      <div role="group" aria-label="Date range" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PATTERN_RANGES.map((r) => (
          <Button
            key={r.id}
            variant={r.id === range ? 'default' : 'outline'}
            className="h-11"
            aria-pressed={r.id === range}
            data-testid={`${testIdPrefix}-range-${r.id}`}
            onClick={() => onRange(r.id)}
          >
            {r.label}
          </Button>
        ))}
      </div>
    </>
  );
}
