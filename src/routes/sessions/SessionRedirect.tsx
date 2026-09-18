import { Navigate, useParams } from 'react-router';

import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { isTargetPhoto } from '@/lib/domain/backing';
import { listPhotosBySession } from '@/lib/store/photos-repo';

/** Route `#/sessions/:sid`: redirect to `metadata` if any photo is `needs-metadata`, else to `results`
 * (analysis-pipeline §1). An id with no photos (a brand-new session) also goes to `metadata`. */
export function SessionRedirect() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const { value } = useLiveQuery(async () => {
    // backing-sheet.md §3: a backing-card photo is not a target and never holds the session here.
    const photos = (await listPhotosBySession(ctx.db, sid)).filter(isTargetPhoto);
    const dest = photos.length === 0 || photos.some((p) => p.status === 'needs-metadata') ? 'metadata' : 'results';
    return { sid, dest };
  }, [ctx, sid]);

  if (value === undefined || value.sid !== sid) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  return <Navigate to={`/sessions/${sid}/${value.dest}`} replace />;
}
