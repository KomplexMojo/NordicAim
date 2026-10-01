import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { chartGeometry, valueToY, type ChartBox } from '@/lib/analysis/chart';
import type { TrendMetric, TrendPoint } from '@/lib/analysis/trend';
import type { GoalLogEntry, GoalMetric, GoalView } from '@/lib/domain/goals';
import { cn } from '@/lib/utils';
import { currentGoal, goalProgress } from '@/lib/goals/model';

const BOX: ChartBox = { width: 320, height: 170, left: 44, right: 12, top: 12, bottom: 28 };

/**
 * One arrow-button step, in the metric's own unit — chosen for a sensible step, not derived from the axis ticks.
 * Only the goal-able metrics (`GoalMetric`, `domain/goals.ts`): MPI's two axes were removed from Goals (owner,
 * 2026-09-30).
 */
const STEP: Record<GoalMetric, number> = {
  score: 1,
  group: 0.1,
  rms: 0.5,
};

/**
 * Sane floor/ceiling for a stepped value — deliberately *not* the chart's own visible `domain`: that's sized to
 * whatever's plotted right now (for one session, exactly `[dataValue, currentGoal]`), so clamping to it would stop
 * "up" from ever going further up once the goal reaches the data value, the moment it's set (found via an e2e test
 * that kept clicking up and watching the value refuse to move past its own starting point).
 */
const BOUNDS: Record<GoalMetric, [number, number]> = {
  score: [0, 100],
  group: [0, Infinity],
  rms: [0, Infinity],
};

/** `YYYY-MM-DD` -> `Sep 21` (the axis is sessions in order; the date names each end). */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function tickLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 1 ? 2 : 1);
}

interface GoalChartProps {
  view: GoalView;
  metric: TrendMetric & { id: GoalMetric };
  trend: TrendPoint[];
  entries: GoalLogEntry[];
  onSetGoal(value: number): Promise<void>;
}

/**
 * goals.md §3–§5: one metric's chart over every session, the same shape as `TrendChart` (analysis.md §4) plus its
 * least-squares trend line, one horizontal line for the current goal (no history: owner, 2026-10-01), whether the
 * sessions since it was set average out at or past it, and up/down buttons beside the chart that step the goal and
 * save immediately. A separate component from `TrendChart` on purpose: the shipped Analysis screen is untouched.
 */
