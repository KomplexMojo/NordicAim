import { Button } from '@/components/ui/button';
import type { SeasonFilter } from '@/lib/domain/season';
import type { PatternRange } from '@/lib/patterns/collect';
import { showingSentence } from '@/lib/patterns/showing';

interface RangeShowingProps {
  range: PatternRange;
  season: SeasonFilter;
  /** How many sessions the range and season left on screen. */
  sessions: number;
  onSeason(season: SeasonFilter): void;
  /** The test ids are `<prefix>-showing` and `<prefix>-showing-all-seasons`. */
  testIdPrefix: string;
}

/**
 * REV-156: under the range and season controls, what they add up to in one sentence; when a season leaves nothing, a
 * button back to every season.
 */
export function RangeShowing({ range, season, sessions, onSeason, testIdPrefix }: RangeShowingProps) {
  const sentence = showingSentence(range, season, sessions);
  if (sentence === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground" role="status" data-testid={`${testIdPrefix}-showing`}>
      <p>{sentence}</p>
      {sessions === 0 && (
        <Button variant="link" className="h-11 px-0" onClick={() => onSeason('all')} data-testid={`${testIdPrefix}-showing-all-seasons`}>
          Show every season
        </Button>
      )}
    </div>
  );
}
