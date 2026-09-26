// REV-39 (M20): `reconcileRounds` applied to a photo's stored shots, per subset (geometry-scoring §7),
// the way Stage A (once the categorization is known) and Stage B run it before `analyzeTarget`.
//
// The owner's edits always win (analysis-pipeline §8):
//   * manual shots are never dropped, moved or given extra rounds — they are fixed units that use up
//     part of the declared rounds;
//   * while every shot is `auto`, reconciliation starts afresh each run (any earlier inferred extra
//     round is removed and re-decided), so changing the declared rounds re-reconciles;
//   * once any shot is `manual`, the owner has taken over: nothing new is inferred and every stored
//     multiplicity stays as it is, so removing an inferred double in Adjust leaves that round a miss.
//
// Pure: no Date.now(), no randomness, no DOM.

import type { Shot } from '../domain/analysis';
import { declaredRounds, isCategorizationComplete } from '../domain/categorization';
import type { ShotPosition, Warning } from '../domain/enums';
import type { Categorization } from '../domain/photo';
import { DEFAULT_MAX_PLAUSIBLE_HOLES } from '../domain/settings';
import { BACKING_OVERLAP_RATIO } from '../cv/constants';
import {
  CONFIDENT_HOLE_MIN,
  DOUBLE_PUNCH_MIN_RATIO,
  DOUBLE_PUNCH_MIN_RATIO_STANDARD,
  reconcileRounds,
  type FoundHole,
  type Reconciliation,
} from './reconcile';
import { assignPositions } from './split';
import { expandUnits } from './units';

/** Which A5 path found the auto shots (`pipeline.detection.method`, backing-sheet.md §3). */
export type DetectionMethod = 'colour' | 'standard';

/** The pipeline warnings reconciliation owns, in analysis-pipeline §4's order. */
export const RECONCILE_WARNINGS = ['extra-candidates-dropped', 'too-many-holes', 'double-punch-assumed', 'rounds-scored-as-miss'] as const;
export type ReconcileWarning = (typeof RECONCILE_WARNINGS)[number];

export interface RejectedSubset {
  position: ShotPosition;
  /** "Found N clear holes": the confident holes plus the owner's own units in this subset. */
  holesFound: number;
  declared: number;
}

export interface ShotsReconciliation {
  /** The shots to store and score. On a rejection, every shot, with nothing inferred. */
  shots: Shot[];
  /** Non-empty when the target is rejected (step 3); one entry per rejected subset. */
  rejected: RejectedSubset[];
  /** Step 4: auto shots the cap removed. */
  dropped: Shot[];
  /** Step 5.2: auto holes that carry inferred extra rounds. */
  doublePunches: number;
  /** Step 5.3: declared rounds with no hole, scored as misses (Σ over subsets). */
  missesAssumed: number;
  /** Reconciliation's pipeline warnings, in analysis-pipeline §4 order. */
  warnings: ReconcileWarning[];
}

export interface ReconcileShotsInput {
  shots: Shot[];
  /** Must be complete (the declared rounds are needed). */
  categorization: Categorization;
  method: DetectionMethod;
  /** Settings' raw-hole-count safety net (`AppSettings.maxPlausibleHoles`). */
  maxPlausibleHoles: number;
}

/** Step 2: the colour path measured 0 false marks, so every hole it finds is confident. */
function isConfident(shot: Shot, method: DetectionMethod): boolean {
  if (method === 'colour') return true;
  return shot.confidence !== null && shot.confidence >= CONFIDENT_HOLE_MIN;
}

/**
 * The hole's overlap evidence. A colour-path shot stored before M20 has no ratio but may carry
 * backing-sheet.md §5.5's flag, which means "at least BACKING_OVERLAP_RATIO".
 */
function overlapEvidence(shot: Shot, method: DetectionMethod): number | null {
  if (shot.overlapRatio !== undefined) return shot.overlapRatio;
  return method === 'colour' && shot.possibleOverlap ? BACKING_OVERLAP_RATIO : null;
}

