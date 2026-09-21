// rendering-composite.md §5, "Session summary image". Combines up to four per-target `cell` diagrams
// (rendering-composite §4) with a session-level analysis band into the one artifact the app ever
// shares or downloads (`CompositeArtifact`, §6; the "share rule" in AGENTS.md).

import { EmptyCompositeError } from '@/lib/composite/artifact';
import type { AnalysisResult, MpiOffset, TargetAnalysis } from '@/lib/domain/analysis';
import type { Lighting, Position, Season } from '@/lib/domain/enums';
import { suggestSeason } from '@/lib/domain/season';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';
import { SCORING_RULE_LABEL, type ScoringRule } from '@/lib/domain/settings';

import { renderBlankCellSvg, renderDiagramSvg, type DiagramInput } from './diagram';
import { brandMotif } from './brand-mark';
import { layoutBand, type BandModel, type BandRow } from './composite-band';
import { renderLightingIcon, renderSeasonIcon } from './condition-icons';
import { PALETTE } from './palette';
import { el, num, text } from './svg';
import { fmtMm, precisionFooterLines, sightingFooterLines } from './text-lines';

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
  /** REV-100: the athlete's identity line and, when a key is set, the stamp. Omitted when there is nothing to print. */
  provenance?: { name: string; club: string; stamp: string | null };
}

/**
 * rendering-composite.md §6: bumped whenever this renderer's output changes (REV-51 layout, REV-52 shared
 * scale, REV-53 position names, REV-54 the credit stamp, REV-58 one fixed scale, REV-59 the scoring method). A stored artifact drawn by an older version is rebuilt when its session's
 * results screen is opened, so an app update is never invisible in the summary image.
 */
export const COMPOSITE_RENDERER_VERSION = 18;

/** §5: the credit stamped on every shared image — the app, and who made it (owner, 2026-09-19). */
export const APP_NAME = 'NordicAim';
export const DEVELOPER_NAME = 'KomplexMojo';
/** REV-69: the footer writes the app's name as one word. */
export const FOOTER_APP_NAME = 'NordicAim';

const WIDTH = 1440;
const HEADER_HEIGHT = 120;
const MAX_LINE_CHARS = 110;

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
  return index === 0 ? 'Precision prone' : 'Precision standing';
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

