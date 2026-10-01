// leaderboard.md §5–§6 (issue #42): this phone's board — its own signed submission, the submissions it has received, and
// importing more. Nothing here sends anything anywhere; sharing is the owner's tap on the Board screen.

import { BOARD_CAP, mergeSubmissions, type MergeSummary } from '@/lib/leaderboard/merge';
import { boardFileName, boardFileText, checkSubmissions, rawSubmissions, submissionFileName, submissionFileText } from '@/lib/leaderboard/file';
import { boardIdentity, type BoardIdentity } from '@/lib/leaderboard/identity';
import { previewSubmission, type MyBoardTarget } from '@/lib/leaderboard/select';
import { buildSubmission, Submission } from '@/lib/leaderboard/submission';
import { getBoard, putBoard } from '@/lib/store/board-repo';
import { getSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';
import { loadMyBoardTargets } from './leaderboard';
import { loadProvenanceKey } from './provenance';
import { localToday } from './sessions';

export { BOARD_CAP };

/** Why this phone cannot sign a submission yet, or `ready`. */
export type IdentityState = 'ready' | 'no-passphrase' | 'locked';

export interface BoardData {
  mine: MyBoardTarget[];
  held: Submission[];
  ownKey: string | null;
  identity: IdentityState;
  athleteName: string;
  athleteClub: string;
}

async function ownIdentity(ctx: ServiceContext): Promise<BoardIdentity | null> {
  const stampKey = await loadProvenanceKey(ctx);
  return stampKey === null ? null : boardIdentity(stampKey);
}

/** The submissions held on this phone; one that no longer reads is skipped, never the whole board. */
export async function loadHeldSubmissions(ctx: ServiceContext): Promise<Submission[]> {
  const board = await getBoard(ctx.db);
  return board.submissions.flatMap((raw) => {
    const parsed = Submission.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function loadBoard(ctx: ServiceContext): Promise<BoardData> {
  const [mine, held, settings, identity] = await Promise.all([
    loadMyBoardTargets(ctx),
    loadHeldSubmissions(ctx),
    getSettings(ctx.db),
    ownIdentity(ctx),
  ]);
  return {
    mine,
    held,
    ownKey: identity?.publicKey ?? null,
    identity: identity !== null ? 'ready' : settings.athleteSalt === null ? 'no-passphrase' : 'locked',
    athleteName: settings.athleteName.trim(),
    athleteClub: settings.athleteClub.trim(),
  };
}

export type MySubmission =
  | { status: 'ok'; submission: Submission; fileName: string; text: string }
  | { status: 'no-passphrase' | 'locked' | 'no-name' | 'not-enough' };

/** leaderboard.md §5: this phone's submission, signed now, ready to share as a file. */
export async function createMySubmission(ctx: ServiceContext): Promise<MySubmission> {
  const data = await loadBoard(ctx);
  if (data.athleteName === '') return { status: 'no-name' };
  const identity = await ownIdentity(ctx);
  if (identity === null) return { status: data.identity === 'ready' ? 'locked' : data.identity };
  const submission = await buildSubmission({
    identity,
    name: data.athleteName,
    club: data.athleteClub,
    signedAt: ctx.now().toISOString(),
    prone: previewSubmission(data.mine, 'prone'),
    standing: previewSubmission(data.mine, 'standing'),
  });
  if (submission === null) return { status: 'not-enough' };
  return { status: 'ok', submission, fileName: submissionFileName(data.athleteName, localToday(ctx)), text: submissionFileText(submission) };
}

/** leaderboard.md §6 (decision 44): every submission on this board, with this phone's own when it can sign one. */
export async function createBoardFile(ctx: ServiceContext): Promise<{ text: string; fileName: string; count: number }> {
  const own = await createMySubmission(ctx);
  const held = await loadHeldSubmissions(ctx);
  const submissions = own.status === 'ok' ? [own.submission, ...held] : held;
  return { text: boardFileText(submissions, ctx.now().toISOString()), fileName: boardFileName(localToday(ctx)), count: submissions.length };
}

export interface ImportPreview {
  accepted: Submission[];
  rejected: number;
  summary: MergeSummary;
}

/** leaderboard.md §6: what importing `text` would do, before anything is saved; null when it is not a board or submission file. */
export async function previewImport(ctx: ServiceContext, text: string): Promise<ImportPreview | null> {
  const raws = rawSubmissions(text);
  if (raws === null) return null;
  const { accepted, rejected } = await checkSubmissions(raws);
  const [held, identity] = await Promise.all([loadHeldSubmissions(ctx), ownIdentity(ctx)]);
  const { summary } = mergeSubmissions(held, accepted, identity?.publicKey ?? null);
  return { accepted, rejected, summary };
}

/** Adds checked submissions to the board (newest per shooter wins, {@link BOARD_CAP} per board). Importing twice changes nothing. */
export async function applyImport(ctx: ServiceContext, accepted: readonly Submission[]): Promise<MergeSummary> {
  const identity = await ownIdentity(ctx);
  const tx = ctx.db.transaction('board', 'readwrite');
  const board = await getBoard(tx);
  const held = board.submissions.flatMap((raw) => {
    const parsed = Submission.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const { submissions, summary } = mergeSubmissions(held, accepted, identity?.publicKey ?? null);
  await putBoard(tx, { ...board, submissions });
  await tx.done;
  return summary;
}

/**
 * leaderboard.md §8: a full backup's board, added after the rest of a restore. Every submission is checked again (shape and signature)
 * and merged like an import, newest per shooter winning, so there is no Keep / Replace question. Returns how many were taken in.
 */
export async function restoreBoard(ctx: ServiceContext, board: { submissions: unknown[] } | undefined): Promise<number> {
  if (board === undefined || board.submissions.length === 0) return 0;
  const { accepted } = await checkSubmissions(board.submissions);
  if (accepted.length === 0) return 0;
  const summary = await applyImport(ctx, accepted);
  return summary.added + summary.updated;
}
