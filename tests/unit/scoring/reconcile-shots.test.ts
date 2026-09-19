// M20 (REV-39, REV-43): reconciliation over a photo's stored shots, per subset, with owner edits winning.

import { describe, expect, it } from 'vitest';

import type { Shot } from '@/lib/domain/analysis';
import type { Categorization } from '@/lib/domain/photo';
import { analyzeTarget } from '@/lib/scoring/analyze';
import { scoreRing } from '@/lib/scoring/precision';
import {
  mergeReconcileWarnings,
  reconcileReasonContext,
  reconcileShots,
  type DetectionMethod,
} from '@/lib/scoring/reconcile-shots';
import { unplacedRounds } from '@/lib/services/adjust';

const PRONE_10: Categorization = { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null };

function auto(i: number, over: Partial<Shot> = {}): Shot {
  return {
    id: `auto-${i}`,
    xMm: i * 3,
    yMm: 0,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto',
    confidence: null,
    cluster: false,
    possibleOverlap: false,
    overlapRatio: 1,
    ...over,
  };
}

function manual(id: string, xMm: number, multiplicity = 1): Shot {
  return {
    id,
    xMm,
    yMm: 5,
    multiplicity,
    positionOverrides: null,
    source: 'manual',
    confidence: null,
    cluster: false,
    possibleOverlap: false,
  };
}

function autos(n: number, over: (i: number) => Partial<Shot> = () => ({})): Shot[] {
  return Array.from({ length: n }, (_, i) => auto(i + 1, over(i + 1)));
}

function run(shots: Shot[], categorization = PRONE_10, method: DetectionMethod = 'colour') {
  return reconcileShots({ shots, categorization, method });
}

describe('reconcileShots: the three outcomes on stored shots', () => {
  it('rejected: every shot kept as detected, nothing inferred, warning too-many-holes, no score', () => {
    const shots = autos(15);
    const r = run(shots);
    expect(r.rejected).toEqual([{ position: 'prone', holesFound: 15, declared: 10 }]);
    expect(r.shots).toEqual(shots);
    expect(r.warnings).toEqual(['too-many-holes']);
    expect(r.missesAssumed).toBe(0);
  });

  it('double punch then miss: the inferred round is an ordinary auto unit at the hole (same ring)', () => {
    const r = run(autos(8, (i) => (i === 5 ? { overlapRatio: 2.23 } : {})));
    const doubled = r.shots.find((s) => s.id === 'auto-5')!;
    expect(doubled).toMatchObject({ source: 'auto', multiplicity: 2, inferred: 'double-punch', xMm: 15, yMm: 0 });
    expect(r.doublePunches).toBe(1);
    expect(r.missesAssumed).toBe(1);
    expect(r.warnings).toEqual(['double-punch-assumed', 'rounds-scored-as-miss']);

    const result = analyzeTarget({ template: 'precision', categorization: PRONE_10, shots: r.shots });
    const units = result.all.units.filter((u) => u.shotId === 'auto-5');
    expect(units).toHaveLength(2);
    expect(units[0]!.ring).toBe(units[1]!.ring);
    expect(result.all.missing).toBe(1);
  });

  it('the cap keeps working on the standard path, warning extra-candidates-dropped', () => {
    const shots = autos(12, (i) => ({ confidence: i <= 9 ? 0.95 : 0.5 + i / 100 }));
    const r = run(shots, PRONE_10, 'standard');
    expect(r.rejected).toEqual([]);
    expect(r.shots).toHaveLength(10);
    expect(r.dropped.map((s) => s.id)).toEqual(['auto-10', 'auto-11']);
    expect(r.warnings).toEqual(['extra-candidates-dropped']);
  });

  it('is idempotent over what it stored, so Stage B can re-run it and the UI can re-derive its numbers', () => {
    const first = run(autos(8, (i) => (i === 2 ? { overlapRatio: 2.5 } : {})));
    const again = run(first.shots);
    expect(again.shots).toEqual(first.shots);
    expect(again.warnings).toEqual(first.warnings);
  });

  it('changing the declared rounds re-runs it: at 8 rounds every round is accounted for and the double is gone', () => {
    const stored = run(autos(8, (i) => (i === 2 ? { overlapRatio: 2.5 } : {}))).shots;
    expect(stored.find((s) => s.id === 'auto-2')?.multiplicity).toBe(2);
    const eight: Categorization = { ...PRONE_10, roundsProne: 8 };
    const r = run(stored, eight);
    expect(r.shots.every((s) => s.multiplicity === 1 && s.inferred === undefined)).toBe(true);
    expect(r.doublePunches).toBe(0);
    expect(r.missesAssumed).toBe(0);
    expect(r.warnings).toEqual([]);
  });
});

