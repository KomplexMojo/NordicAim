// capture-overlay.md §1.1, data-model §7: the quick-start button opens today's local session, creating it once.

import { defaultSessionName } from '@/lib/domain/session-date';
import type { BiathlonSession } from '@/lib/domain/session';
import { clientNow } from '@/lib/media/capture-time';

import type { ServiceContext } from './context';
import { createSession, listSessions, localToday } from './sessions';

export type NavigateFn = (path: string) => void;

/** `true` when a session with `sessionDate` = today (local) already exists. */
export function quickStartLabel(sessions: BiathlonSession[], now: Date): string {
  const today = clientNow(now).clientLocal.slice(0, 10);
  const hasToday = sessions.some((s) => s.sessionDate === today);
  return hasToday ? "Capture (today's session)" : 'Start & capture';
}

/** Finds today's local session or creates `Session <today>` (creates once, then reuses), then navigates to its
 * capture screen. With several sessions today (issue #107's New button), it opens the one created last. */
export async function quickStart(ctx: ServiceContext, navigate: NavigateFn): Promise<BiathlonSession> {
  const today = localToday(ctx);
  const sessions = await listSessions(ctx);
  const existing = sessions
    .filter((s) => s.sessionDate === today)
    .reduce<BiathlonSession | undefined>((latest, s) => (latest === undefined || s.createdAt > latest.createdAt ? s : latest), undefined);
  const session = existing ?? (await createSession(ctx, { sessionDate: today }));
  navigate(`/sessions/${session.id}/capture`);
  return session;
}

/**
 * Issue #107: the name for another session on `sessionDate` — `Session <date>`, then `Session <date> (2)`, `(3)`, … so
 * same-day sessions can be told apart on the list. Pure.
 */
export function newSessionName(sessions: BiathlonSession[], sessionDate: string): string {
  const base = defaultSessionName(sessionDate);
  const taken = new Set(sessions.map((s) => s.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/** Issue #107: the New button — always a fresh session dated today (local), never today's existing one. */
export async function createNewSession(ctx: ServiceContext): Promise<BiathlonSession> {
  const today = localToday(ctx);
  const sessions = await listSessions(ctx);
  return createSession(ctx, { sessionDate: today, name: newSessionName(sessions, today) });
}
