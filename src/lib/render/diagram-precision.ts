// rendering-composite.md §3 (precision) and §4 (cell variant). Precision (Olympic 50m rifle) target:
// 10 concentric rings, a black aiming disc, and a RESULTS tally panel (full variant only).

import { PRECISION_TEMPLATE, ringRadiusMm } from '../defaults/templates';
import type { SubsetResult } from '../domain/analysis';
import { PALETTE } from './palette';
import { renderScoringIcon } from './scoring-icons';
import { el, text } from './svg';
import {
  projectMm,
  renderBackground,
  renderCellCaptionBand,
  renderCellChip,
  renderScoreStar,
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
  CELL_SCALE,
  clipCell,
  fitScale,
  offViewCount,
  renderOffViewNote,
  renderBlankCell,
} from './diagram-shared';
import { cellCaption, precisionFooterLines } from './text-lines';
import type { DiagramInput, DiagramVariant } from './diagram';

const TITLE = PRECISION_TEMPLATE.label; // 'Precision — Olympic 50m Rifle'

const FULL = { width: 1500, height: 1700, cx: 790, cy: 690, s: 6.35 };
const HALO_RADIUS_MM = PRECISION_TEMPLATE.haloDiameterMm / 2; // 82.7
const CELL = { width: 720, height: 720, cx: 360, cy: 350, s: CELL_SCALE };
const BLACK_RADIUS_MM = PRECISION_TEMPLATE.blackDiameterMm / 2; // 56.2

type RingN = keyof typeof PRECISION_TEMPLATE.ringDiameterMm;

function ringR(n: number): number {
  return ringRadiusMm(n as RingN);
}

/** §3 item 5 (precision): halo, rings 1-3 on white, the black disc, rings 4-10 on black, the dashed
 * inner-ten circle, and (when `includeLabels`) the ring-value labels. §4: "ring labels omitted when
 * s < 4" — the caller decides `includeLabels` from the variant's scale. */
export function renderTarget(cx: number, cy: number, s: number, includeLabels: boolean): string {
  const halo = el('circle', { cx, cy, r: HALO_RADIUS_MM * s, fill: '#FFFFFF', stroke: PALETTE.panelBorder, 'stroke-width': 1.5 });

  let outerRings = '';
  for (let n = 1; n <= 3; n++) {
    outerRings += el('circle', { cx, cy, r: ringR(n) * s, stroke: PALETTE.ringOnLight, 'stroke-width': 2.5, fill: 'none' });
  }

  const blackDisc = el('circle', { cx, cy, r: BLACK_RADIUS_MM * s, fill: PALETTE.discPrecision });

  let innerRings = '';
  for (let n = 4; n <= 10; n++) {
    innerRings += el('circle', { cx, cy, r: ringR(n) * s, stroke: PALETTE.ringOnDark, 'stroke-width': 2, fill: 'none' });
  }

  const innerTen = el('circle', {
    cx,
    cy,
    r: (PRECISION_TEMPLATE.innerTenDiameterMm / 2) * s,
    stroke: PALETTE.ringOnDark,
    'stroke-width': 1.5,
    'stroke-dasharray': '4 3',
    fill: 'none',
  });

  let labels = '';
  if (includeLabels) {
    for (let n = 1; n <= 9; n++) {
      const midMm = (ringR(n) + ringR(n + 1)) / 2;
      const x = cx + midMm * s;
      const color = midMm < BLACK_RADIUS_MM ? PALETTE.ringOnDark : PALETTE.textPrimary;
      labels += text(x, cy + 6, 17, String(n), { bold: true, color, anchor: 'middle', class: 'ring-label' });
    }
    const tenPos = projectMm(cx, cy, s, 1.5, 3);
    labels += text(tenPos.x, tenPos.y, 13, '10', { color: PALETTE.ringOnDark });
  }

  return halo + outerRings + blackDisc + innerRings + innerTen + labels;
}

function renderLegend(isBoth: boolean): string {
  const key = text(72, 152, 17, `Scoring key:   ${PRECISION_TEMPLATE.scoringKey.join('   ·   ')}`, { color: PALETTE.textPrimary });
  const both = isBoth ? renderLegendBothDots() : '';
  return renderLegendBand(48, 120, 1404, 52, key + both);
}