describe('reconcileShots: owner overrides win (analysis-pipeline §8, M20 step 8)', () => {
  it('a manual multiplicity is untouched, and nothing new is inferred once the owner has edited', () => {
    const shots = [manual('m-1', -20, 3), ...autos(4, (i) => (i === 1 ? { overlapRatio: 2.4 } : {}))];
    const r = run(shots);
    expect(r.shots).toEqual(shots);
    expect(r.doublePunches).toBe(0);
    expect(r.missesAssumed).toBe(3); // 10 - (3 + 4)
  });

  it('a manual shot added in Adjust reduces missesAssumed by one', () => {
    const before = run(autos(7), PRONE_10, 'standard');
    const after = run([...before.shots, manual('m-1', -20)], PRONE_10, 'standard');
    expect(before.missesAssumed).toBe(3);
    expect(after.missesAssumed).toBe(2);
    expect(unplacedRounds(PRONE_10, after.shots)).toBe(2);
  });

  it('removing an inferred double (the owner sets that hole to 1, which saves it as manual) reverts that round to a miss', () => {
    // auto-1 and auto-2 both clear the ratio; only auto-1 (the stronger) took the one short round.
    const stored = run(autos(9, (i) => (i === 1 ? { overlapRatio: 2.6 } : i === 2 ? { overlapRatio: 2.0 } : {}))).shots;
    expect(stored.find((s) => s.id === 'auto-1')?.multiplicity).toBe(2);

    const edited = stored.map((s) => {
      if (s.id !== 'auto-1') return s;
      const next: Shot = { ...s, multiplicity: 1, source: 'manual', confidence: null };
      delete next.inferred;
      return next;
    });
    const r = run(edited);
    // auto-2 is NOT given the round instead: the owner has taken over.
    expect(r.shots).toEqual(edited);
    expect(r.missesAssumed).toBe(1);
    expect(r.warnings).toEqual(['rounds-scored-as-miss']);
  });

  it('keeps an inferred double the owner left alone after editing something else', () => {
    const stored = run(autos(8, (i) => (i === 3 ? { overlapRatio: 2.2 } : {}))).shots;
    const r = run([...stored, manual('m-1', -20)]);
    expect(r.shots.find((s) => s.id === 'auto-3')?.multiplicity).toBe(2);
    expect(r.missesAssumed).toBe(0);
    expect(r.warnings).toEqual(['double-punch-assumed']);
  });

  it("the owner's own units count toward rejection: 9 manual + 2 confident auto on 10 rounds is too many", () => {
    const shots = [...Array.from({ length: 9 }, (_, i) => manual(`m-${i}`, -i * 3)), ...autos(2)];
    expect(run(shots).rejected).toEqual([{ position: 'prone', holesFound: 11, declared: 10 }]);
  });

  it("the owner's over-count alone is not a rejection (it is `too-many-shots`, §4 rule 7)", () => {
    const shots = Array.from({ length: 11 }, (_, i) => manual(`m-${i}`, -i * 3));
    const r = run(shots);
    expect(r.rejected).toEqual([]);
    expect(r.shots).toEqual(shots);
  });
});

