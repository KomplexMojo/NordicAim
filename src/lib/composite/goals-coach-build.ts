// goals.md §9 (REV-163): the Goals coach image as a stored artifact, for the screen's season. Stored and branded like the
// Analysis one (`coach-store.ts`).

import { SEASON_FILTER_LABEL, type SeasonFilter } from '@/lib/domain/season';
import { GOAL_VIEWS, goalsCoach, hasAnyGoal } from '@/lib/goals/coach';
import { filterBySeason, type PatternPoint } from '@/lib/patterns/collect';
import type { GoalView } from '@/lib/domain/goals';
import { buildGoalsCoachPayload } from '@/lib/provenance/payload-coach';
import { GOALS_COACH_RENDERER_VERSION, renderGoalsCoach } from '@/lib/render/goals-coach';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import type { ServiceContext } from '@/lib/services/context';
import { listGoals } from '@/lib/services/goals';
import { loadPatterns } from '@/lib/services/patterns';

import { coachProvenance, EmptyCoachImageError, localStamp, storeCoachImage, type TrendsArtifact } from './coach-store';

/**
 * §9: renders the Goals coach image for the screen's season, stores it, prunes to the newest three, and returns it with its
 * PNG, ready for `shareArtifact`. Throws `EmptyCoachImageError` when no goal is set.
 */
export async function buildGoalsCoachImage(
  ctx: ServiceContext,
  season: SeasonFilter,
  render: RenderTools,
  release = 'dev',
): Promise<{ artifact: TrendsArtifact; png: Blob }> {
  const entries = await listGoals(ctx);
  if (!hasAnyGoal(entries)) throw new EmptyCoachImageError('No goals set to make a coach image from');
  const loaded = await loadPatterns(ctx);
  // As on the screen, the season narrows the charts and each goal's average since set.
  const byView = Object.fromEntries(GOAL_VIEWS.map((v) => [v, filterBySeason(loaded.data.points[v], season)])) as Record<GoalView, PatternPoint[]>;
  const coach = goalsCoach(entries, byView, loaded.holeDiameterMm);

  const now = ctx.now();
  const createdAt = now.toISOString();
  const seasonLabel = SEASON_FILTER_LABEL[season];
  const { provenance, stamped } = await coachProvenance(ctx, ({ name, club }) => buildGoalsCoachPayload({ name, club, seasonLabel, release, createdAt, coach }));

  const { svg, width, height } = renderGoalsCoach({
    seasonLabel,
    coach,
    release,
    generatedAtLocal: localStamp(now),
    ...(provenance === undefined ? {} : { provenance }),
  });
  const png = await render.svgToPng(svg, width, height);
  return storeCoachImage(ctx, {
    kind: 'goals',
    png,
    widthPx: width,
    heightPx: height,
    createdAt,
    range: null,
    rendererVersion: GOALS_COACH_RENDERER_VERSION,
    // No image data and no GPS: the season, the totals and what the stamp covers.
    sidecar: { season, hit: coach.hit, judged: coach.judged, ...(stamped === null ? {} : { provenance: stamped }) },
  });
}
