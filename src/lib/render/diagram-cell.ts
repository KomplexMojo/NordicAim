// rendering-composite.md §4 (REV-51, REV-52, REV-58): the `cell` variant's chip, caption band, one fixed scale, off-view count and
// clip, and the blank template cell. Split out of `diagram-shared.ts` (issue #24); pure SVG.

import { PALETTE } from './palette';
import { PRECISION_TEMPLATE } from '../defaults/templates';
import { renderPositionSilhouette, renderSightingRoleSymbol } from './diagram-marks';
import { el, text } from './svg';

import { projectMm, renderBackground, svgRoot } from './diagram-svg-base';

/** §4: chip `<TEMPLATE> <slot> · <POSITION>` (slot omitted when not given), sized to its own text. */
export function renderCellChip(templateId: string, positionLabel: string, slotLabel?: string): string {
  const head = slotLabel ? `${templateId} ${slotLabel}` : templateId;
  // An empty slot (REV-51) has no position, so its chip reads just its label ("CONFIRM", "PRECISION 2").
  const label = positionLabel === '' ? head : `${head} · ${positionLabel}`;
  const upper = label.toUpperCase();
  const width = 16 + 9 * upper.length;
  const chip = el('rect', { x: 20, y: 20, width, height: 36, rx: 18, fill: PALETTE.panel });
  const labelText = text(20 + width / 2, 44, 15, upper, { bold: true, anchor: 'middle', color: PALETTE.textPrimary });
  return chip + labelText;
}

/** §4: the caption band rect plus centred caption text. */
export function renderCellCaptionBand(captionText: string): string {
  const band = el('rect', { x: 0, y: 668, width: 720, height: 52, fill: PALETTE.panel });
  const label = text(360, 700, 17, captionText, { anchor: 'middle', color: PALETTE.textPrimary });
  return band + label;
}

/** rendering-composite.md §4: where a cell's caption band starts; the drawing is clipped above it. */
export const CELL_CAPTION_TOP = 668;

/**
 * §4 (REV-58): the one scale every small target view is drawn at, both templates — the precision sheet's halo fills the 300 px
 * drawing radius, so a sighting target is drawn smaller than its panel. The same on a result card and in the shareable image, so
 * targets can be compared by eye. **Never zooms out for a stray shot** (it is clipped and counted instead).
 */
export const CELL_SCALE = 300 / (PRECISION_TEMPLATE.haloDiameterMm / 2);

/**
 * §3 (REV-58): the detail diagram's scale. One target, nothing to compare against, so it zooms out until every shot is shown:
 * `baseScale` while every shot is inside the printed halo, else the scale that puts the farthest shot on the halo's edge, never
 * below half of `baseScale`.
 */
export function fitScale(baseScale: number, haloRadiusMm: number, shots: Array<{ xMm: number; yMm: number }>): number {
  const reach = shots.reduce((max, shot) => Math.max(max, Math.hypot(shot.xMm, shot.yMm)), 0);
  if (reach <= haloRadiusMm) return baseScale;
  return Math.max(0.5 * baseScale, (baseScale * haloRadiusMm) / reach);
}

/** §4 (REV-58): how many shots (not units) a small view's clip leaves out. */
export function offViewCount(shots: Array<{ xMm: number; yMm: number }>, cx: number, cy: number, s: number): number {
  return shots.filter((shot) => {
    const { x, y } = projectMm(cx, cy, s, shot.xMm, shot.yMm);
    return x < 0 || x > 720 || y < 0 || y > CELL_CAPTION_TOP;
  }).length;
}

/** §4 (REV-58): `+N off view`, just above the caption band and outside the clip; nothing when N is 0. */
export function renderOffViewNote(count: number): string {
  return count === 0 ? '' : text(704, 654, 13, `+${count} off view`, { anchor: 'end', color: PALETTE.textSecondary });
}

/**
 * §4 (REV-51): clips a cell's drawing to (0, 0, 720, CELL_CAPTION_TOP) so a scattered group's ellipse is
 * cut at the edge rather than drawn over the caption. `id` must be unique in the whole composite, where
 * several cells share one document.
 */
export function clipCell(id: string, content: string): string {
  const defs = el('defs', {}, el('clipPath', { id }, el('rect', { x: 0, y: 0, width: 720, height: CELL_CAPTION_TOP })));
  return defs + el('g', { 'clip-path': `url(#${id})` }, content);
}

/** §5 (REV-51): how strongly an empty slot's blank template is drawn, so it reads as unused. */
export const BLANK_CELL_OPACITY = 0.35;

/** §5 (REV-51): an empty slot — the template alone, faded, with its chip and a "No target" caption. */
export function renderBlankCell(label: string, target: string, mark?: 'sight-in' | 'confirm' | 'prone' | 'standing'): string {
  const body =
    renderBackground(720, 720) +
    el('g', { opacity: BLANK_CELL_OPACITY }, target) +
    (mark === undefined
      ? renderCellChip(label, '')
      : mark === 'prone' || mark === 'standing'
        ? renderPositionSilhouette(mark)
        : renderSightingRoleSymbol(mark)) +
    renderCellCaptionBand('No target');
  return svgRoot(720, 720, body);
}
