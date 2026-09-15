import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { containTransform, frameToCss, type Size } from '@/lib/capture/overlay';
import type { Calibration } from '@/lib/domain/photo';

interface CaptureReviewProps {
  imageUrl: string;
  frame: Size;
  prior: Calibration;
  saving: boolean;
  onRetake(): void;
  onUse(): void;
}

/** capture-overlay.md §1.5: the captured frame (contain-fit) with the anchor circle where the overlay was. */
export function CaptureReview({ imageUrl, frame, prior, saving, onRetake, onUse }: CaptureReviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size | null>(null);

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

  const t = container ? containTransform(container, frame) : null;
  const centre = t ? frameToCss({ x: prior.cx, y: prior.cy }, t) : null;
  const r = t ? prior.radiusPx * t.k : 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="relative min-h-0 flex-1 bg-black">
        <img src={imageUrl} alt="Captured target" className="absolute inset-0 size-full object-contain" />
        {container && centre && (
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
      </div>
      <div className="flex gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button variant="outline" className="h-12 flex-1 text-base" onClick={onRetake} disabled={saving}>
          Retake
        </Button>
        <Button className="h-12 flex-1 text-base" onClick={onUse} disabled={saving}>
          {saving ? 'Saving…' : 'Use photo'}
        </Button>
      </div>
    </div>
  );
}
