// rendering-composite.md §3 (sighting) and §4 (cell variant). Sighting/zeroing target: two nested
// zones (45 mm prone, 115 mm standing), each with a dotted "clean" guide circle inside its solid ring.

import { SIGHTING_TEMPLATE } from '../defaults/templates';
import { PALETTE } from './palette';
import { el, text } from './svg';
import {
  renderBackground,
  renderCellCaptionBand,
  renderCellChip,
  renderFooterPanel,
  renderGroupEllipse,
  renderLegendBand,
  renderLegendBothDots,
  renderMarkerLabels,
  renderMpiMarker,
  renderShots,
  renderSubtitle,
  renderTitle,
  svgRoot,
  cellScale,
  clipCell,
  renderBlankCell,
} from './diagram-shared';
import { cellCaption, sightingFooterLines } from './text-lines';
import type { DiagramInput, DiagramVariant } from './diagram';

const TITLE = 'Sighting / Zeroing — Biathlon 50m';

const FULL = { width: 1500, height: 1700, cx: 750, cy: 720, s: 8 };
const HALO_RADIUS_MM = SIGHTING_TEMPLATE.haloDiameterMm / 2; // 62.5
const CELL = { width: 720, height: 720, cx: 360, cy: 350, s: 300 / HALO_RADIUS_MM };

/** §3 item 5 (sighting): halo, standing disc + dotted 110mm guide, prone disc + dotted 40mm guide,
 * and a small centre reference dot. Shared verbatim by the full and cell variants (only cx/cy/s differ). */
function renderTarget(cx: number, cy: number, s: number): string {
  const standing = SIGHTING_TEMPLATE.zones.standing;
  const prone = SIGHTING_TEMPLATE.zones.prone;

  const halo = el('circle', { cx, cy, r: (SIGHTING_TEMPLATE.haloDiameterMm / 2) * s, fill: PALETTE.haloFill, stroke: PALETTE.panelBorder, 'stroke-width': 1.5 });
  const disc = el('circle', { cx, cy, r: (standing.solidDiameterMm / 2) * s, fill: PALETTE.discSighting, stroke: '#232A33', 'stroke-width': 3 });
  const standingGuide = el('circle', {
    cx,
    cy,
    r: (standing.guideDiameterMm / 2) * s,
    stroke: PALETTE.guideOnDark,
    'stroke-width': 2,
    'stroke-dasharray': '18 14',
    fill: 'none',
  });
  const proneDisc = el('circle', { cx, cy, r: (prone.solidDiameterMm / 2) * s, fill: '#FFFFFF', stroke: '#232A33', 'stroke-width': 2 });
  const proneGuide = el('circle', {
    cx,
    cy,
    r: (prone.guideDiameterMm / 2) * s,
    stroke: PALETTE.accent,
    'stroke-width': 2,
    'stroke-dasharray': '14 10',
    fill: 'none',
  });
  const centreDot = el('circle', { cx, cy, r: 0.6 * s, stroke: PALETTE.accent, 'stroke-width': 1, fill: 'none' });

  return halo + disc + standingGuide + proneDisc + proneGuide + centreDot;
}

/** §3 item 5 (sighting, `full` only): "45 mm" just right of the prone disc, "115 mm" top-right outside the halo (REV-22). */
function renderZoneLabels(cx: number, cy: number, s: number): string {
  const proneRadiusPx = (SIGHTING_TEMPLATE.zones.prone.solidDiameterMm / 2) * s;
  const prone = text(cx + proneRadiusPx + 10, cy - 8, 14, '45 mm', { color: PALETTE.guideOnDark, class: 'zone-label' });
  const standing = text(cx + 400, cy - 434, 14, '115 mm', { color: PALETTE.accentText, class: 'zone-label' });
  return prone + standing;
}

function renderLegendIcon(cx: number, cy: number, filled: boolean): string {
  return filled
    ? el('circle', { cx, cy, r: 9, fill: PALETTE.discSighting, stroke: '#232A33', 'stroke-width': 2 })
    : el('circle', { cx, cy, r: 9, fill: '#FFFFFF', stroke: '#232A33', 'stroke-width': 2 });
}

function renderLegend(isBoth: boolean): string {
  const proneIcon = renderLegendIcon(83, 146, false);
  const proneLabel = text(110, 152, 17, '45 mm prone zone', { color: PALETTE.textPrimary });
  const standingIcon = renderLegendIcon(380, 146, true);
  const standingLabel = text(416, 152, 17, '115 mm standing zone', { color: PALETTE.textPrimary });
  const guideLabel = text(760, 152, 17, 'Dotted: 40 mm / 110 mm guides', { color: PALETTE.textSecondary });
  const both = isBoth ? renderLegendBothDots() : '';
  return renderLegendBand(48, 120, 1404, 52, proneIcon + proneLabel + standingIcon + standingLabel + guideLabel + both);
}

export function renderSightingDiagram(input: DiagramInput, variant: DiagramVariant, slotLabel?: string): string {
  const { result, shots, positionLabel, captureLocal, lighting, holeDiameterMm } = input;
  const subset = result.all;
  const isBoth = result.position === 'both';

  if (variant === 'cell') {
    // §4 (REV-51): zoom out so every shot fits, then clip the drawing above the caption band.
    const s = input.cellScaleOverride ?? cellScale(CELL.s, shots, holeDiameterMm);
    const target =
      renderTarget(CELL.cx, CELL.cy, s) +
      renderGroupEllipse(subset.groupEllipse, CELL.cx, CELL.cy, s) +
      renderShots(shots, subset.units, CELL.cx, CELL.cy, s, 5, holeDiameterMm) +
      renderMpiMarker(subset.mpi, CELL.cx, CELL.cy, s) +
      renderMarkerLabels(shots, subset.mpi, CELL.cx, CELL.cy, s, 5, 'cell');

    const body =
      renderBackground(CELL.width, CELL.height) +
      clipCell(`cellclip-sighting-${slotLabel ?? '0'}`, target) +
      renderCellChip(input.cellLabelOverride ?? 'SIGHTING', positionLabel, input.cellLabelOverride === undefined ? slotLabel : undefined) +
      renderCellCaptionBand(cellCaption(result));
    return svgRoot(CELL.width, CELL.height, body);
  }

  const target =
    renderTarget(FULL.cx, FULL.cy, FULL.s) +
    renderZoneLabels(FULL.cx, FULL.cy, FULL.s) +
    renderGroupEllipse(subset.groupEllipse, FULL.cx, FULL.cy, FULL.s) +
    renderShots(shots, subset.units, FULL.cx, FULL.cy, FULL.s, 8, holeDiameterMm) +
    renderMpiMarker(subset.mpi, FULL.cx, FULL.cy, FULL.s) +
    renderMarkerLabels(shots, subset.mpi, FULL.cx, FULL.cy, FULL.s, 8, 'full');

  const body =
    renderBackground(FULL.width, FULL.height) +
    renderTitle(TITLE) +
    renderSubtitle(positionLabel, subset.declared, captureLocal, lighting) +
    renderLegend(isBoth) +
    target +
    renderFooterPanel(sightingFooterLines(result, shots, positionLabel, holeDiameterMm));
  return svgRoot(FULL.width, FULL.height, body);
}

/** rendering-composite.md §5 (REV-51): an empty sighting slot in the summary image. */
export function renderBlankSightingCell(label: string, scale = CELL.s): string {
  return renderBlankCell(label, renderTarget(CELL.cx, CELL.cy, scale));
}
