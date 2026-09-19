import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { containTransform, frameToCss, type Size } from '@/lib/capture/overlay';
import type { TemplateId } from '@/lib/domain/enums';
import type { Calibration } from '@/lib/domain/photo';

import { OverlaySvg } from './OverlaySvg';

/**
 * `prior`: the shutter-capture and backing-card flows, where the frame-space calibration prior
 * (or `null` in card mode, backing-sheet.md §2) is mapped onto the contain-fit review image.
 * `template`: the import/native-camera flow (capture-overlay.md §1.8, REV-50) — the framing is
 * unknown, so the full template overlay is drawn fitted to the review container, informationally,
 * without implying any calibration prior.
 */
export type ReviewOverlay =
  | { kind: 'prior'; frame: Size; prior: Calibration | null }
  | { kind: 'template'; template: TemplateId; outerDiameterFraction: number };

interface CaptureReviewProps {
  imageUrl: string;
  /** Shown at the top of the screen (e.g. "Imported photo 2 of 3"); omitted for the shutter flow. */
  header?: string | null;
  overlay?: ReviewOverlay;
  saving: boolean;
  retakeLabel?: string;
  useLabel?: string;
  onRetake(): void;
  onUse(): void;
}

/**
 * capture-overlay.md §1.5: the reviewed image (contain-fit) with either the anchor circle where a
 * live overlay prior was, or the full template overlay drawn informationally over an import.
 */
export function CaptureReview({
  imageUrl,
  header = null,
  overlay,
  saving,
  retakeLabel = 'Retake',
  useLabel = 'Use photo',
  onRetake,
  onUse,
}: CaptureReviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadedForUrl, setLoadedForUrl] = useState(imageUrl);

  // A new image (e.g. the next photo in an import sequence) starts unloaded again. Adjusting
  // state during render, not in an effect, per https://react.dev/learn/you-might-not-need-an-effect.
  if (loadedForUrl !== imageUrl) {
    setLoadedForUrl(imageUrl);
    setLoaded(false);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const recompute = () => {
      const r = el.getBoundingClientRect();
      setContainer((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    };
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    window.addEventListener('orientationchange', recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', recompute);
    };
  }, []);

  const priorOverlay = overlay?.kind === 'prior' ? overlay : null;
  const t = container && priorOverlay?.prior ? containTransform(container, priorOverlay.frame) : null;
  const centre = t && priorOverlay?.prior ? frameToCss({ x: priorOverlay.prior.cx, y: priorOverlay.prior.cy }, t) : null;
  const r = t && priorOverlay?.prior ? priorOverlay.prior.radiusPx * t.k : 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="relative min-h-0 flex-1 bg-black">
        <img
          src={imageUrl}
          alt="Captured photo"
          className="absolute inset-0 size-full object-contain"
          onLoad={() => setLoaded(true)}
        />
        {loaded && container && centre && (
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${container.w} ${container.h}`}
            data-testid="review-overlay"
          >
            <circle cx={centre.x} cy={centre.y} r={r} fill="none" stroke="#0B1220" strokeWidth={5} />
            <circle
              className="review-anchor"
              cx={centre.x}
              cy={centre.y}
              r={r}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={3}
              opacity={0.9}
            />
          </svg>
        )}
        {loaded && container && overlay?.kind === 'template' && (
          <OverlaySvg size={container} template={overlay.template} outerDiameterFraction={overlay.outerDiameterFraction} />
        )}
        {header && (
          <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col items-center gap-1.5">
            <span className="rounded-full bg-black/65 px-3 py-1.5 text-center text-sm text-white" data-testid="review-header">
              {header}
            </span>
            <span className="rounded-full bg-black/65 px-3 py-1.5 text-center text-sm text-white" data-testid="review-loaded">
              {loaded ? 'Loaded' : 'Loading…'}
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="outline" className="h-12 flex-1 text-base" onClick={onRetake} disabled={saving}>
          {retakeLabel}
        </Button>
        <Button className="h-12 flex-1 text-base" onClick={onUse} disabled={saving || !loaded}>
          {saving ? 'Saving…' : useLabel}
        </Button>
      </div>
    </div>
  );
}
