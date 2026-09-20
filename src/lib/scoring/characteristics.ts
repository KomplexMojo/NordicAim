// REV-88: the observable characteristics of a group of shots, and the potential shooting issues they match. Pure.
// The definitions are `docs/spec/shooting-issues.md` (provisional thresholds, owner and coach to confirm).
//
// Everything is measured in a frame where +x is the trigger side and -x the sling side, so a left-handed shooter's shots are mirrored first
// (`x' = h * x`) and no rule ever mentions a hand.

export type Handedness = 'right' | 'left';

export interface Pt {
  xMm: number;
  yMm: number;
}

/** Provisional (spec §2/§3): the owner's tight is 1.5 MOA; the rest are starting points for a coach to change. */
export const THRESHOLDS = {
  minShots: 5,
  tightMoa: 1.5,
  looseMoa: 3.0,
  offsetMoa: 1.0,
  offsetRatio: 2,
  flyerFactor: 2.5,
  horizontalDeg: 25,
  verticalDeg: 20,
  stringAspect: 0.5,
  diagonalAspect: 0.6,
  diagonalLoDeg: 30,
  diagonalHiDeg: 60,
} as const;

const MM_PER_MOA_AT_50M = (50_000 * Math.tan(Math.PI / 180 / 60)) as number; // ≈ 14.544 mm

export function moa(mm: number): number {
  return mm / MM_PER_MOA_AT_50M;
}

export interface Characteristics {
  /** False below the minimum shot count: the numbers are shown but no issue is reported. */
  enough: boolean;
  n: number;
  /** Grouping. */
  esMm: number | null;
  esMoa: number | null;
  /** Precision: mean distance from the group's own centre. */
  meanRadiusMm: number | null;
  meanRadiusMoa: number | null;
  /** Accuracy: how far the centre is from the bullseye, and RMS distance from it. */
  offsetMm: number | null;
  offsetMoa: number | null;
  accuracyMm: number | null;
  /** The centre in the trigger/sling frame (x' > 0 trigger side), mm. */
  centre: { xMm: number; yMm: number } | null;
  /** Shape: principal-axis aspect (0 a line, 1 round) and angle CCW from +x' in [0, 180). */
  aspect: number | null;
  axisDeg: number | null;
  shape: 'round' | 'horizontal string' | 'vertical string' | 'diagonal string (up to the trigger side)' | 'diagonal string (down to the trigger side)' | null;
  flyers: number;
  /** Share of shots outside the black disc. */
  outsideShare: number | null;
  twoClusters: boolean;
  issues: IssueFinding[];
}

export interface IssueFinding {
  id: string;
  /** Role-named, never left/right. */
  label: string;
  /** The measured values behind the finding. */
  detail: string;
}

export interface CharacterizeOptions {
  handedness: Handedness;
  /** `prone` runs the prone-only rules; `standing` and null skip them. */
  position: 'prone' | 'standing' | null;
  /** The black disc's radius in mm, for the outside-the-disc share. */
  discRadiusMm: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function spread(points: Pt[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      max = Math.max(max, Math.hypot(points[i]!.xMm - points[j]!.xMm, points[i]!.yMm - points[j]!.yMm));
    }
  }
  return max;
}

function centroid(points: Pt[]): Pt {
  return { xMm: points.reduce((s, p) => s + p.xMm, 0) / points.length, yMm: points.reduce((s, p) => s + p.yMm, 0) / points.length };
}

/** A 2-means split; null unless both clusters hold at least two shots. */
function twoClusterSplit(points: Pt[]): { a: Pt[]; b: Pt[] } | null {
  if (points.length < 4) return null;
  let p = points[0]!;
  let q = points[1]!;
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i]!.xMm - points[j]!.xMm, points[i]!.yMm - points[j]!.yMm);
      if (d > best) {
        best = d;
        p = points[i]!;
        q = points[j]!;
      }
    }
  }
  let ca = p;
  let cb = q;
  let a: Pt[] = [];
  let b: Pt[] = [];
  for (let iter = 0; iter < 12; iter++) {
    a = points.filter((pt) => Math.hypot(pt.xMm - ca.xMm, pt.yMm - ca.yMm) <= Math.hypot(pt.xMm - cb.xMm, pt.yMm - cb.yMm));
    b = points.filter((pt) => !a.includes(pt));
    if (a.length === 0 || b.length === 0) return null;
    ca = centroid(a);
    cb = centroid(b);
  }
  return a.length >= 2 && b.length >= 2 ? { a, b } : null;
}

