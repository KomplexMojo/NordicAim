// Issue #65 (REV-144): the target mm -> image px homography through point pairs (least squares, h33 = 1), for the printed sheet's
// corner markers. Pure; no OpenCV. `fit-homography.ts` fits circles instead; the result type and `mmToPxH` are shared.

import type { Homography } from './homography';

/** Solves A x = b for a small square system by Gaussian elimination with partial pivoting; null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * The homography taking each `mm` point (+y up) to its image `px` point, least squares over all pairs (at least four, not all on
 * one line). Both sides are normalised first, so millimetres and thousands of pixels stay well conditioned.
 */
export function homographyFromPoints(
  pairs: ReadonlyArray<{ mm: { xMm: number; yMm: number }; px: { x: number; y: number } }>,
): Homography | null {
  if (pairs.length < 4) return null;
  const norm = (pts: Array<{ x: number; y: number }>) => {
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const d = pts.reduce((s, p) => s + Math.hypot(p.x - mx, p.y - my), 0) / pts.length || 1;
    const k = Math.SQRT2 / d;
    return { k, mx, my };
  };
  const from = pairs.map((p) => ({ x: p.mm.xMm, y: p.mm.yMm }));
  const to = pairs.map((p) => p.px);
  const nf = norm(from);
  const nt = norm(to);
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  pairs.forEach((_, i) => {
    const x = (from[i]!.x - nf.mx) * nf.k;
    const y = (from[i]!.y - nf.my) * nf.k;
    const u = (to[i]!.x - nt.mx) * nt.k;
    const v = (to[i]!.y - nt.my) * nt.k;
    const rows: Array<[number[], number]> = [
      [[x, y, 1, 0, 0, 0, -u * x, -u * y], u],
      [[0, 0, 0, x, y, 1, -v * x, -v * y], v],
    ];
    for (const [row, rhs] of rows) {
      for (let a = 0; a < 8; a++) {
        atb[a]! += row[a]! * rhs;
        for (let b = 0; b < 8; b++) ata[a]![b]! += row[a]! * row[b]!;
      }
    }
  });
  const h = solve(ata, atb);
  if (h === null) return null;
  // Undo the normalisation: H = Tto^-1 · Hn · Tfrom.
  const hn = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  const tf = [nf.k, 0, -nf.k * nf.mx, 0, nf.k, -nf.k * nf.my, 0, 0, 1];
  const ttInv = [1 / nt.k, 0, nt.mx, 0, 1 / nt.k, nt.my, 0, 0, 1];
  const mul = (p: number[], q: number[]) =>
    [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => p[r * 3]! * q[c]! + p[r * 3 + 1]! * q[3 + c]! + p[r * 3 + 2]! * q[6 + c]!));
  const out = mul(ttInv, mul(hn, tf));
  const s = out[8]!;
  return out.map((v) => v / s) as unknown as Homography;
}
