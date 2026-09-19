import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { containTransform, type FitTransform, type Size } from '@/lib/capture/overlay';
import type { Shot } from '@/lib/domain/analysis';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';
import { polylineAttr, templateRingPolylines } from '@/lib/geometry/rings';
import { mmToPx, pxToMm } from '@/lib/geometry/transform';

import { ShotLayer } from './ShotLayer';
import { SuggestionLayer, type ScreenSuggestion } from './SuggestionLayer';

/** M13 step 1: "zoom 1x-6x (buttons and pinch)". */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
const ZOOM_STEP = 1.5;
/** A press that never moves further than this is a tap, not a drag. */
const TAP_SLOP_CSS = 6;
const MIN_RADIUS_PX = 10;
const NO_SUGGESTIONS: ScreenSuggestion[] = [];

interface Point {
  x: number;
  y: number;
}

/**
 * M17 step 1: the stage's live transform, handed to the page so a marker dragged in from the
 * unplaced tray lands where the finger is rather than at the SVG's untransformed origin.
 */
export interface StageApi {
  /** A viewport point in target mm, or `null` when it is outside the stage box. */
  clientToMm(client: Point): { xMm: number; yMm: number } | null;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; startPan: Point; moved: boolean; suggestionId?: string }
  | { kind: 'shot'; pointerId: number; id: string }
  | { kind: 'handle'; pointerId: number; handle: 'centre' | 'radius' }
  | { kind: 'pinch'; startDist: number; startZoom: number; anchorCss: Point; anchorImage: Point };

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
}

function clampAxis(pan: number, originAtZoom: number, content: number, container: number): number {
  if (content <= container) return (container - content) / 2 - originAtZoom;
  return Math.min(-originAtZoom, Math.max(container - content - originAtZoom, pan));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const recompute = () => {
      const r = el.getBoundingClientRect();
      setContainer((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    };
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const image: Size = { w: imageSize.widthPx, h: imageSize.heightPx };
  const base: FitTransform | null = container === null ? null : containTransform(container, image);
  const scale = base === null ? 1 : base.k * zoom;
  const offsetX = base === null ? 0 : base.ox * zoom + pan.x;
  const offsetY = base === null ? 0 : base.oy * zoom + pan.y;

  const rings = useMemo(() => templateRingPolylines(calibration, template), [calibration, template]);

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function toImage(p: Point): Point {
    return { x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale };
  }

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

  function clampPan(next: Point, atZoom: number): Point {
    if (base === null || container === null) return next;
    return {
      x: clampAxis(next.x, base.ox * atZoom, image.w * base.k * atZoom, container.w),
      y: clampAxis(next.y, base.oy * atZoom, image.h * base.k * atZoom, container.h),
    };
  }

  /** Changes the zoom while keeping the image point under `anchorCss` where it is. */
  function zoomAround(nextZoom: number, anchorCss: Point, anchorImage: Point) {
    if (base === null) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const nextPan = {
      x: anchorCss.x - anchorImage.x * base.k * z - base.ox * z,
      y: anchorCss.y - anchorImage.y * base.k * z - base.oy * z,
    };
    setZoom(z);
    setPan(clampPan(nextPan, z));
  }

  function zoomByButton(factor: number) {
    if (container === null) return;
    const centre = { x: container.w / 2, y: container.h / 2 };
    zoomAround(zoom * factor, centre, toImage(centre));
  }

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

    if (g !== null && g.kind === 'shot') {
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
            <div
              className="absolute"
              style={{ left: base.ox, top: base.oy, width: image.w * base.k, height: image.h * base.k }}
            >
              {imageUrl !== null && (
                <img src={imageUrl} alt="The photo of this target" className="block size-full" draggable={false} />
              )}
              <svg
                viewBox={`0 0 ${image.w} ${image.h}`}
                className="absolute inset-0 size-full"
                style={{ pointerEvents: 'none' }}
                data-testid="stage-overlay"
              >
                {rings.map((ring) => (
                  <polygon
                    key={`${ring.style}-${ring.diameterMm}`}
                    data-testid="ring-polyline"
                    data-diameter-mm={ring.diameterMm}
                    points={polylineAttr(ring.points)}
                    fill="none"
                    stroke={ring.style === 'anchor' ? '#FFFFFF' : '#67E8F9'}
                    strokeWidth={(ring.style === 'anchor' ? 2.5 : 1.5) / scale}
                    strokeDasharray={ring.style === 'guide' ? `${6 / scale} ${6 / scale}` : undefined}
                    opacity={0.85}
                  />
                ))}
                {/* M21 step 2: under the shots, so a real shot always wins the tap. */}
                <SuggestionLayer
                  suggestions={suggestions}
                  calibration={calibration}
                  scale={scale}
                  holeDiameterMm={holeDiameterMm}
                  interactive={mode === 'shots'}
                />
                <ShotLayer
                  shots={shots}
                  calibration={calibration}
                  selectedId={selectedShotId}
                  scale={scale}
                  holeDiameterMm={holeDiameterMm}
                  mpiMm={mpiMm}
                  interactive={mode === 'shots'}
                />
                {mode === 'alignment' && (
                  <g data-testid="alignment-handles">
                    <circle
                      data-handle="centre"
                      cx={calibration.cx}
                      cy={calibration.cy}
                      r={handleRadius}
                      fill="rgba(250,204,21,0.25)"
                      stroke="#FACC15"
                      strokeWidth={2 / scale}
                      style={{ pointerEvents: 'auto' }}
                    />
                    <circle
                      data-handle="radius"
                      cx={anchorEdge.x}
                      cy={anchorEdge.y}
                      r={handleRadius}
                      fill="rgba(250,204,21,0.25)"
                      stroke="#FACC15"
                      strokeWidth={2 / scale}
                      style={{ pointerEvents: 'auto' }}
                    />
                  </g>
                )}
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          data-testid="zoom-out"
          onClick={() => zoomByButton(1 / ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
        >
          Zoom out
        </Button>
        <span className="min-w-16 text-center text-sm text-muted-foreground" data-testid="zoom-label">
          {zoom.toFixed(1)}x
        </span>
        <Button
          variant="outline"
          className="h-11 flex-1"
          data-testid="zoom-in"
          onClick={() => zoomByButton(ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
        >
          Zoom in
        </Button>
      </div>
    </div>
  );
}
