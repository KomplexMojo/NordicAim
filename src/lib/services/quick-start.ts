// capture-overlay.md §1.1, data-model §7: the quick-start button opens today's local session, creating it once.

import type { BiathlonSession } from '@/lib/domain/session';
import { clientNow } from '@/lib/media/capture-time';

import type { ServiceContext } from './context';
import { createSession, listSessions } from './sessions';

export type NavigateFn = (path: string) => void;

function localDate(ctx: ServiceContext): string {
  return clientNow(ctx.now()).clientLocal.slice(0, 10);
}

/** `true` when a session with `sessionDate` = today (local) already exists. */
export function quickStartLabel(sessions: BiathlonSession[], now: Date): string {
  const today = clientNow(now).clientLocal.slice(0, 10);
  const hasToday = sessions.some((s) => s.sessionDate === today);
  return hasToday ? "Capture (today's session)" : 'Start & capture';
}

/** Finds today's local session or creates `Session <today>` (creates once, then reuses), then navigates to its
 * capture screen. */
export async function quickStart(ctx: ServiceContext, navigate: NavigateFn): Promise<BiathlonSession> {
  const today = localDate(ctx);
  const sessions = await listSessions(ctx);
  const existing = sessions.find((s) => s.sessionDate === today);
  const session = existing ?? (await createSession(ctx, { sessionDate: today }));
  navigate(`/sessions/${session.id}/capture`);
  return session;
}
