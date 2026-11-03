import { CoachImageCard } from '@/components/coach/CoachImageCard';
import { BUILD_SHA } from '@/lib/app/build-info';
import { useServices } from '@/lib/app/services';
import { buildPatternsCoachImage } from '@/lib/composite/patterns-coach-build';
import { SEASON_LABEL, type SeasonFilter } from '@/lib/domain/season';
import { PATTERN_RANGE_LABEL, type PatternRange } from '@/lib/patterns/collect';

/** patterns.md §7 (REV-163): the Patterns coach image, "Group patterns", for the screen's range and season. */
export function PatternsImageCard({ range, season }: { range: PatternRange; season: SeasonFilter }) {
  const { ctx, renderTools } = useServices();
  const which = range === 'all' ? 'all your' : `your ${PATTERN_RANGE_LABEL[range].toLowerCase().replace(/ sessions?$/, '')}`;
  const sessions = `${which}${season === 'all' ? '' : ` ${SEASON_LABEL[season].toLowerCase()}`} ${range === 'last' ? 'session' : 'sessions'}`;
  return (
    <CoachImageCard
      testIdPrefix="patterns"
      description={
        <>
          One image of how your groups look in all four views for {sessions}: group size, centre, shape, how much the group moves
          from target to target, and potential issues. Stamped with your athlete details. Nothing is sent anywhere until you share
          it.
        </>
      }
      make={() => buildPatternsCoachImage(ctx, { range, season }, renderTools, BUILD_SHA)}
      fileStem="nordicaim-patterns"
      shareTitle="Group patterns"
      emptyMessage="No shots in this range yet."
    />
  );
}
