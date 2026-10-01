// leaderboard.md §5 (issue #42): a signed submission — a shooter's best 5 precision prone and/or standing targets, as shot
// positions only (no photo, no GPS). The receiving phone re-scores every target itself and works out the marks. Pure apart from
// WebCrypto (signing and checking).

import { z } from 'zod';

import type { Shot } from '../domain/analysis';
import { MAX_ATHLETE_CLUB, MAX_ATHLETE_NAME } from '../domain/settings';
import { LocalDate, UtcIso } from '../domain/primitives';
import { signText, verifyText, type BoardIdentity } from './identity';
import { correctionCheck, type BoardPosition, type CorrectionCheck } from './score';
import { SUBMISSION_SIZE, type SubmissionPreview } from './select';

export const SUBMISSION_FORMAT = 'nordic-aim-board-submission';

/** A shot as submitted: position in mm to 0.01 mm, and how many rounds went through the hole. */
export const BoardShot = z.object({
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
  m: z.number().int().min(1).max(20),
});
export type BoardShot = z.infer<typeof BoardShot>;

export const SubmittedTarget = z.object({
  date: LocalDate,
  declared: z.number().int().min(1).max(50),
  /** The sender's own reading that the shots or alignment were corrected by hand. */
  edited: z.boolean(),
  /** The automatic shots; null when the target was corrected before they were kept. */
  auto: z.array(BoardShot).max(50).nullable(),
  final: z.array(BoardShot).max(50),
});
export type SubmittedTarget = z.infer<typeof SubmittedTarget>;

const Five = z.array(SubmittedTarget).length(SUBMISSION_SIZE);

