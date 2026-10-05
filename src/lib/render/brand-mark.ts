// REV-138 (icon redesign), owner 2026-10-04 (trend line, bullseye, wordmark): the NordicAim mark as SVG, one source
// for the app icons (scripts/make-icons.ts), the in-app header, the session summary image and the coach image. Pure.
// A biathlon target seen from the firing line, drawn fine-line rather than filled: three concentric outlined rings,
// a hollow bullseye ring at dead centre, and a group of three small holes, with a jagged chart line — up, a dip,
// then a sustained climb — from lower-left to upper-right behind them, clear of the bullseye and every hole: the
// target says what it measures, the line says the app's whole point (Patterns, Analysis, Goals: spot the trend).
// Drawn on a 100-unit grid inside the square at (x, y) of side `size`, on the caller's own dark background (no
// filled disc of its own). `appNameWordmark()` carries the same idea into the header's "NordicAim" text: its N
// and A are drawn as the mark's own line-and-dot style instead of solid font glyphs.

import { SYSTEM_FONT_STACK } from './fonts';

const PAPER = '#F7FAFD';
const ACCENT = '#4B94C3';
/** Exported: owner, 2026-10-04 picks out the "o" in the header wordmark in this same shot colour. */
export const HOLE = '#E8604C';
/** Bright and distinct from the rings' ice blue and the shots' red: a trend reads as growth. Exported: owner,
 * 2026-10-04 picks out the "N" and "A" in the header wordmark in this same colour, so the letters read as the
 * mark's own graph line. */
export const TREND_COLOR = '#34D399';
// owner, 2026-10-04: the third hole moved from (51.2, 52.4) — almost dead centre — left of the bullseye and the
// trend line, into the ring between the bullseye and the inner scoring ring: clear of the bullseye by ~4.8 units
// and the line by ~2.1.
const HOLES: ReadonlyArray<readonly [number, number, number]> = [
  [58.4, 36.8, 3.4],
  [68, 51.2, 3.4],
  [37, 48, 3.4],
];
const RINGS: ReadonlyArray<readonly [number, string, number]> = [
  [38, PAPER, 1.6],
  [27, ACCENT, 1.6],
  [16, PAPER, 1.2],
];
/** owner, 2026-10-04: a hollow bullseye ring at dead centre — tried filled first, but it smothered the hole
 * that used to sit almost on top of it; hollow reads as a natural fourth ring instead. */
const BULLSEYE_RADIUS = 5;
const BULLSEYE_WIDTH = 1.2;
/** owner, 2026-10-04: kept inside the outer ring (r=38 from centre (50,50), every point within 33 units) and
 * clear of the holes (every point and segment at least 1 unit past hole radius + marker radius). SVG y grows
 * downward, so a smaller value is higher up: a chart line's rhythm — rise, dip, then a sustained climb that
 * swings past the holes on their left and above, never through them. */
const TREND_LINE: ReadonlyArray<readonly [number, number]> = [
  [22, 66],
  [30, 54],
  [38, 62],
  [44, 48],
  [52, 30],
  [70, 24],
];
const TREND_LINE_WIDTH = 1.8;
/** Slightly larger than the line's own width, much smaller than a shot hole (radius 3.4). */
const TREND_DOT_RADIUS = 1.4;

export const BRAND_TILE = '#1F2630';

// owner, 2026-10-04: N and A redrawn as the mark's own line-and-dot style (measured once at this reference
// size, anchor='end', against composite.ts/trends-sheet.ts's actual header call — `x`/`y` offsets below are
// relative to that call's own end-x and baseline, so they scale and reposition correctly at any size).
const WORDMARK_REF_SIZE = 34;
const WORDMARK_STROKE_WIDTH = 3.4;
const WORDMARK_DOT_RADIUS = 2.2;
const WORDMARK_CROSSBAR_WIDTH = 1.4;
/** N: a 4-point zigzag (bottom-left, top-left, bottom-right, top-right) — the same up/dip/up rhythm as the
 * mark's own trend line. Offsets from the text's right-anchor end-x and its baseline. */
const WORDMARK_N: ReadonlyArray<readonly [number, number]> = [
  [-168, 0],
  [-168, -23],
  [-150, 0],
  [-150, -23],
];
/** A: a single peak (bottom-left, apex, bottom-right), plus a thin crossbar for legibility (no dots on it —
 * a legibility aid, not part of the "chart line" shape). */
