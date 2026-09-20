// REV-84: the precision tally as rows of ring, shots and the points they add. Pure.

export interface TallyRow {
  ring: number;
  shots: number;
  /** What this ring adds to the score: the ring's value times the shots on it. */
  points: number;
}

export interface Tally {
  rows: TallyRow[];
  /** The sum of every row's points, which is the target's total. */
  total: number;
}

/** Rings 10 down to 0, each with its shots and the points they add (`ring × shots`). */
export function tallyRows(tally: readonly number[]): Tally {
  const rows: TallyRow[] = [];
  for (let ring = 10; ring >= 0; ring--) {
    const shots = tally[ring] ?? 0;
    rows.push({ ring, shots, points: ring * shots });
  }
  return { rows, total: rows.reduce((sum, r) => sum + r.points, 0) };
}
