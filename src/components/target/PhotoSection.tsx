import { useState } from 'react';
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
import type { TargetAnalysis } from '@/lib/domain/analysis';
import type { TargetPhoto } from '@/lib/domain/photo';
import { buildGroundTruth, reanalyze, saveAdjustments } from '@/lib/services/adjust';
import { getCvClient } from '@/workers/cv-client';

interface PhotoSectionProps {
  photo: TargetPhoto;
  analysis: TargetAnalysis | null;
}

/** The photo with its rings and shots, editable (M13), with Save, Re-analyze and More. */
function EditView({ photo }: { photo: TargetPhoto }) {
  const draft = useAdjustDraft(photo.id);
  const { ctx, data, calibration, shots } = draft;
  const [busy, setBusy] = useState(false);
  if (data === undefined || data === null || calibration === null) return null;
  const units = shots.reduce((sum, shot) => sum + shot.multiplicity, 0);
  const pid = photo.id;

  async function onSave() {
    // §8: a manual calibration stops Stage A re-aligning this photo, so only send one the user moved.
    const patch = draft.patch();
    if (patch === null) {
      toast('Nothing to save: no shot or alignment changed.');
      return;
    }
    setBusy(true);
    try {
      await saveAdjustments(ctx, pid, patch);
      draft.setData(await loadAdjust(ctx, pid));
      toast.success('Saved.');
    } catch (err) {
      toast.error(`Could not save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  /** REV-46: save what is on screen, then re-run detection against the alignment just set, keeping the manual shots. */
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
    if (data == null || calibration === null) return;
    const payload = buildGroundTruth(data.photo, { ...data.analysis, calibration, shots });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.photo.originalFilename ?? data.photo.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <p className="text-sm text-muted-foreground" data-testid="adjust-shot-count">
        {shots.length} {shots.length === 1 ? 'hole' : 'holes'} · {units} {units === 1 ? 'shot' : 'shots'}
      </p>
      <AdjustSurface draft={draft} />
      <div className="flex gap-2">
        <Button className="h-11 flex-1" data-testid="save-adjustments" disabled={busy} onClick={() => void onSave()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" className="h-11 flex-1" data-testid="reanalyze" disabled={busy} onClick={() => void onReanalyze()}>
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
              Export this target&apos;s calibration and shots as ground truth for the CV evaluation. The file holds no image data.
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
    </>
  );
}

/**
 * REV-73/REV-78: where the photo is on the target screen. Viewing and adjusting are one screen: the photo with its rings and
 * shots, editable, with the diagram↔photo slider and the wipe/fade switch built in. A target with no alignment yet has
 * neither, and says so.
 */
export function PhotoSection({ photo, analysis }: PhotoSectionProps) {
  if (analysis === null || analysis.calibration === null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="compare-unavailable">
        This target has no alignment yet, so the photo cannot be shown with its rings. Retry the analysis from the results screen.
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-3" data-testid="photo-section" aria-label="Photo and shots">
      <EditView photo={photo} />
    </section>
  );
}
