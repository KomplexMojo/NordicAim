import { useEffect, useMemo, useRef } from 'react';

import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import { templateRingPolylines } from '@/lib/geometry/rings';
import { mmToPx, pxToMm } from '@/lib/geometry/transform';

import { distance, MIN_RADIUS_PX, TAP_SLOP_CSS, type Gesture, type Point } from './image-stage-gesture';
import { StageLayers } from './StageLayers';
import { StageViewportControl } from './StageViewportControl';
import type { ScreenSuggestion } from './SuggestionLayer';
import { MIN_ZOOM, useStageViewport, ZOOM_STEP } from './use-stage-viewport';

export { MAX_ZOOM, MIN_ZOOM } from './use-stage-viewport';
const NO_SUGGESTIONS: ScreenSuggestion[] = [];

/**
 * M17 step 1: the stage's live transform, handed to the page so a marker dragged in from the
 * unplaced tray lands where the finger is rather than at the SVG's untransformed origin.
 */
export interface StageApi {
  /** A viewport point in target mm, or `null` when it is outside the stage box. */
  clientToMm(client: Point): { xMm: number; yMm: number } | null;
}

interface ImageStageProps {
  imageUrl: string | null;
  imageSize: { widthPx: number; heightPx: number };
  calibration: Calibration;
  template: TemplateId;
  mode: 'shots' | 'alignment';
  shots: Shot[];
  selectedShotId: string | null;
  mpiMm: { xMm: number; yMm: number } | null;
  holeDiameterMm: number;
  onSelectShot(id: string | null): void;
  onAddShot(mm: { xMm: number; yMm: number }): void;
  onMoveShot(id: string, mm: { xMm: number; yMm: number }): void;
  onCalibrationChange(calibration: Calibration): void;
  /** M17 step 1: filled with the live transform so the page can place a dragged tray marker. */
  apiRef?: React.RefObject<StageApi | null>;
  /** M17 step 1: where a dragged shot was let go, so the page can drop it on the tray to delete it. */
  onShotDragEnd?(id: string, client: Point): void;
  /** M21 step 2 (REV-40): the suggested holes to draw — derived, never shots. Empty draws nothing. */
  suggestions?: ScreenSuggestion[];
  /** M21 step 2: a tap on a suggestion (not a drag) accepts it. */
  onAcceptSuggestion?(id: string): void;
  /**
   * REV-78: the app's own diagram of this target drawn in the photo's pixel space (`renderDiagramOverlaySvg`), laid over the
   * photo but under the editing marks, with the wipe or fade that `compareLayerStyle` gives. Moves and zooms with the photo.
   */
  diagram?: { svg: string; clipPath: string; opacity: number; boundaryFraction: number; showHandle: boolean } | null;
}

/**
 * M13 step 1: the working photo with template rings, shots and the MPI drawn over it in image px.
 * Zoom 1x-6x with the buttons or a pinch, one-finger pan when no shot (or handle) is grabbed.
 */
