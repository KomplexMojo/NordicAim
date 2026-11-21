// M29 (REV-159, coach-context-import.md §5 step 5): the attach preview's picture of the matched 545 Coach records, drawn with the same
// pieces as the summary image (§6) — the windage badge on the header's dark strip, and one disc row per metal bout. Pure.

import type { MetalBoutRow, WindBadge } from '../domain/coach-context-view';
import { layoutMetalRows } from './coach-metal';
import { renderWindIcon, windLabel } from './condition-icons';
import { PALETTE } from './palette';
import { el, text } from './svg';

const WIDTH = 560;
/** REV-164: wide enough for the metal rows' `Range time` column, used only when a bout is timed. */
const WIDTH_TIMED = 620;
const STRIP = 60;

/** A standalone SVG of the windage badge and the metal rows, or null when there is neither to draw. */
export function renderCoachPreviewSvg(input: { wind: WindBadge | null; metal: readonly MetalBoutRow[] }): { svg: string; width: number; height: number } | null {
  if (input.wind === null && input.metal.length === 0) return null;
  const width = input.metal.some((r) => r.rangeTimeSeconds !== null) ? WIDTH_TIMED : WIDTH;
  let body = '';
  let y = 0;
  if (input.wind !== null) {
    body += el('rect', { x: 0, y: 0, width, height: STRIP, fill: PALETTE.header });
    body += renderWindIcon(input.wind, 12, 8);
    body += text(68, 37, 18, windLabel(input.wind), { color: '#FFFFFF' });
    y = STRIP;
  }
  if (input.metal.length > 0) {
    const metal = layoutMetalRows(input.metal, 16, y + 34);
    body += metal.svg;
    y = metal.lastY + 18;
  }
  const height = y;
  const bg = el('rect', { x: 0, y: 0, width, height, fill: PALETTE.panel });
  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}` }, bg + body);
  return { svg, width, height };
}
