import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import type { BiathlonSession } from '@/lib/domain/session';

interface SessionListProps {
  sessions: BiathlonSession[];
  emptyMessage?: string;
}

/** Sessions §1: name, date, target count. Links to `#/sessions/:sid`, which redirects to metadata or results. */
export function SessionList({ sessions, emptyMessage = 'No sessions yet.' }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="session-list">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            to={`/sessions/${session.id}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted"
          >
            <span className="flex flex-col text-left">
              <span className="font-medium">{session.name}</span>
              <span className="text-xs text-muted-foreground">{session.sessionDate}</span>
            </span>
            <Badge variant="secondary">
              {session.photoIds.length} {session.photoIds.length === 1 ? 'target' : 'targets'}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
