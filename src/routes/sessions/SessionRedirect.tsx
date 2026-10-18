import { Navigate, useParams } from 'react-router';

import { useLiveQuery } from '@/lib/app/use-live-query';
import { useServices } from '@/lib/app/services';
import { isTargetPhoto } from '@/lib/domain/backing';
import { getSession } from '@/lib/services/sessions';
import { listPhotosBySession } from '@/lib/store/photos-repo';

/**
 * Route `#/sessions/:sid` (analysis-pipeline §1 / REV-161):
 * - metadata when any photo needs metadata or there are no target photos
 * - first adjust pass when analysis has not been requested yet
 * - otherwise results
 */
export function SessionRedirect() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const { value } = useLiveQuery(async () => {
    const session = await getSession(ctx, sid);
    if (session === null) return { sid, dest: 'results' as const, review: false };
    const photos = (await listPhotosBySession(ctx.db, sid)).filter(isTargetPhoto);
    if (photos.length === 0 || photos.some((p) => p.status === 'needs-metadata')) {
      return { sid, dest: 'metadata' as const, review: false };
    }
    if (session.analyzeRequestedAt === null) {
      return { sid, dest: 'review' as const, review: true };
    }
    return { sid, dest: 'results' as const, review: false };
  }, [ctx, sid]);

  if (value === undefined || value.sid !== sid) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  if (value.review) {
    return <Navigate to={`/review/${sid}?pass=first`} replace />;
  }
  return <Navigate to={`/sessions/${sid}/${value.dest}`} replace />;
}