function slotDiagramInput(
  slot: SlotData,
  holeDiameterMm: number,
  cellLabelOverride: string,
  scoringRule: ScoringRule,
  sightingRole?: 'sight-in' | 'confirm',
): DiagramInput {
  const position = slot.result.position === 'prone' || slot.result.position === 'standing' ? slot.result.position : undefined;
  return {
    cellLabelOverride,
    sightingRole,
    // REV-86: a precision slot's mark is the silhouette of the position it was shot in (a stored `both` target keeps its text chip).
    ...(slot.result.template === 'precision' && position !== undefined ? { position } : {}),
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

function renderHeader(session: BiathlonSession, lightingSummary: string, photos: TargetPhoto[]): string {
  const bg = el('rect', { x: 0, y: 0, width: WIDTH, height: HEADER_HEIGHT, fill: PALETTE.header });
  // Kept clear of the wordmark on the right: about 50 characters fit at this size.
  const title = text(40, 58, 36, truncate(`Shooting analysis — ${session.name}`, 50), { bold: true, color: '#FFFFFF' });
  const subtitle = text(40, 94, 18, `${session.sessionDate} · ${lightingSummary}`, { color: '#CFE6F3' });
  // REV-104: the NordicAim wordmark and mark at the right of the header.
  const mark = brandMotif(WIDTH - 40 - 76, 22, 76);
  const name = text(WIDTH - 40 - 76 - 14, 71, 34, APP_NAME, { bold: true, anchor: 'end', color: '#FFFFFF' });
  // REV-108: season then lighting, left of the name.
  const season = seasonOf(photos, session.sessionDate);
  const lighting = lightingOf(photos);
  const icons =
    (season === null ? '' : renderSeasonIcon(season, 1010, 38)) + (lighting === 'unknown' ? '' : renderLightingIcon(lighting, 1064, 38));
  return bg + title + subtitle + icons + name + mark;
}

/** REV-108: the one season the targets share (chosen, else the season of the session date), or null when they differ or none is known. */
function seasonOf(photos: TargetPhoto[], sessionDate: string): Season | null {
  const seasons = new Set(photos.map((p) => p.season ?? suggestSeason(p.captureTime.local ?? sessionDate)));
  const [only] = seasons;
  return seasons.size === 1 && only != null ? only : null;
}

/** REV-108: the lighting the targets share; `mixed` when they differ. */
function lightingOf(photos: TargetPhoto[]): Lighting {
  const unique = new Set(photos.map((p) => p.lighting));
  const [only] = unique;
  return unique.size === 0 ? 'unknown' : unique.size === 1 ? only! : 'mixed';
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

const RULES: readonly ScoringRule[] = ['gauge', 'centre', 'visible'];

/** REV-59: what a slot's score is, for comparing rules: precision's total, sighting's hits (both positions summed). */
export function scoreOf(result: AnalysisResult): number {
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

/** REV-118: what the band shows, as data for `layoutBand`: the scoring method, one table row per target, extra lines, notes, athlete. */
function bandModel(input: CompositeInput, placed: Placed[]): BandModel {
  // REV-106: what a target's own caption says (hits, score, ES, MOA) is not repeated here, nor the lighting (header) or the count (grid).
  const showRules = placed.some((p) => sameUnderEveryRule(p.slot) === false);
  const rows: BandRow[] = placed.map((p) => {
    const mpi = p.slot.result.template === 'sighting' ? mpiCompactLine(p.slot.result.all.mpiOffset) : null;
    const hits = p.slot.result.template === 'sighting';
    const scores =
      showRules && p.slot.byRule !== undefined
        ? (Object.fromEntries(
            RULES.map((rule) => {
              const n = scoreOf(p.slot.byRule![rule]);
              return [rule, hits ? `${n} ${n === 1 ? 'hit' : 'hits'}` : String(n)];
            }),
          ) as BandRow['scores'])
        : null;
    return { label: p.label, mpi: mpi === null ? null : mpi.replace(/^MPI /, ''), scores };
  });
  const extra: string[] = [];
  if (placed.length === 1) {
    const only = placed[0]!.slot;
    const footer =
      only.result.template === 'precision'
        ? precisionFooterLines(only.result, only.analysis.shots)
        : sightingFooterLines(only.result, only.analysis.shots, fullPositionLabel(only.result.position), input.holeDiameterMm);
    extra.push(...footer.filter((line) => !REPEATS_HEADLINE.some((re) => re.test(line))).map((l) => truncate(l)));
  }
  if (input.moreCount > 0) extra.push(`+${input.moreCount} more target(s) in the app`);
  return {
    scoring: scoringLine(input, placed),
    rows,
    showMpi: rows.some((r) => r.mpi !== null),
    showRules,
    extra,
    notes: input.session.notes.trim().length > 0 ? input.session.notes : null,
    // Never truncated: cutting the stamp would make it unverifiable.
    athlete: input.provenance === undefined ? null : provenanceLine(input.provenance),
    footer: `Generated by ${FOOTER_APP_NAME} created by ${DEVELOPER_NAME} release ${input.release}`,
  };
}

/** REV-100: `Athlete: <name> · <club> · Stamp: <stamp>`, leaving out what is empty. */
export function provenanceLine(p: { name: string; club: string; stamp: string | null }): string {
  const parts = [p.name === '' ? null : `Athlete: ${p.name}`, p.club === '' ? null : p.name === '' ? `Club: ${p.club}` : p.club, p.stamp === null ? null : `Stamp: ${p.stamp}`];
  return parts.filter((x): x is string => x !== null).join(' · ');
}

/**
 * §5 (REV-51): the whole summary image — the four fixed positions (blank templates where nothing was
 * selected) and an analysis band sized to its content. Returns the size so `buildComposite` rasterises
 * exactly what was drawn.
 */
export function renderComposite(input: CompositeInput): { svg: string; width: number; height: number } {
  const placed = placedSlots(input);
  if (placed.length === 0) throw new EmptyCompositeError();
  const bandY = HEADER_HEIGHT + COMPOSITE_GRID_HEIGHT;
  const band = layoutBand(bandModel(input, placed), bandY);
  const height = bandY + band.height;

  let body = el('rect', { x: 0, y: 0, width: WIDTH, height, fill: PALETTE.panel });
  body += renderHeader(input.session, lightingSummary(placed.map((p) => p.slot.photo)), placed.map((p) => p.slot.photo));
  for (const cell of COMPOSITE_CELLS) {
    const slot = input.slots[cell.template][cell.index];
    const label = positionName(cell.template, cell.index).toUpperCase();
    // REV-79: a sighting slot is drawn with its role's symbol, not the text chip.
    const role = cell.template === 'sighting' ? (cell.index === 0 ? ('sight-in' as const) : ('confirm' as const)) : undefined;
    // A blank precision slot shows the silhouette of the position its place stands for: first prone, then standing (REV-86).
    const blankMark = role ?? (cell.index === 0 ? ('prone' as const) : ('standing' as const));
    const svg =
      slot === null
        ? renderBlankCellSvg(cell.template, label, blankMark)
        : renderDiagramSvg(
            slotDiagramInput(slot, input.holeDiameterMm, label, input.scoring.rule, role),
            'cell',
            String(cell.index + 1), // only the clip id still needs the slot number
          );
    body += nestCellSvg(svg, cell.x, HEADER_HEIGHT + cell.y, cell.size);
  }
  body += band.svg;

  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: WIDTH, height, viewBox: `0 0 ${WIDTH} ${height}` }, body);
  return { svg, width: WIDTH, height };
}

export function renderCompositeSvg(input: CompositeInput): string {
  return renderComposite(input).svg;
}
