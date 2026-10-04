// leaderboard.md §6 (issue #42): adding received submissions to this phone's board. Pure: no clock, no storage; signatures are
// checked by the caller before anything reaches here.

import type { BoardPosition } from './score';
import type { SubmissionPreview } from './select';
import { boardRow, compareRows, type BoardRow, type Submission } from './submission';

/** At most this many shooters per board (prone, standing), owner 2026-10-01. */
export const BOARD_CAP = 100;
const POSITIONS: readonly BoardPosition[] = ['prone', 'standing'];

export interface MergeSummary {
  /** Shooters this board did not have. */
  added: number;
  /** Shooters whose newer submission replaced the one held. */
  updated: number;
  /** The same or an older submission than the one held. */
  unchanged: number;
  /** Submissions that did not make the top {@link BOARD_CAP} of either board. */
  overCap: number;
}

export interface MergeResult {
  submissions: Submission[];
  summary: MergeSummary;
}

/**
 * leaderboard.md §6: one submission per shooter (public key), the newest by its signed time; then each board keeps its best
 * {@link BOARD_CAP} rows, and a submission is kept while it is on either board. `ownKey`'s submissions are never held here: this
 * phone's own row is always worked out live from its targets.
 */
export function mergeSubmissions(held: readonly Submission[], incoming: readonly Submission[], ownKey: string | null): MergeResult {
  const byKey = new Map(held.map((s) => [s.publicKey, s]));
  const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, overCap: 0 };
  for (const s of incoming) {
    if (s.publicKey === ownKey) {
      summary.unchanged += 1;
      continue;
    }
    const current = byKey.get(s.publicKey);
    if (current === undefined) {
      byKey.set(s.publicKey, s);
      summary.added += 1;
    } else if (s.signedAt > current.signedAt) {
      byKey.set(s.publicKey, s);
      summary.updated += 1;
    } else {
      summary.unchanged += 1;
    }
  }

  const all = [...byKey.values()];
  const keep = new Set<string>();
  for (const position of POSITIONS) {
    for (const row of rankRows(all, position).slice(0, BOARD_CAP)) keep.add(row.publicKey);
  }
  const submissions = all.filter((s) => keep.has(s.publicKey));
  const incomingKept = new Set(incoming.map((s) => s.publicKey));
  summary.overCap = all.filter((s) => !keep.has(s.publicKey) && incomingKept.has(s.publicKey)).length;
  return { submissions, summary };
}

/** One board's rows, best first. */
export function rankRows(submissions: readonly Submission[], position: BoardPosition): BoardRow[] {
  return submissions
    .map((s) => boardRow(s, position))
    .filter((r): r is BoardRow => r !== null)
    .sort(compareRows);
}

/** This phone's own row, worked out live from its preview (never from a stored submission); null until it has the full 5. */
export function ownRow(preview: SubmissionPreview, me: { publicKey: string | null; name: string; club: string; picture: string | null }): BoardRow | null {
  if (!preview.complete) return null;
  const targets = preview.targets.map((t) => ({ date: t.sessionDate, check: t.check }));
  const groups = targets.map((t) => t.check.final.groupMm).filter((g): g is number => g !== null);
  return {
    publicKey: me.publicKey ?? 'this-phone',
    name: me.name === '' ? 'You' : me.name,
    club: me.club,
    picture: me.picture,
    signedAt: '',
    position: preview.position,
    targets,
    average: preview.average ?? 0,
    xCount: targets.reduce((sum, t) => sum + t.check.final.xCount, 0),
    meanGroupMm: groups.length === 0 ? null : groups.reduce((a, b) => a + b, 0) / groups.length,
    firstDate: targets.map((t) => t.date).sort()[0]!,
    edited: preview.edited,
    flagged: preview.flagged,
  };
}

/** One board as shown: the held rows and this phone's own row (which replaces any held copy of it), best first. */
export function boardRows(held: readonly Submission[], own: BoardRow | null, position: BoardPosition): BoardRow[] {
  const rows = rankRows(held, position).filter((r) => r.publicKey !== own?.publicKey);
  return own === null ? rows : [...rows, own].sort(compareRows);
}
