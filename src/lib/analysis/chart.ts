// analysis.md §4 (REV-123): the geometry of one trend chart — scales, ticks and the line — so the component only draws.
// Pure: no DOM, no clock.

export interface ChartBox {
  width: number;
  height: number;
  /** Space kept for the y labels (left), and for the x labels (bottom). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ChartPoint {
  index: number;
  x: number;
  y: number;
  value: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  /** SVG path through the points in order; gaps (null values) break the line. */
  path: string;
  yTicks: Array<{ y: number; value: number }>;
  /** Y of the zero line, when asked for and in range. */
  zeroY: number | null;
  domain: [number, number];
  /** §4a (REV-129): the least-squares trend line, clipped to the plot; null below {@link MIN_TREND_SESSIONS} values. */
  trend: TrendSegment | null;
}

export interface TrendSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Change per session, in the metric's own unit. */
  slope: number;
}

/** §4a: two points only restate the line between them, so a trend needs three sessions with a value. */
export const MIN_TREND_SESSIONS = 3;

/**
 * §4a: ordinary least squares of value on session index (the chart's own evenly spaced x), over the sessions that have a
 * value. Null with fewer than {@link MIN_TREND_SESSIONS}.
 */
export function leastSquares(values: Array<number | null>): { slope: number; intercept: number; first: number; last: number } | null {
  const pts = values.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
  if (pts.length < MIN_TREND_SESSIONS) return null;
  const n = pts.length;
  const mi = pts.reduce((s, p) => s + p.i, 0) / n;
  const mv = pts.reduce((s, p) => s + p.v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.i - mi) * (p.v - mv);
    sxx += (p.i - mi) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: mv - slope * mi, first: pts[0]!.i, last: pts.at(-1)!.i };
}

/** A "nice" step (1, 2 or 5 × 10^n) giving about `count` intervals over `span`. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0)) return 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

/**
 * §4: sessions are spaced evenly left to right in order (one per session, not to a time scale, so a burst of sessions
 * stays readable). The y domain covers every value, rounded out to nice ticks; a zero line pulls 0 into the domain.
 */
export function chartGeometry(
  values: Array<number | null>,
  box: ChartBox,
  zeroLine: boolean,
  tickCount = 4,
  /** analysis.md §5: several series on one chart share one y axis, worked out from all of their values. */
  domainFrom: Array<number | null> = values,
): ChartGeometry {
  const present = domainFrom.filter((v): v is number => v !== null);
  let lo = present.length > 0 ? Math.min(...present) : 0;
  let hi = present.length > 0 ? Math.max(...present) : 1;
  if (zeroLine) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi - lo < 1e-9) {
    const pad = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, tickCount);
  const domain: [number, number] = [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];

  const plotW = box.width - box.left - box.right;
  const xAt = (i: number) => (values.length <= 1 ? box.left + plotW / 2 : box.left + (i * plotW) / (values.length - 1));
  const yAt = (v: number) => valueToY(v, box, domain);

  const points: ChartPoint[] = [];
  let path = '';
  let pen = false;
  values.forEach((value, index) => {
    if (value === null) {
      pen = false;
      return;
    }
    const p = { index, x: xAt(index), y: yAt(value), value };
    points.push(p);
    path += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    pen = true;
  });

  const yTicks: Array<{ y: number; value: number }> = [];
  for (let v = domain[0]; v <= domain[1] + step / 2; v += step) {
    const value = Math.abs(v) < step / 1e6 ? 0 : Number(v.toPrecision(12));
    yTicks.push({ y: yAt(value), value });
  }
  const zeroY = zeroLine && domain[0] <= 0 && domain[1] >= 0 ? yAt(0) : null;

  // The fitted line runs from the first to the last session with a value. Its ends can fall past the values' own range, so it
  // is clipped to the domain rather than widening it (several series share one domain, analysis.md §5).
  let trend: TrendSegment | null = null;
  const fit = leastSquares(values);
  if (fit !== null) {
    const at = (i: number) => fit.intercept + fit.slope * i;
    let i1 = fit.first;
    let i2 = fit.last;
    for (const bound of domain) {
      if (fit.slope === 0) break;
      const iAt = (bound - fit.intercept) / fit.slope;
      const outside = (i: number) => (bound === domain[0] ? at(i) < bound : at(i) > bound);
      if (outside(i1)) i1 = Math.max(i1, Math.min(i2, iAt));
      if (outside(i2)) i2 = Math.min(i2, Math.max(i1, iAt));
    }
    trend = { x1: xAt(i1), y1: yAt(at(i1)), x2: xAt(i2), y2: yAt(at(i2)), slope: fit.slope };
  }
  return { points, path, yTicks, zeroY, domain, trend };
}

/** The same value-to-y mapping `chartGeometry` uses internally for its own points and ticks, exposed so a goal
 * marker can be placed at an arbitrary value that didn't come from a `ChartPoint` (goals.md §5 / M28). */
export function valueToY(value: number, box: ChartBox, domain: [number, number]): number {
  const plotH = box.height - box.top - box.bottom;
  const span = domain[1] - domain[0];
  if (span === 0) return box.top + plotH;
  return box.top + plotH - ((value - domain[0]) / span) * plotH;
}

/**
 * goals.md §5 / M28: the inverse of {@link valueToY} — an SVG y-coordinate back to a value in `domain`, for reading
 * a pointer or key press on the chart. Clamped to `domain`, so a drag can't leave the visible axis (a value saved
 * at that edge widens the domain on the next render, letting a further drag push past it).
 */
export function valueAt(y: number, box: ChartBox, domain: [number, number]): number {
  const plotH = box.height - box.top - box.bottom;
  const span = domain[1] - domain[0];
  if (plotH <= 0 || span === 0) return domain[0];
  const raw = domain[0] + ((plotH - (y - box.top)) / plotH) * span;
  return Math.min(domain[1], Math.max(domain[0], raw));
}
