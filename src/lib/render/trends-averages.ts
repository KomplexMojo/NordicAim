// analysis.md §5 (REV-131): the coach image's averages band, in place of the trend charts. One row per view: its mark and name,
// three small number boxes (score or hit rate, group size, accuracy) and an MPI box that places the view's mark where its
// average shot lands on a simulated bullseye. Every MPI box shares one scale. The trends over time stay on the Analysis screen.
// Pure SVG.

import { coachAverages, type CoachAverages, type CoachTrends } from '../analysis/coach';
import { trendMetrics, type TrendMetricId } from '../analysis/trend';
import { PATTERN_VIEW_LABEL, type PatternView } from '../patterns/collect';

import { renderPatternViewMark } from './diagram-marks';
import { PALETTE } from './palette';
import { el, num, text } from './svg';

export const TRENDS_WIDTH = 1440;

const MARGIN = 40;
const TITLE_HEIGHT = 120;
const ROW_HEIGHT = 270;
const LABEL_WIDTH = 230;
const BOX_WIDTH = 270;
const BOX_HEIGHT = 245;
const BOX_GAP = 20;
const MPI_WIDTH = TRENDS_WIDTH - MARGIN - (MARGIN + LABEL_WIDTH + 3 * (BOX_WIDTH + BOX_GAP));
/** The MPI plot's half-size in px: the scale's ± end sits this far from the centre. */
const MPI_HALF = 75;
/** The view mark drawn in an MPI box, px across (the mark's own box is 48). */
const MPI_MARK = 30;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` -> `Sep 21`, without the locale (the image is the same on every phone). */
export function shortDate(iso: string): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7);
  return `${month} ${Number(iso.slice(8, 10))}`;
}

function kindOf(view: PatternView): 'precision' | 'sighting' {
  return view.startsWith('precision') ? 'precision' : 'sighting';
}

const NOTE: Record<'score' | 'group' | 'rms', (kind: 'precision' | 'sighting') => string> = {
  score: (kind) => (kind === 'precision' ? 'average ring, % of 10' : 'shots in the hit zone'),
  group: () => 'widest spread per target, at 50 m',
  rms: () => 'RMS distance from the centre',
};

function numberBox(avg: CoachAverages, id: 'score' | 'group' | 'rms', x: number, y: number): string {
  const kind = kindOf(avg.view);
  const metric = trendMetrics(kind).find((m) => m.id === id)!;
  const value = avg.values[id];
  const cx = x + BOX_WIDTH / 2;
  let out = el('rect', { x, y, width: BOX_WIDTH, height: BOX_HEIGHT, rx: 12, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += text(cx, y + 36, 19, metric.title, { anchor: 'middle', bold: true, color: PALETTE.textSecondary });
  out += text(cx, y + 140, 50, value === null ? '—' : metric.format(value), { anchor: 'middle', bold: true, color: PALETTE.textPrimary });
  out += text(cx, y + 200, 15, NOTE[id](kind), { anchor: 'middle', color: PALETTE.textSecondary });
  return el('g', { class: 'average-box', 'data-view': avg.view, 'data-metric': id }, out);
}

/**
 * The MPI box: a simulated bullseye (rings at half and all of the scale) on +x right / +y up axes, the view's mark at the average
 * MPI, and the offset in words. Target mm are +y up; the drawing's y is down, so y is flipped here.
 */
function mpiBox(avg: CoachAverages, scaleMm: number, x: number, y: number): string {
  const mpiX = avg.values.mpiX;
  const mpiY = avg.values.mpiY;
  const cx = x + MPI_WIDTH / 2;
  const cy = y + 50 + MPI_HALF;
  let out = el('rect', { x, y, width: MPI_WIDTH, height: BOX_HEIGHT, rx: 12, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += text(cx, y + 24, 16, 'MPI (mean point of impact)', { anchor: 'middle', bold: true, color: PALETTE.textSecondary });
  // The bullseye: two rings and a centre dot, under the axes.
  out += el('circle', { cx, cy, r: MPI_HALF, fill: PALETTE.haloFill, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += el('circle', { cx, cy, r: MPI_HALF / 2, fill: 'none', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += el('line', { x1: cx - MPI_HALF, y1: cy, x2: cx + MPI_HALF, y2: cy, stroke: PALETTE.textSecondary, 'stroke-width': 1 });
  out += el('line', { x1: cx, y1: cy - MPI_HALF, x2: cx, y2: cy + MPI_HALF, stroke: PALETTE.textSecondary, 'stroke-width': 1 });
  out += el('circle', { cx, cy, r: 3, fill: PALETTE.textPrimary });
  // The axis ends, in mm.
  const label = { color: PALETTE.textSecondary };
  out += text(cx + MPI_HALF + 6, cy + 5, 13, `+${scaleMm}`, label);
  out += text(cx - MPI_HALF - 6, cy + 5, 13, `−${scaleMm}`, { ...label, anchor: 'end' });
  out += text(cx, cy - MPI_HALF - 5, 13, `+${scaleMm} mm`, { ...label, anchor: 'middle' });
  out += text(cx, cy + MPI_HALF + 16, 13, `−${scaleMm}`, { ...label, anchor: 'middle' });

  if (mpiX !== null && mpiY !== null) {
    const px = cx + (mpiX / scaleMm) * MPI_HALF;
    const py = cy - (mpiY / scaleMm) * MPI_HALF;
    const s = MPI_MARK / 48;
    // The mark's own box is 48 × 48 at (24, 22), centred on (48, 46).
    out += el('g', { class: 'mpi-mark', transform: `translate(${num(px - 48 * s)} ${num(py - 46 * s)}) scale(${num(s)})` }, renderPatternViewMark(avg.view));
    const metrics = trendMetrics(kindOf(avg.view));
    const words = `${metrics.find((m) => m.id === 'mpiX')!.format(mpiX)} · ${metrics.find((m) => m.id === 'mpiY')!.format(mpiY)}`;
    out += text(cx, y + BOX_HEIGHT - 12, 15, words, { anchor: 'middle', bold: true, color: PALETTE.textPrimary });
  } else {
    out += text(cx, y + BOX_HEIGHT - 12, 15, '—', { anchor: 'middle', color: PALETTE.textSecondary });
  }
  return el('g', { class: 'average-box', 'data-view': avg.view, 'data-metric': 'mpi' }, out);
}

function row(avg: CoachAverages, scaleMm: number, y: number): string {
  let out = el('g', { transform: `translate(${num(MARGIN - 24)} ${num(y + 8)})` }, renderPatternViewMark(avg.view));
  // A two-word name (Precision prone, Precision standing) takes two lines, so it stays clear of the first box.
  const [first, ...rest] = PATTERN_VIEW_LABEL[avg.view].split(' ');
  const name = rest.length > 0 && PATTERN_VIEW_LABEL[avg.view].length > 10 ? [first!, rest.join(' ')] : [PATTERN_VIEW_LABEL[avg.view]];
  name.forEach((line, i) => {
    out += text(MARGIN + 64, y + (name.length === 1 ? 62 : 48) + i * 28, 24, line, { bold: true, color: PALETTE.textPrimary });
  });
  out += text(MARGIN, y + 112, 16, avg.sessions === 0 ? 'No shots in this range' : `${avg.sessions} ${avg.sessions === 1 ? 'session' : 'sessions'}`, {
    color: PALETTE.textSecondary,
  });
  const ids: Array<Extract<TrendMetricId, 'score' | 'group' | 'rms'>> = ['score', 'group', 'rms'];
  ids.forEach((id, i) => {
    out += numberBox(avg, id, MARGIN + LABEL_WIDTH + i * (BOX_WIDTH + BOX_GAP), y);
  });
  out += mpiBox(avg, scaleMm, MARGIN + LABEL_WIDTH + 3 * (BOX_WIDTH + BOX_GAP), y);
  return el('g', { class: 'averages-row', 'data-view': avg.view }, out);
}

/** §5: the band at `y`; returns its SVG and height. */
export function renderAveragesBand(trends: CoachTrends, y: number): { svg: string; height: number } {
  const { views, mpiScaleMm } = coachAverages(trends);
  const height = TITLE_HEIGHT + views.length * ROW_HEIGHT + 10;
  let out = el('rect', { x: 0, y, width: TRENDS_WIDTH, height, fill: PALETTE.panel });
  out += el('rect', { x: 0, y, width: 8, height, fill: PALETTE.accent });
  const first = trends.sessions[0];
  const last = trends.sessions.at(-1);
  out += text(MARGIN, y + 56, 28, 'Averages in this range', { bold: true, color: PALETTE.textPrimary });
  const span = first === undefined || last === undefined ? 'No sessions in this range' : `${shortDate(first.sessionDate)} – ${shortDate(last.sessionDate)}`;
  out += text(
    MARGIN,
    y + 90,
    18,
    `${trends.sessions.length} ${trends.sessions.length === 1 ? 'session' : 'sessions'} · ${span} · each session counted once · trends over time are on the Analysis screen`,
    { color: PALETTE.textSecondary },
  );
  views.forEach((avg, i) => {
    out += row(avg, mpiScaleMm, y + TITLE_HEIGHT + i * ROW_HEIGHT);
  });
  return { svg: out, height };
}
