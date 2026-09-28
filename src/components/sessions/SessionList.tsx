import { useState } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BiathlonSession } from '@/lib/domain/session';
import type { SessionKinds } from '@/lib/sessions/kinds';
import { sessionTimeLabel, SEARCH_FROM, matchesSession } from '@/lib/sessions/list-view';

import { SessionKindMarks } from './SessionKindMarks';

interface SessionListProps {
  sessions: BiathlonSession[];
  emptyMessage?: string;
  /**
   * Issue #18: when given, each row gets a quiet **Delete…** control. Only the full Sessions screen passes it; Home's
   * recent list does not, so deleting is never one careless tap from the first screen.
   */
  onDelete?: (session: BiathlonSession) => void;
  /** Issue #73: each session's target kinds; until they load (or for a session with none read), the row shows its count. */
  kinds?: Map<string, SessionKinds>;
}

/**
 * Sessions §1: name, date and time, and its targets: their kinds as marks (issue #73), else the count. REV-93: a search box
 * appears once there are many.
 */
export function SessionList({ sessions, emptyMessage = 'No sessions yet.', onDelete, kinds }: SessionListProps) {
  const [query, setQuery] = useState('');
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const shown = sessions.filter((session) => matchesSession(session, query));
  return (
    <>
      {sessions.length >= SEARCH_FROM && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions by name or date"
          aria-label="Search sessions"
          className="h-11"
          data-testid="session-search"
        />
      )}
      {shown.length === 0 && <p className="text-sm text-muted-foreground" data-testid="session-search-empty">No session matches “{query}”.</p>}
      <ul className="flex flex-col gap-2" data-testid="session-list">
        {shown.map((session) => (
          <li key={session.id} className="flex items-stretch gap-2">
            <Link
              to={`/sessions/${session.id}`}
              className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted"
            >
              <span className="flex flex-col text-left">
                <span className="font-medium">{session.name}</span>
                <span className="text-xs text-muted-foreground" data-testid="session-when">
                  {session.sessionDate} · {sessionTimeLabel(session)}
                </span>
              </span>
              <RowTargets session={session} kinds={kinds?.get(session.id)} loaded={kinds !== undefined} />
            </Link>
            {onDelete !== undefined && (
              <Button
                variant="ghost"
                className="h-auto min-h-11 min-w-11 px-3 text-muted-foreground"
                onClick={() => onDelete(session)}
                data-testid="session-delete"
                data-session-id={session.id}
                aria-label={`Delete ${session.name}, ${session.sessionDate} ${sessionTimeLabel(session)}`}
              >
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
                </svg>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function RowTargets({ session, kinds, loaded }: { session: BiathlonSession; kinds: SessionKinds | undefined; loaded: boolean }) {
  const count = session.photoIds.length;
  // A session with no photo records read has no kinds entry: once loaded, that is simply no targets.
  const shown = kinds ?? (loaded && count === 0 ? { counts: { 'sight-in': 0, confirm: 0, 'precision-prone': 0, 'precision-standing': 0 }, unknown: 0 } : undefined);
  if (shown === undefined) {
    return (
      <Badge variant="secondary">
        {count} {count === 1 ? 'target' : 'targets'}
      </Badge>
    );
  }
  return <SessionKindMarks kinds={shown} targets={count} />;
}
