import { useState } from 'react';
import { Link } from 'react-router';

import { DeleteSessionDialog } from '@/components/sessions/DeleteSessionDialog';
import { SessionList } from '@/components/sessions/SessionList';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { listSessionsWithProblems } from '@/lib/services/sessions';

/** Route `#/sessions`: the full list (analysis-pipeline §1), and the one place a session can be deleted (issue #18). */
export function SessionsPage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => listSessionsWithProblems(ctx), [ctx]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const sessions = value?.sessions;
  const unreadable = value?.unreadable ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sessions</h1>
        <Link to="/patterns" className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4" data-testid="sessions-patterns">
          Patterns
        </Link>
      </header>
      {loading && sessions === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <SessionList sessions={sessions ?? []} onDelete={(session) => setDeleting(session.id)} />
      )}

      {unreadable.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3" data-testid="sessions-unreadable">
          <h2 className="text-sm font-medium">
            {unreadable.length === 1 ? '1 session could not be read' : `${unreadable.length} sessions could not be read`}
          </h2>
          <p className="text-xs text-muted-foreground">
            They are still stored and nothing has been deleted. Diagnostics shows why and can export them; if you no longer
            want one, you can delete it here.
          </p>
          <ul className="flex flex-col gap-1">
            {unreadable.map((bad) => (
              <li key={bad.id} className="flex items-center justify-between gap-2">
                <span className="break-all text-xs text-muted-foreground">{bad.id}</span>
                <Button
                  variant="ghost"
                  className="h-auto min-h-11 text-muted-foreground"
                  onClick={() => setDeleting(bad.id)}
                  data-testid="unreadable-delete"
                  aria-label={`Delete unreadable session ${bad.id}`}
                >
                  Delete…
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DeleteSessionDialog key={deleting ?? 'none'} sessionId={deleting} onClose={() => setDeleting(null)} />
    </main>
  );
}
