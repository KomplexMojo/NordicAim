import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { AdjustSurface } from '@/components/adjust/AdjustSurface';
import { useAdjustDraft } from '@/components/adjust/useAdjustDraft';
import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { TargetPhoto } from '@/lib/domain/photo';
import { targetHeadline } from '@/lib/render/text-lines';
import { saveAdjustments } from '@/lib/services/adjust';
import { loadReviewPhotos } from '@/lib/services/review';

/** What happened to one photo during the pass. */
type Outcome = 'saved' | 'unchanged' | 'skipped';

const OUTCOME_LABEL: Record<Outcome, string> = {
  saved: 'Changes saved',
  unchanged: 'Confirmed, no changes',
  skipped: 'Skipped',
};

function photoLabel(photo: TargetPhoto): string {
  const template = photo.categorization.template;
  const name = template === null ? 'Target' : template === 'precision' ? 'Precision' : 'Sighting';
  return photo.originalFilename === null ? name : `${name} · ${photo.originalFilename}`;
}

interface StepProps {
  photo: TargetPhoto;
  index: number;
  total: number;
  onDone(outcome: Outcome): void;
}

/**
 * One photo of the review: the Adjust editor itself (not a copy), a "Photo 3 of 8" header with the live
 * headline score, and Confirm / Skip. Confirm saves through `saveAdjustments` only when something changed.
 */
function ReviewStep({ photo, index, total, onDone }: StepProps) {
  const draft = useAdjustDraft(photo.id);
  const [busy, setBusy] = useState(false);
  const { ctx, data, calibration, preview } = draft;

  async function onConfirm() {
    const patch = draft.patch();
    if (!draft.dirty() || patch === null) {
      onDone('unchanged');
      return;
    }
    setBusy(true);
    try {
      await saveAdjustments(ctx, photo.id, patch);
      onDone('saved');
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  const headline = preview?.result ? targetHeadline(preview.result) : 'No score yet';

  return (
    <>
      <header className="flex flex-col gap-1" data-testid="review-step" data-photo-id={photo.id}>
        <span className="text-sm text-muted-foreground" data-testid="review-progress">
          Photo {index + 1} of {total}
        </span>
        <h1 className="text-xl font-semibold">{photoLabel(photo)}</h1>
        <p className="text-lg font-semibold" data-testid="review-headline">
          {headline}
        </p>
      </header>

      {data === undefined ? (
        <p className="p-6 text-center text-muted-foreground">Loading…</p>
      ) : data === null || calibration === null ? (
        <p className="text-sm text-muted-foreground">This target could not be opened.</p>
      ) : (
        <AdjustSurface draft={draft} />
      )}

      <div className="flex gap-2">
        <Button className="h-11 flex-1" data-testid="review-confirm" disabled={busy || !data} onClick={() => void onConfirm()}>
          {busy ? 'Saving…' : 'Confirm'}
        </Button>
        <Button variant="outline" className="h-11 flex-1" data-testid="review-skip" disabled={busy} onClick={() => onDone('skipped')}>
          Skip
        </Button>
      </div>
    </>
  );
}

/**
 * Route `#/review/:sessionId` (M21 step 4, REV-42): a single pass over a session's photos — needing
 * attention first, then the rest, each by capture time — with the Adjust editor embedded. Each Confirm
 * saves as it goes, so leaving part-way loses nothing. The order is fixed when the pass starts, so a
 * photo whose status changes after a save does not jump around.
 */
export function ReviewPage() {
  const { sessionId = '' } = useParams();
  const { ctx } = useServices();
  const [photos, setPhotos] = useState<TargetPhoto[] | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadReviewPhotos(ctx, sessionId).then(
      (next) => {
        if (!cancelled) setPhotos(next);
      },
      (err: unknown) => {
        if (cancelled) return;
        toast.error(`Could not open this session: ${err instanceof Error ? err.message : String(err)}`);
        setPhotos(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx, sessionId]);

  const resultsLink = (
    <Link
      to={`/sessions/${sessionId}/results`}
      className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
      data-testid="review-back"
    >
      Back to results
    </Link>
  );

  if (photos === undefined) return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  if (photos === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Session not found.</p>
        {resultsLink}
      </main>
    );
  }

  const current = photos[index];
  if (current === undefined) {
    // The final step: what changed, and the way back.
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8" data-testid="review-summary">
        <header className="flex items-center justify-between gap-2">{resultsLink}</header>
        <h1 className="text-xl font-semibold">Review finished</h1>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No targets in this session to review.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {photos.map((photo, i) => {
              const outcome = outcomes[i] ?? 'skipped';
              return (
                <li
                  key={photo.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                  data-testid="review-summary-row"
                  data-photo-id={photo.id}
                  data-outcome={outcome}
                >
                  <span>
                    {i + 1}. {photoLabel(photo)}
                  </span>
                  <span className={outcome === 'saved' ? 'font-medium' : 'text-muted-foreground'}>
                    {OUTCOME_LABEL[outcome]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <Link
          to={`/sessions/${sessionId}/results`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          data-testid="review-done"
        >
          See results
        </Link>
      </main>
    );
  }

  function onDone(outcome: Outcome) {
    setOutcomes((prev) => {
      const next = [...prev];
      next[index] = outcome;
      return next;
    });
    setIndex((i) => i + 1);
    window.scrollTo(0, 0);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8">
      <div className="flex items-center justify-between gap-2">{resultsLink}</div>
      <ReviewStep key={current.id} photo={current} index={index} total={photos.length} onDone={onDone} />
    </main>
  );
}
