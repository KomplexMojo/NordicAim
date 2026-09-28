// analysis.md §5 (REV-124, issue #57): the coach image. A header like the session summary's, the four Patterns drawings
// (Sight in, Confirm, Precision prone, Precision standing) in a 2 × 2 grid, the trends band across the full width below,
// and the athlete line and credit at the foot. Pure SVG.

import type { CoachTrends } from '../analysis/coach';
import { PATTERN_VIEWS, PATTERN_VIEW_LABEL, type PatternPoint, type PatternView } from '../patterns/collect';
import { patternsScorePercent, type PatternSummary } from '../patterns/summarize';

import { brandMotif } from './brand-mark';
import { APP_NAME, DEVELOPER_NAME, FOOTER_APP_NAME, provenanceLine } from './composite';
import { renderPatternViewMark } from './diagram-marks';
import { PALETTE } from './palette';
import { PATTERNS_SIZE, renderPatternsSvg } from './patterns';
import { el, num, text } from './svg';
import { renderTrendsBand, TRENDS_WIDTH } from './trends-band';

/** Bump whenever this renderer's output changes. */
export const TRENDS_RENDERER_VERSION = 2;

const HEADER_HEIGHT = 120;
const CELL = 720;
const GRID_HEIGHT = 2 * CELL;
const FOOTER_HEIGHT = 110;

export interface TrendsSheetInput {
  /** The Analysis screen's range, as its button reads (`All time`, `30 days`, …). */
  rangeLabel: string;
  views: Record<PatternView, { points: PatternPoint[]; summary: PatternSummary }>;
  /** `patternsSizeFactor` over every recorded shot, so the drawings match the Patterns screen. */
  factor: number;
  trends: CoachTrends;
  /** REV-100: the athlete's name, club and stamp; omitted when there is nothing to print. */
  provenance?: { name: string; club: string; stamp: string | null };
  release: string;
  generatedAtLocal: string;
}

function kindOf(view: PatternView): 'precision' | 'sighting' {
  return view.startsWith('precision') ? 'precision' : 'sighting';
}

function header(input: TrendsSheetInput): string {
  const bg = el('rect', { x: 0, y: 0, width: TRENDS_WIDTH, height: HEADER_HEIGHT, fill: PALETTE.header });
  const title = text(40, 58, 36, 'Shooting trends', { bold: true, color: '#FFFFFF' });
  const subtitle = text(40, 94, 18, `${input.rangeLabel} · generated ${input.generatedAtLocal}`, { color: '#CFE6F3' });
  const mark = brandMotif(TRENDS_WIDTH - 40 - 76, 22, 76);
  const name = text(TRENDS_WIDTH - 40 - 76 - 14, 71, 34, APP_NAME, { bold: true, anchor: 'end', color: '#FFFFFF' });
  return bg + title + subtitle + name + mark;
}

/** One view's cell: its mark, name and totals across the top, then the Patterns drawing. */
function cell(view: PatternView, input: TrendsSheetInput, x: number, y: number): string {
  const { points, summary } = input.views[view];
  const kind = kindOf(view);
  const percent = patternsScorePercent(summary, kind);
  let out = el('rect', { x, y, width: CELL, height: CELL, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  out += el('g', { transform: `translate(${num(x + 4)} ${num(y + 6)})` }, renderPatternViewMark(view));
  out += text(x + 84, y + 58, 28, PATTERN_VIEW_LABEL[view], { bold: true, color: PALETTE.textPrimary });
  const totals =
    summary.shots === 0
      ? ['No shots in this range']
      : [
          percent === null ? null : kind === 'precision' ? `Score ${percent}%` : `Hit rate ${percent}%`,
          `${summary.shots} ${summary.shots === 1 ? 'shot' : 'shots'}`,
          `${summary.sessions} ${summary.sessions === 1 ? 'session' : 'sessions'}`,
        ].filter((t): t is string => t !== null);
  out += text(x + CELL - 24, y + 58, 18, totals.join(' · '), { anchor: 'end', color: PALETTE.textSecondary });
  // The Patterns drawing (1200 × 1200) fitted under the label.
  const size = CELL - 96;
  const drawing = renderPatternsSvg({ kind, points, summary, factor: input.factor })
    .replace(/^<svg /, `<svg x="${num(x + (CELL - size) / 2)}" y="${num(y + 88)}" `)
    .replace(` width="${PATTERNS_SIZE}" height="${PATTERNS_SIZE}"`, ` width="${num(size)}" height="${num(size)}"`);
  out += drawing;
  return el('g', { class: 'trends-cell', 'data-view': view }, out);
}

/** §5: the whole coach image, and its size, so the build rasterises exactly what was drawn. */
export function renderTrendsSheet(input: TrendsSheetInput): { svg: string; width: number; height: number } {
  const band = renderTrendsBand(input.trends, HEADER_HEIGHT + GRID_HEIGHT);
  const footerY = HEADER_HEIGHT + GRID_HEIGHT + band.height;
  const height = footerY + FOOTER_HEIGHT;

  // A full-canvas panel first, so no area is ever left unfilled (transparent renders black).
  let body = el('rect', { x: 0, y: 0, width: TRENDS_WIDTH, height, fill: PALETTE.panel });
  body += header(input);
  PATTERN_VIEWS.forEach((view, i) => {
    body += cell(view, input, (i % 2) * CELL, HEADER_HEIGHT + Math.floor(i / 2) * CELL);
  });
  body += band.svg;
  body += el('rect', { x: 0, y: footerY, width: TRENDS_WIDTH, height: FOOTER_HEIGHT, fill: PALETTE.panel });
  if (input.provenance !== undefined) {
    const line = provenanceLine(input.provenance);
    if (line !== '') body += text(40, footerY + 40, 20, line, { bold: true, color: PALETTE.textPrimary });
  }
  body += text(40, footerY + 78, 14, `Generated by ${FOOTER_APP_NAME} created by ${DEVELOPER_NAME} release ${input.release}`, {
    color: PALETTE.textSecondary,
  });

  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: TRENDS_WIDTH, height, viewBox: `0 0 ${TRENDS_WIDTH} ${height}` }, body);
  return { svg, width: TRENDS_WIDTH, height };
}
