// leaderboard.md §9 (issue #42): a challenge — one shooter's signed, reasoned dispute of one target in another shooter's submission.
// The entry stays on the board, marked challenged; a newer submission from that shooter answers it (the challenge names the
// submission it was made against). Pure apart from WebCrypto.

import { z } from 'zod';

import { UtcIso } from '../domain/primitives';
import { signText, verifyText, type BoardIdentity } from './identity';
import type { BoardPosition } from './score';
import { SUBMISSION_SIZE } from './select';

export const CHALLENGE_FORMAT = 'nordic-aim-board-challenge';
export const MAX_CHALLENGE_REASON = 200;
/** At most this many challenges are kept against one submission. */
export const MAX_CHALLENGES_PER_SUBMISSION = 20;

const Key = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const Challenge = z.object({
  format: z.literal(CHALLENGE_FORMAT),
  version: z.literal(1),
  challenger: Key,
  challengerName: z.string().trim().min(1).max(40),
  /** The challenged shooter, the submission (by its signed time), and the target within it. */
  shooter: Key,
  submissionSignedAt: UtcIso,
  position: z.enum(['prone', 'standing']),
  index: z.number().int().min(0).max(SUBMISSION_SIZE - 1),
  reason: z.string().trim().min(1).max(MAX_CHALLENGE_REASON),
  createdAt: UtcIso,
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});
export type Challenge = z.infer<typeof Challenge>;
type UnsignedChallenge = Omit<Challenge, 'signature'>;

function canonicalChallenge(c: UnsignedChallenge): string {
  return JSON.stringify({
    format: c.format,
    version: c.version,
    challenger: c.challenger,
    challengerName: c.challengerName,
    shooter: c.shooter,
    submissionSignedAt: c.submissionSignedAt,
    position: c.position,
    index: c.index,
    reason: c.reason,
    createdAt: c.createdAt,
  });
}

export interface ChallengeTarget {
  shooter: string;
  submissionSignedAt: string;
  position: BoardPosition;
  index: number;
}

export async function signChallenge(
  identity: BoardIdentity,
  challengerName: string,
  target: ChallengeTarget,
  reason: string,
  createdAt: string,
): Promise<Challenge> {
  const unsigned: UnsignedChallenge = {
    format: CHALLENGE_FORMAT,
    version: 1,
    challenger: identity.publicKey,
    challengerName: challengerName.trim(),
    ...target,
    reason: reason.trim(),
    createdAt,
  };
  return { ...unsigned, signature: await signText(identity.privateKey, canonicalChallenge(unsigned)) };
}

export async function verifyChallenge(c: Challenge): Promise<boolean> {
  const { signature, ...unsigned } = c;
  return verifyText(c.challenger, canonicalChallenge(unsigned), signature);
}

/** Each challenge parsed and its signature checked, one at a time. */
export async function checkChallenges(raws: readonly unknown[]): Promise<{ accepted: Challenge[]; rejected: number }> {
  const accepted: Challenge[] = [];
  let rejected = 0;
  for (const raw of raws) {
    const parsed = Challenge.safeParse(raw);
    if (parsed.success && (await verifyChallenge(parsed.data))) accepted.push(parsed.data);
    else rejected += 1;
  }
  return { accepted, rejected };
}

const challengeKey = (c: Challenge): string => [c.challenger, c.shooter, c.submissionSignedAt, c.position, c.index].join('|');

/**
 * leaderboard.md §9: one challenge per challenger and target (the newest), kept only while it still applies — against a submission
 * this board holds, or against this phone's own shooter (whose row is live) — and at most {@link MAX_CHALLENGES_PER_SUBMISSION} per
 * submission. Returns the kept list and how many of `incoming` were new.
 */
export function mergeChallenges(
  held: readonly Challenge[],
  incoming: readonly Challenge[],
  live: { submissions: ReadonlyArray<{ publicKey: string; signedAt: string }>; ownKey: string | null },
): { challenges: Challenge[]; added: number } {
  const byKey = new Map(held.map((c) => [challengeKey(c), c]));
  let added = 0;
  for (const c of incoming) {
    const current = byKey.get(challengeKey(c));
    if (current === undefined) added += 1;
    if (current === undefined || c.createdAt > current.createdAt) byKey.set(challengeKey(c), c);
  }
  const applies = new Set(live.submissions.map((s) => `${s.publicKey}|${s.signedAt}`));
  const perSubmission = new Map<string, number>();
  const challenges = [...byKey.values()]
    .filter((c) => c.shooter === live.ownKey || applies.has(`${c.shooter}|${c.submissionSignedAt}`))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .filter((c) => {
      const k = `${c.shooter}|${c.submissionSignedAt}`;
      const n = perSubmission.get(k) ?? 0;
      perSubmission.set(k, n + 1);
      return n < MAX_CHALLENGES_PER_SUBMISSION;
    });
  return { challenges, added: Math.min(added, challenges.length) };
}

/** The challenges against one shooter's row: their current submission's (`signedAt`), or for this phone's own live row, all of them. */
export function challengesFor(challenges: readonly Challenge[], shooter: string, position: BoardPosition, signedAt: string | null): Challenge[] {
  return challenges.filter((c) => c.shooter === shooter && c.position === position && (signedAt === null || c.submissionSignedAt === signedAt));
}
