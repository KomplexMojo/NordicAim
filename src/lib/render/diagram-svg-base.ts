// rendering-composite.md intro, §3: the SVG root, the mm -> px projection and the page background every diagram starts from.
// Split out of `diagram-shared.ts` (issue #24); pure SVG.

import { PALETTE } from './palette';
import { el } from './svg';

export function svgRoot(width: number, height: number, children: string): string {
  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}` }, children);
}

/** rendering-composite.md intro: `X = cx + xMm*s`, `Y = cy - yMm*s`. */
export function projectMm(cx: number, cy: number, s: number, xMm: number, yMm: number): { x: number; y: number } {
  return { x: cx + xMm * s, y: cy - yMm * s };
}

export function renderBackground(width: number, height: number): string {
  const page = el('rect', { x: 0, y: 0, width, height, fill: PALETTE.page });
  const rail = el('rect', { x: 0, y: 0, width: 8, height, fill: PALETTE.accent });
  return page + rail;
}
