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
  const plotH = box.height - box.top - box.bottom;
  const xAt = (i: number) => (values.length <= 1 ? box.left + plotW / 2 : box.left + (i * plotW) / (values.length - 1));
  const yAt = (v: number) => box.top + plotH - ((v - domain[0]) / (domain[1] - domain[0])) * plotH;

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
  return { points, path, yTicks, zeroY, domain };
}
