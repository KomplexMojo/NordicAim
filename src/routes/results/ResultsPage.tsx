import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { TargetCard } from '@/components/results/TargetCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import { isTargetPhoto } from '@/lib/domain/backing';
import type { TargetPhoto } from '@/lib/domain/photo';
import { retryFailedStage } from '@/lib/pipeline/runner-browser';
import { getSession } from '@/lib/services/sessions';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { listPhotosBySession } from '@/lib/store/photos-repo';

interface ResultsData {
  sid: string;
  name: string;
  photos: TargetPhoto[];
  analyses: Map<string, TargetAnalysis | null>;
}

async function loadResults(ctx: ReturnType<typeof useServices>['ctx'], sid: string): Promise<ResultsData | null> {
  const session = await getSession(ctx, sid);
  if (session === null) return null;
  const photos = await listPhotosBySession(ctx.db, sid);
  const byId = new Map(photos.map((p) => [p.id, p]));
  // analysis-pipeline §1 step 3: "one target card per photo in capture order".
  // backing-sheet.md §3: card photos never appear in results (they are not in `photoIds` either).
  const ordered = session.photoIds
    .map((id) => byId.get(id))
    .filter((p): p is TargetPhoto => p !== undefined && isTargetPhoto(p));
  const entries = await Promise.all(ordered.map(async (p) => [p.id, await getAnalysisRecord(ctx.db, p.id)] as const));
  return { sid, name: session.name, photos: ordered, analyses: new Map(entries) };
}

/** Route `#/sessions/:sid/results` — analysis-pipeline §1 step 3, "receive analysis". */
export function ResultsPage() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const { value: data } = useLiveQuery(() => loadResults(ctx, sid), [ctx, sid]);

  async function onRetry(photoId: string) {
    try {
      await retryFailedStage(ctx, photoId);
    } catch (err) {
      toast.error(`Could not retry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (data === undefined) {
    return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  }
  if (data === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Session not found.</p>
        <Link to="/" className="text-primary underline underline-offset-4">
          Home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8">
      <header className="flex items-center justify-between gap-2">
        <Link to="/" className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4">
          Home
        </Link>
        <span className="text-sm text-muted-foreground" data-testid="results-photo-count">
          {data.photos.length} {data.photos.length === 1 ? 'target' : 'targets'}
        </span>
      </header>

      <h1 className="text-xl font-semibold">{data.name}</h1>

      {/* The session summary image and Share arrive with M14; the card holds its place in the layout. */}
      <Card data-testid="summary-placeholder">
        <CardHeader>
          <CardTitle>Session summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The shareable summary image for this session will appear here.
        </CardContent>
      </Card>

      {data.photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No targets in this session yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.photos.map((photo) => (
            <TargetCard
              key={photo.id}
              sessionId={sid}
              photo={photo}
              analysis={data.analyses.get(photo.id) ?? null}
              onRetry={() => void onRetry(photo.id)}
            />
          ))}
        </div>
      )}

      <Link
        to={`/sessions/${sid}/metadata`}
        className="inline-flex h-11 items-center justify-center text-sm text-primary underline underline-offset-4"
        data-testid="edit-metadata-link"
      >
        Edit metadata
      </Link>
    </main>
  );
}
