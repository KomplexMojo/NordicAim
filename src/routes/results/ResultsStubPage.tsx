import { Link, useParams } from 'react-router';

import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { listPhotosBySession } from '@/lib/store/photos-repo';

/** Route `#/sessions/:sid/results`. Temporary stub (M09); replaced by the real results screen in M12/M14. */
export function ResultsStubPage() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const { value: photos, loading } = useLiveQuery(() => listPhotosBySession(ctx.db, sid), [ctx, sid]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analysis will appear here</h1>
        <Link to="/" className="text-sm text-primary underline underline-offset-4">
          Home
        </Link>
      </header>
      {loading && photos === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="results-stub-list">
          {(photos ?? []).map((photo) => (
            <li key={photo.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span>{photo.categorization.template ?? 'Untitled target'}</span>
              <span className="text-sm text-muted-foreground" data-testid="results-stub-status">
                {photo.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