export function GoalChart({ view, metric, trend, entries, onSetGoal }: GoalChartProps) {
  const dataValues = useMemo(() => trend.map((p) => metric.value(p)), [trend, metric]);
  const goalNow = useMemo(() => currentGoal(entries, view, metric.id), [entries, view, metric.id]);
  const progress = useMemo(
    () => (goalNow === null ? null : goalProgress(goalNow, metric.id, trend, metric.value)),
    [goalNow, metric, trend],
  );
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const lineValue = draft ?? goalNow?.value ?? null;

  // The goal joins the axis so its line stays on the chart even when it sits outside every session's value.
  const domainFrom = useMemo(() => [...dataValues, lineValue], [dataValues, lineValue]);
  const data = useMemo(() => chartGeometry(dataValues, BOX, metric.zeroLine, 4, domainFrom), [dataValues, metric.zeroLine, domainFrom]);
  // REV-133/analysis.md §4a: the same least-squares trend line Analysis draws for this metric, carried over here too.
  const fit = metric.trendLine ? data.trend : null;

  async function step(direction: 1 | -1) {
    if (saving) return;
    const [lo, hi] = BOUNDS[metric.id];
    const base = draft ?? goalNow?.value ?? dataValues.at(-1) ?? 0;
    const next = Math.min(hi, Math.max(lo, base + direction * STEP[metric.id]));
    setDraft(next); // moves the line immediately; the save below is the async round trip.
    setSaving(true);
    try {
      await onSetGoal(next);
    } finally {
      setSaving(false);
      setDraft(null);
    }
  }

  const [lo, hi] = BOUNDS[metric.id];
  const atUpBound = lineValue !== null && lineValue >= hi;
  const atLowBound = lineValue !== null && lineValue <= lo;

  return (
    <Card data-testid={`goal-${metric.id}`} data-has-goal={goalNow !== null}>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          <span>{metric.title}</span>
          <span className="text-sm font-medium tabular-nums" data-testid={`goal-${metric.id}-value`}>
            {goalNow === null ? 'No goal' : `Goal: ${metric.format(goalNow.value)}`}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{metric.note}</p>
        {fit !== null && (
          <p className="text-xs text-muted-foreground" data-testid={`goal-${metric.id}-slope`}>
            <svg viewBox="0 0 20 6" className="mr-1 inline-block h-1.5 w-5 align-middle" aria-hidden="true">
              <line x1={0} y1={3} x2={20} y2={3} className="stroke-foreground" strokeWidth={2} strokeDasharray="5 3" />
            </svg>
            Trend: {metric.formatChange(fit.slope)}
          </p>
        )}
        {progress !== null && (
          <p
            className="text-sm tabular-nums"
            data-testid={`goal-${metric.id}-status`}
            data-hit={progress.hit === null ? 'pending' : String(progress.hit)}
          >
            {progress.average === null ? (
              <span className="text-muted-foreground">No sessions since this goal was set</span>
            ) : (
              <>
                <span className="text-muted-foreground">
                  Average since set: {metric.format(progress.average)} over {progress.sessions}{' '}
                  {progress.sessions === 1 ? 'session' : 'sessions'} ·{' '}
                </span>
                <span className={cn('font-semibold', progress.hit ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
                  {progress.hit ? 'Hit' : 'Not yet'}
                </span>
              </>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions with this measure yet.</p>
        ) : (
          <div className="flex items-stretch gap-2">
            <div className="flex flex-col items-center justify-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                disabled={saving || atUpBound}
                aria-label={`Raise the ${metric.title} goal by ${metric.format(STEP[metric.id])}`}
                data-testid={`goal-${metric.id}-up`}
                onClick={() => void step(1)}
              >
                ▲
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                disabled={saving || atLowBound}
                aria-label={`Lower the ${metric.title} goal by ${metric.format(STEP[metric.id])}`}
                data-testid={`goal-${metric.id}-down`}
                onClick={() => void step(-1)}
              >
                ▼
              </Button>
            </div>
            <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="h-auto w-full select-none" role="img" aria-label={`${metric.title} over ${data.points.length} sessions, with its goal`}>
              {data.yTicks.map((t) => (
                <g key={t.value}>
                  <line x1={BOX.left} x2={BOX.width - BOX.right} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
                  <text x={BOX.left - 6} y={t.y + 4} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                    {tickLabel(t.value)}
                  </text>
                </g>
              ))}
              {data.zeroY !== null && <line x1={BOX.left} x2={BOX.width - BOX.right} y1={data.zeroY} y2={data.zeroY} className="stroke-muted-foreground" strokeWidth={1} />}
              <text x={data.points[0]!.x} y={BOX.height - 8} textAnchor={data.points.length === 1 ? 'middle' : 'start'} className="fill-muted-foreground text-[10px]">
                {shortDate(trend[data.points[0]!.index]!.sessionDate)}
              </text>
              {data.points.length > 1 && (
                <text x={data.points.at(-1)!.x} y={BOX.height - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {shortDate(trend[data.points.at(-1)!.index]!.sessionDate)}
                </text>
              )}
              <path d={data.path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {fit !== null && (
                <line
                  x1={fit.x1}
                  y1={fit.y1}
                  x2={fit.x2}
                  y2={fit.y2}
                  className="stroke-foreground"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  strokeLinecap="round"
                  data-testid={`goal-${metric.id}-line`}
                />
              )}
              {data.points.map((p) => (
                <circle key={p.index} cx={p.x} cy={p.y} r={4} className="fill-primary stroke-card" strokeWidth={2} />
              ))}
              {/* goals.md §4: the current goal, solid and full-width. */}
              {lineValue !== null && (
                <line
                  x1={BOX.left}
                  x2={BOX.width - BOX.right}
                  y1={valueToY(lineValue, BOX, data.domain)}
                  y2={valueToY(lineValue, BOX, data.domain)}
                  className="stroke-sky-500"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  data-testid={`goal-${metric.id}-indicator`}
                />
              )}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
