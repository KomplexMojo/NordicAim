// patterns.md §5: every recorded shot on one printed target, as small translucent dots. Pure.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '../defaults/templates';
import type { PatternPoint } from '../patterns/collect';
import type { PatternSummary } from '../patterns/summarize';
import { renderTarget as renderPrecisionTarget } from './diagram-precision';
import { renderTarget as renderSightingTarget } from './diagram-sighting';
import { fitScale, projectMm, renderGroupEllipse, renderMpiMarker, svgRoot } from './diagram-shared';
import { el } from './svg';

export const PATTERNS_SIZE = 1200;
const CENTRE = PATTERNS_SIZE / 2;
// Big and bright enough to read on a phone, where the 1200 px drawing is shown about 340 px wide; the white edge keeps a
// dot visible on the black disc and the red keeps it visible on white, and overlap still deepens the colour.
export const DOT_RADIUS_PX = 8;
export const DOT_OPACITY = 0.6;
export const DOT_COLOUR = '#FF3B1F';
const PRECISION_BASE_SCALE = 6.35;
const SIGHTING_BASE_SCALE = 8;

export interface PatternsInput {
  kind: 'precision' | 'sighting';
  points: PatternPoint[];
  summary: PatternSummary;
}

/** The scale the drawing uses: the detail scale, zoomed out so the farthest shot is on the paper (floor 0.5×). */
export function patternsScale(kind: 'precision' | 'sighting', points: PatternPoint[]): number {
  return kind === 'precision'
    ? fitScale(PRECISION_BASE_SCALE, PRECISION_TEMPLATE.haloDiameterMm / 2, points)
    : fitScale(SIGHTING_BASE_SCALE, SIGHTING_TEMPLATE.haloDiameterMm / 2, points);
}

export function renderPatternsSvg({ kind, points, summary }: PatternsInput): string {
  const s = patternsScale(kind, points);
  const target = kind === 'precision' ? renderPrecisionTarget(CENTRE, CENTRE, s, s >= 4) : renderSightingTarget(CENTRE, CENTRE, s);

  let dots = '';
  for (const p of points) {
    const { x, y } = projectMm(CENTRE, CENTRE, s, p.xMm, p.yMm);
    dots += el('circle', { cx: x, cy: y, r: DOT_RADIUS_PX, fill: DOT_COLOUR,
      'fill-opacity': DOT_OPACITY,
      stroke: '#FFFFFF',
      'stroke-width': 1.5,
      'stroke-opacity': 0.85,
      class: 'pattern-dot',
    });
  }

  const layers =
    target +
    renderGroupEllipse(summary.ellipse, CENTRE, CENTRE, s) +
    el('g', { class: 'pattern-dots' }, dots) +
    renderMpiMarker(summary.mpi, CENTRE, CENTRE, s);
  return svgRoot(PATTERNS_SIZE, PATTERNS_SIZE, layers);
}
