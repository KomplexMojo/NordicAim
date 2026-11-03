// patterns.md §7 (REV-163): the Patterns coach image as a stored artifact, for the screen's range and season. Stored and
// branded like the Analysis one (`coach-store.ts`).

import { SEASON_FILTER_LABEL, type SeasonFilter } from '@/lib/domain/season';
import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, filterByRange, filterBySeason, type PatternPoint, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { patternsCoach, viewKind } from '@/lib/patterns/coach';
import { buildPatternsCoachPayload } from '@/lib/provenance/payload-coach';
import { patternsSizeFactor } from '@/lib/render/patterns';
import { PATTERNS_COACH_RENDERER_VERSION, renderPatternsCoach } from '@/lib/render/patterns-coach';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import type { ServiceContext } from '@/lib/services/context';
import { loadPatterns } from '@/lib/services/patterns';

import { coachProvenance, EmptyCoachImageError, localStamp, storeCoachImage, type TrendsArtifact } from './coach-store';

/**
 * §7: renders the Patterns coach image for the screen's range and season (the season first, as on the screen), stores it,
 * prunes to the newest three, and returns it with its PNG, ready for `shareArtifact`. Throws `EmptyCoachImageError` when
 * no view has a shot.
 */
export async function buildPatternsCoachImage(
  ctx: ServiceContext,
  filters: { range: PatternRange; season: SeasonFilter },
  render: RenderTools,
  release = 'dev',
): Promise<{ artifact: TrendsArtifact; png: Blob }> {
  const loaded = await loadPatterns(ctx);
  const byView = Object.fromEntries(
    PATTERN_VIEWS.map((v) => [v, filterByRange(filterBySeason(loaded.data.points[v], filters.season), filters.range)]),
  ) as Record<PatternView, PatternPoint[]>;
  if (PATTERN_VIEWS.every((v) => byView[v].length === 0)) throw new EmptyCoachImageError('No shots in this range to make a coach image from');

  const views = patternsCoach(byView, { handedness: loaded.handedness, holeDiameterMm: loaded.holeDiameterMm });
  // The same size as the Patterns screen: worked out from every recorded shot, not the range.
  const factor = patternsSizeFactor(PATTERN_VIEWS.map((v) => ({ kind: viewKind(v), points: loaded.data.points[v] })));

  const now = ctx.now();
  const createdAt = now.toISOString();
  const rangeLabel = PATTERN_RANGE_LABEL[filters.range];
  const seasonLabel = SEASON_FILTER_LABEL[filters.season];
  const { provenance, stamped } = await coachProvenance(ctx, ({ name, club }) =>
    buildPatternsCoachPayload({ name, club, rangeLabel, seasonLabel, release, createdAt, views }),
  );

  const { svg, width, height } = renderPatternsCoach({
    rangeLabel,
    seasonLabel,
    views,
    factor,
    release,
    generatedAtLocal: localStamp(now),
    ...(provenance === undefined ? {} : { provenance }),
  });
  const png = await render.svgToPng(svg, width, height);
  const sessions = new Set(PATTERN_VIEWS.flatMap((v) => byView[v].map((p) => p.sessionId))).size;
  return storeCoachImage(ctx, {
    kind: 'patterns',
    png,
    widthPx: width,
    heightPx: height,
    createdAt,
    range: filters.range,
    rendererVersion: PATTERNS_COACH_RENDERER_VERSION,
    // No image data and no GPS: the filters, the session count and what the stamp covers.
    sidecar: { range: filters.range, rangeLabel, season: filters.season, sessions, ...(stamped === null ? {} : { provenance: stamped }) },
  });
}
