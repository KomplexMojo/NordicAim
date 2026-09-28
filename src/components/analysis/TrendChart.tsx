import { useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { chartGeometry, type ChartBox } from '@/lib/analysis/chart';
import type { TrendMetric, TrendPoint } from '@/lib/analysis/trend';

const BOX: ChartBox = { width: 320, height: 170, left: 44, right: 12, top: 12, bottom: 28 };

/** `YYYY-MM-DD` -> `Sep 21` (the axis is sessions in order; the date names each end). */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function tickLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 1 ? 2 : 1);
}

interface TrendChartProps {
  metric: TrendMetric;
  trend: TrendPoint[];
}

/**
 * analysis.md §4 (REV-123): one metric over the sessions shown, one data point per session. A single series, so no
 * legend: the title names it. A 2 px line, 8 px points ringed in the card colour, hairline gridlines, a zero line for the
 * signed MPI charts, and the latest value written out. Tapping a point reads it out above the chart.
 */
export function TrendChart({ metric, trend }: TrendChartProps) {
  const values = useMemo(() => trend.map((p) => metric.value(p)), [trend, metric]);
  const g = useMemo(() => chartGeometry(values, BOX, metric.zeroLine), [values, metric.zeroLine]);
  // REV-133: the MPI charts plot a signed position, so they draw no trend line.
  const fit = metric.trendLine ? g.trend : null;
  const [selected, setSelected] = useState<number | null>(null);

  const latest = g.points.at(-1) ?? null;
  const readout = selected !== null ? g.points.find((p) => p.index === selected) ?? null : latest;

  return (
    <Card data-testid={`trend-${metric.id}`} data-points={g.points.length}>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          <span>{metric.title}</span>
          <span className="text-sm font-medium tabular-nums" aria-live="polite" data-testid={`trend-${metric.id}-readout`}>
            {readout === null ? '—' : metric.format(readout.value)}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {metric.note}
          {readout !== null && ` · ${selected !== null ? '' : 'latest, '}${shortDate(trend[readout.index]!.sessionDate)}`}
        </p>
        {fit !== null && (
          <p className="text-xs text-muted-foreground" data-testid={`trend-${metric.id}-slope`}>
            <svg viewBox="0 0 20 6" className="mr-1 inline-block h-1.5 w-5 align-middle" aria-hidden="true">
              <line x1={0} y1={3} x2={20} y2={3} className="stroke-foreground" strokeWidth={2} strokeDasharray="5 3" />
            </svg>
            Trend: {metric.formatChange(fit.slope)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {g.points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions with this measure in the range.</p>
        ) : (
          <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="h-auto w-full" role="img" aria-label={`${metric.title} over ${g.points.length} sessions`}>
            {g.yTicks.map((t) => (
              <g key={t.value}>
                <line x1={BOX.left} x2={BOX.width - BOX.right} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
                <text x={BOX.left - 6} y={t.y + 4} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {tickLabel(t.value)}
                </text>
              </g>
            ))}
            {g.zeroY !== null && (
              <line x1={BOX.left} x2={BOX.width - BOX.right} y1={g.zeroY} y2={g.zeroY} className="stroke-muted-foreground" strokeWidth={1} data-testid={`trend-${metric.id}-zero`} />
            )}
            <text x={g.points[0]!.x} y={BOX.height - 8} textAnchor={g.points.length === 1 ? 'middle' : 'start'} className="fill-muted-foreground text-[10px]">
              {shortDate(trend[g.points[0]!.index]!.sessionDate)}
            </text>
            {g.points.length > 1 && (
              <text x={g.points.at(-1)!.x} y={BOX.height - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {shortDate(trend[g.points.at(-1)!.index]!.sessionDate)}
              </text>
            )}
            <path d={g.path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
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
                data-testid={`trend-${metric.id}-line`}
              />
            )}
            {g.points.map((p) => (
              <g key={p.index}>
                <circle cx={p.x} cy={p.y} r={p.index === selected ? 6 : 4} className="fill-primary stroke-card" strokeWidth={2} />
                {/* A generous, invisible hit target: the point itself is too small to tap. */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={14}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={`${shortDate(trend[p.index]!.sessionDate)}: ${metric.format(p.value)}`}
                  data-testid={`trend-${metric.id}-point`}
                  onClick={() => setSelected(p.index === selected ? null : p.index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelected(p.index === selected ? null : p.index);
                  }}
                >
                  <title>{`${trend[p.index]!.sessionDate}: ${metric.format(p.value)}`}</title>
                </circle>
              </g>
            ))}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}
