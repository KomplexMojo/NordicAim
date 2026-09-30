import { useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { chartGeometry, valueAt, valueToY, type ChartBox } from '@/lib/analysis/chart';
import type { TrendMetric, TrendMetricId, TrendPoint } from '@/lib/analysis/trend';
import type { GoalLogEntry } from '@/lib/domain/goals';
import { currentGoal, goalSeries } from '@/lib/goals/model';
import type { PatternView } from '@/lib/patterns/collect';

const BOX: ChartBox = { width: 320, height: 170, left: 44, right: 12, top: 12, bottom: 28 };
const PLOT_H = BOX.height - BOX.top - BOX.bottom;
/** M28 (goals.md §5): the star sits at the chart's own star, echoing the Goals tab's icon (`TabBar.tsx`). */
const STAR_PATH = 'M12,3 14.12,9.09 20.56,9.22 15.42,13.11 17.29,19.28 12,15.6 6.71,19.28 8.58,13.11 3.44,9.22 9.88,9.09 Z';
const STAR_SCALE = 0.7;

/** One keyboard nudge, in the metric's own unit — chosen for a sensible step, not derived from the axis ticks. */
const KEYBOARD_STEP: Record<TrendMetricId, number> = {
  score: 1,
  group: 0.1,
  rms: 0.5,
  mpiX: 0.5,
  mpiY: 0.5,
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
  view: PatternView;
  metric: TrendMetric;
  trend: TrendPoint[];
  entries: GoalLogEntry[];
  onSetGoal(value: number): Promise<void>;
}

/**
 * goals.md §3–§5: one metric's chart, the same shape as `TrendChart` (analysis.md §4) plus the goal step-line and
 * its own least-squares trend line, and a draggable star (M28) to set the goal — tap or drag anywhere on the plot
 * to place it at that Y position; release to save. Arrow/Page/Home/End keys move it for a keyboard user, Enter
 * saves, Escape cancels: unlike a native range input, a key press only updates a live preview rather than writing
 * a new append-only log entry (goals.md §2) on every step, so the log only grows on an actual release or Enter. A
 * separate component from `TrendChart` on purpose: this stays additive, so the shipped Analysis screen is untouched.
 */
export function GoalChart({ view, metric, trend, entries, onSetGoal }: GoalChartProps) {
  const dataValues = useMemo(() => trend.map((p) => metric.value(p)), [trend, metric]);
  const goalValues = useMemo(() => goalSeries(entries, view, metric.id, trend), [entries, view, metric.id, trend]);
  const domainFrom = useMemo(() => [...dataValues, ...goalValues], [dataValues, goalValues]);
  const data = useMemo(() => chartGeometry(dataValues, BOX, metric.zeroLine, 4, domainFrom), [dataValues, metric.zeroLine, domainFrom]);
  const goal = useMemo(() => chartGeometry(goalValues, BOX, metric.zeroLine, 4, domainFrom), [goalValues, metric.zeroLine, domainFrom]);
  // REV-133/analysis.md §4a: the same least-squares trend line Analysis draws for this metric, carried over here too.
  const fit = metric.trendLine ? data.trend : null;

  const goalNow = currentGoal(entries, view, metric.id);
  const [draft, setDraft] = useState<number | null>(null);
  const [pointerId, setPointerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit(value: number) {
    setSaving(true);
    try {
      await onSetGoal(value);
    } finally {
      setSaving(false);
      setDraft(null);
    }
  }

  function valueFromPointer(e: { clientY: number; currentTarget: Element }): number {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.height <= 0) return draft ?? goalNow?.value ?? data.domain[0];
    const y = BOX.top + ((e.clientY - rect.top) / rect.height) * PLOT_H;
    return valueAt(y, BOX, data.domain);
  }

  function onPlotPointerDown(e: React.PointerEvent<SVGRectElement>) {
    if (saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPointerId(e.pointerId);
    setDraft(valueFromPointer(e));
  }

  function onPlotPointerMove(e: React.PointerEvent<SVGRectElement>) {
    if (e.pointerId !== pointerId) return;
    setDraft(valueFromPointer(e));
  }

  function onPlotPointerUp(e: React.PointerEvent<SVGRectElement>) {
    if (e.pointerId !== pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPointerId(null);
    void commit(valueFromPointer(e));
  }

  function onPlotPointerCancel(e: React.PointerEvent<SVGRectElement>) {
    if (e.pointerId !== pointerId) return;
    setPointerId(null);
    setDraft(null);
  }

  function onPlotKeyDown(e: React.KeyboardEvent<SVGRectElement>) {
    if (saving) return;
    const [lo, hi] = data.domain;
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
    const step = KEYBOARD_STEP[metric.id];
    const base = draft ?? goalNow?.value ?? dataValues.at(-1) ?? (lo + hi) / 2;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        setDraft(clamp(base + step));
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        setDraft(clamp(base - step));
        break;
      case 'PageUp':
        setDraft(clamp(base + step * 5));
        break;
      case 'PageDown':
        setDraft(clamp(base - step * 5));
        break;
      case 'Home':
        setDraft(lo);
        break;
      case 'End':
        setDraft(hi);
        break;
      case 'Enter':
        if (draft !== null) void commit(draft);
        break;
      case 'Escape':
        setDraft(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  function onPlotBlur() {
    if (draft !== null && pointerId === null) void commit(draft);
  }

  const starValue = draft ?? goalNow?.value ?? null;
  const starX = BOX.width - BOX.right;

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
        {draft !== null && (
          <p className="text-xs font-medium text-sky-600" data-testid={`goal-${metric.id}-preview`} aria-live="polite">
            Setting: {metric.format(draft)}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions with this measure in the range.</p>
        ) : (
          <>
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
              {/* goals.md §4: the goal step-line, drawn under the data and trend lines so real shots always read on top. */}
              {goal.path !== '' && (
                <path d={goal.path} fill="none" className="stroke-sky-500" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" data-testid={`goal-${metric.id}-step`} />
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
              {starValue !== null && (
                <g
                  transform={`translate(${starX - 12 * STAR_SCALE} ${valueToY(starValue, BOX, data.domain) - 12 * STAR_SCALE}) scale(${STAR_SCALE})`}
                  className="pointer-events-none"
                  data-testid={`goal-${metric.id}-star`}
                >
                  <path d={STAR_PATH} className="fill-sky-500 stroke-card" strokeWidth={1.5} strokeLinejoin="round" />
                </g>
              )}
              {/* M28 (goals.md §5): tap or drag anywhere in the plot to place/move the star; Enter/arrow keys for a keyboard user. */}
              <rect
                x={BOX.left}
                y={BOX.top}
                width={BOX.width - BOX.left - BOX.right}
                height={PLOT_H}
                fill="transparent"
                className="touch-none cursor-ns-resize outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                tabIndex={0}
                role="slider"
                aria-orientation="vertical"
                aria-label={`${metric.title} goal`}
                aria-valuemin={data.domain[0]}
                aria-valuemax={data.domain[1]}
                aria-valuenow={starValue ?? undefined}
                aria-valuetext={starValue === null ? 'No goal' : metric.format(starValue)}
                data-testid={`goal-${metric.id}-plot`}
                onPointerDown={onPlotPointerDown}
                onPointerMove={onPlotPointerMove}
                onPointerUp={onPlotPointerUp}
                onPointerCancel={onPlotPointerCancel}
                onKeyDown={onPlotKeyDown}
                onBlur={onPlotBlur}
              />
            </svg>
            <p className="text-xs text-muted-foreground">Tap or drag on the chart to set the goal.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
