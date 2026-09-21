// REV-104: the NordicAim mark as SVG, one source for the app icons (scripts/make-icons.ts) and the summary image's header. Pure.
// A biathlon target seen from the firing line: white paper disc, black aiming disc with an accent ring, one white scoring ring (a slim paper margin, REV-121), and a
// tight group of three same-size holes just off centre. Drawn on a 100-unit grid inside the square at (x, y) of side `size`.

const PAPER = '#F7FAFD';
const ACCENT = '#4B94C3';
const AIM = '#0B1220';
const HOLE = '#E8604C';
const HOLES: ReadonlyArray<readonly [number, number, number]> = [
  [58.4, 36.8, 8.4],
  [68, 51.2, 8.4],
  [51.2, 52.4, 8.4],
];

export const BRAND_TILE = '#1F2630';

export function brandMotif(x: number, y: number, size: number): string {
  const k = size / 100;
  const at = (v: number, o: number) => (o + v * k).toFixed(2);
  const len = (v: number) => (v * k).toFixed(2);
  const c = (v: number, o: number) => at(v, o);
  const holes = HOLES.map(
    ([hx, hy, r]) => `<circle cx="${c(hx, x)}" cy="${c(hy, y)}" r="${len(r)}" fill="${HOLE}" stroke="#FFFFFF" stroke-width="${len(2.64)}" />`,
  ).join('');
  return (
    `<g class="brand-mark">` +
    `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(43.2)}" fill="${PAPER}" />` +
    `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(37.2)}" fill="${AIM}" />` +
    `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(37.2)}" fill="none" stroke="${ACCENT}" stroke-width="${len(5.4)}" />` +
    `<circle cx="${c(50, x)}" cy="${c(50, y)}" r="${len(19.2)}" fill="none" stroke="${PAPER}" stroke-width="${len(3.12)}" />` +
    holes +
    `</g>`
  );
}
