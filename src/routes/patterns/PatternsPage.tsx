import { useMemo, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router';

import { ObservedPatterns } from '@/components/results/ObservedPatterns';
import { PatternHeader } from '@/components/patterns/PatternHeader';
import { RangeShowing } from '@/components/patterns/RangeShowing';
import { TargetLinks } from '@/components/patterns/TargetLinks';
import { SeasonFilter } from '@/components/patterns/SeasonFilter';
import { ViewRangeControls } from '@/components/patterns/ViewRangeControls';
import { Card, CardContent } from '@/components/ui/card';
import { ZoomFrame } from '@/components/ui/zoom-frame';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import type { SeasonFilter as SeasonFilterValue } from '@/lib/domain/season';
import { PATTERN_VIEWS, PATTERN_VIEW_LABEL, filterByRange, filterBySeason, type PatternRange, type PatternView } from '@/lib/patterns/collect';
import { characterize } from '@/lib/scoring/characteristics';
import { summarizePatterns, THIN_SHOT_COUNT } from '@/lib/patterns/summarize';
import { PATTERNS_SIZE, patternsPxToMm, patternsScale, patternsSizeFactor, renderPatternsSvg } from '@/lib/render/patterns';
import { pickTargets, TAP_RADIUS_CSS_PX, type TargetRef } from '@/lib/patterns/pick';
import { parseViewRange, viewRangeSearch } from '@/lib/patterns/url';
import { loadPatterns } from '@/lib/services/patterns';
import { formatMm } from '@/lib/scoring/format';
import { missLabel } from '@/lib/ui/panel-labels';

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Route `#/patterns` (patterns.md §6): every recorded shot on each kind of target. View-only. */
export function PatternsPage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => loadPatterns(ctx), [ctx]);
  // Issue #72: the view and range live in the address, so Back from a target opened here returns to them.
  const [params, setParams] = useSearchParams();
  const { view, range, season } = parseViewRange(params);
  // The targets under the last tap on the drawing (null: nothing tapped), cleared when the view or range changes.
  const [picked, setPicked] = useState<{ key: string; refs: TargetRef[] } | null>(null);
  const viewKey = viewRangeSearch(view, range, season);
  const setView = (v: PatternView) => setParams(viewRangeSearch(v, range, season), { replace: true });
  const setRange = (r: PatternRange) => setParams(viewRangeSearch(view, r, season), { replace: true });
  const setSeason = (s: SeasonFilterValue) => setParams(viewRangeSearch(view, range, s), { replace: true });
  const from = { path: `/patterns?${viewKey}`, label: 'Back to Patterns' };

  const kind = view.startsWith('precision') ? 'precision' : 'sighting';
  const position = view === 'precision-standing' ? 'standing' : 'prone';
  const shown = useMemo(
    // REV-154/156: the season first, so "Last 5" under Winter is the last five winter sessions.
    () => (value === undefined ? [] : filterByRange(filterBySeason(value.data.points[view], season), range)),
    [value, view, range, season],
  );
  const summary = useMemo(() => summarizePatterns(shown, kind), [shown, kind]);
  // REV-88: the observed patterns are worked out over the whole set of shots on screen, as one group.
  const observed = useMemo(
    () =>
      value === undefined
        ? null
        : characterize(shown, {
            handedness: value.handedness,
            position,
            holeDiameterMm: value.holeDiameterMm,
          }),
    [shown, value, position],
  );
  // One size for all four views, worked out from every shot ever recorded (patterns.md §5).
  const factor = useMemo(
    () =>
      value === undefined
        ? 1
        : patternsSizeFactor(PATTERN_VIEWS.map((v) => ({ kind: v.startsWith('precision') ? ('precision' as const) : ('sighting' as const), points: value.data.points[v] }))),
    [value],
  );
  const svg = useMemo(() => renderPatternsSvg({ kind, points: shown, summary, factor }), [kind, shown, summary, factor]);

  /** Issue #72: a tap on the drawing lists the targets of the shots under it (a 44 px target, whatever the zoom). */
  function onDrawingClick(e: MouseEvent<HTMLDivElement>) {
    const svgEl = e.currentTarget.querySelector('svg');
    if (svgEl === null) return;
    const box = svgEl.getBoundingClientRect();
    if (box.width === 0) return;
    const unitsPerCssPx = PATTERNS_SIZE / box.width;
    const at = patternsPxToMm(kind, factor, (e.clientX - box.left) * unitsPerCssPx, (e.clientY - box.top) * unitsPerCssPx);
    const radiusMm = (TAP_RADIUS_CSS_PX * unitsPerCssPx) / patternsScale(kind, factor);
    setPicked({ key: viewKey, refs: pickTargets(shown, at.xMm, at.yMm, radiusMm) });
  }
  const pickedRefs = picked !== null && picked.key === viewKey ? picked.refs : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      {/* REV-136: a tab now, so no Home link of its own: Sessions is the tab beside it. */}
      <h1 className="text-xl font-semibold">Patterns</h1>

      <ViewRangeControls view={view} range={range} onView={setView} onRange={setRange} testIdPrefix="pattern" />
      <SeasonFilter season={season} onSeason={setSeason} testIdPrefix="pattern" />
      {value !== undefined && <RangeShowing range={range} season={season} sessions={summary.sessions} onSeason={setSeason} testIdPrefix="pattern" />}

      {loading && value === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1">
            <Card>
              <PatternHeader view={view} kind={kind} summary={summary} />
              <CardContent>
                <ZoomFrame maxHeight="80vh" controlsCorner="bottom-right">
                  <div
                    data-testid="patterns-drawing"
                    data-shots={shown.length}
                    className="w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    role="img"
                    aria-label={`${PATTERN_VIEW_LABEL[view]}: ${shown.length} shots`}
                    // Generated by our own pure renderer from numbers and constants only.
                    dangerouslySetInnerHTML={{ __html: svg }}
                    onClick={onDrawingClick}
                  />
                </ZoomFrame>
                {pickedRefs !== null && (
                  <div className="mt-3">
                    <TargetLinks refs={pickedRefs} from={from} onClose={() => setPicked(null)} testId="patterns-targets" />
                  </div>
                )}
                {pickedRefs === null && shown.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Tap a dot to open the target it came from.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3 lg:w-80">
          <ObservedPatterns
            characteristics={observed}
            scope={`Worked out over all ${shown.length} shots shown, as one group.`}
            missLabel={missLabel(position)}
          />
          <section className="flex flex-col gap-1 text-sm" aria-label="Summary" data-testid="patterns-summary">
            <p className="font-medium" data-testid="patterns-counts">
              {summary.shots} {summary.shots === 1 ? 'shot' : 'shots'} · {summary.targets}{' '}
              {summary.targets === 1 ? 'target' : 'targets'} · {summary.sessions}{' '}
              {summary.sessions === 1 ? 'session' : 'sessions'}
            </p>
            {summary.shots === 0 ? (
              <p className="text-muted-foreground">No shots here yet.</p>
            ) : (
              <>
                {summary.thin && (
                  <p className="text-muted-foreground" data-testid="patterns-thin">
                    Patterns need more shots (at least {THIN_SHOT_COUNT}).
                  </p>
                )}
                {summary.mpiOffset !== null && (
                  <p>
                    Mean point of impact: {formatMm(Math.abs(summary.mpiOffset.xMm))} mm {summary.mpiOffset.xMm >= 0 ? 'right' : 'left'},{' '}
                    {formatMm(Math.abs(summary.mpiOffset.yMm))} mm {summary.mpiOffset.yMm >= 0 ? 'high' : 'low'}
                  </p>
                )}
                {summary.extremeSpreadMm !== null && <p>Widest spread: {formatMm(summary.extremeSpreadMm)} mm</p>}
                {summary.averageRing !== null && <p>Average ring: {summary.averageRing.toFixed(2)}</p>}
                {summary.ringCounts !== null && (
                  <p className="text-xs text-muted-foreground" data-testid="patterns-rings">
                    {summary.ringCounts
                      .map((n, ring) => ({ n, ring }))
                      .reverse()
                      .filter(({ n }) => n > 0)
                      .map(({ n, ring }) => `${ring}: ${percent(n / summary.shots)}`)
                      .join(' · ')}
                  </p>
                )}
                {summary.zoneHitShare !== null && <p>In the hit zone: {percent(summary.zoneHitShare)}</p>}
              </>
            )}
            {value !== undefined && value.data.leftOut > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="patterns-left-out">
                {value.data.leftOut} {value.data.leftOut === 1 ? 'target' : 'targets'} left out (not analysed, or alignment not
                confirmed).
              </p>
            )}
          </section>
          </div>
        </div>
      )}
    </main>
  );
}
