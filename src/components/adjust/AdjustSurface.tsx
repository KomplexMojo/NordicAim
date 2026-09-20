import { useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import { shotTemplate } from '@/lib/pipeline/stage-a';
import { compareLayerStyle, renderDiagramOverlaySvg, type CompareMode } from '@/lib/render/diagram-overlay';
import { unplacedRounds } from '@/lib/services/adjust';

import { AlignmentControls } from './AlignmentControls';
import { ImageStage, type StageApi } from './ImageStage';
import { LivePreview } from './LivePreview';
import { ShotInspector } from './ShotInspector';
import { UnplacedTray } from './UnplacedTray';
import type { AdjustDraft } from './useAdjustDraft';

/**
 * The Adjust editor itself (M13 steps 1-3, M17 step 1, M21 steps 2-3): modes, the photo with its rings,
 * shots and suggested holes, the unplaced tray, the Inspector or alignment controls, and the live
 * preview. The Adjust route and the session review (M21 step 4) both render this one component, each
 * with its own actions around it.
 */
export function AdjustSurface({ draft }: { draft: AdjustDraft }) {
  const [mode, setMode] = useState<'shots' | 'alignment'>('shots');
  // M17 step 1: the stage's live transform, so a dragged tray marker lands under the finger.
  const stageApi = useRef<StageApi | null>(null);
  // REV-78: 0 is the whole diagram and 1 the whole photo (the M17 compare slider, now part of the editor); the photo shows first.
  const [compareValue, setCompareValue] = useState(1);
  const [compareMode, setCompareMode] = useState<CompareMode>('wipe');
  const sliderId = useId();
  const { data, calibration, shots, selectedId, setSelectedId, preview } = draft;
  const diagram = useMemo(() => {
    if (!data || calibration === null) return null;
    const { photo, analysis, holeDiameterMm } = data;
    const svg = renderDiagramOverlaySvg(
      preview?.result ?? analysis.computed?.result ?? null,
      shots,
      calibration,
      shotTemplate(photo, analysis.pipeline.templateHint, calibration),
      photo.working,
      holeDiameterMm,
    );
    const style = compareLayerStyle(compareMode, draft.imageUrl === null ? 0 : compareValue);
    return { svg, ...style, showHandle: compareMode === 'wipe' && compareValue > 0 && compareValue < 1 };
  }, [data, calibration, shots, preview, compareMode, compareValue, draft.imageUrl]);
  if (!data || calibration === null) return null;

  const { photo, analysis, holeDiameterMm } = data;
  const template = shotTemplate(photo, analysis.pipeline.templateHint, calibration);
  const selected = shots.find((shot) => shot.id === selectedId) ?? null;
  const unplaced = unplacedRounds(photo.categorization, shots);

  function deleteSelected() {
    if (selectedId !== null) draft.deleteShot(selectedId);
  }

  /** M17 step 1: a parked marker let go over the photo becomes a manual shot where the finger was. */
  function placeUnplaced(client: { x: number; y: number }) {
    const mm = stageApi.current?.clientToMm(client) ?? null;
    if (mm === null) return;
    draft.addShot(mm);
  }

  /** M17 step 1: a placed shot dragged back onto the tray is removed. */
  function onShotDragEnd(id: string, client: { x: number; y: number }) {
    const dropped = document.elementFromPoint(client.x, client.y);
    if (dropped?.closest('[data-unplaced-tray]') != null) draft.deleteShot(id);
  }

  return (
    <>
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
            imageUrl={draft.imageUrl}
            imageSize={photo.working}
            calibration={calibration}
            template={template}
            mode={mode}
            shots={shots}
            selectedShotId={selectedId}
            mpiMm={preview?.result?.all.mpi ?? null}
            holeDiameterMm={holeDiameterMm}
            onSelectShot={setSelectedId}
            onAddShot={draft.addShot}
            onMoveShot={draft.moveShot}
            onCalibrationChange={draft.changeCalibration}
            apiRef={stageApi}
            onShotDragEnd={onShotDragEnd}
            suggestions={draft.suggestions}
            onAcceptSuggestion={draft.acceptSuggestion}
            diagram={diagram}
          />
        </div>
        {/* M17 step 1 (REV-29): one parked marker per round with no hole yet. Derived, never stored.
            M20 (REV-39): each one is scored as a miss until it is dragged onto a hole. */}
        {mode === 'shots' && <UnplacedTray count={unplaced} onPlace={placeUnplaced} />}
      </div>

      {/* REV-78 (was the separate Compare view): slide between the diagram and the photo, or fade instead of wipe. */}
      <section
        className="flex flex-col gap-1"
        data-testid="compare-slider"
        data-compare-mode={compareMode}
        data-compare-value={compareValue}
      >
        <label htmlFor={sliderId} className="text-sm text-muted-foreground">
          Diagram ↔ Photo
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={compareValue}
          data-testid="compare-range"
          aria-label="Diagram ↔ Photo"
          className="h-11 w-full"
          onChange={(e) => setCompareValue(Number(e.target.value))}
        />
        <Button
          variant="outline"
          className="h-11"
          data-testid="compare-mode"
          aria-pressed={compareMode === 'fade'}
          onClick={() => setCompareMode(compareMode === 'wipe' ? 'fade' : 'wipe')}
        >
          {compareMode === 'wipe' ? 'Fade instead of wipe' : 'Wipe instead of fade'}
        </Button>
      </section>

      {/* M21 step 2: only when there is something to hide; with no suggestions nothing is shown or said. */}
      {mode === 'shots' && draft.suggestionCount > 0 && (
        <Button
          variant="outline"
          className="h-11"
          data-testid="toggle-suggestions"
          aria-pressed={draft.showSuggestions}
          onClick={() => draft.setShowSuggestions(!draft.showSuggestions)}
        >
          {draft.showSuggestions
            ? `Hide ${draft.suggestionCount} suggested ${draft.suggestionCount === 1 ? 'hole' : 'holes'}`
            : `Show ${draft.suggestionCount} suggested ${draft.suggestionCount === 1 ? 'hole' : 'holes'}`}
        </Button>
      )}

      {mode === 'shots' ? (
        selected !== null ? (
          <ShotInspector
            shot={selected}
            position={photo.categorization.position ?? 'prone'}
            onChange={draft.changeShot}
            onDelete={deleteSelected}
            onClose={() => setSelectedId(null)}
            proposedMultiplicity={draft.proposalFor(selected)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Tap the photo to add a shot, tap a shot to select it, or drag one to move it.
            {draft.suggestions.length > 0
              ? ' Dashed circles are marks the app was unsure about; tap one to count it as a shot.'
              : ''}
            {unplaced > 0
              ? ' Rounds in the tray are scored as misses (off target); drag one onto the hole it made to count it.'
              : ''}
          </p>
        )
      ) : (
        <AlignmentControls calibration={calibration} onChange={draft.changeCalibration} />
      )}

      {preview !== null && (
        <LivePreview
          result={preview.result}
          status={preview.status}
          reasons={preview.reasons}
          hintTemplate={analysis.pipeline.templateHint?.template ?? null}
          declared={declaredRoundsOrNull(photo.categorization)}
          reconcile={preview.reconcile}
        />
      )}
    </>
  );
}
