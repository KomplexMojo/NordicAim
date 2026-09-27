// analysis.md §5 (REV-124): the trends band of the coach image — a legend, then one full-width chart per metric, every
// chart on the same session axis so a session sits at the same x in all of them. Pure SVG.

import { chartGeometry, type ChartBox } from '../analysis/chart';
import type { CoachMetric, CoachTrends } from '../analysis/coach';
import type { PatternView } from '../patterns/collect';

import { renderPatternViewMark } from './diagram-marks';
import { PALETTE } from './palette';
import { el, num, text } from './svg';

export const TRENDS_WIDTH = 1440;

/**
 * The four views' line colours: the reference categorical palette's first four slots, in order. Validated on the image
 * panel (#EAF2F8) with the dataviz validator: lightness, chroma, CVD (worst adjacent ΔE 9.1) and normal-vision checks
 * pass. Three sit below 3:1 contrast, so every series is also named in the legend (with its view mark) and in the
 * latest-value column: colour is never the only key.
 */
export const SERIES_COLOUR: Record<PatternView, string> = {
  'sight-in': '#2a78d6',
  confirm: '#eb6834',
  'precision-prone': '#1baf7a',
  'precision-standing': '#eda100',
};

export const SERIES_LABEL: Record<PatternView, string> = {
  'sight-in': 'Sight in',
  confirm: 'Confirm',
  'precision-prone': 'Prone',
  'precision-standing': 'Standing',
};

