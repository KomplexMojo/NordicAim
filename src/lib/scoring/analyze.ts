// geometry-scoring.md §10. analyzeTarget: the scoring engine's single entry point.

import { BIATHLON_50M } from '../defaults/biathlon';
import { SIGHTING_TEMPLATE } from '../defaults/templates';
import type { AnalysisResult, Shot, SubsetResult, UnitResult } from '../domain/analysis';
import { IncompleteCategorizationError, declaredRounds, isCategorizationComplete } from '../domain/categorization';
import type { Position, ShotPosition, TemplateId } from '../domain/enums';
import type { Categorization } from '../domain/photo';
import { angular, extremeSpread, groupEllipse, meanRadius, mpi, mpiOffset } from './groups';
import { buildPrecisionScore, buildSightingOutcome, combinePrecisionScores, combineSightingOutcomes, missingInfo } from './missing';
import type { SightingUnit } from './missing';
import { scoreRing } from './precision';
import { zoneFor } from './sighting';
import { assignPositions } from './split';
import type { PositionedUnit } from './split';
import { expandUnits } from './units';

export const ENGINE_VERSION = '1';

export interface AnalyzeTargetInput {
  template: TemplateId;
  categorization: Categorization;
  shots: Shot[];
  profile?: typeof BIATHLON_50M;
}

function zoneDiameterFor(position: ShotPosition): 45 | 115 {
  return SIGHTING_TEMPLATE.zones[position].solidDiameterMm as 45 | 115;
}

function toSightingUnit(u: UnitResult): SightingUnit {
  return { shotId: u.shotId, unitIndex: u.unitIndex, xMm: u.xMm, yMm: u.yMm, radialMm: u.radialMm, zone: u.zone! };
}

/**
 * geometry-scoring.md §10. Throws {@link IncompleteCategorizationError} when the position or a
 * required rounds field is missing. Pure — no other side effects.
 */
export function analyzeTarget(input: AnalyzeTargetInput): AnalysisResult {
  const profile = input.profile ?? BIATHLON_50M;
  const { template, categorization, shots } = input;
  if (!isCategorizationComplete(categorization)) throw new IncompleteCategorizationError();

  const position = categorization.position as Position;
  const holeDiameterMm = profile.holeDiameterMm;
  const distanceMm = profile.distanceM * 1000;

  const expanded = expandUnits(shots);
  const positioned = assignPositions(expanded, categorization, shots);

  const classify = (u: PositionedUnit): UnitResult => {
    if (template === 'precision') {
      const { ring, isX } = scoreRing(u.radialMm, holeDiameterMm);
      return { shotId: u.shotId, unitIndex: u.unitIndex, xMm: u.xMm, yMm: u.yMm, radialMm: u.radialMm, position: u.position, ring, isX, zone: null };
    }
    const zone = zoneFor(u.radialMm, u.position, holeDiameterMm);
    return { shotId: u.shotId, unitIndex: u.unitIndex, xMm: u.xMm, yMm: u.yMm, radialMm: u.radialMm, position: u.position, ring: null, isX: null, zone };
  };

  const buildSubset = (key: 'prone' | 'standing' | 'all', units: UnitResult[], declared: number): SubsetResult => {
    const { identified, missing, overcount, warnings } = missingInfo(units.length, declared);
    const center = mpi(units);
    const es = extremeSpread(units);

    return {
      key,
      declared,
      identified,
      missing,
      overcount,
      units,
      mpi: center,
      extremeSpreadMm: es,
      extremeSpreadAngular: angular(es, distanceMm),
      meanRadiusMm: meanRadius(units, center),
      mpiOffset: mpiOffset(center, distanceMm),
      groupEllipse: groupEllipse(units),
      precision: template === 'precision' ? buildPrecisionScore(units.map((u) => ({ ring: u.ring!, isX: u.isX! })), declared) : null,
      sighting:
        template === 'sighting'
          ? buildSightingOutcome(
              units.map(toSightingUnit),
              declared,
              key === 'all' ? (position === 'both' ? null : zoneDiameterFor(position as ShotPosition)) : zoneDiameterFor(key),
            )
          : null,
      warnings,
    };
  };

  if (position !== 'both') {
    const declared = declaredRounds(categorization);
    const units = positioned.filter((u) => u.position === position).map(classify);
    const subset = buildSubset(position, units, declared);
    const all: SubsetResult = { ...subset, key: 'all' };
    return { engineVersion: ENGINE_VERSION, template, position, subsets: [subset], all };
  }

  const declaredProne = categorization.roundsProne as number;
  const declaredStanding = categorization.roundsStanding as number;
  const declaredAll = declaredProne + declaredStanding;

  const proneUnits = positioned.filter((u) => u.position === 'prone').map(classify);
  const standingUnits = positioned.filter((u) => u.position === 'standing').map(classify);
  const proneSubset = buildSubset('prone', proneUnits, declaredProne);
  const standingSubset = buildSubset('standing', standingUnits, declaredStanding);

  const allUnits = [...proneSubset.units, ...standingSubset.units];
  const { identified: identifiedAll, missing: missingAll, overcount: overcountAll, warnings: warningsAll } = missingInfo(
    allUnits.length,
    declaredAll,
  );
  const centerAll = mpi(allUnits);
  const esAll = extremeSpread(allUnits);

  const allSubset: SubsetResult = {
    key: 'all',
    declared: declaredAll,
    identified: identifiedAll,
    missing: missingAll,
    overcount: overcountAll,
    units: allUnits,
    mpi: centerAll,
    extremeSpreadMm: esAll,
    extremeSpreadAngular: angular(esAll, distanceMm),
    meanRadiusMm: meanRadius(allUnits, centerAll),
    mpiOffset: mpiOffset(centerAll, distanceMm),
    groupEllipse: groupEllipse(allUnits),
    precision: template === 'precision' ? combinePrecisionScores(proneSubset.precision!, standingSubset.precision!, declaredAll) : null,
    sighting:
      template === 'sighting'
        ? combineSightingOutcomes(proneSubset.sighting!, standingSubset.sighting!)
        : null,
    warnings: warningsAll,
  };

  return { engineVersion: ENGINE_VERSION, template, position, subsets: [proneSubset, standingSubset], all: allSubset };
}
