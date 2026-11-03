// patterns.md §7 (REV-163): one view's row on the Patterns coach image. The Patterns drawing on the left; on the right the
// view's name and totals, four number boxes (group size, mean radius, centre, shape), how one target's group compares with
// all the shots together, where the shots land, and the potential issues with how many targets showed each. Pure SVG.

import { trendMetrics } from '../analysis/trend';
import { PATTERN_VIEW_LABEL } from '../patterns/collect';
import { viewPosition, type PatternsCoachView } from '../patterns/coach';
import { patternsScorePercent, THIN_SHOT_COUNT } from '../patterns/summarize';
import { THRESHOLDS } from '../scoring/characteristics';

import { capitalize, truncate } from './composite-layout';
import { renderPatternViewMark } from './diagram-marks';
import { PALETTE } from './palette';
import { PATTERNS_SIZE, renderPatternsSvg } from './patterns';
import { el, num, text } from './svg';

/** A view with shots: the row's height including the gap under it. */
export const ROW_HEIGHT = 600;
/** A view with no shots in the range: its name and one sentence. */
export const EMPTY_ROW_HEIGHT = 140;

const LEFT = 20;
const RIGHT = 1420;
const DRAWING = 520;
const X0 = 600;
const WIDTH = 800;
const BOX_GAP = 8;
const BOX_WIDTHS = [180, 180, 196, 220] as const;
const BOX_HEIGHT = 120;
const MAX_CHIPS = 4;
const CHIP_WIDTH = (WIDTH - 12) / 2;

/** Ring 10 darkest to ring 0 lightest, the printed target's own greys and blues. */
const RING_SHADE = ['#F2F7FB', '#EAF2F8', '#DCEBF5', '#CDE3F1', '#BBD9EC', '#A9CFE3', '#8994A1', '#6B7684', '#4D5866', '#36404D', '#1C1F24'] as const;

const MUTED = { color: PALETTE.textSecondary };

function sectionTitle(y: number, label: string): string {
  return text(X0, y, 19, label, { bold: true, color: PALETTE.textPrimary });
}