describe('reconcileShots: a both target is reconciled per subset (Pitfalls)', () => {
  const both: Categorization = { template: 'precision', position: 'both', roundsProne: 5, roundsStanding: 5 };

  it('says which position was rejected', () => {
    // 13 holes: the 5 outermost are standing (§7), the other 8 are prone — 3 over.
    const r = run(autos(13), both);
    expect(r.rejected).toEqual([{ position: 'prone', holesFound: 8, declared: 5 }]);
    expect(r.warnings).toEqual(['too-many-holes']);
    const ctx = reconcileReasonContext(autos(13), both, 'colour');
    expect(ctx).toMatchObject({ holesFound: 8, rejectedDeclared: 5, rejectedPosition: 'prone' });
  });

  it('short: misses are counted per subset', () => {
    const r = run(autos(8), both);
    expect(r.missesAssumed).toBe(2);
  });
});

describe('REV-43 (M20 Open question 1): a located hole outside the scoring area is a ring-zero unit', () => {
  it('beyond ring 1 already scores 0 under geometry-scoring §4 — no extra case is needed', () => {
    expect(scoreRing(80.01).ring).toBe(0);
    expect(scoreRing(120).ring).toBe(0);
  });

  it('it counts as identified: it reduces missing and is never also an assumed miss; it enters the group metrics', () => {
    const shots = [...autos(9), auto(10, { xMm: 100, yMm: 0 })];
    const r = run(shots);
    expect(r.missesAssumed).toBe(0);
    const result = analyzeTarget({ template: 'precision', categorization: PRONE_10, shots: r.shots });
    expect(result.all.identified).toBe(10);
    expect(result.all.missing).toBe(0);
    expect(result.all.precision!.tally[0]).toBe(1);
    // Its measured position is part of the MPI: (3+6+…+27 + 100) / 10.
    expect(result.all.mpi!.xMm).toBeCloseTo((3 * 45 + 100) / 10, 9);
  });

  it('sighting scores by zone: a hole outside the outermost zone is a located miss that still enters the group metrics', () => {
    const sighting: Categorization = { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null };
    const shots = [...autos(9, () => ({ xMm: 1 })), auto(10, { xMm: 70, yMm: 0 })];
    const r = run(shots, sighting);
    expect(r.missesAssumed).toBe(0);
    const result = analyzeTarget({ template: 'sighting', categorization: sighting, shots: r.shots });
    expect(result.all.identified).toBe(10);
    expect(result.all.sighting).toMatchObject({ hits: 9, misses: 1 });
    expect(result.all.units.find((u) => u.shotId === 'auto-10')?.zone).toBe('miss');
    expect(result.all.extremeSpreadMm).toBeCloseTo(69, 9);
  });

  it('an assumed miss (no hole anywhere) enters no group metric', () => {
    const shots = autos(9, () => ({ xMm: 2 }));
    const result = analyzeTarget({ template: 'precision', categorization: PRONE_10, shots: run(shots).shots });
    expect(result.all.missing).toBe(1);
    expect(result.all.mpi).toEqual({ xMm: 2, yMm: 0 });
    expect(result.all.extremeSpreadMm).toBeNull();
  });
});

describe('mergeReconcileWarnings', () => {
  it("replaces reconciliation's own warnings, keeps the rest, and orders as analysis-pipeline §4", () => {
    expect(
      mergeReconcileWarnings(['double-punch-assumed', 'image-blurry'], { warnings: ['rounds-scored-as-miss'] }),
    ).toEqual(['rounds-scored-as-miss', 'image-blurry']);
  });

  it('keeps a cap warning Stage A raised, since the dropped candidates are gone from the shots', () => {
    expect(mergeReconcileWarnings(['extra-candidates-dropped'], { warnings: [] })).toEqual(['extra-candidates-dropped']);
  });

  it('a rejection replaces the cap warning', () => {
    expect(mergeReconcileWarnings(['extra-candidates-dropped'], { warnings: ['too-many-holes'] })).toEqual(['too-many-holes']);
  });
});
