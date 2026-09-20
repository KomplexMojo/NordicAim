// patterns.md §5: every recorded shot on one printed target, as small translucent dots. Pure.

import { PRECISION_TEMPLATE, SIGHTING_TEMPLATE } from '../defaults/templates';
import type { PatternPoint } from '../patterns/collect';
import type { PatternSummary } from '../patterns/summarize';
import { renderTarget as renderPrecisionTarget } from './diagram-precision';
import { renderTarget as renderSightingTarget } from './diagram-sighting';
import { fitScale, projectMm, renderGroupEllipse, renderMpiMarker, svgRoot } from './diagram-shared';
import { renderIssueOverlays } from './issue-overlay';
import { el } from './svg';

export const PATTERNS_SIZE = 1200;
const CENTRE = PATTERNS_SIZE / 2;
// Big and bright enough to read on a phone, where the 1200 px drawing is shown about 340 px wide; the white edge keeps a
// dot visible on the black disc and the red keeps it visible on white, and overlap still deepens the colour.
export const DOT_RADIUS_PX = 8;
export const DOT_OPACITY = 0.6;
export const DOT_COLOUR = '#FF3B1F';
// Both printed targets are drawn with the same outer diameter (halo radius 525 px of the 1200 px drawing), so the four views
// are the same size; one shared zoom-out (`patternsSizeFactor`) keeps every shot on the paper in all of them.
const HALO_PX = 525;
const PRECISION_BASE_SCALE = HALO_PX / (PRECISION_TEMPLATE.haloDiameterMm / 2);
const SIGHTING_BASE_SCALE = HALO_PX / (SIGHTING_TEMPLATE.haloDiameterMm / 2);
const MIN_FACTOR = 0.5;

export interface PatternsInput {
  kind: 'precision' | 'sighting';
  points: PatternPoint[];
  summary: PatternSummary;
  /** From `patternsSizeFactor`; 1 draws the halo at full size. */
  factor: number;
  /** REV-74: shooting-issue regions to draw over the target. */
  issues?: readonly string[];
}

/**
 * The one zoom-out every view shares: 1 while every shot of every view is inside its printed halo, else small enough that the
 * farthest shot of any view is on the paper (floor 0.5). Computed from all shots, not the date range, so the size does not jump
 * when the range or the view changes.
 */
export function patternsSizeFactor(views: ReadonlyArray<{ kind: 'precision' | 'sighting'; points: PatternPoint[] }>): number {
  let factor = 1;
  for (const { kind, points } of views) {
    const halo = (kind === 'precision' ? PRECISION_TEMPLATE.haloDiameterMm : SIGHTING_TEMPLATE.haloDiameterMm) / 2;
    const base = kind === 'precision' ? PRECISION_BASE_SCALE : SIGHTING_BASE_SCALE;
    factor = Math.min(factor, fitScale(base, halo, points) / base);
  }
  return Math.max(MIN_FACTOR, factor);
}

export function patternsScale(kind: 'precision' | 'sighting', factor: number): number {
  return (kind === 'precision' ? PRECISION_BASE_SCALE : SIGHTING_BASE_SCALE) * factor;
}

export function renderPatternsSvg({ kind, points, summary, factor, issues = [] }: PatternsInput): string {
  const s = patternsScale(kind, factor);
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
    renderMpiMarker(summary.mpi, CENTRE, CENTRE, s) +
    renderIssueOverlays(issues, { cx: CENTRE, cy: CENTRE, s }, kind);
  return svgRoot(PATTERNS_SIZE, PATTERNS_SIZE, layers);
}