/** §3 item 9: the RESULTS tally panel (full variant only). */
function renderResultsPanel(subset: SubsetResult): string {
  const precision = subset.precision!;
  const panel = el('rect', { x: 48, y: 210, width: 272, height: 510, rx: 10, fill: PALETTE.panel });
  const heading = text(68, 244, 18, 'RESULTS', { color: PALETTE.textPrimary });
  const subheading = text(68, 268, 13, `${subset.declared} shots`, { color: PALETTE.textSecondary });

  let rows = '';
  for (let i = 0; i <= 10; i++) {
    const n = 10 - i;
    const y = 304 + 28 * i;
    const count = precision.tally[n] ?? 0;
    const numberLabel = text(96, y, 15, String(n), { anchor: 'end', color: PALETTE.textPrimary });
    const countLabel = text(108, y, 15, count > 0 ? `x${count}` : '-', { color: PALETTE.textSecondary });
    rows += el('g', { class: 'results-row' }, numberLabel + countLabel);
  }

  const divider = el('line', { x1: 68, y1: 650, x2: 296, y2: 650, stroke: PALETTE.panelBorder, 'stroke-width': 1 });
  // REV-39 (M20): the total is definite — a round that was not found is a miss and scores 0.
  const totalText = `Total  ${precision.identifiedTotal} / ${precision.maxPossible}`;
  const total = text(68, 686, 22, totalText, { bold: true, color: PALETTE.textPrimary });

  return panel + heading + subheading + rows + divider + total;
}

export function renderPrecisionDiagram(input: DiagramInput, variant: DiagramVariant, slotLabel?: string): string {
  const { result, shots, positionLabel, captureLocal, lighting, holeDiameterMm } = input;
  const subset = result.all;
  const isBoth = result.position === 'both';

  if (variant === 'cell') {
    // §4 (REV-58): one fixed scale, never a zoom-out; the drawing is clipped above the caption band and a clipped
    // shot is counted.
    const s = CELL.s;
    const target =
      renderTarget(CELL.cx, CELL.cy, s, s >= 4) +
      renderGroupEllipse(subset.groupEllipse, CELL.cx, CELL.cy, s) +
      renderShots(shots, subset.units, CELL.cx, CELL.cy, s, 5, holeDiameterMm, input.shotColour) +
      renderMpiMarker(subset.mpi, CELL.cx, CELL.cy, s) +
      renderMarkerLabels(shots, subset.mpi, CELL.cx, CELL.cy, s, 5, 'cell');

    const body =
      renderBackground(CELL.width, CELL.height) +
      clipCell(`cellclip-precision-${slotLabel ?? '0'}`, target) +
      renderOffViewNote(offViewCount(shots, CELL.cx, CELL.cy, s)) +
      renderCellChip(input.cellLabelOverride ?? 'PRECISION', positionLabel, input.cellLabelOverride === undefined ? slotLabel : undefined) +
      (subset.precision === null ? '' : renderScoreStar(664, 56, subset.precision.identifiedTotal, subset.precision.maxPossible)) +
      (input.scoringRule === undefined ? '' : renderScoringIcon(input.scoringRule, 664, 128)) +
      renderCellCaptionBand(cellCaption(result));
    return svgRoot(CELL.width, CELL.height, body);
  }

  // §3 (REV-58): the detail diagram always shows every shot.
  const s = fitScale(FULL.s, HALO_RADIUS_MM, shots);
  const target =
    renderTarget(FULL.cx, FULL.cy, s, s >= 4) +
    renderGroupEllipse(subset.groupEllipse, FULL.cx, FULL.cy, s) +
    renderShots(shots, subset.units, FULL.cx, FULL.cy, s, 8, holeDiameterMm, input.shotColour) +
    renderMpiMarker(subset.mpi, FULL.cx, FULL.cy, s) +
    renderMarkerLabels(shots, subset.mpi, FULL.cx, FULL.cy, s, 8, 'full');

  const body =
    renderBackground(FULL.width, FULL.height) +
    renderTitle(TITLE) +
    renderSubtitle(positionLabel, subset.declared, captureLocal, lighting) +
    renderLegend(isBoth) +
    target +
    renderResultsPanel(subset) +
    renderFooterPanel(precisionFooterLines(result, shots)) +
    (subset.precision === null ? '' : renderScoreStar(1400, 250, subset.precision.identifiedTotal, subset.precision.maxPossible, 1.3)) +
    (input.scoringRule === undefined ? '' : renderScoringIcon(input.scoringRule, 1400, 345, 1.3));
  return svgRoot(FULL.width, FULL.height, body);
}

/** rendering-composite.md §5 (REV-51): an empty precision slot in the summary image. */
export function renderBlankPrecisionCell(label: string): string {
  return renderBlankCell(label, renderTarget(CELL.cx, CELL.cy, CELL.s, CELL.s >= 4));
}
