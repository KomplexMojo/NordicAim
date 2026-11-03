// goals.md §9 (REV-163): one goal view's section on the Goals coach image: its heading, then one row per goal-able metric
// with the goal, Hit or Not yet, the average since it was set, how many sessions met it, how far is left to go, a small chart
// of the sessions since it was set, and the trend arrow. A metric with no goal is a short grey row. Pure SVG.

import type { GoalsCoachMetric, GoalsCoachView } from '../goals/coach';
import { PATTERN_VIEW_LABEL } from '../patterns/collect';

import { renderPatternViewMark } from './diagram-marks';
import { PALETTE } from './palette';
import { el, num, text } from './svg';
import { shortDate, trendArrowSvg } from './trends-averages';

export const VIEW_HEADING_HEIGHT = 70;
export const GOAL_ROW_HEIGHT = 170;
export const NO_GOAL_ROW_HEIGHT = 90;

const LEFT = 20;
const RIGHT = 1420;
const CHART = { x: 760, y: 22, width: 560, height: 96 } as const;

const MUTED = { color: PALETTE.textSecondary };

/** How far is left to go, with one more decimal than the metric's own format so a small gap never reads as 0. */
export function formatGap(m: Pick<GoalsCoachMetric, 'unit'>, gap: number): string {
  if (m.unit === '%') return `${gap.toFixed(1)}%`;
  if (m.unit === 'MOA') return `${gap.toFixed(2)} MOA`;
  return `${gap.toFixed(1)} ${m.unit}`;
}

function pill(x: number, y: number, label: string, fill: string): string {
  const width = 24 + label.length * 10;
  return (
    el('rect', { x, y, width, height: 34, rx: 17, fill }) +
    text(x + width / 2, y + 23, 17, label, { anchor: 'middle', bold: true, color: '#FFFFFF' })
  );
}

/** The sessions since the goal was set, oldest to newest, with the goal as a blue line and a green ring on each one that met it. */
function sparkChart(m: GoalsCoachMetric, x0: number, y0: number): string {
  const x = x0 + CHART.x;
  const y = y0 + CHART.y;
  let out = el('rect', { x, y, width: CHART.width, height: CHART.height, fill: PALETTE.page, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  if (m.goal === null || m.since.length === 0) {
    return out + text(x + CHART.width / 2, y + CHART.height / 2 + 6, 16, 'No sessions since this goal was set', { ...MUTED, anchor: 'middle' });
  }
  const values = [...m.since.map((s) => s.value), m.goal.value];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = hi === lo ? Math.max(Math.abs(hi) * 0.1, 1) : (hi - lo) * 0.15;
  lo -= pad;
  hi += pad;
  const yOf = (v: number) => y + 10 + ((hi - v) / (hi - lo)) * (CHART.height - 20);
  const xOf = (i: number) => (m.since.length === 1 ? x + CHART.width / 2 : x + 24 + (i * (CHART.width - 48)) / (m.since.length - 1));
  out += el('line', { class: 'goal-line', x1: x, y1: yOf(m.goal.value), x2: x + CHART.width, y2: yOf(m.goal.value), stroke: PALETTE.ellipse, 'stroke-width': 3 });
  if (m.since.length > 1) {
    const pts = m.since.map((s, i) => `${num(xOf(i))},${num(yOf(s.value))}`).join(' ');
    out += el('polyline', { points: pts, fill: 'none', stroke: PALETTE.accentText, 'stroke-width': 3 });
  }
  m.since.forEach((s, i) => {
    out += el('circle', { cx: xOf(i), cy: yOf(s.value), r: 6, fill: PALETTE.accentText });
    if (s.met) out += el('circle', { class: 'goal-met', cx: xOf(i), cy: yOf(s.value), r: 11, fill: 'none', stroke: PALETTE.goalMet, 'stroke-width': 3 });
  });
  out += text(x, y + CHART.height + 22, 14, 'Since set, oldest to newest · blue line: the goal · green ring: met', MUTED);
  return out;
}

function goalRow(m: GoalsCoachMetric, y: number): string {
  if (m.goal === null) {
    let out = el('rect', { x: LEFT, y, width: RIGHT - LEFT, height: NO_GOAL_ROW_HEIGHT - 14, fill: PALETTE.panel, stroke: PALETTE.panelBorder, 'stroke-width': 1, 'stroke-dasharray': '6 5' });
    out += text(44, y + 34, 22, m.title, { bold: true, color: PALETTE.textSecondary });
    out += text(44, y + 60, 17, 'No goal set', MUTED);
    return el('g', { class: 'goals-coach-row', 'data-metric': m.metric, 'data-hit': 'none' }, out);
  }
  const progress = m.progress!;
  const n = progress.sessions;
  let out = el('rect', { x: LEFT, y, width: RIGHT - LEFT, height: GOAL_ROW_HEIGHT - 14, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += text(44, y + 40, 22, m.title, { bold: true, color: PALETTE.textPrimary });
  out += text(44, y + 70, 17, `Goal ${m.format(m.goal.value)} or ${m.direction === 'higher' ? 'more' : 'less'} · set ${shortDate(m.goal.setAt)}`, MUTED);
  out +=
    progress.hit === null
      ? pill(44, y + 92, 'No sessions yet', PALETTE.textSecondary)
      : progress.hit
        ? pill(44, y + 92, 'Hit', PALETTE.goalMet)
        : pill(44, y + 92, 'Not yet', PALETTE.goalMissed);

  if (progress.average !== null) {
    const met = m.since.filter((s) => s.met).length;
    out += text(420, y + 52, 34, m.format(progress.average), { bold: true, color: PALETTE.textPrimary });
    out += text(420, y + 82, 17, `average over ${n} ${n === 1 ? 'session' : 'sessions'}`, MUTED);
    out += text(420, y + 108, 17, `${met} of ${n} ${n === 1 ? 'session' : 'sessions'} met it`, MUTED);
    if (m.gap !== null) out += text(420, y + 134, 17, `${formatGap(m, m.gap)} to go`, { bold: true, color: PALETTE.textPrimary });
  } else {
    // The chart says there are no sessions since it was set.
    out += text(420, y + 52, 34, '—', { bold: true, color: PALETTE.textSecondary });
  }
  out += sparkChart(m, 0, y);
  out += trendArrowSvg(m.trend, RIGHT - 46, y + 30);
  return el('g', { class: 'goals-coach-row', 'data-metric': m.metric, 'data-hit': progress.hit === null ? 'pending' : String(progress.hit) }, out);
}

/** §9: a view's section at `y`; returns its SVG and height. */
export function renderGoalsCoachView(v: GoalsCoachView, y: number): { svg: string; height: number } {
  let out = el('g', { transform: `translate(${num(LEFT - 4)} ${num(y - 10)})` }, renderPatternViewMark(v.view));
  out += text(108, y + 44, 28, PATTERN_VIEW_LABEL[v.view], { bold: true, color: PALETTE.textPrimary });
  const goals = v.metrics.length;
  out += text(RIGHT - 4, y + 44, 18, `${v.sessions} ${v.sessions === 1 ? 'session' : 'sessions'} · ${v.set} of ${goals} goals set`, { ...MUTED, anchor: 'end' });
  let at = y + VIEW_HEADING_HEIGHT;
  for (const m of v.metrics) {
    out += goalRow(m, at);
    at += m.goal === null ? NO_GOAL_ROW_HEIGHT : GOAL_ROW_HEIGHT;
  }
  return { svg: el('g', { class: 'goals-coach-view', 'data-view': v.view }, out), height: at - y };
}
