import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { GlossarySheet } from '@/components/glossary/GlossarySheet';
import { Button } from '@/components/ui/button';
import { declaredRoundsOrNull } from '@/lib/domain/categorization';
import { shotTemplate } from '@/lib/pipeline/stage-a';
import { blendLayerStyle, renderDiagramOverlaySvg } from '@/lib/render/diagram-overlay';
import { unplacedRounds } from '@/lib/services/adjust';
import { readPanelOpen, writePanelOpen } from '@/lib/ui/panel-state';
import { cn } from '@/lib/utils';

import { AdjustTip } from './AdjustTip';
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
/**
 * The suggested-holes feature (M21 step 2) is switched off for now (the owner, 2026-09-20: 'we may re-add it later'). Set this to `true` to
 * bring back the dashed suggestion circles and the Hide/Show button; the detection, the draft state and the tests for it are all still here.
 */
const SHOW_SUGGESTED_HOLES = false;

export function AdjustSurface({ draft }: { draft: AdjustDraft }) {
  const [mode, setMode] = useState<'shots' | 'alignment'>('shots');
  // M17 step 1: the stage's live transform, so a dragged tray marker lands under the finger.
  const stageApi = useRef<StageApi | null>(null);
  // REV-85: two sliders over the diagram layer, side by side. Swipe: 0 the whole diagram to 1 the whole photo (it starts on the photo, so
  // editing looks as before). Fade: 0 the diagram solid to 1 gone; it starts solid, so swiping alone reveals the diagram.
  const [fade, setFade] = useState(0);
  // REV-119: everything drawn shows at first; slide right (swipe) or up (fade) to reveal the bare photo.
  const [swipe, setSwipe] = useState(0);
  // Issue #88: the two sliders sit behind a Compare toggle, closed by default (remembered on this device); closed, the
  // diagram shows solid over the photo, the default editing view.
  const [compareOpen, setCompareOpen] = useState(() => readPanelOpen('compare', false));
  const fadeId = useId();
  const swipeId = useId();
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
    const [f, w] = compareOpen ? [fade, swipe] : [0, 0];
    const style = blendLayerStyle(f, draft.imageUrl === null ? 0 : w);
    return { svg, ...style, showHandle: w > 0 && w < 1 };
  }, [data, calibration, shots, preview, fade, swipe, compareOpen, draft.imageUrl]);
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
      <AdjustTip />
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
            suggestions={SHOW_SUGGESTED_HOLES ? draft.suggestions : []}
            onAcceptSuggestion={draft.acceptSuggestion}
            diagram={diagram}
          />
        </div>
        {/* M17 step 1 (REV-29): one parked marker per round with no hole yet. Derived, never stored.
            M20 (REV-39): each one is scored as a miss until it is dragged onto a hole. */}
        {mode === 'shots' && <UnplacedTray count={unplaced} onPlace={placeUnplaced} />}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          className="h-11 gap-2 text-muted-foreground"
          aria-expanded={compareOpen}
          aria-controls="compare-slider"
          data-testid="compare-toggle"
          onClick={() => {
            writePanelOpen('compare', !compareOpen);
            setCompareOpen(!compareOpen);
          }}
        >
          Compare with photo
          <ChevronDown className={cn('size-4 transition-transform', compareOpen && 'rotate-180')} aria-hidden="true" />
        </Button>
        <GlossarySheet />
      </div>

      {/* REV-78/REV-85: the diagram↔photo comparison, as two half-width sliders side by side (issue #88: behind Compare). */}
      {compareOpen && (
        <section
          id="compare-slider"
          className="grid grid-cols-2 gap-3"
          data-testid="compare-slider"
          data-fade={fade}
          data-swipe={swipe}
          aria-label="Compare the diagram with the photo"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={fadeId} className="text-sm text-muted-foreground">
              Fade
            </label>
            <input
              id={fadeId}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fade}
              data-testid="fade-range"
              className="h-11 w-full"
              onChange={(e) => setFade(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={swipeId} className="text-sm text-muted-foreground">
              Swipe
            </label>
            <input
              id={swipeId}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={swipe}
              data-testid="swipe-range"
              className="h-11 w-full"
              onChange={(e) => setSwipe(Number(e.target.value))}
            />
          </div>
        </section>
      )}

      {/* M21 step 2: only when there is something to hide; with no suggestions nothing is shown or said. */}
      {SHOW_SUGGESTED_HOLES && mode === 'shots' && draft.suggestionCount > 0 && (
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
        ) : null
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
          modified={draft.modified}
        />
      )}
    </>
  );
}