/** An auto shot as detection found it: one round, nothing inferred. */
function asDetected(shot: Shot): Shot {
  const fresh: Shot = { ...shot, multiplicity: 1, positionOverrides: null };
  delete fresh.inferred;
  return fresh;
}

function subsetKeys(categorization: Categorization): ShotPosition[] {
  const position = categorization.position;
  return position === 'both' ? ['prone', 'standing'] : [position as ShotPosition];
}

function declaredFor(categorization: Categorization, key: ShotPosition): number {
  if (categorization.position !== 'both') return declaredRounds(categorization);
  return (key === 'prone' ? categorization.roundsProne : categorization.roundsStanding) ?? 0;
}

/** Σ over subsets of `max(0, declared - units)` for `shots` as geometry-scoring §7 splits them. */
export function missingRounds(shots: Shot[], categorization: Categorization): number {
  const positioned = assignPositions(expandUnits(shots), categorization, shots);
  return subsetKeys(categorization).reduce(
    (sum, key) => sum + Math.max(0, declaredFor(categorization, key) - positioned.filter((u) => u.position === key).length),
    0,
  );
}

/** REV-39 / M20: reconcile a photo's shots against its declared rounds, per subset. */
export function reconcileShots(input: ReconcileShotsInput): ShotsReconciliation {
  const { categorization, method, maxPlausibleHoles } = input;
  const ownerEdited = input.shots.some((shot) => shot.source === 'manual');
  const shots = ownerEdited ? [...input.shots] : input.shots.map(asDetected);

  // Owner instruction, 2026-09-26: this many raw holes on one target (Settings' maxPlausibleHoles,
  // default 10 — a precision target is always 10 shots) is a detector malfunction (a hole-size or
  // calibration bug flooding a target with false candidates), not a shooting result — reject the whole
  // target outright rather than let per-subset reconciliation try to make sense of it. Zero holes found
  // is treated the same way — a detection failure (wrong target, a missed alignment) rather than a
  // shooting result, so it is rejected rather than silently scored as every declared round missed. Note:
  // a sighting target where every round truly missed the paper is indistinguishable from this at the
  // detector level; flagged as-is per the owner's instruction rather than guessed around. Checked
  // independently of any subset's declared rounds, and only while every shot is still `auto`: a manual
  // edit is the owner's own confirmed count and is never overridden (analysis-pipeline §8).
  if (!ownerEdited && (shots.length === 0 || shots.length > maxPlausibleHoles)) {
    const positionedRaw = assignPositions(expandUnits(shots), categorization, shots);
    const rejected: RejectedSubset[] = subsetKeys(categorization).map((key) => ({
      position: key,
      holesFound: positionedRaw.filter((u) => u.position === key).length,
      declared: declaredFor(categorization, key),
    }));
    return { shots, rejected, dropped: [], doublePunches: 0, missesAssumed: 0, warnings: ['too-many-holes'] };
  }

  // Which subset each unit falls in (§7), before anything is inferred.
  const positioned = assignPositions(expandUnits(shots), categorization, shots);
  const minRatio = ownerEdited ? null : method === 'colour' ? DOUBLE_PUNCH_MIN_RATIO : DOUBLE_PUNCH_MIN_RATIO_STANDARD;

  const perSubset: Array<{ key: ShotPosition; declared: number; fixed: number; result: Reconciliation }> = [];
  for (const key of subsetKeys(categorization)) {
    const units = positioned.filter((u) => u.position === key);
    const found: FoundHole[] = [];
    let fixed = 0;
    for (const unit of units) {
      const shot = shots.find((s) => s.id === unit.shotId) as Shot;
      // An auto hole is found once (its first unit); every other unit is fixed: the owner's own, or an
      // extra round the owner has since kept by editing the target.
      if (shot.source === 'auto' && unit.unitIndex === 0) {
        found.push({
          id: shot.id,
          xMm: shot.xMm,
          yMm: shot.yMm,
          confidence: shot.confidence,
          confident: isConfident(shot, method),
          overlapRatio: overlapEvidence(shot, method),
        });
      } else {
        fixed += 1;
      }
    }
    const declared = declaredFor(categorization, key);
    perSubset.push({ key, declared, fixed, result: reconcileRounds(found, declared - fixed, { doublePunchMinRatio: minRatio }) });
  }

  const rejected: RejectedSubset[] = perSubset
    .filter((s) => s.result.outcome === 'rejected')
    .map((s) => ({ position: s.key, holesFound: s.result.confident + s.fixed, declared: s.declared }));
  if (rejected.length > 0) {
    // Step 3: withhold the score, keep every shot so the owner can inspect them in Adjust.
    return { shots, rejected, dropped: [], doublePunches: 0, missesAssumed: 0, warnings: ['too-many-holes'] };
  }

  const droppedIds = new Set(perSubset.flatMap((s) => s.result.dropped.map((hole) => hole.id)));
  const extras = Object.assign({}, ...perSubset.map((s) => s.result.extraShots)) as Record<string, number>;
  const kept = shots
    .filter((shot) => !droppedIds.has(shot.id))
    .map((shot) => {
      const extra = extras[shot.id] ?? 0;
      return extra === 0 ? shot : { ...shot, multiplicity: 1 + extra, inferred: 'double-punch' as const };
    });

  const doublePunches = kept.filter((shot) => shot.source === 'auto' && shot.inferred === 'double-punch').length;
  const missesAssumed = missingRounds(kept, categorization);
  const warnings: ReconcileWarning[] = [];
  if (droppedIds.size > 0) warnings.push('extra-candidates-dropped');
  if (doublePunches > 0) warnings.push('double-punch-assumed');
  if (missesAssumed > 0) warnings.push('rounds-scored-as-miss');

  return {
    shots: kept,
    rejected: [],
    dropped: shots.filter((shot) => droppedIds.has(shot.id)),
    doublePunches,
    missesAssumed,
    warnings,
  };
}