const inArc = (deg: number, lo: number, hi: number): boolean => deg >= lo && deg <= hi;

/** The characteristics of one group of shots, and the issues it matches. Below the minimum shot count only the numbers are given. */
export function characterize(points: readonly Pt[], options: CharacterizeOptions): Characteristics {
  const T = THRESHOLDS;
  const h = options.handedness === 'left' ? -1 : 1;
  const pts: Pt[] = points.map((p) => ({ xMm: h * p.xMm, yMm: p.yMm }));
  const n = pts.length;
  const empty: Characteristics = {
    enough: false,
    n,
    esMm: null,
    esMoa: null,
    meanRadiusMm: null,
    meanRadiusMoa: null,
    offsetMm: null,
    offsetMoa: null,
    accuracyMm: null,
    centre: null,
    aspect: null,
    axisDeg: null,
    shape: null,
    flyers: 0,
    outsideShare: null,
    twoClusters: false,
    issues: [],
  };
  if (n === 0) return empty;

  const c = centroid(pts);
  const d = pts.map((p) => Math.hypot(p.xMm - c.xMm, p.yMm - c.yMm));
  const r = d.reduce((s, v) => s + v, 0) / n;
  const med = median(d);
  const es = n < 2 ? 0 : spread(pts);
  const M = Math.hypot(c.xMm, c.yMm);
  const A = Math.sqrt(pts.reduce((s, p) => s + p.xMm * p.xMm + p.yMm * p.yMm, 0) / n);

  const a = pts.reduce((s, p) => s + (p.xMm - c.xMm) ** 2, 0) / n;
  const cc = pts.reduce((s, p) => s + (p.yMm - c.yMm) ** 2, 0) / n;
  const b = pts.reduce((s, p) => s + (p.xMm - c.xMm) * (p.yMm - c.yMm), 0) / n;
  const mean = (a + cc) / 2;
  const diff = Math.sqrt(((a - cc) / 2) ** 2 + b * b);
  const s1 = Math.sqrt(Math.max(mean + diff, 0));
  const s2 = Math.sqrt(Math.max(mean - diff, 0));
  const aspect = s1 > 0 ? s2 / s1 : 1;
  const axis = ((((0.5 * Math.atan2(2 * b, a - cc)) * 180) / Math.PI) % 180 + 180) % 180;

  const horizontal = aspect <= T.stringAspect && (axis <= T.horizontalDeg || axis >= 180 - T.horizontalDeg);
  const vertical = aspect <= T.stringAspect && Math.abs(axis - 90) <= T.verticalDeg;
  const diagUp = aspect <= T.diagonalAspect && inArc(axis, T.diagonalLoDeg, T.diagonalHiDeg);
  const diagDown = aspect <= T.diagonalAspect && inArc(axis, 180 - T.diagonalHiDeg, 180 - T.diagonalLoDeg);
  const shape: Characteristics['shape'] = horizontal
    ? 'horizontal string'
    : vertical
      ? 'vertical string'
      : diagUp
        ? 'diagonal string (up to the trigger side)'
        : diagDown
          ? 'diagonal string (down to the trigger side)'
          : 'round';

  const flyerIdx = med > 0 ? d.map((v, i) => (v >= T.flyerFactor * med ? i : -1)).filter((i) => i >= 0) : [];
  const core = pts.filter((_, i) => !flyerIdx.includes(i));
  const esCore = core.length < 2 ? 0 : spread(core);
  const coreC = core.length === 0 ? c : centroid(core);
  const outside = pts.filter((p) => Math.hypot(p.xMm, p.yMm) > options.discRadiusMm).length / n;
  const split = twoClusterSplit(pts);
  let twoClusters = false;
  if (split) {
    const ca = centroid(split.a);
    const cb = centroid(split.b);
    const sep = Math.hypot(ca.xMm - cb.xMm, ca.yMm - cb.yMm);
    const w = Math.max(
      split.a.reduce((s, p) => s + Math.hypot(p.xMm - ca.xMm, p.yMm - ca.yMm), 0) / split.a.length,
      split.b.reduce((s, p) => s + Math.hypot(p.xMm - cb.xMm, p.yMm - cb.yMm), 0) / split.b.length,
    );
    twoClusters = sep >= 2 * w && moa(sep) >= 1;
  }

  const esMoa = moa(es);
  const offMoa = moa(M);
  const kappa = r > 0 ? M / r : Number.POSITIVE_INFINITY;
  const xC = moa(c.xMm);
  const yC = moa(c.yMm);
  const enough = n >= T.minShots;
  const prone = options.position === 'prone';
  const issues: IssueFinding[] = [];
  const f = (id: string, label: string, detail: string) => issues.push({ id, label, detail });
  const fmt = (v: number) => v.toFixed(1);

  if (enough) {
    if (esMoa <= T.tightMoa) f('tight', 'Tight group', `${fmt(esMoa)} MOA spread`);
    if (esMoa >= T.looseMoa) f('scattered', 'Scattered group', `${fmt(esMoa)} MOA spread`);
    if (esMoa <= T.looseMoa && offMoa >= T.offsetMoa && kappa >= T.offsetRatio) {
      f('zero-off', 'Zero off', `centre ${fmt(offMoa)} MOA from the bullseye, ${fmt(kappa)} group widths`);
    }
    if (outside >= 0.5) f('fundamentals', 'Fundamentals / equipment', `${Math.round(outside * 100)}% of shots outside the black`);
    if (flyerIdx.length >= 2 && moa(esCore) <= T.tightMoa && outside >= 0.2 && outside < 0.5) {
      f('sight-alignment', 'Sight alignment', `${flyerIdx.length} flyers around a ${fmt(moa(esCore))} MOA core`);
    }
    if (prone && twoClusters) f('position-change', 'Position change', 'two separate clusters');
    if (horizontal && esMoa >= 2 && Math.abs(xC) < T.offsetMoa) f('wind-light', 'Wind or light drift', `horizontal string, ${fmt(esMoa)} MOA`);
    if (prone && horizontal && esMoa >= 2 && xC <= -T.offsetMoa) {
      f('sling-elbow-in', 'Sling-arm elbow too far in', `horizontal string ${fmt(esMoa)} MOA, ${fmt(-xC)} MOA to the sling side`);
    }
    if (prone && diagDown && esMoa >= 2) f('trigger-elbow-out', 'Trigger-arm elbow sliding out', `diagonal string ${fmt(esMoa)} MOA`);
    if (prone && diagUp && esMoa >= 2.5) f('sling-tight', 'Sling too tight', `diagonal string ${fmt(esMoa)} MOA`);
    if (diagUp && esMoa >= 1 && esMoa < 2.5) f('trigger-finger', 'Trigger finger placement', `diagonal string ${fmt(esMoa)} MOA`);
    if (prone && vertical && esMoa >= 2 && Math.abs(xC) < T.offsetMoa) f('sling-loose', 'Sling too loose or slipping', `vertical string ${fmt(esMoa)} MOA`);
    if (vertical && esMoa >= 4 && pts.some((p) => p.yMm > c.yMm && d[pts.indexOf(p)]! >= T.flyerFactor * med) && pts.some((p) => p.yMm < c.yMm && d[pts.indexOf(p)]! >= T.flyerFactor * med)) {
      f('breath-timing', 'Breath control / timing', `vertical string ${fmt(esMoa)} MOA with shots above and below`);
    }
    if (prone && yC >= T.offsetMoa && Math.abs(xC) <= 0.5 * yC && esMoa <= T.looseMoa) f('butt-low', 'Butt too low on the shoulder', `centre ${fmt(yC)} MOA high`);
    if (esMoa <= 2 && yC <= -T.offsetMoa && Math.abs(xC) <= 0.5 * Math.abs(yC)) f('drift-down', 'Light or zero drift down', `centre ${fmt(-yC)} MOA low`);
    if (prone && xC <= -T.offsetMoa && Math.abs(yC) <= 0.5 * Math.abs(xC) && aspect > 0.5 && moa(r) >= 1) {
      f('natural-alignment', 'Natural alignment', `round group ${fmt(-xC)} MOA to the sling side`);
    }
    if (flyerIdx.length === 1 && moa(esCore) <= T.tightMoa) {
      const fl = pts[flyerIdx[0]!]!;
      if (fl.xMm >= coreC.xMm && fl.yMm >= coreC.yMm) f('flinch', 'Trigger control / flinch', `one flyer to the trigger side and above a ${fmt(moa(esCore))} MOA core`);
    }
  }

  return {
    enough,
    n,
    esMm: es,
    esMoa,
    meanRadiusMm: r,
    meanRadiusMoa: moa(r),
    offsetMm: M,
    offsetMoa: offMoa,
    accuracyMm: A,
    centre: { xMm: c.xMm, yMm: c.yMm },
    aspect,
    axisDeg: axis,
    shape,
    flyers: flyerIdx.length,
    outsideShare: outside,
    twoClusters,
    issues,
  };
}
