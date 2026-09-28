// analysis.md §2–§3 (REV-123, issue #57): how a Patterns view trends over time — one data point per session. Pure: no
// clock, no storage. The shots are the same ones Patterns shows (`collectPatterns`, `filterByRange`), grouped by session.

import type { PatternPoint } from '../patterns/collect';
import { patternsScorePercent, summarizePatterns } from '../patterns/summarize';
import { accuracyRmse, angular, extremeSpread, mpi } from '../scoring/groups';

/** geometry-scoring.md: biathlon is shot at 50 m, the distance every angular size in the app is read at. */
const DISTANCE_MM = 50_000;

export interface TrendPoint {
  sessionId: string;
  /** `YYYY-MM-DD`. */
  sessionDate: string;
  sessionStamp: string;
  targets: number;
  /** Issue #72: the session's targets of this view, in the order their shots came, so a point can open them. */
  photoIds: string[];
  shots: number;
  /** §3: the Patterns score star over this session's shots, 0..100. */
  scorePercent: number | null;
  /** §3: the mean of each target's extreme spread, in MOA; null when no target has two distinct shots. */
  groupMoa: number | null;
  /** §3 (REV-128): accuracy, the root-mean-square distance of every shot in the session from the bullseye, mm (REV-60). */
  rmsMm: number | null;
  /** §3: the session's mean point of impact, mm from the centre (+x right, +y up). */
  mpiXMm: number | null;
  mpiYMm: number | null;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** §2: one point per session with shots in `points`, oldest first (session date, then creation time). */
export function sessionTrend(points: PatternPoint[], kind: 'precision' | 'sighting'): TrendPoint[] {
  const bySession = new Map<string, PatternPoint[]>();
  for (const p of points) {
    const list = bySession.get(p.sessionId) ?? [];
    list.push(p);
    bySession.set(p.sessionId, list);
  }
  const trend: TrendPoint[] = [];
  for (const [sessionId, shots] of bySession) {
    const first = shots[0]!;
    const byTarget = new Map<string, PatternPoint[]>();
    for (const p of shots) byTarget.set(p.photoId, [...(byTarget.get(p.photoId) ?? []), p]);
    const spreads: number[] = [];
    for (const targetShots of byTarget.values()) {
      const moa = angular(extremeSpread(targetShots), DISTANCE_MM)?.moa;
      if (moa !== undefined) spreads.push(moa);
    }
    const centre = mpi(shots);
    trend.push({
      sessionId,
      sessionDate: first.sessionDate,
      sessionStamp: first.sessionStamp,
      targets: byTarget.size,
      photoIds: [...byTarget.keys()],
      shots: shots.length,
      scorePercent: patternsScorePercent(summarizePatterns(shots, kind), kind),
      groupMoa: mean(spreads),
      rmsMm: accuracyRmse(shots),
      mpiXMm: centre?.xMm ?? null,
      mpiYMm: centre?.yMm ?? null,
    });
  }
  return trend.sort((a, b) =>
    a.sessionDate === b.sessionDate ? a.sessionStamp.localeCompare(b.sessionStamp) : a.sessionDate.localeCompare(b.sessionDate),
  );
}

export type TrendMetricId = 'score' | 'group' | 'rms' | 'mpiX' | 'mpiY';

export interface TrendMetric {
  id: TrendMetricId;
  title: string;
  /** What a higher value means, shown under the title. */
  note: string;
  unit: string;
  /** Draw a zero line: the metric is signed around a target of 0. */
  zeroLine: boolean;
  /**
   * REV-133: whether the chart draws a trend line (§4a). Not for the MPI charts: they plot a signed position, so a line through 0
   * cannot tell swapping sides from closing in; closeness is the Accuracy chart's.
   */
  trendLine: boolean;
  value(point: TrendPoint): number | null;
  format(value: number): string;
  /** §4a (REV-129): the trend line's change per session, signed, with its unit. */
  formatChange(slope: number): string;
}

function change(decimals: number, unit: string): (slope: number) => string {
  return (slope) => {
    const r = Number(slope.toFixed(decimals));
    const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
    return `${sign}${Math.abs(r).toFixed(decimals)}${unit === '%' ? '%' : ` ${unit}`} per session`;
  };
}

/** §3: the charts, in order. The score's meaning depends on the target kind. */
export function trendMetrics(kind: 'precision' | 'sighting'): TrendMetric[] {
  // An offset that rounds to 0.0 mm has no side: it reads "centred", not "0.0 mm right".
  const signed = (v: number, pos: string, neg: string) =>
    Math.abs(v) < 0.05 ? 'centred' : `${Math.abs(v).toFixed(1)} mm ${v >= 0 ? pos : neg}`;
  return [
    {
      id: 'score',
      title: kind === 'precision' ? 'Score' : 'Hit rate',
      note: kind === 'precision' ? 'Average ring, as a percentage of 10' : 'Share of shots in the hit zone',
      unit: '%',
      zeroLine: false,
      trendLine: true,
      value: (p) => p.scorePercent,
      format: (v) => `${Math.round(v)}%`,
      formatChange: change(1, '%'),
    },
    {
      id: 'group',
      title: 'Group size',
      note: 'Widest spread per target, in MOA at 50 m; lower is tighter',
      unit: 'MOA',
      zeroLine: false,
      trendLine: true,
      value: (p) => p.groupMoa,
      format: (v) => `${v.toFixed(2)} MOA`,
      formatChange: change(2, 'MOA'),
    },
    {
      id: 'rms',
      title: 'Accuracy (RMS)',
      note: 'Root-mean-square distance of every shot from the centre, in mm; lower is closer',
      unit: 'mm',
      zeroLine: false,
      trendLine: true,
      value: (p) => p.rmsMm,
      format: (v) => `${v.toFixed(1)} mm`,
      formatChange: change(1, 'mm'),
    },
    {
      id: 'mpiX',
      title: 'MPI left / right',
      note: 'Mean point of impact; 0 is centred, above 0 is right',
      unit: 'mm',
      zeroLine: true,
      trendLine: false,
      value: (p) => p.mpiXMm,
      format: (v) => signed(v, 'right', 'left'),
      formatChange: change(1, 'mm'),
    },
    {
      id: 'mpiY',
      title: 'MPI up / down',
      note: 'Mean point of impact; 0 is centred, above 0 is high',
      unit: 'mm',
      zeroLine: true,
      trendLine: false,
      value: (p) => p.mpiYMm,
      format: (v) => signed(v, 'high', 'low'),
      formatChange: change(1, 'mm'),
    },
  ];
}
