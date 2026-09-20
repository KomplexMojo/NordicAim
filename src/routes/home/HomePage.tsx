import { Link } from 'react-router';

import { BackupReminder } from '@/components/settings/BackupReminder';
import { SessionList } from '@/components/sessions/SessionList';
import { QuickStartButton } from '@/components/sessions/QuickStartButton';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { listSessionsWithProblems } from '@/lib/services/sessions';

const RECENT_COUNT = 5;

/** Route `#/` (analysis-pipeline §1). */
export function HomePage() {
  const { ctx } = useServices();
  const { value, loading } = useLiveQuery(() => listSessionsWithProblems(ctx), [ctx]);
  const sessions = value?.sessions;
  const unreadable = value?.unreadable ?? [];
  const recent = (sessions ?? []).slice(0, RECENT_COUNT);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <h1 className="pt-4 text-center text-2xl font-semibold">Nordic Aim</h1>

      <div className="flex justify-center">
        <QuickStartButton sessions={sessions ?? []} />
      </div>

      <BackupReminder />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent sessions</h2>
        {loading && sessions === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <SessionList sessions={recent} emptyMessage="No sessions yet. Quick start to take your first photo." />
        )}
        {(sessions?.length ?? 0) > RECENT_COUNT && (
          <Link to="/sessions" className="text-sm text-primary underline underline-offset-4">
            All sessions
          </Link>
        )}
      </section>

      {unreadable.length > 0 && (
        <p className="rounded-md border border-destructive/40 p-3 text-sm" data-testid="home-unreadable">
          {unreadable.length === 1 ? '1 session could not be read' : `${unreadable.length} sessions could not be read`} and
          {unreadable.length === 1 ? ' is' : ' are'} not shown. Nothing has been deleted —{' '}
          <Link to="/diagnostics" className="text-primary underline underline-offset-4">
            open Diagnostics
          </Link>{' '}
          to see why and to export your data.
        </p>
      )}

      <p className="mt-auto text-center text-xs text-muted-foreground">Results are stored only on this phone.</p>
    </main>
  );
}
