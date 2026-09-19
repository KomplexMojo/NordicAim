// rendering-composite.md §5, "Session summary image". Combines up to four per-target `cell` diagrams
// (rendering-composite §4) with a session-level analysis band into the one artifact the app ever
// shares or downloads (`CompositeArtifact`, §6; the "share rule" in AGENTS.md).

import { EmptyCompositeError } from '@/lib/composite/artifact';
import type { AnalysisResult, MpiOffset, TargetAnalysis } from '@/lib/domain/analysis';
import type { Position } from '@/lib/domain/enums';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';

import { renderDiagramSvg, type DiagramInput } from './diagram';
import { PALETTE } from './palette';
import { el, num, text } from './svg';
import { fmtAngular, fmtMm, precisionFooterLines, sightingFooterLines, targetHeadline } from './text-lines';

export interface SlotData {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
  result: AnalysisResult;
}

export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: [SlotData | null, SlotData | null]; precision: [SlotData | null, SlotData | null] };
  generatedAtLocal: string; // "2026-09-05 17:20"
  holeDiameterMm: number;
  /**
   * §5's line 3 ("+<n> more target(s) in the app") needs the count of `analyzed` candidates beyond the
   * four slots — information `selectDefaultSlots` sees but a `CompositeInput` built from only the
   * selected slots cannot recover on its own. `composite/build.ts` computes it; see the milestone's
   * Open questions for this addition to the documented `CompositeInput` shape.
   */
  moreCount: number;
}

const WIDTH = 1440;
const HEADER_HEIGHT = 120;
const ROW_HEIGHT = 720;
const BAND_HEIGHT = 600;
const MAX_LINE_CHARS = 110;

/** §5: `120 + 720 × rows + 600`; zero rows throws (both height vectors and `buildComposite` rely on this). */
export function compositeHeight(sightingRow: 0 | 1, precisionRow: 0 | 1): number {
  const rows = sightingRow + precisionRow;
  if (rows === 0) throw new EmptyCompositeError();
  return HEADER_HEIGHT + ROW_HEIGHT * rows + BAND_HEIGHT;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function truncate(value: string, max = MAX_LINE_CHARS): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** §3's `DiagramInput.positionLabel` ("Prone" | "Standing" | "Prone + standing"), duplicated here (not
 * imported from `pipeline/stage-b.ts`) so this pure render module stays free of the pipeline layer. */
function fullPositionLabel(position: Position): string {
  if (position === 'prone') return 'Prone';
  if (position === 'standing') return 'Standing';
  return 'Prone + standing';
}

/** The analysis band's parenthetical, e.g. "(prone)" / "(prone + standing)". */
function shortPositionLabel(position: Position): string {
  if (position === 'both') return 'prone + standing';
  return position;
}

function slotDiagramInput(slot: SlotData, holeDiameterMm: number): DiagramInput {
  return {
    template: slot.result.template,
    result: slot.result,
    shots: slot.analysis.shots,
    positionLabel: fullPositionLabel(slot.result.position),
    captureLocal: slot.photo.captureTime.local,
    lighting: slot.photo.lighting,
    holeDiameterMm,
  };
}

/** Turns a full standalone `<svg …>` (as `renderDiagramSvg('cell', …)` returns) into a nested one at (x, y). */
function nestCellSvg(svg: string, x: number, y: number): string {
  return svg.replace('<svg ', `<svg x="${num(x)}" y="${num(y)}" `);
}

function renderHeader(session: BiathlonSession, lightingSummary: string): string {
  const bg = el('rect', { x: 0, y: 0, width: WIDTH, height: HEADER_HEIGHT, fill: PALETTE.header });
  const title = text(40, 58, 36, `Shooting analysis — ${session.name}`, { bold: true, color: '#FFFFFF' });
  const subtitle = text(40, 94, 18, `${session.sessionDate} · ${lightingSummary}`, { color: '#CFE6F3' });
  return bg + title + subtitle;
}

/** §5: "shared label if all slots agree, else `mixed lighting`". */
function lightingSummary(photos: TargetPhoto[]): string {
  const unique = new Set(photos.map((p) => p.lighting));
  if (unique.size === 0) return 'unknown';
  const [only] = unique;
  return unique.size === 1 ? capitalize(only!) : 'mixed lighting';
}

/** §4 stat-card content: the target's `full`-variant footer lines, 20 px from (776, y+84), step 40. */
function renderStatCard(slot: SlotData, holeDiameterMm: number, rowY: number): string {
  const panel = el('rect', { x: 744, y: rowY + 24, width: 672, height: 672, rx: 16, fill: PALETTE.panel });
  const lines =
    slot.result.template === 'precision'
      ? precisionFooterLines(slot.result, slot.analysis.shots)
      : sightingFooterLines(slot.result, slot.analysis.shots, fullPositionLabel(slot.result.position), holeDiameterMm);
  let body = '';
  let y = rowY + 84;
  for (const line of lines) {
    body += text(776, y, 20, line, { color: PALETTE.textPrimary });
    y += 40;
  }
  return panel + body;
}

/** One 720-tall row: both slot cells side by side, or one cell (x 0) plus a stat card (x 720). */
function renderRow(pair: [SlotData | null, SlotData | null], rowY: number, holeDiameterMm: number): string {
  const filled = pair.filter((s): s is SlotData => s !== null);
  if (filled.length === 2) {
    const [a, b] = pair as [SlotData, SlotData];
    return (
      nestCellSvg(renderDiagramSvg(slotDiagramInput(a, holeDiameterMm), 'cell', '1'), 0, rowY) +
      nestCellSvg(renderDiagramSvg(slotDiagramInput(b, holeDiameterMm), 'cell', '2'), 720, rowY)
    );
  }
  // Exactly one filled (selectDefaultSlots always fills slot 1 first): that cell at x 0, a stat card at x 720.
  const slotIndex = pair[0] !== null ? 0 : 1;
  const slot = filled[0]!;
  return (
    nestCellSvg(renderDiagramSvg(slotDiagramInput(slot, holeDiameterMm), 'cell', String(slotIndex + 1)), 0, rowY) +
    renderStatCard(slot, holeDiameterMm, rowY)
  );
}

