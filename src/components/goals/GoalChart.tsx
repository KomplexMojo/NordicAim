import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { chartGeometry, type ChartBox } from '@/lib/analysis/chart';
import type { TrendMetric, TrendPoint } from '@/lib/analysis/trend';
import type { GoalLogEntry } from '@/lib/domain/goals';
import { currentGoal, goalSeries } from '@/lib/goals/model';
import type { PatternView } from '@/lib/patterns/collect';

const BOX: ChartBox = { width: 320, height: 170, left: 44, right: 12, top: 12, bottom: 28 };

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
 * goals.md §3, §4: one metric's chart, the same shape as `TrendChart` (analysis.md §4), plus the goal step-line and
 * a numeric way to set it (§5 — the drag-a-star gesture is M28). A separate component from `TrendChart` on purpose:
 * this milestone is additive, so the already-shipped Analysis screen is never touched.
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setDraft(goalNow === null ? '' : String(goalNow.value));
    setEditing(true);
  }

  async function save() {
    const value = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(value)) return;
    setSaving(true);
    try {
      await onSetGoal(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

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
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions with this measure in the range.</p>
        ) : (
          <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="h-auto w-full" role="img" aria-label={`${metric.title} over ${data.points.length} sessions, with its goal`}>
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
          </svg>
        )}
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              autoFocus
              className="h-11 flex-1"
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') setEditing(false);
              }}
              aria-label={`${metric.title} goal, in ${metric.unit}`}
              data-testid={`goal-${metric.id}-input`}
            />
            <Button className="h-11" disabled={saving || draft.trim() === ''} onClick={() => void save()} data-testid={`goal-${metric.id}-save`}>
              Save
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="h-11 self-start" onClick={startEditing} data-testid={`goal-${metric.id}-set`}>
            {goalNow === null ? 'Set goal' : 'Change goal'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
