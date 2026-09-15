import { useMemo } from 'react';

import { overlayLayout, renderOverlaySvg, type Size } from '@/lib/capture/overlay';
import type { TemplateId } from '@/lib/domain/enums';

interface OverlaySvgProps {
  size: Size;
  template: TemplateId;
  outerDiameterFraction: number;
}

/** capture-overlay.md §4: the pure SVG string from `renderOverlaySvg`, drawn 1:1 over the viewfinder container. */
export function OverlaySvg({ size, template, outerDiameterFraction }: OverlaySvgProps) {
  const svg = useMemo(() => {
    if (size.w <= 0 || size.h <= 0) return '';
    return renderOverlaySvg(overlayLayout(size, template, outerDiameterFraction), template, size);
  }, [size, template, outerDiameterFraction]);

  return (
    <div
      className="pointer-events-none absolute inset-0 [&>svg]:block [&>svg]:size-full"
      data-testid="capture-overlay"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
