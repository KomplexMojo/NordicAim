// REV-93: how Home's session rows read and are searched. Pure.

import type { BiathlonSession } from '../domain/session';

/** A search box appears from this many sessions. */
export const SEARCH_FROM = 8;

type Timed = Pick<BiathlonSession, 'createdAt'>;

/** `HH:MM` of when the session was started, in the phone's local time, so two sessions on one day read differently. */
export function sessionTimeLabel(session: Timed): string {
  const d = new Date(session.createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Every word of the query must appear in the session's name or date (case-insensitive). An empty query matches all. */
export function matchesSession(session: Pick<BiathlonSession, 'name' | 'sessionDate'>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const hay = `${session.name} ${session.sessionDate}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export type SessionSortDirection = 'asc' | 'desc';

type Dated = Pick<BiathlonSession, 'sessionDate' | 'createdAt'>;

/**
 * By `sessionDate`, then `createdAt` to order same-day sessions (the row's own two fields), `'desc'` (the default,
 * most recent first) or `'asc'`. A new array; the input is never mutated.
 */
export function sortSessions<T extends Dated>(sessions: readonly T[], direction: SessionSortDirection): T[] {
  const sign = direction === 'desc' ? -1 : 1;
  return [...sessions].sort((a, b) => {
    if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? -sign : sign;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -sign : sign;
    return 0;
  });
}
