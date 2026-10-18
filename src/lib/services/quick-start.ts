// capture-overlay.md §1.1, data-model §7: Capture and Import each start a fresh session dated today (REV-162).

import { defaultSessionName } from '@/lib/domain/session-date';
import type { BiathlonSession } from '@/lib/domain/session';

import type { ServiceContext } from './context';
import { createSession, listSessions, localToday } from './sessions';

export type NavigateFn = (path: string) => void;

/** Home Capture button label — always "Capture" (REV-162); continue an existing session from the list. */
export function quickStartLabel(_sessions: BiathlonSession[], _now: Date): string {
  void _sessions;
  void _now;
  return 'Capture';
}

/**
 * Issue #107 / REV-162: the name for another session on `sessionDate` — `Session <date>`, then `Session <date> (2)`,
 * `(3)`, … so same-day sessions can be told apart on the list. Pure.
 */
export function newSessionName(sessions: BiathlonSession[], sessionDate: string): string {
  const base = defaultSessionName(sessionDate);
  const taken = new Set(sessions.map((s) => s.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/** Always a fresh session dated today (local), named with (2)/(3) when today already has one. */
export async function createNewSession(ctx: ServiceContext): Promise<BiathlonSession> {
  const today = localToday(ctx);
  const sessions = await listSessions(ctx);
  return createSession(ctx, { sessionDate: today, name: newSessionName(sessions, today) });
}

/** REV-162: Capture always mints a new session for today, then opens its camera — never reuses an existing one. */
export async function quickStart(ctx: ServiceContext, navigate: NavigateFn): Promise<BiathlonSession> {
  const session = await createNewSession(ctx);
  navigate(`/sessions/${session.id}/capture`);
  return session;
}
