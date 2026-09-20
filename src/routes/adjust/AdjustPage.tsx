import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { AdjustSurface } from '@/components/adjust/AdjustSurface';
import { loadAdjust, useAdjustDraft } from '@/components/adjust/useAdjustDraft';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buildGroundTruth, reanalyze, saveAdjustments } from '@/lib/services/adjust';
import { getCvClient } from '@/workers/cv-client';

/**
 * Route `#/sessions/:sid/photos/:pid/adjust` (analysis-pipeline §1, M13). The photo with the template
 * rings drawn on it: move, add and delete shots, or line the target up by hand, with a live score
 * preview. Saving writes `manual` data the pipeline never overwrites (analysis-pipeline §8).
 *
 * The editor itself is `AdjustSurface` over `useAdjustDraft`, which the session review (M21) embeds too.
 */
export function AdjustPage() {
  const { sid = '', pid = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  /**
   * Where Save and the back link go. Adjust is opened from the results list and from a target's detail
   * screen; it used to return to the results list either way, throwing away where the user was (owner,
   * 2026-09-19). `?from=detail` is the only value that changes it, so an unknown value is simply results.
   */
  const origin = searchParams.get('from') === 'detail' ? `/sessions/${sid}/photos/${pid}` : `/sessions/${sid}/results`;
  const draft = useAdjustDraft(pid);
  const { ctx, data, calibration, shots } = draft;
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <p className="p-6 text-center text-muted-foreground">Loading…</p>;
  if (data === null || calibration === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Target not found.</p>
        <Link to={`/sessions/${sid}/results`} className="text-primary underline underline-offset-4">
          Back to results
        </Link>
      </main>
    );
  }

  const { photo, analysis } = data;
  const units = shots.reduce((sum, shot) => sum + shot.multiplicity, 0);

  async function onSave() {
    // §8: a manual calibration stops Stage A re-aligning this photo, so only send one the user moved.
    const patch = draft.patch();
    if (patch === null) return;
    setBusy(true);
    try {
      await saveAdjustments(ctx, pid, patch);
      void navigate(origin);
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  /**
   * REV-46: save what is on screen, then re-run detection against the alignment the user just set, keeping
   * their manual shots. Nothing on screen is discarded — the old Re-detect ran against the saved alignment
   * and threw unsaved edits away.
   */
  async function onReanalyze() {
    const patch = draft.patch();
    if (patch === null) return;
    setBusy(true);
    try {
      await reanalyze(ctx, pid, patch, getCvClient());
      draft.setData(await loadAdjust(ctx, pid));
      toast.success('Re-analyzed with your alignment and shots.');
    } catch (err) {
      toast.error(`Could not re-analyze: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  /** M13 step 7: the ground-truth JSON for `cv:eval` — calibration, shots and the image size only. */
  function onExportGroundTruth() {
    if (calibration === null) return;
    const payload = buildGroundTruth(photo, { ...analysis, calibration, shots });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${photo.originalFilename ?? photo.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8 lg:max-w-5xl">
      <header className="flex items-center justify-between gap-2">
        <Link
          to={origin}
          className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
          data-testid="adjust-back"
        >
          {origin.endsWith('/results') ? 'Back to results' : 'Back to target'}
        </Link>
        <span className="text-sm text-muted-foreground" data-testid="adjust-shot-count">
          {shots.length} {shots.length === 1 ? 'hole' : 'holes'} · {units} {units === 1 ? 'shot' : 'shots'}
        </span>
      </header>

      <h1 className="text-xl font-semibold">Adjust shots</h1>

      <AdjustSurface draft={draft} />

      <div className="flex gap-2">
        <Button className="h-11 flex-1" data-testid="save-adjustments" disabled={busy} onClick={() => void onSave()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1"
          data-testid="reanalyze"
          disabled={busy}
          onClick={() => void onReanalyze()}
        >
          Re-analyze
        </Button>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="h-11" data-testid="adjust-more">
            More…
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>More</DialogTitle>
            <DialogDescription>
              Export this target&apos;s calibration and shots as ground truth for the CV evaluation. The file holds no
              image data.
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" className="h-11" data-testid="export-ground-truth" onClick={onExportGroundTruth}>
            Export ground truth JSON
          </Button>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" className="h-11">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
