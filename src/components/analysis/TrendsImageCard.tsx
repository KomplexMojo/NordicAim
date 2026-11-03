import { CoachImageCard } from '@/components/coach/CoachImageCard';
import { BUILD_SHA } from '@/lib/app/build-info';
import { useServices } from '@/lib/app/services';
import { buildTrendsImage, EmptyTrendsError } from '@/lib/composite/trends-build';
import { PATTERN_RANGE_LABEL, type PatternRange } from '@/lib/patterns/collect';

interface TrendsImageCardProps {
  range: PatternRange;
}

/** analysis.md §5 (REV-124): the Analysis coach image for the screen's range (`CoachImageCard`). */
export function TrendsImageCard({ range }: TrendsImageCardProps) {
  const { ctx, renderTools } = useServices();
  return (
    <CoachImageCard
      testIdPrefix="trends"
      description={
        <>
          One image with the four Patterns drawings and these trends for {range === 'all' ? 'all your sessions' : `your ${PATTERN_RANGE_LABEL[range].toLowerCase()}`}, stamped with
          your athlete details. Nothing is sent anywhere until you share it.
        </>
      }
      make={() => buildTrendsImage(ctx, range, renderTools, BUILD_SHA)}
      fileStem="nordicaim-trends"
      shareTitle="Shooting trends"
      emptyMessage="No shots in this range yet."
      isEmpty={(err) => err instanceof EmptyTrendsError}
    />
  );
}
