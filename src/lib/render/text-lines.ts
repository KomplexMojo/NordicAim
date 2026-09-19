// rendering-composite.md §3 (item 10, "Footer panel"), §4 ("Caption band"), and the Steps section's
// `targetHeadline` rules. Pure line builders shared by the full-variant footer panel, the cell-variant
// caption band, and result cards (`targetHeadline`). All numeric formatting follows §3 item 10's stated
// rule: "mm 1 dp, MOA/MRAD 2 dp, averages 1 dp; unavailable —".

import type { AnalysisResult, MpiOffset, Shot, SubsetResult, UnitResult } from '../domain/analysis';
import type { ShotPosition } from '../domain/enums';
import { zoneFor } from '../scoring/sighting';
import { isUnitTouchCredited } from './diagram-shared';

/** mm 1 dp, unavailable `—` (§3 item 10's stated rule). Exported for `render/composite.ts`. */
export function fmtMm(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** MOA/MRAD 2 dp, unavailable `—`. Exported for `render/composite.ts`. */
export function fmtAngular(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

/** The largest `Shot.multiplicity` among shots that contributed a unit to `subset` (1 when none is
 * clustered). Used to append " · largest cluster x<k>" when it exceeds 1. */
function largestMultiplicity(subset: SubsetResult, shots: Shot[]): number {
  const shotIds = new Set(subset.units.map((u) => u.shotId));
  let max = 1;
  for (const shot of shots) {
    if (shotIds.has(shot.id) && shot.multiplicity > max) max = shot.multiplicity;
  }
  return max;
}

function shotsLine(subset: SubsetResult, shots: Shot[]): string {
  const base = `Shots: ${subset.identified} identified of ${subset.declared}`;
  const maxMultiplicity = largestMultiplicity(subset, shots);
  return maxMultiplicity > 1 ? `${base} · largest cluster x${maxMultiplicity}` : base;
}

function mpiOffsetLine(offset: MpiOffset | null): string {
  if (offset === null) return 'MPI offset: —';
  const xDir = offset.xMm >= 0 ? 'R' : 'L';
  const yDir = offset.yMm >= 0 ? 'U' : 'D';
  return (
    `MPI offset: ${fmtMm(Math.abs(offset.xMm))} mm ${xDir} · ${fmtMm(Math.abs(offset.yMm))} mm ${yDir} ` +
    `(${fmtAngular(Math.abs(offset.xMoa))} / ${fmtAngular(Math.abs(offset.yMoa))} MOA)`
  );
}

function groupSizeAngular(subset: SubsetResult): string {
  const angular = subset.extremeSpreadAngular;
  return `${fmtAngular(angular?.moa ?? null)} MOA · ${fmtAngular(angular?.mrad ?? null)} MRAD`;
}

function zoneHitMiss(units: UnitResult[], position: ShotPosition, holeDiameterMm: number): { hits: number; misses: number } {
  let hits = 0;
  for (const unit of units) {
    if (zoneFor(unit.radialMm, position, holeDiameterMm) !== 'miss') hits += 1;
  }
  return { hits, misses: units.length - hits };
}

/**
 * rendering-composite.md §3 item 10, Sighting lines 1-7. Always uses `result.all` — the footer
 * summarises the whole target sheet regardless of how many positions it holds.
 */
export function sightingFooterLines(result: AnalysisResult, shots: Shot[], positionLabel: string, holeDiameterMm: number): string[] {
  const subset = result.all;
  const sighting = subset.sighting!;
  const vsProne = zoneHitMiss(subset.units, 'prone', holeDiameterMm);
  const vsStanding = zoneHitMiss(subset.units, 'standing', holeDiameterMm);

  // REV-39: `misses` already counts every round that was not found (a miss), so the line is definite.
  const scored = `Scored (${positionLabel}): ${sighting.hits} hit / ${sighting.misses} miss`;

  const lines = [
    'Group metrics',
    shotsLine(subset, shots),
    `Group size (extreme spread): ${fmtMm(subset.extremeSpreadMm)} mm`,
    `Angular size @ 50 m: ${groupSizeAngular(subset)}`,
    `vs 45 mm prone: ${vsProne.hits} hit / ${vsProne.misses} miss   ·   vs 115 mm standing: ${vsStanding.hits} hit / ${vsStanding.misses} miss`,
    scored,
    mpiOffsetLine(subset.mpiOffset),
  ];
  const touchNote = touchCreditNote(subset.units);
  if (touchNote !== null) lines.push(touchNote);
  return lines;
}

/**
 * rendering-composite.md §3 item 10, Precision lines 1-6, plus line 7 only when `position === 'both'`.
 * Always uses `result.all` (and, for line 7, `result.subsets`).
 */
export function precisionFooterLines(result: AnalysisResult, shots: Shot[]): string[] {
  const subset = result.all;
  const precision = subset.precision!;

  const lines = [
    'Scoring summary',
    shotsLine(subset, shots),
    `Total: ${precision.identifiedTotal} / ${precision.maxPossible} · X count ${precision.xCount}${missesSuffix(subset.missing)}`,
    `Group size: ${fmtMm(subset.extremeSpreadMm)} mm · ${groupSizeAngular(subset)} @ 50 m`,
    mpiOffsetLine(subset.mpiOffset),
  ];

  if (result.position === 'both') {
    const prone = result.subsets.find((s) => s.key === 'prone')!;
    const standing = result.subsets.find((s) => s.key === 'standing')!;
    lines.push(
      `Prone: ${prone.precision!.identifiedTotal}/${prone.precision!.maxPossible} · ` +
        `Standing: ${standing.precision!.identifiedTotal}/${standing.precision!.maxPossible}`,
    );
  }

  const touchNote = touchCreditNote(subset.units);
  if (touchNote !== null) lines.push(touchNote);
  return lines;
}

/** rendering-composite.md §4, caption band. Always uses `result.all` (and, for `both` sighting, `result.subsets`). */
export function cellCaption(result: AnalysisResult): string {
  const subset = result.all;
  const esText = `ES ${fmtMm(subset.extremeSpreadMm)} mm · ${fmtAngular(subset.extremeSpreadAngular?.moa ?? null)} MOA`;

  if (result.template === 'sighting') {
    const sighting = subset.sighting!;
    let head: string;
    if (result.position === 'both') {
      const prone = result.subsets.find((s) => s.key === 'prone')!;
      const standing = result.subsets.find((s) => s.key === 'standing')!;
      head = `P ${prone.sighting!.hits}/${prone.declared} · S ${standing.sighting!.hits}/${standing.declared}`;
    } else {
      head = `${sighting.hits}/${subset.declared} hit @ ${sighting.zoneDiameterMm} mm`;
    }
    return `${head} · ${esText}`;
  }

  const precision = subset.precision!;
  return `${precision.identifiedTotal}/${precision.maxPossible} · X ${precision.xCount} · ${esText}`;
}

/** REV-39 (M20): ` · 1 miss` / ` · 5 misses` when rounds were scored as misses, else nothing. */
export function missesSuffix(missing: number): string {
  if (missing <= 0) return '';
  return ` · ${missing} ${missing === 1 ? 'miss' : 'misses'}`;
}

function precisionHeadline(subset: SubsetResult): string {
  const p = subset.precision!;
  return `${p.identifiedTotal} / ${p.maxPossible}${missesSuffix(subset.missing)} · X ${p.xCount}`;
}

/**
 * REV-49 (M24, issue #6): say what is counted — hits and misses, never "hits" alongside a "found"
 * denominator that reads as a shot count. `positionWord` (lowercase "prone"/"standing") is appended
 * after the zone so a single-position headline reads "7 hits · 3 misses — 45 mm prone"; `null` for a
 * `both` headline, where the "Prone "/"Standing " prefix already names the position — the zone is
 * then dropped too (fix round 1: the zone is fixed per position and repeating it in both halves is
 * redundant, and keeping it pushed the composite image's per-slot line, §5, past its 110-char cap).
 */
function sightingHeadline(subset: SubsetResult, positionWord: 'prone' | 'standing' | null): string {
  const s = subset.sighting!;
  const hitWord = s.hits === 1 ? 'hit' : 'hits';
  const missWord = s.misses === 1 ? 'miss' : 'misses';
  const zoneSuffix = positionWord === null || s.zoneDiameterMm === null ? '' : ` — ${s.zoneDiameterMm} mm ${positionWord}`;
  return `${s.hits} ${hitWord} · ${s.misses} ${missWord}${zoneSuffix}`;
}

/**
 * Steps §3 / rendering-composite.md §3. Used by result cards (M12), the target detail screen and the
 * summary image (M24: all three call this one helper, so they stay in step): precision `72 / 100 · X
 * 1`, and `68 / 100 · 1 miss · X 1` when rounds were scored as misses (REV-39: the total is definite,
 * never a range); sighting `<hits> hit(s) · <misses> miss(es) — <45|115> mm <prone|standing>` (REV-49,
 * issue #6: "hit(s)" and "found" never share a sentence — see `shotsFoundLine`); `both`: `Prone
 * <headline> · Standing <headline>`, each half computed from that subset alone (not from `result.all`).
 */
export function targetHeadline(result: AnalysisResult): string {
  if (result.template === 'precision') {
    if (result.position === 'both') {
      const prone = result.subsets.find((s) => s.key === 'prone')!;
      const standing = result.subsets.find((s) => s.key === 'standing')!;
      return `Prone ${precisionHeadline(prone)} · Standing ${precisionHeadline(standing)}`;
    }
    return precisionHeadline(result.all);
  }

  if (result.position === 'both') {
    const prone = result.subsets.find((s) => s.key === 'prone')!;
    const standing = result.subsets.find((s) => s.key === 'standing')!;
    return `Prone ${sightingHeadline(prone, null)} · Standing ${sightingHeadline(standing, null)}`;
  }
  return sightingHeadline(result.all, result.position);
}

/**
 * REV-49 (M24, issue #6): the "found" line, always separate from `targetHeadline`'s hit/miss count so
 * "hit" and "found" never share a sentence. `result.all.missing` is every declared round that was not
 * identified (geometry-scoring §8) — "not placed" in the app's own Adjust-shots language.
 */
export function shotsFoundLine(result: AnalysisResult): string {
  const subset = result.all;
  const base = `${subset.identified} of ${subset.declared} shots found`;
  return subset.missing > 0 ? `${base} — ${subset.missing} not placed` : base;
}

/**
 * rendering-composite.md §3 item 7a (M24, REV-49): when any unit in `units` was touch-credited (its
 * scored ring/zone was reached only because the hole's edge touches the line — the same check
 * `renderShots` draws the marker from), a line explaining the diagram's dashed-ring marker; `null`
 * when no unit was touch-credited, so an unaffected diagram's footer is unchanged.
 */
export function touchCreditNote(units: UnitResult[]): string | null {
  return units.some(isUnitTouchCredited) ? 'Dashed ring around a shot: scored by touching the line, not a solid hit' : null;
}
