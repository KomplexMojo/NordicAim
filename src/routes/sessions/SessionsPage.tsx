import { SessionList } from '@/components/sessions/SessionList';
import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { listSessions } from '@/lib/services/sessions';

/** Route `#/sessions`: the full list (analysis-pipeline §1). */
export function SessionsPage() {
  const { ctx } = useServices();
  const { value: sessions, loading } = useLiveQuery(() => listSessions(ctx), [ctx]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sessions</h1>
      </header>
      {loading && sessions === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <SessionList sessions={sessions ?? []} />
      )}
    </main>
  );
}
