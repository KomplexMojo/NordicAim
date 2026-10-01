import { useEffect, useRef, useState, type RefObject } from 'react';

import { containTransform, type FitTransform, type Size } from '@/lib/capture/overlay';

import { clampAxis, type Point } from './image-stage-gesture';

/** M13 step 1: "zoom 1x-6x (buttons and pinch)". */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
export const ZOOM_STEP = 1.5;

/**
 * M13 step 1: the Adjust stage's viewport — the photo fitted to the stage, then zoomed (1x-6x) and panned, kept in bounds, with the
 * buttons, keys (+, -, 0) and a trackpad pinch (ctrl + wheel). `ImageStage` adds the pointer gestures on top. Split out of
 * `ImageStage.tsx` (issue #24).
 */
export function useStageViewport(containerRef: RefObject<HTMLDivElement | null>, imageSize: { widthPx: number; heightPx: number }) {
  const [container, setContainer] = useState<Size | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

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
  }, [containerRef]);

  const image: Size = { w: imageSize.widthPx, h: imageSize.heightPx };
  const base: FitTransform | null = container === null ? null : containTransform(container, image);
  const scale = base === null ? 1 : base.k * zoom;
  const offsetX = base === null ? 0 : base.ox * zoom + pan.x;
  const offsetY = base === null ? 0 : base.oy * zoom + pan.y;

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function toImage(p: Point): Point {
    return { x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale };
  }

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

  function fit() {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === '+' || e.key === '=') zoomByButton(ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') zoomByButton(1 / ZOOM_STEP);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  }

  // Trackpad pinch (and ctrl + wheel) zooms about the cursor; a plain wheel still scrolls the page.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || base === null) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      const at = { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
      zoomAround(zoom * Math.exp(-e.deltaY * 0.01), at, toImage(at));
    };
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef]);

  return {
    container,
    zoom,
    pan,
    setPan,
    image,
    base,
    scale,
    offsetX,
    offsetY,
    localPoint,
    toImage,
    clampPan,
    zoomAround,
    zoomByButton,
    fit,
    onKeyDown,
  };
}
