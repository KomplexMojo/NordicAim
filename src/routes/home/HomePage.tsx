import { useState } from 'react';
import { Link } from 'react-router';

import { UpdateBanner } from '@/components/UpdateBanner';
import { BUILD_SHA } from '@/lib/app/build-info';
import { DeleteSessionDialog } from '@/components/sessions/DeleteSessionDialog';
import { SessionList } from '@/components/sessions/SessionList';
import { QuickStartButton } from '@/components/sessions/QuickStartButton';
import { BackupReminder } from '@/components/settings/BackupReminder';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { listSessionsWithProblems } from '@/lib/services/sessions';

/**
 * Route `#/` (analysis-pipeline §1). REV-72: the one screen that lists every session, and the one place a session is
 * deleted (issue #18). There is no separate Sessions screen.
 */
export function HomePage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => listSessionsWithProblems(ctx), [ctx]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const sessions = value?.sessions;
  const unreadable = value?.unreadable ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6 lg:max-w-3xl">
      {/* The name is in the header on every page (REV-109); the heading stays for screen readers. */}
      <h1 className="sr-only">NordicAim</h1>

      <UpdateBanner />

      <QuickStartButton sessions={sessions ?? []} className="h-14 w-full text-lg" />

      <BackupReminder />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Sessions</h2>
        {loading && sessions === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <SessionList
            sessions={sessions ?? []}
            emptyMessage="No sessions yet. Quick start to take your first photo."
            onDelete={(session) => setDeleting(session.id)}
          />
        )}
      </section>

      {unreadable.length > 0 && (
        <section className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3" data-testid="home-unreadable">
          <h2 className="text-sm font-medium">
            {unreadable.length === 1 ? '1 session could not be read' : `${unreadable.length} sessions could not be read`}
          </h2>
          <p className="text-xs text-muted-foreground">
            Nothing has been deleted.{' '}
            <Link to="/diagnostics" className="text-primary underline underline-offset-4">
              Open Diagnostics
            </Link>{' '}
            to see why and to export your data, or delete one you no longer want.
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

      <p className="mt-auto text-center text-xs text-muted-foreground">
        Results are stored only on this phone. Version{' '}
        <span className="font-mono" data-testid="app-version">
          {BUILD_SHA}
        </span>
      </p>
    </main>
  );
}
