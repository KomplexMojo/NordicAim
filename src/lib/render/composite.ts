// rendering-composite.md §5, "Session summary image". Combines up to four per-target `cell` diagrams
// (rendering-composite §4) with a session-level analysis band into the one artifact the app ever
// shares or downloads (`CompositeArtifact`, §6; the "share rule" in AGENTS.md).

import { EmptyCompositeError } from '@/lib/composite/artifact';
import type { AnalysisResult, MpiOffset, TargetAnalysis } from '@/lib/domain/analysis';
import type { Position } from '@/lib/domain/enums';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';
import { SCORING_RULE_LABEL, type ScoringRule } from '@/lib/domain/settings';

import { renderBlankCellSvg, renderDiagramSvg, type DiagramInput } from './diagram';
import { PALETTE } from './palette';
import { el, num, text } from './svg';
import { fmtAngular, fmtMm, precisionFooterLines, sightingFooterLines, targetHeadline } from './text-lines';

export interface SlotData {
  photo: TargetPhoto;
  analysis: TargetAnalysis;
  /** The result under the scoring rule in force (`CompositeInput.scoring`). */
  result: AnalysisResult;
  /**
   * REV-59: the same shots scored under every rule, for the band's comparison. Optional: without it the band
   * names the rule but shows no comparison.
   */
  byRule?: Record<ScoringRule, AnalysisResult>;
}

export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: [SlotData | null, SlotData | null]; precision: [SlotData | null, SlotData | null] };
  generatedAtLocal: string; // "2026-09-05 17:20"
  /** REV-69: the build (git short SHA) that drew the image; printed in the footer of every summary. */
  release: string;
  holeDiameterMm: number;
  /** REV-59: the scoring rule the results were computed under, and the visible-hole size it may use. */
  scoring: { rule: ScoringRule; visibleHoleDiameterMm: number };
  /**
   * §5's line 3 ("+<n> more target(s) in the app") needs the count of `analyzed` candidates beyond the
   * four slots — information `selectDefaultSlots` sees but a `CompositeInput` built from only the
   * selected slots cannot recover on its own. `composite/build.ts` computes it; see the milestone's
   * Open questions for this addition to the documented `CompositeInput` shape.
   */
  moreCount: number;
}

/**
 * rendering-composite.md §6: bumped whenever this renderer's output changes (REV-51 layout, REV-52 shared
 * scale, REV-53 position names, REV-54 the credit stamp, REV-58 one fixed scale, REV-59 the scoring method). A stored artifact drawn by an older version is rebuilt when its session's
 * results screen is opened, so an app update is never invisible in the summary image.
 */
export const COMPOSITE_RENDERER_VERSION = 10;

/** §5: the credit stamped on every shared image — the app, and who made it (owner, 2026-09-19). */
export const APP_NAME = 'Nordic Aim';
export const DEVELOPER_NAME = 'KomplexMojo';
/** REV-69: the footer writes the app's name as one word. */
export const FOOTER_APP_NAME = 'NordicAim';

const WIDTH = 1440;
const HEADER_HEIGHT = 120;
const MAX_LINE_CHARS = 110;
const LINE_STEP = 34;

/** §5 (REV-51): one of the four fixed positions, its offset within the grid, and its drawn size. */
export interface CellPlacement {
  template: 'sighting' | 'precision';
  index: 0 | 1;
  x: number;
  y: number;
  size: number;
}

/**
 * §5 (REV-51, owner: "keep a blank template slot for each of the 4 targets"): always four positions —
 * sighting 1 and 2 on the top row, precision 1 and 2 below. An empty position shows its blank template,
 * so every summary has the same shape and a target is always found in the same place.
 */
export const COMPOSITE_CELLS: readonly CellPlacement[] = [
  { template: 'sighting', index: 0, x: 0, y: 0, size: 720 },
  { template: 'sighting', index: 1, x: 720, y: 0, size: 720 },
  { template: 'precision', index: 0, x: 0, y: 720, size: 720 },
  { template: 'precision', index: 1, x: 720, y: 720, size: 720 },
];
export const COMPOSITE_GRID_HEIGHT = 1440;

/**
 * §5 (REV-53). How a session actually runs, in the owner's words: "you sight in on one target and then you
 * confirm on a second target". So the two sighting positions are **Sight in** and **Confirm** rather than
 * "Sighting 1" and "Sighting 2"; the precision positions stay numbered. Slot 1 is the earlier target
 * (selection orders them chronologically), which is the one sighted in on.
 */
export function positionName(template: 'sighting' | 'precision', index: 0 | 1): string {
  if (template === 'sighting') return index === 0 ? 'Sight in' : 'Confirm';
  return `Precision ${index + 1}`;
}

