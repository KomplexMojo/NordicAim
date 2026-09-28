// analysis.md §5 (REV-124, issue #57): the numbers behind the coach image. Every metric shares one session axis — every session
// that has shots in any view, oldest first — and carries one series per view; the stamp covers these, and the image draws each
// view's averages over them (`coachAverages`, REV-131). Pure: no clock, no storage.

import { PATTERN_VIEWS, type PatternPoint, type PatternView } from '../patterns/collect';

import { leastSquares } from './chart';
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
  /** REV-132: each box's trend over the range; null below `MIN_TREND_SESSIONS` sessions with a value. */
  trends: Record<AverageBox, CoachTrend | null>;
  /**
   * REV-133: each session's MPI, oldest first. The average MPI is the bias to dial out, but sessions that sit on alternate sides
   * average to about 0, so the box also shows where each one sat.
   */
  mpiSessions: Array<{ xMm: number; yMm: number }>;
  /** REV-133: the mean of each session's MPI distance from the centre, whichever way: how far off a session typically sits. */
  mpiTypicalMm: number | null;
}

/** The boxes on the coach image: three numbers and the MPI (whose trend is its distance from the centre). */
export type AverageBox = 'score' | 'group' | 'rms' | 'mpi';

export interface CoachTrend {
  direction: 'up' | 'flat' | 'down';
  /** Whether the direction is an improvement: up for the score, down for the others; null when flat. */
  improving: boolean | null;
}

/**
 * REV-132: a change smaller than this is flat. The fitted change across the range (slope × sessions spanned) must reach 5% of
 * the average, and at least a floor in the box's unit, so a wobble never shows as a trend.
 */
export const FLAT_SHARE = 0.05;
export const FLAT_FLOOR: Record<AverageBox, number> = { score: 1, group: 0.02, rms: 0.5, mpi: 0.5 };

export function trendOf(box: AverageBox, values: Array<number | null>): CoachTrend | null {
  const fit = leastSquares(values);
  if (fit === null) return null;
  const present = values.filter((v): v is number => v !== null);
  const average = present.reduce((a, b) => a + b, 0) / present.length;
  const change = fit.slope * (fit.last - fit.first);
  if (Math.abs(change) < Math.max(FLAT_SHARE * Math.abs(average), FLAT_FLOOR[box])) return { direction: 'flat', improving: null };
  const direction = change > 0 ? 'up' : 'down';
  return { direction, improving: box === 'score' ? direction === 'up' : direction === 'down' };
}

/**
 * §5 (REV-131): what the coach image shows instead of the charts: per view, the average of every metric over the sessions
 * that have a value, and one MPI scale for every MPI box, so an icon's place means the same in each.
 */
export function coachAverages(trends: CoachTrends): { views: CoachAverages[]; mpiScaleMm: number } {
  const views = PATTERN_VIEWS.map((view) => {
    const values = {} as Record<TrendMetricId, number | null>;
    const series = {} as Record<TrendMetricId, Array<number | null>>;
    let sessions = 0;
    for (const m of trends.metrics) {
      series[m.id] = m.series.find((s) => s.view === view)?.values ?? [];
      const present = series[m.id].filter((v): v is number => v !== null);
      values[m.id] = present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
      if (m.id === 'mpiX') sessions = present.length;
    }
    // The MPI's trend is its distance from the centre, session by session: up is drifting away, down is closing in.
    const distance = series.mpiX.map((x, i) => {
      const y = series.mpiY[i];
      return x === null || y === null || y === undefined ? null : Math.hypot(x, y);
    });
    const mpiSessions = series.mpiX.flatMap((x, i) => {
      const y = series.mpiY[i];
      return x === null || y === null || y === undefined ? [] : [{ xMm: x, yMm: y }];
    });
    const mpiTypicalMm = mpiSessions.length === 0 ? null : mpiSessions.reduce((t, p) => t + Math.hypot(p.xMm, p.yMm), 0) / mpiSessions.length;
    const boxTrends: Record<AverageBox, CoachTrend | null> = {
      score: trendOf('score', series.score),
      group: trendOf('group', series.group),
      rms: trendOf('rms', series.rms),
      mpi: trendOf('mpi', distance),
    };
    return { view, sessions, values, trends: boxTrends, mpiSessions, mpiTypicalMm };
  });
  // The scale fits every session's MPI as well as the averages, so no session's dot falls off the box.
  const offsets = views.flatMap((v) => v.mpiSessions.flatMap((p) => [p.xMm, p.yMm]));
  return { views, mpiScaleMm: mpiScale(offsets.length === 0 ? 0 : Math.max(...offsets.map(Math.abs))) };
}

/** The MPI boxes' half-width: the first of these at least 15% past the largest offset, so no icon sits on the edge. */
export const MPI_SCALES_MM = [5, 10, 15, 20, 25] as const;

/**
 * REV-134 (owner 2026-09-28): the scale stops at ±25 mm. An average drift of 25 mm is already a large one, and a wider box
 * only crowds everything that matters near the centre; an MPI past it is pinned to the edge (the words still give its value).
 */
export const MPI_SCALE_MAX_MM = 25;

export function mpiScale(largestMm: number): number {
  return MPI_SCALES_MM.find((s) => s >= largestMm * 1.15) ?? MPI_SCALE_MAX_MM;
}
