// rendering-composite.md §5, "Session summary image". Combines up to four per-target `cell` diagrams
// (rendering-composite §4) with a session-level analysis band into the one artifact the app ever
// shares or downloads (`CompositeArtifact`, §6; the "share rule" in AGENTS.md).

import { EmptyCompositeError } from '@/lib/composite/artifact';
import type { AnalysisResult, MpiOffset } from '@/lib/domain/analysis';
import type { WindBadge } from '@/lib/domain/coach-context-view';
import type { Lighting, Season } from '@/lib/domain/enums';
import { suggestSeason } from '@/lib/domain/season';
import type { TargetPhoto } from '@/lib/domain/photo';
import type { BiathlonSession } from '@/lib/domain/session';
import { SCORING_RULE_LABEL, type ScoringRule } from '@/lib/domain/settings';

import { renderBlankCellSvg, renderDiagramSvg, type DiagramInput } from './diagram';
import { appNameWordmark, brandMotif } from './brand-mark';
import { layoutBand, type BandModel, type BandRow } from './composite-band';
import { goalBandRows, goalViewOf, renderGoalsSeal } from './composite-goals';
import { renderLightingIcon, renderSeasonIcon, renderWindIcon } from './condition-icons';
import { PALETTE } from './palette';
import { el, num, text } from './svg';
import { fmtMm, precisionFooterLines, sightingFooterLines } from './text-lines';

import {
  COMPOSITE_CELLS,
  COMPOSITE_GRID_HEIGHT,
  type CompositeInput,
  DEVELOPER_NAME,
  FOOTER_APP_NAME,
  HEADER_HEIGHT,
  type SlotData,
  WIDTH,
  capitalize,
  fullPositionLabel,
  positionName,
  truncate,
} from './composite-layout';

export {
  COMPOSITE_RENDERER_VERSION,
  APP_NAME,
  DEVELOPER_NAME,
  FOOTER_APP_NAME,
  COMPOSITE_CELLS,
  COMPOSITE_GRID_HEIGHT,
  positionName,
} from './composite-layout';
export type { SlotData, CompositeInput, CellPlacement } from './composite-layout';

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

/**
 * M29 (REV-159): the windage badge sits one badge-step (54 px) left of the season badge, since the 34 px between the lighting badge
 * (ends at x 1108) and the wordmark (its N starts at x 1142) cannot hold a 44 px badge. It takes that much room from the title, which
 * is then cut at 47 characters instead of 50 (about 19.5 px a character at 36 px bold, measured with resvg).
 */
const WIND_ICON_X = 956;
const TITLE_CHARS = 50;
const TITLE_CHARS_WITH_WIND = 47;

function renderHeader(session: BiathlonSession, lightingSummary: string, photos: TargetPhoto[], wind: WindBadge | null): string {
  const bg = el('rect', { x: 0, y: 0, width: WIDTH, height: HEADER_HEIGHT, fill: PALETTE.header });
  // Kept clear of the wordmark on the right: about 50 characters fit at this size.
  const titleChars = wind === null ? TITLE_CHARS : TITLE_CHARS_WITH_WIND;
  const title = text(40, 58, 36, truncate(`Shooting analysis — ${session.name}`, titleChars), { bold: true, color: '#FFFFFF' });
  const subtitle = text(40, 94, 18, `${session.sessionDate} · ${lightingSummary}`, { color: '#CFE6F3' });
  // REV-104: the NordicAim wordmark and mark at the right of the header.
  const mark = brandMotif(WIDTH - 40 - 76, 22, 76);
  const name = appNameWordmark(WIDTH - 40 - 76 - 14, 71, 34, '#FFFFFF');
  // REV-108: season then lighting, left of the name.
  const season = seasonOf(photos, session.sessionDate);
  const lighting = lightingOf(photos);
  const icons =
    (wind === null ? '' : renderWindIcon(wind, WIND_ICON_X, 38)) +
    (season === null ? '' : renderSeasonIcon(season, 1010, 38)) +
    (lighting === 'unknown' ? '' : renderLightingIcon(lighting, 1064, 38));
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
    goals: goalBandRows(input.goals),
    // M29 (REV-159): only when bouts are attached, so a session without any draws its band exactly as before.
    ...(input.coach !== undefined && input.coach.metal.length > 0 ? { metal: input.coach.metal } : {}),
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
  body += renderHeader(input.session, lightingSummary(placed.map((p) => p.slot.photo)), placed.map((p) => p.slot.photo), input.coach?.wind ?? null);
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
    // REV-148: the seal when the session met every goal in effect for this target's position.
    const view = slot === null || cell.template !== 'precision' ? null : goalViewOf(slot.result.position);
    if (view !== null && input.goals?.[view]?.allMet === true) body += renderGoalsSeal(cell.x + 664, HEADER_HEIGHT + cell.y + 198);
  }
  body += band.svg;

  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: WIDTH, height, viewBox: `0 0 ${WIDTH} ${height}` }, body);
  return { svg, width: WIDTH, height };
}

export function renderCompositeSvg(input: CompositeInput): string {
  return renderComposite(input).svg;
}
