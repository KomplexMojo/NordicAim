import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { AlignmentControls } from '@/components/adjust/AlignmentControls';
import { ImageStage, type StageApi } from '@/components/adjust/ImageStage';
import { LivePreview } from '@/components/adjust/LivePreview';
import { ShotInspector } from '@/components/adjust/ShotInspector';
import { UnplacedTray } from '@/components/adjust/UnplacedTray';
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
import { useServices } from '@/lib/app/services';
import { BIATHLON_50M } from '@/lib/defaults/biathlon';
import type { AnalysisResult, Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { declaredRoundsOrNull, isCategorizationComplete } from '@/lib/domain/categorization';
import type { Calibration, TargetPhoto } from '@/lib/domain/photo';
import { photoStatus } from '@/lib/domain/status';
import { shotTemplate } from '@/lib/pipeline/stage-a';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { reprojectShots } from '@/lib/geometry/reproject';
import {
  adjustStartCalibration,
  buildGroundTruth,
  reanalyze,
  saveAdjustments,
  unplacedRounds,
} from '@/lib/services/adjust';
import { getAnalysisRecord } from '@/lib/store/analyses-repo';
import { photoWorkingKey } from '@/lib/store/blob-keys';
import { getBlob } from '@/lib/store/blobs-repo';
import { getPhotoRecord } from '@/lib/store/photos-repo';
import { getSettings } from '@/lib/store/settings-repo';
import { getCvClient } from '@/workers/cv-client';

interface AdjustData {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
  holeDiameterMm: number;
}

async function loadAdjust(ctx: ReturnType<typeof useServices>['ctx'], pid: string): Promise<AdjustData | null> {
  const photo = await getPhotoRecord(ctx.db, pid);
  if (photo === null) return null;
  const analysis = await getAnalysisRecord(ctx.db, pid);
  if (analysis === null) return null;
  const settings = await getSettings(ctx.db);
  return { photo, analysis, holeDiameterMm: settings.profileOverrides.holeDiameterMm };
}

function sameCalibration(a: Calibration, b: Calibration): boolean {
  return (
    a.cx === b.cx &&
    a.cy === b.cy &&
    a.radiusPx === b.radiusPx &&
    a.axisRatio === b.axisRatio &&
    a.angleDeg === b.angleDeg &&
    a.anchorDiameterMm === b.anchorDiameterMm
  );
}

/**
 * Route `#/sessions/:sid/photos/:pid/adjust` (analysis-pipeline §1, M13). The photo with the template
 * rings drawn on it: move, add and delete shots, or line the target up by hand, with a live score
 * preview. Saving writes `manual` data the pipeline never overwrites (analysis-pipeline §8).
 *
 * The record is read once and then edited locally — a live query would throw the draft away every
 * time the background runner touched the same photo.
 */
export function AdjustPage() {
  const { sid = '', pid = '' } = useParams();
  const { ctx } = useServices();
  const navigate = useNavigate();

  const [data, setData] = useState<AdjustData | null | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [mode, setMode] = useState<'shots' | 'alignment'>('shots');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // M17 step 1: the stage's live transform, so a dragged tray marker lands under the finger.
  const stageApi = useRef<StageApi | null>(null);
  // REV-46: the alignment the on-screen shots are currently expressed in. A ref, not state, because a drag
  // delivers several changes between renders and each must re-project from the one before it.
  const shotsCalibration = useRef<Calibration | null>(null);

  /** Loads a fresh record's alignment and shots as they are — nothing to re-project. */
  function resetDraft(next: AdjustData) {
    const start = adjustStartCalibration(next.photo, next.analysis);
    shotsCalibration.current = start;
    setCalibration(start);
    setShots(next.analysis.shots);
    setSelectedId(null);
  }

  /** REV-46: the user moved the alignment. The rings move; the holes do not, so every shot follows its hole. */
  function changeCalibration(next: Calibration) {
    const previous = shotsCalibration.current;
    shotsCalibration.current = next;
    if (previous !== null) setShots((current) => reprojectShots(current, previous, next));
    setCalibration(next);
  }

  useEffect(() => {
    let cancelled = false;
    loadAdjust(ctx, pid).then(
      (next) => {
        if (cancelled) return;
        setData(next);
        if (next === null) return;
        resetDraft(next);
      },
      (err: unknown) => {
        if (cancelled) return;
        toast.error(`Could not open this target: ${err instanceof Error ? err.message : String(err)}`);
        setData(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ctx, pid]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    getBlob(ctx.db, photoWorkingKey(pid)).then(
      (blob) => {
        if (cancelled || blob === null) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      },
      () => {
        // No working image stored: the stage still draws the rings and shots on a blank background.
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ctx, pid]);

  // M13 step 3: the score the edits on screen would produce, recomputed on every change.
  const preview = useMemo(() => {
    if (!data || calibration === null) return null;
    const { photo, analysis, holeDiameterMm } = data;
    const categorization = photo.categorization;
    let result: AnalysisResult | null = null;
    if (categorization.template !== null && isCategorizationComplete(categorization)) {
      const profile = { ...BIATHLON_50M, holeDiameterMm } as typeof BIATHLON_50M;
      try {
        result = analyzeTarget({ template: categorization.template, categorization, shots, profile });
      } catch {
        result = null;
      }
    }
    const draft: TargetAnalysis = {
      ...analysis,
      calibration,
      shots,
      pipeline: { ...analysis.pipeline, stageA: 'done', stageB: 'done', error: null },
    };
    const { status, reasons } = photoStatus({ categorization, analysis: draft, result });
    return { result, status, reasons };
  }, [data, calibration, shots]);

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

  const { photo, analysis, holeDiameterMm } = data;
  const template = shotTemplate(photo, analysis.pipeline.templateHint, calibration);
  const selected = shots.find((shot) => shot.id === selectedId) ?? null;
  const units = shots.reduce((sum, shot) => sum + shot.multiplicity, 0);
  const unplaced = unplacedRounds(photo.categorization, shots);

  function addShot(mm: { xMm: number; yMm: number }) {
    const shot: Shot = {
      id: ctx.newId(),
      xMm: mm.xMm,
      yMm: mm.yMm,
      multiplicity: 1,
      positionOverrides: null,
      source: 'manual',
      confidence: null,
      cluster: false,
      possibleOverlap: false,
    };
    setShots((current) => [...current, shot]);
    setSelectedId(shot.id);
  }

  function moveShot(id: string, mm: { xMm: number; yMm: number }) {
    setShots((current) => current.map((shot) => (shot.id === id ? { ...shot, xMm: mm.xMm, yMm: mm.yMm } : shot)));
  }

  function changeShot(next: Shot) {
    setShots((current) => current.map((shot) => (shot.id === next.id ? next : shot)));
  }

  function deleteShot(id: string) {
    setShots((current) => current.filter((shot) => shot.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function deleteSelected() {
    if (selectedId !== null) deleteShot(selectedId);
  }

  /** M17 step 1: a parked marker let go over the photo becomes a manual shot where the finger was. */
  function placeUnplaced(client: { x: number; y: number }) {
    const mm = stageApi.current?.clientToMm(client) ?? null;
    if (mm === null) return;
    addShot(mm);
  }

  /** M17 step 1: a placed shot dragged back onto the tray is removed. */
  function onShotDragEnd(id: string, client: { x: number; y: number }) {
    const dropped = document.elementFromPoint(client.x, client.y);
    if (dropped?.closest('[data-unplaced-tray]') != null) deleteShot(id);
  }

  async function onSave() {
    if (calibration === null) return;
    setBusy(true);
    try {
      const stored = analysis.calibration;
      // §8: a manual calibration stops Stage A re-aligning this photo, so only send one the user moved.
      const moved = stored === null || !sameCalibration(stored, calibration);
      await saveAdjustments(ctx, pid, { ...(moved ? { calibration } : {}), shots });
      void navigate(`/sessions/${sid}/results`);
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
    if (calibration === null) return;
    setBusy(true);
    try {
      const stored = analysis.calibration;
      const moved = stored === null || !sameCalibration(stored, calibration);
      await reanalyze(ctx, pid, { ...(moved ? { calibration } : {}), shots }, getCvClient());
      const next = await loadAdjust(ctx, pid);
      setData(next);
      if (next !== null) resetDraft(next);
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-8">
      <header className="flex items-center justify-between gap-2">
        <Link
          to={`/sessions/${sid}/results`}
          className="inline-flex h-11 items-center text-sm text-primary underline underline-offset-4"
        >
          Back to results
        </Link>
        <span className="text-sm text-muted-foreground" data-testid="adjust-shot-count">
          {shots.length} {shots.length === 1 ? 'hole' : 'holes'} · {units} {units === 1 ? 'shot' : 'shots'}
        </span>
      </header>

      <h1 className="text-xl font-semibold">Adjust shots</h1>

      <div className="flex gap-2" role="group" aria-label="Edit mode">
        <Button
          variant={mode === 'shots' ? 'default' : 'outline'}
          className="h-11 flex-1"
          aria-pressed={mode === 'shots'}
          data-testid="mode-shots"
          onClick={() => setMode('shots')}
        >
          Shots
        </Button>
        <Button
          variant={mode === 'alignment' ? 'default' : 'outline'}
          className="h-11 flex-1"
          aria-pressed={mode === 'alignment'}
          data-testid="mode-alignment"
          onClick={() => {
            setMode('alignment');
            setSelectedId(null);
          }}
        >
          Alignment
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ImageStage
            imageUrl={imageUrl}
            imageSize={photo.working}
            calibration={calibration}
            template={template}
            mode={mode}
            shots={shots}
            selectedShotId={selectedId}
            mpiMm={preview?.result?.all.mpi ?? null}
            holeDiameterMm={holeDiameterMm}
            onSelectShot={setSelectedId}
            onAddShot={addShot}
            onMoveShot={moveShot}
            onCalibrationChange={changeCalibration}
            apiRef={stageApi}
            onShotDragEnd={onShotDragEnd}
          />
        </div>
        {/* M17 step 1 (REV-29): one parked marker per round with no hole yet. Derived, never stored. */}
        {mode === 'shots' && <UnplacedTray count={unplaced} onPlace={placeUnplaced} />}
      </div>

      {mode === 'shots' ? (
        selected !== null ? (
          <ShotInspector
            shot={selected}
            position={photo.categorization.position ?? 'prone'}
            onChange={changeShot}
            onDelete={deleteSelected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Tap the photo to add a shot, tap a shot to select it, or drag one to move it.
            {unplaced > 0 ? ' Drag a numbered marker from the tray onto the hole it made.' : ''}
          </p>
        )
      ) : (
        <AlignmentControls calibration={calibration} onChange={changeCalibration} />
      )}

      {preview !== null && (
        <LivePreview
          result={preview.result}
          status={preview.status}
          reasons={preview.reasons}
          hintTemplate={analysis.pipeline.templateHint?.template ?? null}
          declared={declaredRoundsOrNull(photo.categorization)}
        />
      )}

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
