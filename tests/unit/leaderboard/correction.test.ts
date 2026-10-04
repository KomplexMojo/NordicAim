// leaderboard.md §2–§3 (issue #42): the board score, the automatic baseline and the correction flag.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Shot, TargetAnalysis } from '@/lib/domain/analysis';
import { baselineShots, isEdited, keepBaseline } from '@/lib/leaderboard/baseline';
import { boardScore, correctionCheck, formatPercent } from '@/lib/leaderboard/score';
import { boardTarget } from '@/lib/leaderboard/target';

import { makeAnalysis, makePhoto, makePrior } from '../../helpers/records';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../fixtures/reference/sample-shots-precision.json', import.meta.url)), 'utf-8'),
) as { shots: Shot[] };

const shot = (id: string, xMm: number, yMm = 0, source: Shot['source'] = 'auto'): Shot => ({
  id, xMm, yMm, multiplicity: 1, positionOverrides: null, source, confidence: null, cluster: false, possibleOverlap: false,
});
/** Ten shots at one radius. */
const ring = (radiusMm: number, source: Shot['source'] = 'auto'): Shot[] => Array.from({ length: 10 }, (_, i) => shot(`s${i}`, radiusMm, 0, source));

describe('boardScore: official gauge, 5.6 mm, points out of 100', () => {
  it('scores the reference precision target as its golden total', () => {
    const score = boardScore(fixture.shots, 'prone', 10);
    expect(score.percent).toBe(72);
    expect(score.xCount).toBe(1);
    expect(formatPercent(score.percent)).toBe('72%');
  });

  it('a missed round scores 0', () => {
    expect(boardScore(ring(0).slice(0, 9), 'prone', 10).percent).toBe(90);
  });
});

describe('correctionCheck: flagged above 10 points, either way', () => {
  it("the owner's example: automatic 70, corrected to 82, is flagged", () => {
    // Ten shots in ring 7 score 70; moving three of them into the 10 adds 9, four adds 12.
    const auto = ring(28);
    const r7 = boardScore(auto, 'prone', 10).percent;
    expect(r7).toBe(70);
    const corrected = auto.map((s, i) => (i < 4 ? { ...s, xMm: 0, source: 'manual' as const } : s));
    const check = correctionCheck(corrected, auto, true, 'prone', 10);
    expect(check.auto?.percent).toBe(70);
    expect(check.final.percent).toBe(82);
    expect(check.deltaPoints).toBe(12);
    expect(check.flagged).toBe(true);
  });

  it('exactly 10 points, or less, is not flagged; a fall of more than 10 is', () => {
    const auto = ring(28);
    const plusNine = auto.map((s, i) => (i < 3 ? { ...s, xMm: 0 } : s));
    expect(correctionCheck(plusNine, auto, true, 'prone', 10).flagged).toBe(false);
    const dropTwo = auto.slice(0, 8); // -14
    expect(correctionCheck(dropTwo, auto, true, 'prone', 10)).toMatchObject({ deltaPoints: -14, flagged: true });
  });

  it('no baseline: nothing to compare, so never flagged', () => {
    expect(correctionCheck(ring(0), null, true, 'prone', 10)).toMatchObject({ auto: null, deltaPoints: null, flagged: false });
  });
});

describe('the automatic baseline', () => {
  const scored = (over: Partial<TargetAnalysis> = {}): TargetAnalysis =>
    makeAnalysis('p1', {}, { calibration: makePrior({ source: 'auto' }), shots: ring(28), computed: { engineVersion: '1', result: {} as never }, ...over });

  it('edited means a manual shot or a manual alignment', () => {
    expect(isEdited(scored())).toBe(false);
    expect(isEdited(scored({ shots: [...ring(28).slice(1), shot('m', 0, 0, 'manual')] }))).toBe(true);
    expect(isEdited(scored({ calibration: makePrior({ source: 'manual' }) }))).toBe(true);
  });

  it('while nothing is corrected, the current shots are the baseline', () => {
    const a = scored();
    expect(baselineShots(a)).toBe(a.shots);
  });

  it('the first correction keeps the automatic shots; later ones never replace them', () => {
    const before = scored();
    const first = keepBaseline(before, { ...before, shots: ring(0, 'manual') }, '2026-10-01T10:00:00.000Z');
    expect(first.autoBaseline).toEqual({ shots: before.shots, recordedAt: '2026-10-01T10:00:00.000Z' });
    expect(baselineShots(first)).toEqual(before.shots);
    const second = keepBaseline(first, { ...first, shots: ring(5, 'manual') }, '2026-10-02T10:00:00.000Z');
    expect(second.autoBaseline).toBe(first.autoBaseline);
  });

  it('no baseline for a target the app never scored, or one corrected before baselines were kept', () => {
    const unscored = scored({ computed: null });
    expect(keepBaseline(unscored, { ...unscored, shots: ring(0, 'manual') }, '2026-10-01T10:00:00.000Z').autoBaseline).toBeUndefined();
    expect(baselineShots(scored({ shots: ring(0, 'manual') }))).toBeNull();
  });

  it('an edit that keeps everything automatic (e.g. a re-detect) keeps none', () => {
    const a = scored();
    expect(keepBaseline(a, { ...a, shots: ring(5) }, '2026-10-01T10:00:00.000Z').autoBaseline).toBeUndefined();
  });
});

describe('boardTarget', () => {
  it('reads a corrected precision target against its baseline', () => {
    const auto = ring(28);
    const analysis = makeAnalysis('p1', {}, {
      calibration: makePrior({ source: 'auto' }),
      shots: auto.map((s, i) => (i < 4 ? { ...s, xMm: 0, source: 'manual' as const } : s)),
      computed: { engineVersion: '1', result: {} as never },
      autoBaseline: { shots: auto, recordedAt: '2026-10-01T10:00:00.000Z' },
    });
    const t = boardTarget(makePhoto(), analysis);
    expect(t?.check).toMatchObject({ edited: true, flagged: true, deltaPoints: 12 });
  });

  it('is null for sighting, unscored or unaligned targets', () => {
    const analysis = makeAnalysis('p1', {}, { calibration: makePrior(), shots: ring(0), computed: { engineVersion: '1', result: {} as never } });
    expect(boardTarget(makePhoto({ categorization: { template: 'sighting', position: 'prone', roundsProne: 10, roundsStanding: null } }), analysis)).toBeNull();
    expect(boardTarget(makePhoto(), { ...analysis, computed: null })).toBeNull();
    expect(boardTarget(makePhoto(), { ...analysis, calibration: null })).toBeNull();
    expect(boardTarget(makePhoto(), null)).toBeNull();
  });
});
