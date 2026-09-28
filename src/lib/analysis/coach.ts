// analysis.md §5 (REV-124, issue #57): the numbers behind the coach image. Every metric shares one session axis — every session
// that has shots in any view, oldest first — and carries one series per view; the stamp covers these, and the image draws each
// view's averages over them (`coachAverages`, REV-131). Pure: no clock, no storage.

import { PATTERN_VIEWS, type PatternPoint, type PatternView } from '../patterns/collect';

import { sessionTrend, trendMetrics, type TrendMetricId, type TrendPoint } from './trend';

export interface CoachSession {
  sessionId: string;
  sessionDate: string;
  sessionStamp: string;
}

export interface CoachMetric {
  id: TrendMetricId;
  title: string;
  unit: string;
  zeroLine: boolean;
  format(value: number): string;
  /** One series per view, each aligned to `sessions` (null where the view has no value that session). */
  series: Array<{ view: PatternView; values: Array<number | null> }>;
}

export interface CoachTrends {
  sessions: CoachSession[];
  metrics: CoachMetric[];
}

const COACH_TITLE: Record<TrendMetricId, string> = {
  score: 'Score (precision: average ring %, sighting: hit rate %)',
  group: 'Group size (MOA at 50 m, mean per target)',
  rms: 'Accuracy (RMS distance from the centre, mm)',
  mpiX: 'MPI left / right (mm, above 0 is right)',
  mpiY: 'MPI up / down (mm, above 0 is high)',
};

function kindOf(view: PatternView): 'precision' | 'sighting' {
  return view.startsWith('precision') ? 'precision' : 'sighting';
}

function order(a: CoachSession, b: CoachSession): number {
  return a.sessionDate === b.sessionDate ? a.sessionStamp.localeCompare(b.sessionStamp) : a.sessionDate.localeCompare(b.sessionDate);
}

/** §5: the session axis and, per metric, one aligned series per view. `pointsByView` is already filtered to the range. */
export function coachTrends(pointsByView: Record<PatternView, PatternPoint[]>): CoachTrends {
  const perView = new Map<PatternView, Map<string, TrendPoint>>();
  const sessions = new Map<string, CoachSession>();
  for (const view of PATTERN_VIEWS) {
    const trend = sessionTrend(pointsByView[view], kindOf(view));
    perView.set(view, new Map(trend.map((t) => [t.sessionId, t])));
    for (const t of trend) sessions.set(t.sessionId, { sessionId: t.sessionId, sessionDate: t.sessionDate, sessionStamp: t.sessionStamp });
  }
  const axis = [...sessions.values()].sort(order);
  // The precision definitions carry every metric's value and unit; the score's meaning per view is in the title.
  const metrics = trendMetrics('precision').map((m) => ({
    id: m.id,
    title: COACH_TITLE[m.id],
    unit: m.unit,
    zeroLine: m.zeroLine,
    format: m.format,
    series: PATTERN_VIEWS.map((view) => ({
      view,
      values: axis.map((s) => {
        const point = perView.get(view)!.get(s.sessionId);
        return point === undefined ? null : m.value(point);
      }),
    })),
  }));
  return { sessions: axis, metrics };
}

/** §5 (REV-131): one view's averages over the range, each session counted once (the mean of its session values). */
export interface CoachAverages {
  view: PatternView;
  /** Sessions in the range with shots in this view. */
  sessions: number;
  values: Record<TrendMetricId, number | null>;
}

/**
 * §5 (REV-131): what the coach image shows instead of the charts: per view, the average of every metric over the sessions
 * that have a value, and one MPI scale for every MPI box, so an icon's place means the same in each.
 */
export function coachAverages(trends: CoachTrends): { views: CoachAverages[]; mpiScaleMm: number } {
  const views = PATTERN_VIEWS.map((view) => {
    const values = {} as Record<TrendMetricId, number | null>;
    let sessions = 0;
    for (const m of trends.metrics) {
      const present = (m.series.find((s) => s.view === view)?.values ?? []).filter((v): v is number => v !== null);
      values[m.id] = present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
      if (m.id === 'mpiX') sessions = present.length;
    }
    return { view, sessions, values };
  });
  const offsets = views.flatMap((v) => [v.values.mpiX, v.values.mpiY]).filter((v): v is number => v !== null);
  return { views, mpiScaleMm: mpiScale(offsets.length === 0 ? 0 : Math.max(...offsets.map(Math.abs))) };
}

/** The MPI boxes' half-width: the first of these at least 15% past the largest offset, so no icon sits on the edge. */
export const MPI_SCALES_MM = [5, 10, 20, 50, 100, 200, 500] as const;

export function mpiScale(largestMm: number): number {
  return MPI_SCALES_MM.find((s) => s >= largestMm * 1.15) ?? 500;
}
