import type { ZodError } from 'zod';

/** At most this many field problems are named; the rest are counted, so a toast stays readable. */
const MAX_REPORTED_ISSUES = 3;

/**
 * Why a stored record did not parse, in the message: `name: too small` rather than only the key. The
 * owner hit "Corrupt record in store \"sessions\"" with nothing to act on (2026-09-19). `schemaVersion`
 * says so plainly, because that is what a record written by a NEWER build looks like to an older one.
 */
function describe(error: ZodError | undefined): string {
  if (error === undefined) return '';
  const issues = error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `${path}: ${issue.message}`;
  });
  const more = error.issues.length - issues.length;
  const tail = more > 0 ? `, +${more} more` : '';
  return issues.length === 0 ? '' : ` — ${issues.join('; ')}${tail}`;
}

export class CorruptRecordError extends Error {
  constructor(store: string, key: string, error?: ZodError) {
    super(`Corrupt record in store "${store}" for key "${key}"${describe(error)}`);
    this.name = 'CorruptRecordError';
  }
}