const WORDMARK_A: ReadonlyArray<readonly [number, number]> = [
  [-63, 0],
  [-52, -23],
  [-41, 0],
];
const WORDMARK_A_CROSSBAR: readonly [number, number, number, number] = [-58.7, -8, -45.3, -8];

/**
 * owner, 2026-10-04: the "NordicAim" header wordmark (composite.ts, trends-sheet.ts), N and A drawn as the
 * mark's own trend-line style instead of solid font glyphs; "o" stays the shots' red, "ordic"/"im" stay
 * `defaultColor`. `endX`/`y`/`sizePx` match a right-anchored `text()` call (`textOptions.anchor: 'end'`):
 * the real "N"/"A" characters stay in the flow but invisible, so they still reserve their usual advance
 * width for the letters after them, and the line art is drawn on top at the same measured position.
 */
export function appNameWordmark(endX: number, y: number, sizePx: number, defaultColor: string): string {
  const k = sizePx / WORDMARK_REF_SIZE;
  const at = (offset: number, origin: number) => (origin + offset * k).toFixed(2);

  const text = `<text x="${endX}" y="${y}" font-family="${SYSTEM_FONT_STACK}" font-size="${sizePx}" font-weight="bold" text-anchor="end"><tspan fill="transparent">N</tspan><tspan fill="${HOLE}">o</tspan><tspan fill="${defaultColor}">rdic</tspan><tspan fill="transparent">A</tspan><tspan fill="${defaultColor}">im</tspan></text>`;

  const lineArt = (points: ReadonlyArray<readonly [number, number]>): string => {
    const path = points.map(([ox, oy]) => `${at(ox, endX)},${at(oy, y)}`).join(' ');
    const line = `<polyline points="${path}" fill="none" stroke="${TREND_COLOR}" stroke-width="${(WORDMARK_STROKE_WIDTH * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" />`;
    const dots = points
      .map(([ox, oy]) => `<circle cx="${at(ox, endX)}" cy="${at(oy, y)}" r="${(WORDMARK_DOT_RADIUS * k).toFixed(2)}" fill="${TREND_COLOR}" />`)
      .join('');
    return line + dots;
  };

  const [cx1, cy, cx2, cy2] = WORDMARK_A_CROSSBAR;
  const crossbar = `<line x1="${at(cx1, endX)}" y1="${at(cy, y)}" x2="${at(cx2, endX)}" y2="${at(cy2, y)}" stroke="${TREND_COLOR}" stroke-width="${(WORDMARK_CROSSBAR_WIDTH * k).toFixed(2)}" stroke-linecap="round" />`;

  return text + lineArt(WORDMARK_N) + crossbar + lineArt(WORDMARK_A);
}

export function brandMotif(x: number, y: number, size: number): string {
  const k = size / 100;
  const at = (v: number, o: number) => (o + v * k).toFixed(2);
  const len = (v: number) => (v * k).toFixed(2);
  const c = (v: number, o: number) => at(v, o);
  const points = TREND_LINE.map(([px, py]) => `${c(px, x)},${c(py, y)}`).join(' ');
  const trendLine = `<polyline points="${points}" fill="none" stroke="${TREND_COLOR}" stroke-width="${len(TREND_LINE_WIDTH)}" stroke-linecap="round" stroke-linejoin="round" />`;
  const trendDots = TREND_LINE.map(([px, py]) => `<circle cx="${c(px, x)}" cy="${c(py, y)}" r="${len(TREND_DOT_RADIUS)}" fill="${TREND_COLOR}" />`).join('');
  const rings = RINGS.map(
    ([r, stroke, width]) => `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(r)}" fill="none" stroke="${stroke}" stroke-width="${len(width)}" />`,
  ).join('');
  const bullseye = `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(BULLSEYE_RADIUS)}" fill="none" stroke="${PAPER}" stroke-width="${len(BULLSEYE_WIDTH)}" />`;
  const holes = HOLES.map(
    ([hx, hy, r]) => `<circle cx="${c(hx, x)}" cy="${c(hy, y)}" r="${len(r)}" fill="${HOLE}" stroke="${PAPER}" stroke-width="${len(0.8)}" />`,
  ).join('');
  return `<g class="brand-mark">${trendLine}${trendDots}${rings}${bullseye}${holes}</g>`;
}
