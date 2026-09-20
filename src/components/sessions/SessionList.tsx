import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BiathlonSession } from '@/lib/domain/session';

interface SessionListProps {
  sessions: BiathlonSession[];
  emptyMessage?: string;
  /**
   * Issue #18: when given, each row gets a quiet **Delete…** control. Only the full Sessions screen passes it; Home's
   * recent list does not, so deleting is never one careless tap from the first screen.
   */
  onDelete?: (session: BiathlonSession) => void;
}

/** Sessions §1: name, date, target count. Links to `#/sessions/:sid`, which redirects to metadata or results. */
export function SessionList({ sessions, emptyMessage = 'No sessions yet.', onDelete }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="session-list">
      {sessions.map((session) => (
        <li key={session.id} className="flex items-stretch gap-2">
          <Link
            to={`/sessions/${session.id}`}
            className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted"
          >
            <span className="flex flex-col text-left">
              <span className="font-medium">{session.name}</span>
              <span className="text-xs text-muted-foreground">{session.sessionDate}</span>
            </span>
            <Badge variant="secondary">
              {session.photoIds.length} {session.photoIds.length === 1 ? 'target' : 'targets'}
            </Badge>
          </Link>
          {onDelete !== undefined && (
            <Button
              variant="ghost"
              className="h-auto min-h-11 text-muted-foreground"
              onClick={() => onDelete(session)}
              data-testid="session-delete"
              data-session-id={session.id}
              aria-label={`Delete ${session.name}`}
            >
              Delete…
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