export function ImageStage(props: ImageStageProps) {
  const {
    imageUrl,
    imageSize,
    calibration,
    template,
    mode,
    shots,
    selectedShotId,
    mpiMm,
    holeDiameterMm,
    suggestions = NO_SUGGESTIONS,
    onAcceptSuggestion,
    diagram = null,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // The fitted, zoomed and panned view of the photo; the pointer gestures below drive it.
  const view = useStageViewport(containerRef, imageSize);
  const { container, zoom, pan, setPan, image, base, scale, offsetX, offsetY } = view;
  const { localPoint, toImage, clampPan, zoomAround, zoomByButton, fit, onKeyDown } = view;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);

  const rings = useMemo(() => templateRingPolylines(calibration, template), [calibration, template]);

  // M17 step 1: refreshed on every render, because `scale`/`offset` change with zoom and pan.
  const apiRef = props.apiRef;
  useEffect(() => {
    if (apiRef === undefined) return;
    apiRef.current = {
      clientToMm(client: Point) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect === undefined || base === null) return null;
        if (client.x < rect.left || client.x > rect.right || client.y < rect.top || client.y > rect.bottom) {
          return null;
        }
        return pxToMm(toImage({ x: client.x - rect.left, y: client.y - rect.top }), calibration);
      },
    };
    return () => {
      apiRef.current = null;
    };
  });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (base === null) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    containerRef.current?.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        const anchorCss = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gesture.current = {
          kind: 'pinch',
          startDist: Math.max(1, distance(a, b)),
          startZoom: zoom,
          anchorCss,
          anchorImage: toImage(anchorCss),
        };
      }
      return;
    }

    const target = e.target as Element;
    // REV-96: the grab tag. The marker follows the finger with the offset it had when the tag was pressed.
    const tagEl = mode === 'shots' ? target.closest?.('[data-tag-for]') : null;
    if (tagEl !== null && tagEl !== undefined) {
      const id = tagEl.getAttribute('data-tag-for') ?? '';
      const shot = shots.find((s) => s.id === id);
      if (shot !== undefined) {
        const at = toImage(p);
        const marker = mmToPx(shot, calibration);
        gesture.current = { kind: 'tag', pointerId: e.pointerId, id, dx: marker.x - at.x, dy: marker.y - at.y };
        return;
      }
    }
    const shotEl = target.closest?.('[data-shot-id]');
    const handleEl = target.closest?.('[data-handle]');
    const suggestionEl = mode === 'shots' ? target.closest?.('[data-suggestion-id]') : null;
    if (mode === 'shots' && shotEl !== null && shotEl !== undefined) {
      const id = shotEl.getAttribute('data-shot-id') ?? '';
      props.onSelectShot(id);
      gesture.current = { kind: 'shot', pointerId: e.pointerId, id };
      return;
    }
    if (mode === 'alignment' && handleEl !== null && handleEl !== undefined) {
      const handle = handleEl.getAttribute('data-handle') === 'radius' ? 'radius' : 'centre';
      gesture.current = { kind: 'handle', pointerId: e.pointerId, handle };
      return;
    }
    // A press on a suggestion pans like bare paper if it moves; only a tap accepts it (M21 step 2).
    const suggestionId = suggestionEl?.getAttribute('data-suggestion-id') ?? undefined;
    gesture.current = { kind: 'pan', pointerId: e.pointerId, start: p, startPan: pan, moved: false, suggestionId };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (g === null || base === null) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);

    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      zoomAround((distance(a, b) / g.startDist) * g.startZoom, g.anchorCss, g.anchorImage);
      return;
    }
    if (e.pointerId !== g.pointerId) return;

    if (g.kind === 'shot') {
      props.onMoveShot(g.id, pxToMm(toImage(p), calibration));
      return;
    }
    if (g.kind === 'tag') {
      const at = toImage(p);
      props.onMoveShot(g.id, pxToMm({ x: at.x + g.dx, y: at.y + g.dy }, calibration));
      return;
    }
    if (g.kind === 'handle') {
      const img = toImage(p);
      if (g.handle === 'centre') {
        props.onCalibrationChange({ ...calibration, cx: img.x, cy: img.y });
        return;
      }
      const theta = (calibration.angleDeg * Math.PI) / 180;
      const along = (img.x - calibration.cx) * Math.cos(theta) + (img.y - calibration.cy) * Math.sin(theta);
      props.onCalibrationChange({ ...calibration, radiusPx: Math.max(MIN_RADIUS_PX, Math.abs(along)) });
      return;
    }

    const next = { x: g.startPan.x + (p.x - g.start.x), y: g.startPan.y + (p.y - g.start.y) };
    if (distance(p, g.start) > TAP_SLOP_CSS) g.moved = true;
    setPan(clampPan(next, zoom));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const p = localPoint(e);
    pointers.current.delete(e.pointerId);
    containerRef.current?.releasePointerCapture?.(e.pointerId);

    if (g !== null && (g.kind === 'shot' || g.kind === 'tag')) {
      // M17 step 1: dropping a shot on the tray removes it; the page decides from the drop point.
      props.onShotDragEnd?.(g.id, { x: e.clientX, y: e.clientY });
    }

    if (g !== null && g.kind === 'pan' && !g.moved && base !== null) {
      // A tap on a suggestion accepts it; a tap on bare paper adds a shot in the Shots mode, otherwise
      // it clears the selection.
      if (mode === 'shots' && g.suggestionId !== undefined && onAcceptSuggestion !== undefined) {
        onAcceptSuggestion(g.suggestionId);
      } else if (mode === 'shots') props.onAddShot(pxToMm(toImage(p), calibration));
      else props.onSelectShot(null);
    }

    const remaining = [...pointers.current.entries()][0];
    gesture.current =
      remaining === undefined
        ? null
        : { kind: 'pan', pointerId: remaining[0], start: remaining[1], startPan: pan, moved: true };
  }

  const visible =
    base === null || container === null
      ? null
      : (() => {
          const a = toImage({ x: 0, y: 0 });
          const b = toImage({ x: container.w, y: container.h });
          return { x0: Math.max(0, a.x), y0: Math.max(0, a.y), x1: Math.min(image.w, b.x), y1: Math.min(image.h, b.y) };
        })();
  const anchorEdge = mmToPx({ xMm: calibration.anchorDiameterMm / 2, yMm: 0 }, calibration);
  const handleRadius = 16 / scale;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        data-testid="image-stage"
        data-ready={base === null ? 'false' : 'true'}
        data-scale={scale}
        data-offset-x={offsetX}
        data-offset-y={offsetY}
        data-zoom={zoom}
        className="relative w-full touch-none select-none overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: `${image.w} / ${image.h}`, maxHeight: '60vh' }}
        tabIndex={0}
        aria-label="Photo of the target. Plus and minus zoom, 0 fits the whole photo."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {base !== null && (
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
          >
            <StageLayers
              image={image}
              base={base}
              imageUrl={imageUrl}
              diagram={diagram}
              rings={rings}
              scale={scale}
              suggestions={suggestions}
              calibration={calibration}
              holeDiameterMm={holeDiameterMm}
              mode={mode}
              shots={shots}
              selectedShotId={selectedShotId}
              mpiMm={mpiMm}
              visible={visible}
              anchorEdge={anchorEdge}
              handleRadius={handleRadius}
            />
          </div>
        )}
        {/* REV-96: one zoom control, on the picture. Its own pointer events never reach the stage, so pressing it can never add a shot. */}
        <StageViewportControl
          zoom={zoom}
          canFit={!(zoom <= MIN_ZOOM && pan.x === 0 && pan.y === 0)}
          onZoomOut={() => zoomByButton(1 / ZOOM_STEP)}
          onZoomIn={() => zoomByButton(ZOOM_STEP)}
          onFit={fit}
        />
      </div>
    </div>
  );
}