/**
 * Replaces reconciliation's own warnings in `warnings` with this run's, keeping every other warning.
 * `extra-candidates-dropped` is sticky: once a cap has dropped a candidate, that candidate is gone from
 * the stored shots, so a later run cannot see it but the owner should still be told (M16 step 5).
 */
export function mergeReconcileWarnings(warnings: Warning[], reconciliation: Pick<ShotsReconciliation, 'warnings'>): Warning[] {
  const sticky = warnings.includes('extra-candidates-dropped');
  const others = warnings.filter((w) => !(RECONCILE_WARNINGS as readonly string[]).includes(w));
  const own = new Set<Warning>(reconciliation.warnings);
  if (sticky && !own.has('too-many-holes')) own.add('extra-candidates-dropped');
  return [...RECONCILE_WARNINGS.filter((w) => own.has(w)), ...others];
}

/** The numbers the three REV-39 reason messages name (analysis-pipeline §4), for `reasonMessage`. */
export interface ReconcileReasonContext {
  holesFound?: number;
  rejectedDeclared?: number;
  rejectedPosition?: ShotPosition;
  doublePunches: number;
  missesAssumed: number;
}

/**
 * Re-derives the reconciliation a photo's stored shots imply, for its reason messages. Reconciliation
 * is deterministic and idempotent over what Stage B stored, so this names the same numbers Stage B
 * decided on; nothing extra has to be stored. `null` while the categorization is incomplete.
 */
export function reconcileReasonContext(
  shots: Shot[],
  categorization: Categorization,
  method: DetectionMethod,
  maxPlausibleHoles: number = DEFAULT_MAX_PLAUSIBLE_HOLES,
): ReconcileReasonContext | null {
  if (!isCategorizationComplete(categorization)) return null;
  const reconciled = reconcileShots({ shots, categorization, method, maxPlausibleHoles });
  const rejected = reconciled.rejected[0];
  return {
    ...(rejected === undefined
      ? {}
      : {
          holesFound: rejected.holesFound,
          rejectedDeclared: rejected.declared,
          ...(categorization.position === 'both' ? { rejectedPosition: rejected.position } : {}),
        }),
    doublePunches: reconciled.doublePunches,
    missesAssumed: reconciled.missesAssumed,
  };
}
