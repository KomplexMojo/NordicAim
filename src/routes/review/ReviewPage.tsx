import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { AdjustSurface } from '@/components/adjust/AdjustSurface';
import { UnsavedGuard } from '@/components/adjust/UnsavedGuard';
import { loadAdjust, useAdjustDraft } from '@/components/adjust/useAdjustDraft';
import { EpisodeSteps } from '@/components/session/EpisodeSteps';
import { Button } from '@/components/ui/button';
import { useServices } from '@/lib/app/services';
import type { TargetPhoto } from '@/lib/domain/photo';
import { targetHeadline } from '@/lib/render/text-lines';
import { reanalyze, saveAdjustments } from '@/lib/services/adjust';
import { requestAnalysis } from '@/lib/services/photos';
import { loadReviewPhotos, type AdjustPassMode } from '@/lib/services/review';
import { getCvClient } from '@/workers/cv-client';

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
 * One photo of the adjust pass: the Adjust editor, progress, and Confirm / Skip.
 * REV-161: Confirm saves (re-detecting when the alignment moved) and always advances.
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
      if (draft.alignmentMoved) await reanalyze(ctx, photo.id, patch, getCvClient());
      else await saveAdjustments(ctx, photo.id, patch);
      draft.setData(await loadAdjust(ctx, photo.id));
      onDone('saved');
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  const headline = preview?.result ? targetHeadline(preview.result) : 'No score yet';
  const savingLabel = draft.alignmentMoved ? 'Updating holes…' : 'Saving…';

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

      <UnsavedGuard modified={draft.modified} />
      {draft.alignmentMoved && draft.modified && (
        <p className="text-sm text-muted-foreground" data-testid="review-redetect-hint">
          Saving will update the holes for the new rings.
        </p>
      )}
      <div className="flex gap-2">
        <Button className="h-11 flex-1" data-testid="review-confirm" disabled={busy || !data} onClick={() => void onConfirm()}>
          {busy ? savingLabel : 'Confirm'}
        </Button>
        <Button variant="outline" className="h-11 flex-1" data-testid="review-skip" disabled={busy} onClick={() => onDone('skipped')}>
          {draft.modified ? 'Discard changes and skip' : 'Skip'}
        </Button>
      </div>
    </>
  );
}

/**
 * Route `#/review/:sessionId` (M21 / REV-42 / REV-161): adjust-all pass.
 * `?pass=first` after capture Done (kind order); otherwise Re-check (needs-attention first).
 * Finishing a first pass requests analysis and opens Results.
 */
export function ReviewPage() {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { ctx } = useServices();
  const passMode: AdjustPassMode = searchParams.get('pass') === 'first' ? 'first' : 'recheck';
  const [photos, setPhotos] = useState<TargetPhoto[] | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadReviewPhotos(ctx, sessionId, passMode).then(
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
  }, [ctx, sessionId, passMode]);

  const backLink =
    passMode === 'first' ? (
      <Link
        to={`/sessions/${sessionId}/capture`}
        className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
        data-testid="review-back"
      >
        Back to capture
      </Link>
    ) : (
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
        {backLink}
      </main>
    );
  }

  const current = photos[index];
  if (current === undefined) {
    async function onSeeResults() {
      setFinishing(true);
      try {
        if (passMode === 'first') await requestAnalysis(ctx, sessionId);
        navigate(`/sessions/${sessionId}/results`);
      } catch (err) {
        toast.error(`Could not start analysis: ${err instanceof Error ? err.message : String(err)}`);
        setFinishing(false);
      }
    }

    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-5xl" data-testid="review-summary">
        <header className="flex items-center justify-between gap-2">{backLink}</header>
        {passMode === 'first' && <EpisodeSteps current={2} />}
        <h1 className="text-xl font-semibold">{passMode === 'first' ? 'Adjust finished' : 'Review finished'}</h1>
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
        <Button
          className="h-11"
          data-testid="review-done"
          disabled={finishing}
          onClick={() => void onSeeResults()}
        >
          {finishing ? 'Opening results…' : 'See results'}
        </Button>
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-5xl">
      <div className="flex items-center justify-between gap-2">{backLink}</div>
      {passMode === 'first' && <EpisodeSteps current={2} />}
      <ReviewStep key={current.id} photo={current} index={index} total={photos.length} onDone={onDone} />
    </main>
  );
}
