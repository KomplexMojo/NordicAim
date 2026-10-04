// REV-141: a session's date can be set on the metadata screen, so a session shot on an earlier day can be recorded. Pure.

import { LocalDate } from './primitives';

/** The name a new session gets (`createSession`, analysis-pipeline §1). */
export function defaultSessionName(sessionDate: string): string {
  return `Session ${sessionDate}`;
}

/** A default name follows the date when it changes; a name the athlete typed is kept. */
export function nameForNewDate(name: string, oldDate: string, newDate: string): string {
  return name.trim() === defaultSessionName(oldDate) ? defaultSessionName(newDate) : name;
}

/** The earliest date a session can be given. */
export const EARLIEST_SESSION_DATE = '2000-01-01';

/**
 * Whether `date` can be a session's date: a real calendar day (`YYYY-MM-DD`), not before 2000 and not after `today` (the
 * phone's local date). A session is always of a day already shot.
 */
export function isValidSessionDate(date: string, today: string): boolean {
  if (!LocalDate.safeParse(date).success) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return false;
  return date >= EARLIEST_SESSION_DATE && date <= today;
}
