// analysis.md §5 (REV-124, issue #57): the Analysis coach image as a stored artifact. Storing, pruning and the brand are
// shared with the Patterns and Goals coach images (`coach-store.ts`, REV-163).

import { coachTrends } from '@/lib/analysis/coach';
import { PATTERN_RANGE_LABEL, PATTERN_VIEWS, filterByRange, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { summarizePatterns } from '@/lib/patterns/summarize';
import { buildTrendsPayload } from '@/lib/provenance/payload-trends';
import { patternsSizeFactor } from '@/lib/render/patterns';
import type { RenderTools } from '@/lib/render/rasterize-browser';
import { renderTrendsSheet, TRENDS_RENDERER_VERSION, type TrendsSheetInput } from '@/lib/render/trends-sheet';
import type { ServiceContext } from '@/lib/services/context';
import { loadPatterns } from '@/lib/services/patterns';

import { coachProvenance, KEEP_COACH_IMAGES, localStamp, storeCoachImage, type TrendsArtifact } from './coach-store';

export type { TrendsArtifact } from './coach-store';

export class EmptyTrendsError extends Error {
  constructor() {
    super('No shots in this range to make a trends image from');
    this.name = 'EmptyTrendsError';
  }
}

/** The newest this many coach images are kept; older ones are deleted when a new one is stored. */
export const KEEP_TRENDS_IMAGES = KEEP_COACH_IMAGES;

/**
 * §5: renders the coach image for the Analysis screen's range, stores it, prunes to the newest three, and returns it with
 * its PNG, ready for `shareArtifact`. Throws `EmptyTrendsError` when the range has no shots in any view.
 */
export async function buildTrendsImage(
  ctx: ServiceContext,
  range: PatternRange,
  render: RenderTools,
  release = 'dev',
): Promise<{ artifact: TrendsArtifact; png: Blob }> {
  const loaded = await loadPatterns(ctx);
  const byView = Object.fromEntries(PATTERN_VIEWS.map((v) => [v, filterByRange(loaded.data.points[v], range)])) as Record<
    PatternView,
    ReturnType<typeof filterByRange>
  >;
  if (PATTERN_VIEWS.every((v) => byView[v].length === 0)) throw new EmptyTrendsError();

  const kindOf = (v: PatternView) => (v.startsWith('precision') ? ('precision' as const) : ('sighting' as const));
  const views = Object.fromEntries(PATTERN_VIEWS.map((v) => [v, { points: byView[v], summary: summarizePatterns(byView[v], kindOf(v)) }])) as TrendsSheetInput['views'];
  // The same size as the Patterns screen: worked out from every recorded shot, not the range.
  const factor = patternsSizeFactor(PATTERN_VIEWS.map((v) => ({ kind: kindOf(v), points: loaded.data.points[v] })));
  const trends = coachTrends(byView);

  const now = ctx.now();
  const createdAt = now.toISOString();
  const rangeLabel = PATTERN_RANGE_LABEL[range];
  const { provenance, stamped } = await coachProvenance(ctx, ({ name, club }) => buildTrendsPayload({ name, club, rangeLabel, release, createdAt, trends }));

  const { svg, width, height } = renderTrendsSheet({
    rangeLabel,
    views,
    factor,
    trends,
    release,
    generatedAtLocal: localStamp(now),
    ...(provenance === undefined ? {} : { provenance }),
  });
  const png = await render.svgToPng(svg, width, height);
  return storeCoachImage(ctx, {
    kind: 'trends',
    png,
    widthPx: width,
    heightPx: height,
    createdAt,
    range,
    rendererVersion: TRENDS_RENDERER_VERSION,
    // No image data and no GPS: the range, the session count and what the stamp covers.
    sidecar: { range, rangeLabel, sessions: trends.sessions.length, ...(stamped === null ? {} : { provenance: stamped }) },
  });
}
