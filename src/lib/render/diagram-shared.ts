// rendering-composite.md §3-§4. Layout pieces shared verbatim by both templates: the page background,
// title/subtitle, the "both"-position legend dots, shot circles, the group ellipse, the MPI marker, the
// footer panel, and the cell-variant chip/caption band. Each template's own ring/zone geometry (the part
// that actually differs) lives in `diagram-sighting.ts` / `diagram-precision.ts`.

import type { GroupEllipse, Shot, UnitResult } from '../domain/analysis';
import type { Lighting } from '../domain/enums';
import { placeLabels, type Box, type Circle, type LabelRequest, type PlacedLabel } from './label-placement';
import { PALETTE } from './palette';
import { el, num, text } from './svg';

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

export function renderTitle(title: string): string {
  return text(48, 70, 34, title, { bold: true, color: PALETTE.textPrimary });
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/** `LocalDateTime` (`YYYY-MM-DDTHH:mm:ss`) to the subtitle's `YYYY-MM-DD HH:mm`. */
function formatCaptureLocal(local: string): string {
  return local.slice(0, 16).replace('T', ' ');
}

/** §3 item 3: `positionLabel · <declared> rounds · <YYYY-MM-DD HH:mm> · <Lighting>`, omitting empty parts. */
export function renderSubtitle(positionLabel: string, declared: number, captureLocal: string | null, lighting: Lighting): string {
  const parts = [positionLabel, `${declared} rounds`, captureLocal ? formatCaptureLocal(captureLocal) : null, capitalize(lighting)];
  const joined = parts.filter((part): part is string => part !== null).join(' · ');
  return text(48, 104, 19, joined, { color: PALETTE.textSecondary });
}

export function renderLegendBand(x: number, y: number, width: number, height: number, innerContent: string): string {
  const band = el('rect', { x, y, width, height, rx: 10, fill: PALETTE.panel });
  return band + innerContent;
}

/** §3 item 4: "position `both`: prone and standing colour dots with labels at x 1200." Only ever
 * called when `result.position === 'both'` (callers gate this); structure tests check the `legend-both`
 * class is present only for that position. */
export function renderLegendBothDots(): string {
  const x = 1200;
  const dotR = 6;
  const proneDot = el('circle', { cx: x, cy: 146, r: dotR, fill: PALETTE.shotProne });
  const proneLabel = text(x + 12, 152, 17, 'Prone', { color: PALETTE.textPrimary });
  const standingX = x + 96;
  const standingDot = el('circle', { cx: standingX, cy: 146, r: dotR, fill: PALETTE.shotStanding });
  const standingLabel = text(standingX + 12, 152, 17, 'Standing', { color: PALETTE.textPrimary });
  return el('g', { class: 'legend-both' }, proneDot + proneLabel + standingDot + standingLabel);
}

function shotFillColor(shot: Shot, units: UnitResult[]): string {
  const unit0 = units.find((u) => u.shotId === shot.id && u.unitIndex === 0);
  return unit0?.position === 'standing' ? PALETTE.shotStanding : PALETTE.shotProne;
}

/** §3 item 7 / §4: one circle per `Shot` (not per unit), coloured by unit 0's assigned position. The radius
 * is a fixed display size (full 8, cell 5), not the true hole size, so tight groups stay readable (REV-22). */
export function renderShots(shots: Shot[], units: UnitResult[], cx: number, cy: number, s: number, radiusPx: number): string {
  let out = '';
  for (const shot of shots) {
    const { x, y } = projectMm(cx, cy, s, shot.xMm, shot.yMm);
    const r = shotRadius(shot, radiusPx);
    out += el('circle', { cx: x, cy: y, r, fill: shotFillColor(shot, units), stroke: '#FFFFFF', 'stroke-width': 2, class: 'shot' });
  }
  return out;
}

function shotRadius(shot: Shot, radiusPx: number): number {
  return shot.multiplicity > 1 ? radiusPx * 1.25 : radiusPx;
}

/** §3 item 6: the group ellipse, drawn at its own centre (== the subset's MPI). */
export function renderGroupEllipse(ellipse: GroupEllipse | null, cx: number, cy: number, s: number): string {
  if (ellipse === null) return '';
  const { x, y } = projectMm(cx, cy, s, ellipse.cxMm, ellipse.cyMm);
  return el('ellipse', {
    cx: x,
    cy: y,
    rx: ellipse.rxMm * s,
    ry: ellipse.ryMm * s,
    stroke: PALETTE.ellipse,
    'stroke-width': 2,
    fill: 'none',
    // negative: CCW target angle → clockwise SVG rotation (rendering-composite.md §3 item 6).
    transform: `rotate(${num(-ellipse.angleDeg)} ${num(x)} ${num(y)})`,
  });
}

/** §3 item 8: the `all`-subset MPI marker (a ±14px cross and a dot). Its label is drawn by `renderMarkerLabels`. */
export function renderMpiMarker(mpiPoint: { xMm: number; yMm: number } | null, cx: number, cy: number, s: number): string {
  if (mpiPoint === null) return '';
  const { x, y } = projectMm(cx, cy, s, mpiPoint.xMm, mpiPoint.yMm);
  const hLine = el('line', { x1: x - 14, y1: y, x2: x + 14, y2: y, stroke: PALETTE.mpi, 'stroke-width': 2.5 });
  const vLine = el('line', { x1: x, y1: y - 14, x2: x, y2: y + 14, stroke: PALETTE.mpi, 'stroke-width': 2.5 });
  const dot = el('circle', { cx: x, cy: y, r: 6, fill: PALETTE.mpi });
  return hLine + vLine + dot;
}

const LABEL_SIZE_PX = 15;
const MPI_MARKER_RADIUS_PX = 14;

/** §3 item 11: the area labels must stay inside (between the legend band and footer; below the cell chip, above the caption band). */
export const LABEL_AREA: Record<'full' | 'cell', Box> = {
  full: { left: 8, top: 180, right: 1500, bottom: 1230 },
  cell: { left: 8, top: 60, right: 720, bottom: 664 },
};

/** §3 item 11: positions for the "MPI" label (first) and each `x<k>` label (shot order), clear of shots, the MPI marker and each other. */
export function markerLabelLayout(
  shots: Shot[],
  mpiPoint: { xMm: number; yMm: number } | null,
  cx: number,
  cy: number,
  s: number,
  radiusPx: number,
  variant: 'full' | 'cell',
): PlacedLabel[] {
  const shotCircles: Circle[] = shots.map((shot) => {
    const { x, y } = projectMm(cx, cy, s, shot.xMm, shot.yMm);
    return { x, y, r: shotRadius(shot, radiusPx) + 1 }; // +1: half the white stroke
  });
  const obstacles = [...shotCircles];
  const requests: LabelRequest[] = [];
  if (mpiPoint !== null) {
    const { x, y } = projectMm(cx, cy, s, mpiPoint.xMm, mpiPoint.yMm);
    const anchor = { x, y, r: MPI_MARKER_RADIUS_PX };
    obstacles.push(anchor);
    requests.push({ text: 'MPI', sizePx: LABEL_SIZE_PX, color: PALETTE.mpi, anchor, preferred: { x: x + 18, y: y - 8 } });
  }
  shots.forEach((shot, i) => {
    const anchor = shotCircles[i]!;
    if (shot.multiplicity <= 1) return;
    const preferred = { x: anchor.x + 10, y: anchor.y - 14 };
    requests.push({ text: `x${shot.multiplicity}`, sizePx: LABEL_SIZE_PX, color: PALETTE.accentText, anchor, preferred });
  });
  return placeLabels(requests, obstacles, LABEL_AREA[variant]);
}

/** §3 items 7, 8, 11: draws the marker labels on top of everything else in the target, with the REV-23 outline. */
export function renderMarkerLabels(
  shots: Shot[],
  mpiPoint: { xMm: number; yMm: number } | null,
  cx: number,
  cy: number,
  s: number,
  radiusPx: number,
  variant: 'full' | 'cell',
): string {
  return markerLabelLayout(shots, mpiPoint, cx, cy, s, radiusPx, variant)
    .map((label) => text(label.x, label.y, label.sizePx, label.text, { bold: true, color: label.color, outline: '#FFFFFF' }))
    .join('');
}

/** §3 item 10: the footer panel rect plus one line of text per entry (first line 18px, rest 17px). */
export function renderFooterPanel(lines: string[]): string {
  const panel = el('rect', { x: 48, y: 1240, width: 1404, height: 420, rx: 16, fill: PALETTE.panel });
  let y = 1290;
  let body = '';
  for (let i = 0; i < lines.length; i++) {
    body += text(72, y, i === 0 ? 18 : 17, lines[i]!, { color: PALETTE.textPrimary });
    y += 34;
  }
  return panel + body;
}

/** §4: chip `<TEMPLATE> <slot> · <POSITION>` (slot omitted when not given), sized to its own text. */
export function renderCellChip(templateId: string, positionLabel: string, slotLabel?: string): string {
  const label = slotLabel ? `${templateId} ${slotLabel} · ${positionLabel}` : `${templateId} · ${positionLabel}`;
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
