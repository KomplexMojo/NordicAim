// REV-138 (icon redesign), owner 2026-10-04 (trend line): the NordicAim mark as SVG, one source for the app icons
// (scripts/make-icons.ts) and the summary image's header. Pure. A biathlon target seen from the firing line, drawn
// fine-line rather than filled: three concentric outlined rings and a tight group of three small holes just off
// centre, with a rising trend line from bottom-left to top-right behind them — the target says what it measures,
// the line says the app's whole point (Patterns, Analysis, Goals: spot the trend). Drawn on a 100-unit grid inside
// the square at (x, y) of side `size`, on the caller's own dark background (no filled disc of its own).

const PAPER = '#F7FAFD';
const ACCENT = '#4B94C3';
const HOLE = '#E8604C';
const HOLES: ReadonlyArray<readonly [number, number, number]> = [
  [58.4, 36.8, 3.4],
  [68, 51.2, 3.4],
  [51.2, 52.4, 3.4],
];
const RINGS: ReadonlyArray<readonly [number, string, number]> = [
  [38, PAPER, 1.6],
  [27, ACCENT, 1.6],
  [16, PAPER, 1.2],
];
/** Bottom-left to top-right (SVG y grows downward, so the higher value is the lower point), behind the rings. */
const TREND_LINE: readonly [number, number, number, number] = [10, 90, 90, 10];
const TREND_LINE_WIDTH = 2.2;

export const BRAND_TILE = '#1F2630';

export function brandMotif(x: number, y: number, size: number): string {
  const k = size / 100;
  const at = (v: number, o: number) => (o + v * k).toFixed(2);
  const len = (v: number) => (v * k).toFixed(2);
  const c = (v: number, o: number) => at(v, o);
  const [x1, y1, x2, y2] = TREND_LINE;
  const trendLine = `<line x1="${c(x1, x)}" y1="${c(y1, y)}" x2="${c(x2, x)}" y2="${c(y2, y)}" stroke="${ACCENT}" stroke-width="${len(TREND_LINE_WIDTH)}" stroke-linecap="round" />`;
  const rings = RINGS.map(
    ([r, stroke, width]) => `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(r)}" fill="none" stroke="${stroke}" stroke-width="${len(width)}" />`,
  ).join('');
  const holes = HOLES.map(
    ([hx, hy, r]) => `<circle cx="${c(hx, x)}" cy="${c(hy, y)}" r="${len(r)}" fill="${HOLE}" stroke="${PAPER}" stroke-width="${len(0.8)}" />`,
  ).join('');
  return `<g class="brand-mark">${trendLine}${rings}${holes}</g>`;
}