function box(x: number, y: number, width: number, label: string, lines: Array<{ text: string; size: number; bold?: boolean }>, metric: string): string {
  let out = el('rect', { x, y, width, height: BOX_HEIGHT, rx: 10, fill: PALETTE.panel, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += text(x + 14, y + 28, 16, label, MUTED);
  let at = y + 28;
  for (const line of lines) {
    at += line.size + 10;
    out += text(x + 14, at, line.size, line.text, { bold: line.bold === true, color: line.bold === true ? PALETTE.textPrimary : PALETTE.textSecondary });
  }
  return el('g', { class: 'patterns-coach-box', 'data-metric': metric }, out);
}

function boxes(v: PatternsCoachView, y: number): string {
  const { summary, characteristics: c } = v;
  const metrics = trendMetrics(v.kind);
  const fmt = (id: 'mpiX' | 'mpiY', value: number) => metrics.find((m) => m.id === id)!.format(value);
  const [shape = null, detail = null] = c.shape === null ? [] : c.shape.replace(')', '').split(' (');
  const flyers = `${c.flyers} ${c.flyers === 1 ? 'flyer' : 'flyers'}`;
  const parts = [
    {
      label: 'Group size',
      metric: 'group',
      lines:
        summary.extremeSpreadMoa === null
          ? [{ text: '—', size: 30, bold: true }]
          : [
              { text: `${summary.extremeSpreadMoa.toFixed(2)} MOA`, size: 30, bold: true },
              { text: `${(summary.extremeSpreadMm ?? 0).toFixed(1)} mm widest spread`, size: 14 },
            ],
    },
    {
      label: 'Mean radius',
      metric: 'radius',
      lines:
        c.meanRadiusMoa === null || c.meanRadiusMm === null
          ? [{ text: '—', size: 30, bold: true }]
          : [
              { text: `${c.meanRadiusMoa.toFixed(2)} MOA`, size: 30, bold: true },
              { text: `${c.meanRadiusMm.toFixed(1)} mm from its centre`, size: 14 },
            ],
    },
    {
      label: 'Centre (MPI)',
      metric: 'mpi',
      lines:
        summary.mpi === null
          ? [{ text: '—', size: 30, bold: true }]
          : [
              { text: fmt('mpiX', summary.mpi.xMm), size: 20, bold: true },
              { text: fmt('mpiY', summary.mpi.yMm), size: 20, bold: true },
            ],
    },
    {
      label: 'Shape',
      metric: 'shape',
      lines:
        shape === null
          ? [{ text: '—', size: 30, bold: true }]
          : [{ text: capitalize(shape), size: 20, bold: true }, ...(detail === null ? [] : [{ text: detail, size: 13 }]), { text: flyers, size: 13 }],
    },
  ];
  let out = '';
  let x = X0;
  parts.forEach((p, i) => {
    out += box(x, y, BOX_WIDTHS[i]!, p.label, p.lines, p.metric);
    x += BOX_WIDTHS[i]! + BOX_GAP;
  });
  return out;
}

function targetToTarget(v: PatternsCoachView, y: number): string {
  let out = sectionTitle(y, 'Target to target');
  const together = v.summary.extremeSpreadMoa;
  if (v.targetsSized < 2 || v.typicalTargetMoa === null || together === null) {
    return out + text(X0, y + 28, 18, 'One target with a group in this range: nothing to compare yet.', MUTED);
  }
  out += text(X0, y + 28, 18, `Typical single target ${v.typicalTargetMoa.toFixed(2)} MOA · all ${v.summary.shots} shots together ${together.toFixed(2)} MOA`, {
    color: PALETTE.textPrimary,
  });
  out += text(X0, y + 54, 15, 'The gap between the two is how far the group moves from target to target (zero, position or wind).', MUTED);
  return out;
}

function shotsLand(v: PatternsCoachView, y: number): string {
  let out = sectionTitle(y, 'Where the shots land');
  const { summary, characteristics: c } = v;
  const barY = y + 14;
  const outside = c.outsideShare === null ? null : `${Math.round(c.outsideShare * 100)}% would miss the ${viewPosition(v.view)} hit zone`;
  let bar = '';
  let note: string;
  if (summary.ringCounts !== null) {
    let x = X0;
    for (let ring = 10; ring >= 0; ring -= 1) {
      const n = summary.ringCounts[ring] ?? 0;
      if (n === 0) continue;
      const w = (n / summary.shots) * WIDTH;
      bar += el('rect', { x, y: barY, width: w, height: 28, fill: RING_SHADE[ring], stroke: '#FFFFFF', 'stroke-width': 1 });
      if (w >= 64) bar += text(x + 4, barY + 48, 14, `${ring}: ${Math.round((100 * n) / summary.shots)}%`, MUTED);
      x += w;
    }
    note = [summary.averageRing === null ? null : `Average ring ${summary.averageRing.toFixed(1)}`, outside].filter((s): s is string => s !== null).join(' · ');
  } else {
    const share = summary.zoneHitShare ?? 0;
    bar += el('rect', { x: X0, y: barY, width: WIDTH, height: 28, fill: PALETTE.haloFill, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
    bar += el('rect', { x: X0, y: barY, width: share * WIDTH, height: 28, fill: PALETTE.accent });
    bar += text(X0 + 4, barY + 48, 14, `${Math.round(share * 100)}% in the target's hit zone`, MUTED);
    note = outside ?? '';
  }
  out += el('g', { class: 'patterns-coach-land' }, bar);
  out += text(X0, y + 88, 16, note, { color: PALETTE.textPrimary });
  return out;
}

function issueChip(x: number, y: number, label: string): string {
  return (
    el('rect', { x, y, width: CHIP_WIDTH, height: 34, rx: 17, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1.5 }) +
    text(x + 14, y + 23, 14, truncate(label, 52), { color: PALETTE.textPrimary })
  );
}

function issues(v: PatternsCoachView, y: number): string {
  let out = sectionTitle(y, 'Potential issues');
  if (v.targetsTested === 0 && !v.characteristics.enough) {
    return out + text(X0, y + 30, 16, `Needs at least ${THRESHOLDS.minShots} shots on a target.`, MUTED);
  }
  if (v.issues.length === 0) return out + text(X0, y + 30, 16, 'No potential issues found.', MUTED);
  const labels = v.issues.map((i) =>
    i.targets > 0 ? `${i.label} · ${i.targets} of ${v.targetsTested} ${v.targetsTested === 1 ? 'target' : 'targets'}` : `${i.label} · all shots together`,
  );
  const shown = labels.length > MAX_CHIPS ? [...labels.slice(0, MAX_CHIPS - 1), `+${labels.length - MAX_CHIPS + 1} more on the Patterns screen`] : labels;
  shown.forEach((label, i) => {
    out += issueChip(X0 + (i % 2) * (CHIP_WIDTH + 12), y + 14 + Math.floor(i / 2) * 42, label);
  });
  return el('g', { class: 'patterns-coach-issues', 'data-count': v.issues.length }, out);
}

function heading(v: PatternsCoachView, x: number, y: number): string {
  const { summary } = v;
  const percent = patternsScorePercent(summary, v.kind);
  let out = el('g', { transform: `translate(${num(x - 24)} ${num(y + 6)})` }, renderPatternViewMark(v.view));
  out += text(x + 64, y + 58, 28, PATTERN_VIEW_LABEL[v.view], { bold: true, color: PALETTE.textPrimary });
  if (summary.shots === 0) return out;
  const totals = [
    percent === null ? null : v.kind === 'precision' ? `Score ${percent}%` : `Hit rate ${percent}%`,
    `${summary.shots} ${summary.shots === 1 ? 'shot' : 'shots'}`,
    `${summary.targets} ${summary.targets === 1 ? 'target' : 'targets'}`,
    `${summary.sessions} ${summary.sessions === 1 ? 'session' : 'sessions'}`,
  ].filter((t): t is string => t !== null);
  return out + text(RIGHT - 24, y + 58, 18, totals.join(' · '), { anchor: 'end', color: PALETTE.textSecondary });
}

/** §7: the row at `y`, drawn with the shared Patterns size `factor`; returns its SVG and height (gap included). */
export function renderPatternsCoachRow(v: PatternsCoachView, factor: number, y: number): { svg: string; height: number } {
  if (v.summary.shots === 0) {
    let out = el('rect', { x: LEFT, y, width: RIGHT - LEFT, height: EMPTY_ROW_HEIGHT - 20, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
    out += heading(v, 44, y);
    out += text(108, y + 96, 18, 'No shots in this range', MUTED);
    return { svg: el('g', { class: 'patterns-coach-row', 'data-view': v.view, 'data-empty': 'true' }, out), height: EMPTY_ROW_HEIGHT };
  }
  let out = el('rect', { x: LEFT, y, width: RIGHT - LEFT, height: ROW_HEIGHT - 20, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  // The Patterns drawing (1200 × 1200) fitted on the left.
  const drawing = renderPatternsSvg({ kind: v.kind, points: v.points, summary: v.summary, factor })
    .replace(/^<svg /, `<svg x="${num(40)}" y="${num(y + 24)}" `)
    .replace(` width="${PATTERNS_SIZE}" height="${PATTERNS_SIZE}"`, ` width="${num(DRAWING)}" height="${num(DRAWING)}"`);
  out += drawing;
  if (v.summary.thin) out += text(40 + DRAWING / 2, y + 568, 15, `Patterns need more shots (at least ${THIN_SHOT_COUNT})`, { ...MUTED, anchor: 'middle' });
  out += heading(v, X0, y);
  out += boxes(v, y + 86);
  out += targetToTarget(v, y + 240);
  out += shotsLand(v, y + 334);
  out += issues(v, y + 472);
  return { svg: el('g', { class: 'patterns-coach-row', 'data-view': v.view }, out), height: ROW_HEIGHT };
}
