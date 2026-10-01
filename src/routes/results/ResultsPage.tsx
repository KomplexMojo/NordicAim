import { ListChecks, PencilLine, Star } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { GoalChecksCard } from '@/components/goals/GoalChecks';
import { BackupReminder } from '@/components/settings/BackupReminder';
import { SummaryCard } from '@/components/results/SummaryCard';
import { leftOutOfSummary } from '@/lib/composite/select-defaults';
import { TargetCard } from '@/components/results/TargetCard';
import { useServices } from '@/lib/app/services';
import { useLiveQuery } from '@/lib/app/use-live-query';
import type { TargetAnalysis } from '@/lib/domain/analysis';
import { isTargetPhoto } from '@/lib/domain/backing';
import { orderedByKind } from '@/lib/domain/photo-order';
import type { TargetPhoto } from '@/lib/domain/photo';
import { getRecentTimings } from '@/lib/pipeline/timing';
import { retryFailedStage } from '@/lib/pipeline/runner-browser';
import { loadSessionGoalChecks } from '@/lib/services/goals';
import { getSession } from '@/lib/services/sessions';
import { cn } from '@/lib/utils';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { listPhotosBySession } from '@/lib/store/photos-repo';

/**
 * M15 (analysis-pipeline §9): `?debug=1` shows the last 10 recorded pipeline job durations, for
 * checking the performance budget against the owner's iPhone.
 */
function TimingDebugPanel() {
  const timings = getRecentTimings(10);
  return (
    <section className="rounded-md border border-dashed border-border p-3 text-xs" data-testid="timing-debug">
      <h2 className="mb-1 font-medium text-muted-foreground">Stage timings (last {timings.length})</h2>
      {timings.length === 0 ? (
        <p className="text-muted-foreground">No jobs run yet this page load.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 font-mono">
          {timings.map((t, i) => (
            <li key={i}>
              Stage {t.kind} · {t.photoId.slice(0, 8)} · {t.ms.toFixed(0)} ms
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
  // REV-68/90: Sight in, Confirm, Precision prone, Precision standing, each in capture order, however the photos were added.
  const ordered = orderedByKind(
    session.photoIds.map((id) => byId.get(id)).filter((p): p is TargetPhoto => p !== undefined && isTargetPhoto(p)),
  );
  const entries = await Promise.all(ordered.map(async (p) => [p.id, await getAnalysisRecord(ctx.db, p.id)] as const));
  return { sid, name: session.name, photos: ordered, analyses: new Map(entries) };
}

/** Route `#/sessions/:sid/results` — analysis-pipeline §1 step 3, "receive analysis". */
export function ResultsPage() {
  const { sid = '' } = useParams();
  const { ctx } = useServices();
  const { value: data } = useLiveQuery(() => loadResults(ctx, sid), [ctx, sid]);
  const { value: goals } = useLiveQuery(() => loadSessionGoalChecks(ctx, sid), [ctx, sid]);
  const [searchParams] = useSearchParams();
  const showDebug = searchParams.get('debug') === '1';

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

  const needsReview = data.photos.some((p) => p.status === 'needs-attention');
  // REV-42: batch review walks every target once, the ones needing attention first; its star lights only when one does.
  // REV-141: Edit metadata sits beside it, each with its icon; with no targets there is nothing to review.
  // Issue #85: on a healthy session the payoff leads (summary, Share, goals) and this row follows it, both buttons quiet;
  // when a target needs attention, Review session is the next step, so the row stays at the top with Review as the primary.
  const actions = (
    <div className={data.photos.length > 0 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1'}>
      {data.photos.length > 0 && (
        <Link
          to={`/review/${sid}`}
          className={cn(
            'inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium',
            needsReview ? 'bg-primary text-primary-foreground' : 'border border-border',
          )}
          data-testid="review-session-link"
        >
          <ListChecks className="size-5 shrink-0" aria-hidden="true" />
          Review session
          {needsReview && <Star className="size-4 shrink-0" aria-hidden="true" fill="currentColor" data-testid="review-session-star" />}
        </Link>
      )}
      <Link
        to={`/sessions/${sid}/metadata`}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium"
        data-testid="edit-metadata-link"
      >
        <PencilLine className="size-5 shrink-0" aria-hidden="true" />
        Edit metadata
      </Link>
    </div>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-6xl">
      <header className="flex items-center justify-between gap-2">
        {/* The Shooting tab already goes Home; this is the parent of a session (owner, 2026-09-19). */}
        <Link
          to="/"
          className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
          data-testid="results-back"
        >
          All sessions
        </Link>
        <span className="text-sm text-muted-foreground" data-testid="results-photo-count">
          {data.photos.length} {data.photos.length === 1 ? 'target' : 'targets'}
        </span>
      </header>

      <h1 className="text-xl font-semibold">{data.name}</h1>

      {needsReview && actions}

      {showDebug && <TimingDebugPanel />}

      <div className="lg:mx-auto lg:w-full lg:max-w-4xl">
        <SummaryCard sessionId={sid} sessionName={data.name} leftOut={leftOutOfSummary(data.photos)} />
      </div>

      {/* REV-148: the goals in effect when this session was created, against its own results. */}
      <div className="lg:mx-auto lg:w-full lg:max-w-4xl">
        <GoalChecksCard goals={goals} note="Against the goals set when this session was created." testId="results-goals" />
      </div>

      {!needsReview && actions}

      <BackupReminder />

      {data.photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No targets in this session yet.</p>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-3">
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

      {/* Step 1 of the app: adding more targets was three taps away, behind the metadata screen. */}
      <Link
        to={`/sessions/${sid}/capture`}
        className="inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
        data-testid="add-photos-link"
      >
        Add photos
      </Link>

    </main>
  );
}
