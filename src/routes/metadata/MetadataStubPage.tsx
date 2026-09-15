import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { useServices } from '@/lib/app/services';
import { listPhotosBySession } from '@/lib/store/photos-repo';

/** Route `#/sessions/:sid/metadata`. Temporary stub (M07) showing the photo count; replaced by MetadataPage in M09. */
export function MetadataStubPage() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const [loaded, setLoaded] = useState<{ sid: string; count: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPhotosBySession(ctx.db, sid).then(
      (photos) => {
        if (!cancelled) setLoaded({ sid, count: photos.length });
      },
      () => {
        if (!cancelled) setLoaded({ sid, count: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx, sid]);

  const count = loaded?.sid === sid ? loaded.count : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Add metadata</h1>
      {count === undefined && <p className="text-muted-foreground">Loading…</p>}
      {count === null && <p className="text-destructive">Could not read this session's photos.</p>}
      {typeof count === 'number' && (
        <p data-testid="metadata-photo-count">
          {count} {count === 1 ? 'photo' : 'photos'}
        </p>
      )}
      <Link to={`/sessions/${sid}/capture`} className="inline-flex h-11 items-center text-primary underline underline-offset-4">
        Back to capture
      </Link>
    </main>
  );
}
