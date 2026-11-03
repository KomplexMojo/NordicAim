import { CoachImageCard } from '@/components/coach/CoachImageCard';
import { BUILD_SHA } from '@/lib/app/build-info';
import { useServices } from '@/lib/app/services';
import { buildGoalsCoachImage } from '@/lib/composite/goals-coach-build';
import { SEASON_LABEL, type SeasonFilter } from '@/lib/domain/season';

/** goals.md §9 (REV-163): the Goals coach image, "Goal progress", for the screen's season. */
export function GoalsImageCard({ season }: { season: SeasonFilter }) {
  const { ctx, renderTools } = useServices();
  return (
    <CoachImageCard
      testIdPrefix="goals"
      description={
        <>
          One image of your progress towards every goal, prone and standing{season === 'all' ? '' : `, over your ${SEASON_LABEL[season].toLowerCase()} sessions`}:
          goals hit, the average since each was set, how far is left to go, and the sessions that met them. Stamped with your athlete
          details. Nothing is sent anywhere until you share it.
        </>
      }
      make={() => buildGoalsCoachImage(ctx, season, renderTools, BUILD_SHA)}
      fileStem="nordicaim-goals"
      shareTitle="Goal progress"
      emptyMessage="Set a goal first."
    />
  );
}
