// leaderboard.md §5–§9 (issue #42): this phone's board — its own signed submission, the submissions and challenges it has received,
// importing more, and challenging an entry. Nothing here sends anything anywhere; sharing is the owner's tap on the Board screen.

import { Challenge, checkChallenges, mergeChallenges, signChallenge, type ChallengeTarget } from '@/lib/leaderboard/challenge';
import { boardFileName, boardFileText, checkSubmissions, readBoardFile, submissionFileName, submissionFileText } from '@/lib/leaderboard/file';
import { boardIdentity, type BoardIdentity } from '@/lib/leaderboard/identity';
import { BOARD_CAP, mergeSubmissions, type MergeSummary } from '@/lib/leaderboard/merge';
import { previewSubmission, type MyBoardTarget } from '@/lib/leaderboard/select';
import { buildSubmission, Submission } from '@/lib/leaderboard/submission';
import type { BoardStore } from '@/lib/leaderboard/store-schema';
import { getBoard, putBoard } from '@/lib/store/board-repo';
import { getSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';
import { loadMyBoardTargets } from './leaderboard';
import { loadProvenanceKey } from './provenance';
import { localToday } from './sessions';

export { BOARD_CAP };

/** Why this phone cannot sign yet, or `ready`. */
export type IdentityState = 'ready' | 'no-passphrase' | 'locked';

export interface BoardData {
  mine: MyBoardTarget[];
  held: Submission[];
  challenges: Challenge[];
  ownKey: string | null;
  identity: IdentityState;
  athleteName: string;
  athleteClub: string;
}

async function ownIdentity(ctx: ServiceContext): Promise<BoardIdentity | null> {
  const stampKey = await loadProvenanceKey(ctx);
  return stampKey === null ? null : boardIdentity(stampKey);
}

/** The stored row read item by item: one submission or challenge that no longer reads is skipped, never the whole board. */
function readStore(board: BoardStore): { submissions: Submission[]; challenges: Challenge[] } {
  return {
    submissions: board.submissions.flatMap((raw) => {
      const parsed = Submission.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    }),
    challenges: board.challenges.flatMap((raw) => {
      const parsed = Challenge.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}

export async function loadHeldSubmissions(ctx: ServiceContext): Promise<Submission[]> {
  return readStore(await getBoard(ctx.db)).submissions;
}

export async function loadBoard(ctx: ServiceContext): Promise<BoardData> {
  const [mine, board, settings, identity] = await Promise.all([loadMyBoardTargets(ctx), getBoard(ctx.db), getSettings(ctx.db), ownIdentity(ctx)]);
  const { submissions, challenges } = readStore(board);
  return {
    mine,
    held: submissions,
    challenges,
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

/** leaderboard.md §6 (decision 44): every submission and challenge on this board, with this phone's own submission when it can sign one. */
export async function createBoardFile(ctx: ServiceContext): Promise<{ text: string; fileName: string; count: number }> {
  const own = await createMySubmission(ctx);
  const { submissions: held, challenges } = readStore(await getBoard(ctx.db));
  const submissions = own.status === 'ok' ? [own.submission, ...held] : held;
  return { text: boardFileText(submissions, ctx.now().toISOString(), challenges), fileName: boardFileName(localToday(ctx)), count: submissions.length };
}

export interface ImportPreview {
  accepted: Submission[];
  rejected: number;
  summary: MergeSummary;
  challenges: { accepted: Challenge[]; rejected: number };
}

/** leaderboard.md §6: what importing `text` would do, before anything is saved; null when it is not a board or submission file. */
export async function previewImport(ctx: ServiceContext, text: string): Promise<ImportPreview | null> {
  const contents = readBoardFile(text);
  if (contents === null) return null;
  const [{ accepted, rejected }, challenges] = await Promise.all([checkSubmissions(contents.submissions), checkChallenges(contents.challenges)]);
  const [held, identity] = await Promise.all([loadHeldSubmissions(ctx), ownIdentity(ctx)]);
  const { summary } = mergeSubmissions(held, accepted, identity?.publicKey ?? null);
  return { accepted, rejected, summary, challenges };
}

export interface ImportResult extends MergeSummary {
  /** Challenges this board did not have. */
  challengesAdded: number;
}

/**
 * Adds checked submissions and challenges to the board: newest submission per shooter wins, {@link BOARD_CAP} per board, and a
 * challenge is kept while the submission it names is still held. Importing the same file twice changes nothing.
 */
export async function applyImport(ctx: ServiceContext, accepted: readonly Submission[], challenges: readonly Challenge[] = []): Promise<ImportResult> {
  const ownKey = (await ownIdentity(ctx))?.publicKey ?? null;
  const tx = ctx.db.transaction('board', 'readwrite');
  const board = await getBoard(tx);
  const held = readStore(board);
  const { submissions, summary } = mergeSubmissions(held.submissions, accepted, ownKey);
  const merged = mergeChallenges(held.challenges, challenges, { submissions, ownKey });
  await putBoard(tx, { ...board, submissions, challenges: merged.challenges });
  await tx.done;
  return { ...summary, challengesAdded: merged.added };
}

/**
 * leaderboard.md §8: a full backup's board, added after the rest of a restore. Everything is checked again (shape and signature)
 * and merged like an import, so there is no Keep / Replace question. Returns how many shooters were taken in.
 */
export async function restoreBoard(ctx: ServiceContext, board: { submissions: unknown[]; challenges?: unknown[] } | undefined): Promise<number> {
  if (board === undefined || board.submissions.length === 0) return 0;
  const [{ accepted }, challenges] = await Promise.all([checkSubmissions(board.submissions), checkChallenges(board.challenges ?? [])]);
  if (accepted.length === 0) return 0;
  const result = await applyImport(ctx, accepted, challenges.accepted);
  return result.added + result.updated;
}

export type ChallengeResult =
  | { status: 'ok'; challenge: Challenge; fileName: string; text: string }
  | { status: 'no-passphrase' | 'locked' | 'no-name' | 'own' };

/**
 * leaderboard.md §9: challenges one target of another shooter's entry, signed by this phone and kept on its board; the result is a
 * board file holding just the challenge, for the owner to share (nothing is sent automatically).
 */
export async function createChallenge(ctx: ServiceContext, target: ChallengeTarget, reason: string): Promise<ChallengeResult> {
  const settings = await getSettings(ctx.db);
  const name = settings.athleteName.trim();
  if (name === '') return { status: 'no-name' };
  const identity = await ownIdentity(ctx);
  if (identity === null) return { status: settings.athleteSalt === null ? 'no-passphrase' : 'locked' };
  if (target.shooter === identity.publicKey) return { status: 'own' };
  const challenge = await signChallenge(identity, name, target, reason, ctx.now().toISOString());
  await applyImport(ctx, [], [challenge]);
  return {
    status: 'ok',
    challenge,
    fileName: `nordic-aim-challenge-${localToday(ctx)}.json`,
    text: boardFileText([], ctx.now().toISOString(), [challenge]),
  };
}