export const Submission = z
  .object({
    format: z.literal(SUBMISSION_FORMAT),
    version: z.literal(1),
    publicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    name: z.string().trim().min(1).max(MAX_ATHLETE_NAME),
    club: z.string().trim().max(MAX_ATHLETE_CLUB),
    signedAt: UtcIso,
    prone: Five.optional(),
    standing: Five.optional(),
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
  .refine((s) => s.prone !== undefined || s.standing !== undefined, 'A submission holds at least one position');
export type Submission = z.infer<typeof Submission>;
export type UnsignedSubmission = Omit<Submission, 'signature'>;

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function toBoardShots(shots: readonly Shot[]): BoardShot[] {
  return shots.map((s) => ({ x: round2(s.xMm), y: round2(s.yMm), m: s.multiplicity }));
}

export function fromBoardShots(shots: readonly BoardShot[]): Shot[] {
  return shots.map((s, i) => ({
    id: `s${i}`,
    xMm: s.x,
    yMm: s.y,
    multiplicity: s.m,
    positionOverrides: null,
    source: 'auto',
    confidence: null,
    cluster: false,
    possibleOverlap: false,
  }));
}

function sameBoardShots(a: readonly BoardShot[], b: readonly BoardShot[]): boolean {
  return a.length === b.length && a.every((s, i) => s.x === b[i]!.x && s.y === b[i]!.y && s.m === b[i]!.m);
}

/** The exact text that is signed: every field in a fixed order, so the same submission always signs to the same bytes. */
export function canonicalText(s: UnsignedSubmission): string {
  const target = (t: SubmittedTarget) => ({
    date: t.date,
    declared: t.declared,
    edited: t.edited,
    auto: t.auto === null ? null : t.auto.map((p) => ({ x: p.x, y: p.y, m: p.m })),
    final: t.final.map((p) => ({ x: p.x, y: p.y, m: p.m })),
  });
  return JSON.stringify({
    format: s.format,
    version: s.version,
    publicKey: s.publicKey,
    name: s.name,
    club: s.club,
    signedAt: s.signedAt,
    prone: s.prone === undefined ? null : s.prone.map(target),
    standing: s.standing === undefined ? null : s.standing.map(target),
  });
}

/** One previewed position as it is submitted. */
function submittedTargets(preview: SubmissionPreview): SubmittedTarget[] {
  return preview.targets.map((t) => {
    const final = toBoardShots(t.finalShots);
    return {
      date: t.sessionDate,
      declared: t.declared,
      edited: t.check.edited,
      auto: t.autoShots === null ? null : toBoardShots(t.autoShots),
      final,
    };
  });
}

export interface BuildSubmissionInput {
  identity: BoardIdentity;
  name: string;
  club: string;
  signedAt: string;
  prone: SubmissionPreview;
  standing: SubmissionPreview;
}

/** leaderboard.md §5: the signed submission; each position is in it only when it has the full 5 (decision 35). Null when neither does. */
export async function buildSubmission(input: BuildSubmissionInput): Promise<Submission | null> {
  if (!input.prone.complete && !input.standing.complete) return null;
  const unsigned: UnsignedSubmission = {
    format: SUBMISSION_FORMAT,
    version: 1,
    publicKey: input.identity.publicKey,
    name: input.name.trim(),
    club: input.club.trim(),
    signedAt: input.signedAt,
    ...(input.prone.complete ? { prone: submittedTargets(input.prone) } : {}),
    ...(input.standing.complete ? { standing: submittedTargets(input.standing) } : {}),
  };
  return { ...unsigned, signature: await signText(input.identity.privateKey, canonicalText(unsigned)) };
}

/** Whether the submission's signature is its own key's, over exactly what it says. */
export async function verifySubmission(s: Submission): Promise<boolean> {
  const { signature, ...unsigned } = s;
  return verifyText(s.publicKey, canonicalText(unsigned), signature);
}

/** A received target re-scored on this phone. */
export interface ReceivedTarget {
  date: string;
  check: CorrectionCheck;
}

/** One shooter's row on one board. */
export interface BoardRow {
  publicKey: string;
  name: string;
  club: string;
  signedAt: string;
  position: BoardPosition;
  targets: ReceivedTarget[];
  average: number;
  /** Tie-breaks (leaderboard.md §4): total Xs, then the mean group, then the earliest target date. */
  xCount: number;
  meanGroupMm: number | null;
  firstDate: string;
  edited: boolean;
  flagged: boolean;
}

/**
 * leaderboard.md §3–§4: a position of a submission as a board row, every target scored here under the board rule. Edited is the
 * sender's mark, or a missing baseline, or automatic shots that differ from the final ones; the flag is always worked out here.
 */
export function boardRow(s: Submission, position: BoardPosition): BoardRow | null {
  const list = position === 'prone' ? s.prone : s.standing;
  if (list === undefined) return null;
  const targets = list.map((t): ReceivedTarget => {
    const edited = t.edited || t.auto === null || !sameBoardShots(t.auto, t.final);
    const check = correctionCheck(fromBoardShots(t.final), t.auto === null ? null : fromBoardShots(t.auto), edited, position, t.declared);
    return { date: t.date, check };
  });
  const groups = targets.map((t) => t.check.final.groupMm).filter((g): g is number => g !== null);
  return {
    publicKey: s.publicKey,
    name: s.name,
    club: s.club,
    signedAt: s.signedAt,
    position,
    targets,
    average: targets.reduce((sum, t) => sum + t.check.final.percent, 0) / targets.length,
    xCount: targets.reduce((sum, t) => sum + t.check.final.xCount, 0),
    meanGroupMm: groups.length === 0 ? null : groups.reduce((a, b) => a + b, 0) / groups.length,
    firstDate: targets.map((t) => t.date).sort()[0]!,
    edited: targets.some((t) => t.check.edited),
    flagged: targets.some((t) => t.check.flagged),
  };
}

/** Board order: higher average, more Xs, the smaller mean group, the earlier first target; key last so the order is stable. */
export function compareRows(a: BoardRow, b: BoardRow): number {
  if (a.average !== b.average) return b.average - a.average;
  if (a.xCount !== b.xCount) return b.xCount - a.xCount;
  if (a.meanGroupMm !== b.meanGroupMm) {
    if (a.meanGroupMm === null) return 1;
    if (b.meanGroupMm === null) return -1;
    return a.meanGroupMm - b.meanGroupMm;
  }
  if (a.firstDate !== b.firstDate) return a.firstDate < b.firstDate ? -1 : 1;
  return a.publicKey < b.publicKey ? -1 : a.publicKey > b.publicKey ? 1 : 0;
}