/** §5: the analysis band's height for `lines` text lines — sized to its content, never a fixed block. */
export function bandHeight(lines: number): number {
  return 100 + LINE_STEP * lines + 64;
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

function slotDiagramInput(
  slot: SlotData,
  holeDiameterMm: number,
  cellLabelOverride: string,
  scoringRule: ScoringRule,
  sightingRole?: 'sight-in' | 'confirm',
): DiagramInput {
  return {
    cellLabelOverride,
    sightingRole,
    scoringRule,
    shotColour: slot.analysis.pipeline.detection.backingColour ?? undefined,
    template: slot.result.template,
    result: slot.result,
    shots: slot.analysis.shots,
    positionLabel: fullPositionLabel(slot.result.position),
    captureLocal: slot.photo.captureTime.local,
    lighting: slot.photo.lighting,
    holeDiameterMm,
  };
}

/** Turns a standalone 720×720 cell `<svg …>` into a nested one at (x, y), drawn at `size` (viewBox unchanged). */
function nestCellSvg(svg: string, x: number, y: number, size: number): string {
  return svg
    .replace(/^<svg /, `<svg x="${num(x)}" y="${num(y)}" `)
    .replace(' width="720" height="720"', ` width="${num(size)}" height="${num(size)}"`);
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

function mpiCompactLine(offset: MpiOffset | null): string | null {
  if (offset === null) return null;
  const xDir = offset.xMm >= 0 ? 'R' : 'L';
  const yDir = offset.yMm >= 0 ? 'U' : 'D';
  return `MPI ${fmtMm(Math.abs(offset.xMm))} ${xDir} / ${fmtMm(Math.abs(offset.yMm))} ${yDir} mm`;
}

/** §5 line 2: one summary line per filled slot, built from the same `targetHeadline` the results card
 * and target detail screen use (M24: all three stay in step), e.g.
 * "Sight in (prone): 9 hits · 1 miss — 45 mm prone · ES 27.7 mm (1.90 MOA) · MPI 9.7 R / 3.9 U mm"
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

const RULES: readonly ScoringRule[] = ['gauge', 'centre', 'visible'];

/** REV-59: what a slot's score is, for comparing rules: precision's total, sighting's hits (both positions summed). */
function scoreOf(result: AnalysisResult): number {
  if (result.template === 'precision') return result.all.precision?.identifiedTotal ?? 0;
  return result.subsets.reduce((sum, subset) => sum + (subset.sighting?.hits ?? 0), 0);
}

/** REV-59: whether a slot scores the same under all three rules; unknown (no `byRule`) counts as not comparable. */
function sameUnderEveryRule(slot: SlotData): boolean | null {
  if (slot.byRule === undefined) return null;
  const scores = RULES.map((rule) => scoreOf(slot.byRule![rule]));
  return scores.every((score) => score === scores[0]);
}

/** REV-59: `Scoring: <method>`, with the visible size, and `same under every rule` when nothing differs. */
function scoringLine(input: CompositeInput, placed: Placed[]): string {
  const { rule, visibleHoleDiameterMm } = input.scoring;
  const name = rule === 'visible' ? `${SCORING_RULE_LABEL.visible} (${fmtMm(visibleHoleDiameterMm)} mm)` : SCORING_RULE_LABEL[rule];
  const verdicts = placed.map((p) => sameUnderEveryRule(p.slot));
  const allSame = verdicts.length > 0 && verdicts.every((v) => v === true);
  return `Scoring: ${name}${allSame ? ' · same under every rule' : ''}`;
}

/** REV-59: the other rules' scores under a slot, only when they differ from one another. */
function ruleComparisonLine(slot: SlotData): string | null {
  if (slot.byRule === undefined || sameUnderEveryRule(slot) !== false) return null;
  const scores = RULES.map((rule) => `${rule} ${scoreOf(slot.byRule![rule])}`).join(' · ');
  return slot.result.template === 'precision' ? `By rule: ${scores}` : `By rule (hits): ${scores}`;
}

/** A filled slot with its chip label, in §5's reading order: sighting 1, sighting 2, precision 1, precision 2. */
interface Placed {
  label: string;
  slotLabel: string;
  slot: SlotData;
}

function placedSlots(input: CompositeInput): Placed[] {
  const placed: Placed[] = [];
  input.slots.sighting.forEach((slot, i) => {
    if (slot !== null) placed.push({ label: positionName('sighting', i as 0 | 1), slotLabel: String(i + 1), slot });
  });
  input.slots.precision.forEach((slot, i) => {
    if (slot !== null) placed.push({ label: positionName('precision', i as 0 | 1), slotLabel: String(i + 1), slot });
  });
  return placed;
}

/**
 * §5 N = 1: the full footer lines that only repeat the slot line above them — the footer panel's own
 * heading, and the total / hit-miss line the headline already states.
 */
const REPEATS_HEADLINE = [/^Scoring summary$/, /^Total: /, /^Scored \(/];

/** §5's band lines, in order. N = 1 adds that target's `full` footer lines (what the old stat card held). */
function bandLines(input: CompositeInput, placed: Placed[]): string[] {
  const nS = placed.filter((p) => p.slot.result.template === 'sighting').length;
  const nP = placed.length - nS;
  // Zero counts are left out ("Targets: 1 precision", never "0 sighting · 1 precision").
  const counts = [nS > 0 ? `${nS} sighting` : null, nP > 0 ? `${nP} precision` : null].filter((c) => c !== null);
  const lines: string[] = [`Targets: ${[...counts, lightingSummary(placed.map((p) => p.slot.photo))].join(' · ')}`];
  lines.push(scoringLine(input, placed));
  for (const p of placed) {
    lines.push(slotSummaryLine(p.label, p.slot));
    const comparison = ruleComparisonLine(p.slot);
    if (comparison !== null) lines.push(comparison);
  }
  if (placed.length === 1) {
    const only = placed[0]!.slot;
    const footer =
      only.result.template === 'precision'
        ? precisionFooterLines(only.result, only.analysis.shots)
        : sightingFooterLines(only.result, only.analysis.shots, fullPositionLabel(only.result.position), input.holeDiameterMm);
    lines.push(...footer.filter((line) => !REPEATS_HEADLINE.some((re) => re.test(line))));
  }
  if (input.moreCount > 0) lines.push(`+${input.moreCount} more target(s) in the app`);
  if (input.session.notes.trim().length > 0) lines.push(...noteLines(input.session.notes));
  return lines.map((line) => truncate(line));
}

function renderAnalysisBand(lines: string[], release: string, bandY: number): string {
  const height = bandHeight(lines.length);
  const panel = el('rect', { x: 0, y: bandY, width: WIDTH, height, fill: PALETTE.panel });
  const rail = el('rect', { x: 0, y: bandY, width: 8, height, fill: PALETTE.accent });
  const title = text(40, bandY + 56, 24, 'Session analysis', { bold: true, color: PALETTE.textPrimary });
  let body = '';
  let y = bandY + 100;
  for (const line of lines) {
    body += text(40, y, 18, line, { color: PALETTE.textPrimary });
    y += LINE_STEP;
  }
  const footer = text(
    40,
    bandY + height - 28,
    13,
    `Generated by ${FOOTER_APP_NAME} created by ${DEVELOPER_NAME} release ${release}`,
    { color: PALETTE.textSecondary },
  );
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

/**
 * §5 (REV-51): the whole summary image — the four fixed positions (blank templates where nothing was
 * selected) and an analysis band sized to its content. Returns the size so `buildComposite` rasterises
 * exactly what was drawn.
 */
export function renderComposite(input: CompositeInput): { svg: string; width: number; height: number } {
  const placed = placedSlots(input);
  if (placed.length === 0) throw new EmptyCompositeError();
  const lines = bandLines(input, placed);
  const bandY = HEADER_HEIGHT + COMPOSITE_GRID_HEIGHT;
  const height = bandY + bandHeight(lines.length);

  let body = el('rect', { x: 0, y: 0, width: WIDTH, height, fill: PALETTE.panel });
  body += renderHeader(input.session, lightingSummary(placed.map((p) => p.slot.photo)));
  for (const cell of COMPOSITE_CELLS) {
    const slot = input.slots[cell.template][cell.index];
    const label = positionName(cell.template, cell.index).toUpperCase();
    // REV-79: a sighting slot is drawn with its role's symbol, not the text chip.
    const role = cell.template === 'sighting' ? (cell.index === 0 ? ('sight-in' as const) : ('confirm' as const)) : undefined;
    const svg =
      slot === null
        ? renderBlankCellSvg(cell.template, label, role)
        : renderDiagramSvg(
            slotDiagramInput(slot, input.holeDiameterMm, label, input.scoring.rule, role),
            'cell',
            String(cell.index + 1), // only the clip id still needs the slot number
          );
    body += nestCellSvg(svg, cell.x, HEADER_HEIGHT + cell.y, cell.size);
  }
  body += renderAnalysisBand(lines, input.release, bandY);

  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: WIDTH, height, viewBox: `0 0 ${WIDTH} ${height}` }, body);
  return { svg, width: WIDTH, height };
}

export function renderCompositeSvg(input: CompositeInput): string {
  return renderComposite(input).svg;
}