function mpiCompactLine(offset: MpiOffset | null): string | null {
  if (offset === null) return null;
  const xDir = offset.xMm >= 0 ? 'R' : 'L';
  const yDir = offset.yMm >= 0 ? 'U' : 'D';
  return `MPI ${fmtMm(Math.abs(offset.xMm))} ${xDir} / ${fmtMm(Math.abs(offset.yMm))} ${yDir} mm`;
}

/** §5 line 2: one summary line per filled slot, built from the same `targetHeadline` the results card
 * and target detail screen use (M24: all three stay in step), e.g.
 * "Sighting 1 (prone): 9 hits · 1 miss — 45 mm prone · ES 27.7 mm (1.90 MOA) · MPI 9.7 R / 3.9 U mm"
 * "Precision 1 (prone): 72 / 100 · X 1 · ES 41.9 mm (2.88 MOA)". */
function slotSummaryLine(label: string, slot: SlotData): string {
  const subset = slot.result.all;
  const position = shortPositionLabel(slot.result.position);
  const esText = `ES ${fmtMm(subset.extremeSpreadMm)} mm (${fmtAngular(subset.extremeSpreadAngular?.moa ?? null)} MOA)`;
  const headline = targetHeadline(slot.result);

  if (slot.result.template === 'precision') {
    return `${label} (${position}): ${headline} · ${esText}`;
  }

  const mpi = mpiCompactLine(subset.mpiOffset);
  const head = `${label} (${position}): ${headline} · ${esText}`;
  return mpi === null ? head : `${head} · ${mpi}`;
}

function renderAnalysisBand(input: CompositeInput, bandY: number): string {
  const { slots, session, generatedAtLocal, moreCount } = input;
  const filledSighting = slots.sighting.filter((s): s is SlotData => s !== null);
  const filledPrecision = slots.precision.filter((s): s is SlotData => s !== null);
  const allFilled = [...filledSighting, ...filledPrecision].map((s) => s.photo);

  const panel = el('rect', { x: 0, y: bandY, width: WIDTH, height: BAND_HEIGHT, fill: PALETTE.panel });
  const rail = el('rect', { x: 0, y: bandY, width: 8, height: BAND_HEIGHT, fill: PALETTE.accent });
  const title = text(40, bandY + 56, 24, 'Session analysis', { bold: true, color: PALETTE.textPrimary });

  const lines: string[] = [
    `Targets: ${filledSighting.length} sighting · ${filledPrecision.length} precision · ${lightingSummary(allFilled)}`,
  ];
  slots.sighting.forEach((slot, i) => {
    if (slot !== null) lines.push(slotSummaryLine(`Sighting ${i + 1}`, slot));
  });
  slots.precision.forEach((slot, i) => {
    if (slot !== null) lines.push(slotSummaryLine(`Precision ${i + 1}`, slot));
  });
  if (moreCount > 0) lines.push(`+${moreCount} more target(s) in the app`);

  let body = '';
  let y = bandY + 100;
  for (const line of lines) {
    body += text(40, y, 18, truncate(line), { color: PALETTE.textPrimary });
    y += 34;
  }

  if (session.notes.trim().length > 0) {
    for (const noteLine of noteLines(session.notes)) {
      body += text(40, y, 18, noteLine, { color: PALETTE.textPrimary });
      y += 34;
    }
  }

  const footer = text(40, bandY + 572, 13, `advanced-shooting-analysis · generated ${generatedAtLocal}`, {
    color: PALETTE.textSecondary,
  });

  return panel + rail + title + body + footer;
}

/** `session.notes` wrapped into at most 2 lines of `MAX_LINE_CHARS`, the second ending in `…` if more remains. */
function noteLines(notes: string): string[] {
  const prefixed = `Notes: ${notes.trim()}`;
  if (prefixed.length <= MAX_LINE_CHARS) return [prefixed];
  const first = prefixed.slice(0, MAX_LINE_CHARS);
  const rest = prefixed.slice(MAX_LINE_CHARS);
  return [first, truncate(rest)];
}

export function renderCompositeSvg(input: CompositeInput): string {
  const anySighting = input.slots.sighting.some((s) => s !== null) ? 1 : 0;
  const anyPrecision = input.slots.precision.some((s) => s !== null) ? 1 : 0;
  const height = compositeHeight(anySighting, anyPrecision); // throws EmptyCompositeError at (0, 0)

  const photosForLighting = [...input.slots.sighting, ...input.slots.precision]
    .filter((s): s is SlotData => s !== null)
    .map((s) => s.photo);

  let y = HEADER_HEIGHT;
  let body = renderHeader(input.session, lightingSummary(photosForLighting));
  if (anySighting === 1) {
    body += renderRow(input.slots.sighting, y, input.holeDiameterMm);
    y += ROW_HEIGHT;
  }
  if (anyPrecision === 1) {
    body += renderRow(input.slots.precision, y, input.holeDiameterMm);
    y += ROW_HEIGHT;
  }
  body += renderAnalysisBand(input, y);

  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: WIDTH, height, viewBox: `0 0 ${WIDTH} ${height}` }, body);
}