const MARGIN = 40;
const LEGEND_TOP = 112;
const CHARTS_TOP = 170;
const CHART_HEIGHT = 300;
const VALUE_COLUMN = 260;
/** Points are drawn while there are this few sessions; past it the line alone reads better. */
export const MAX_MARKED_SESSIONS = 40;
/** At most this many dates label the session axis (first and last always). */
const MAX_DATE_LABELS = 8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` -> `Sep 21`, without the locale (the image is the same on every phone). */
export function shortDate(iso: string): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7);
  return `${month} ${Number(iso.slice(8, 10))}`;
}

/** Which sessions get a date under the axis: all of them up to 8, else 8 spread evenly, first and last included. */
export function dateLabelIndices(count: number): number[] {
  if (count <= MAX_DATE_LABELS) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>();
  for (let k = 0; k < MAX_DATE_LABELS; k += 1) out.add(Math.round((k * (count - 1)) / (MAX_DATE_LABELS - 1)));
  return [...out];
}

function tickLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 1 ? 2 : 1);
}

function legend(y: number): string {
  let out = '';
  (Object.keys(SERIES_COLOUR) as PatternView[]).forEach((view, i) => {
    const x = MARGIN + i * 330;
    // The view's own mark (48 × 48 box at (24, 22)), at 0.75 size.
    out += el('g', { transform: `translate(${num(x - 18)} ${num(y - 34)}) scale(0.75)` }, renderPatternViewMark(view));
    out += el('line', { x1: x + 42, y1: y - 6, x2: x + 82, y2: y - 6, stroke: SERIES_COLOUR[view], 'stroke-width': 5, 'stroke-linecap': 'round' });
    out += text(x + 94, y, 20, SERIES_LABEL[view], { color: PALETTE.textPrimary });
  });
  return out;
}

function chart(metric: CoachMetric, sessions: CoachTrends['sessions'], top: number): string {
  // Drawn in the chart's own coordinates and moved into place, so every y below is local.
  const box: ChartBox = { width: TRENDS_WIDTH, height: CHART_HEIGHT, left: MARGIN + 70, right: MARGIN + VALUE_COLUMN, top: 46, bottom: 44 };
  const everything = metric.series.flatMap((s) => s.values);
  const marked = sessions.length <= MAX_MARKED_SESSIONS;
  let out = text(MARGIN, 28, 22, metric.title, { bold: true, color: PALETTE.textPrimary });

  const base = chartGeometry(sessions.map(() => null), box, metric.zeroLine, 4, everything);
  for (const t of base.yTicks) {
    out += el('line', { x1: box.left, x2: TRENDS_WIDTH - box.right, y1: t.y, y2: t.y, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
    out += text(box.left - 10, t.y + 5, 15, tickLabel(t.value), { anchor: 'end', color: PALETTE.textSecondary });
  }
  if (base.zeroY !== null) {
    out += el('line', { x1: box.left, x2: TRENDS_WIDTH - box.right, y1: base.zeroY, y2: base.zeroY, stroke: PALETTE.textSecondary, 'stroke-width': 1.5 });
  }
  // The session axis: the same x for a session in every chart.
  const plotW = TRENDS_WIDTH - box.left - box.right;
  const xAt = (i: number) => (sessions.length <= 1 ? box.left + plotW / 2 : box.left + (i * plotW) / (sessions.length - 1));
  for (const i of dateLabelIndices(sessions.length)) {
    const x = xAt(i);
    out += el('line', { x1: x, x2: x, y1: box.top, y2: CHART_HEIGHT - box.bottom, stroke: PALETTE.panelBorder, 'stroke-width': 1, 'stroke-opacity': 0.6 });
    const anchor = sessions.length > 1 && i === 0 ? 'start' : sessions.length > 1 && i === sessions.length - 1 ? 'end' : 'middle';
    out += text(x, CHART_HEIGHT - 16, 15, shortDate(sessions[i]!.sessionDate), { anchor, color: PALETTE.textSecondary });
  }

  metric.series.forEach((series, row) => {
    const g = chartGeometry(series.values, box, metric.zeroLine, 4, everything);
    const colour = SERIES_COLOUR[series.view];
    if (g.path !== '') {
      out += el('path', { d: g.path, fill: 'none', stroke: colour, 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    }
    // A lone point between gaps has no segment, so it is always marked.
    for (const p of g.points) {
      const alone = series.values[p.index - 1] == null && series.values[p.index + 1] == null;
      if (marked || alone) out += el('circle', { cx: p.x, cy: p.y, r: 6, fill: colour, stroke: PALETTE.panel, 'stroke-width': 2 });
    }
    // The latest value, in text ink, keyed by a dot of the series colour.
    const latest = g.points.at(-1);
    const rowY = 70 + row * 42;
    const x = TRENDS_WIDTH - MARGIN - VALUE_COLUMN + 24;
    out += el('circle', { cx: x + 7, cy: rowY - 6, r: 7, fill: colour });
    out += text(x + 22, rowY, 16, `${SERIES_LABEL[series.view]}: ${latest === undefined ? '—' : metric.format(latest.value)}`, {
      color: PALETTE.textPrimary,
    });
  });
  return el('g', { class: `trend-chart`, 'data-metric': metric.id, transform: `translate(0 ${num(top)})` }, out);
}

/** §5: the band at `y`; returns its SVG and height. */
export function renderTrendsBand(trends: CoachTrends, y: number): { svg: string; height: number } {
  const height = CHARTS_TOP + trends.metrics.length * CHART_HEIGHT + 10;
  let out = el('rect', { x: 0, y, width: TRENDS_WIDTH, height, fill: PALETTE.panel });
  out += el('rect', { x: 0, y, width: 8, height, fill: PALETTE.accent });
  const first = trends.sessions[0];
  const last = trends.sessions.at(-1);
  out += text(MARGIN, y + 56, 28, 'Trends over time', { bold: true, color: PALETTE.textPrimary });
  const span = first === undefined || last === undefined ? 'No sessions in this range' : `${shortDate(first.sessionDate)} – ${shortDate(last.sessionDate)}`;
  out += text(MARGIN, y + 88, 18, `${trends.sessions.length} ${trends.sessions.length === 1 ? 'session' : 'sessions'} · ${span} · one point per session`, {
    color: PALETTE.textSecondary,
  });
  out += legend(y + LEGEND_TOP + 24);
  trends.metrics.forEach((m, i) => {
    out += chart(m, trends.sessions, y + CHARTS_TOP + i * CHART_HEIGHT);
  });
  return { svg: out, height };
}
