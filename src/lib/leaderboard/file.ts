// leaderboard.md §6 (issue #42): the two files a board travels in — one shooter's submission, or a whole board — and reading
// either back. Every submission is checked on its own (its shape and its signature); a bad one is rejected without the rest.

import { fileNameSlug } from '../backup/format';
import { Submission, verifySubmission } from './submission';

export const BOARD_FILE_FORMAT = 'nordic-aim-board';

export interface BoardFile {
  format: typeof BOARD_FILE_FORMAT;
  version: 1;
  exportedAt: string;
  submissions: Submission[];
}

/** A whole board: this phone's own submission (when it has one) and every submission it holds, from every club (decision 44). */
export function boardFileText(submissions: readonly Submission[], exportedAt: string): string {
  const file: BoardFile = { format: BOARD_FILE_FORMAT, version: 1, exportedAt, submissions: [...submissions] };
  return JSON.stringify(file);
}

export function submissionFileText(submission: Submission): string {
  return JSON.stringify(submission);
}

export function submissionFileName(name: string, localDate: string): string {
  const slug = fileNameSlug(name);
  return ['nordic-aim-submission', ...(slug === '' ? [] : [slug]), localDate].join('-') + '.json';
}

export function boardFileName(localDate: string): string {
  return `nordic-aim-board-${localDate}.json`;
}

/** The submissions a file holds, unchecked: a board file's list, or a single submission. Null when it is neither. */
export function rawSubmissions(text: string): unknown[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const format = (data as { format?: unknown }).format;
  if (format === BOARD_FILE_FORMAT) {
    const list = (data as { submissions?: unknown }).submissions;
    return Array.isArray(list) ? list : null;
  }
  if (format === 'nordic-aim-board-submission') return [data];
  return null;
}

export interface CheckedSubmissions {
  accepted: Submission[];
  /** Submissions whose shape or signature did not check out. */
  rejected: number;
}

/** Each submission parsed and its signature checked, one at a time. */
export async function checkSubmissions(raws: readonly unknown[]): Promise<CheckedSubmissions> {
  const accepted: Submission[] = [];
  let rejected = 0;
  for (const raw of raws) {
    const parsed = Submission.safeParse(raw);
    if (parsed.success && (await verifySubmission(parsed.data))) accepted.push(parsed.data);
    else rejected += 1;
  }
  return { accepted, rejected };
}
