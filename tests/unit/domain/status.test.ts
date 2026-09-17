import { describe, expect, it } from 'vitest';

import type { AnalysisResult, SubsetResult } from '@/lib/domain/analysis';
import { initialAnalysis } from '@/lib/domain/analysis';
import { photoStatus } from '@/lib/domain/status';
import { emptyCategorization } from '@/lib/domain/categorization';
import type { Categorization } from '@/lib/domain/photo';
import type { StageState, Warning } from '@/lib/domain/enums';

const completeCategorization: Categorization = {
  template: 'precision',
  position: 'prone',
  roundsProne: 10,
  roundsStanding: null,
};

function subsetStub(overrides: Partial<SubsetResult> = {}): SubsetResult {
  return {
    key: 'all',
    declared: 10,
    identified: 10,
    missing: 0,
    overcount: 0,
    units: [],
    mpi: null,
    extremeSpreadMm: null,
    extremeSpreadAngular: null,
    meanRadiusMm: null,
    mpiOffset: null,
    groupEllipse: null,
    precision: null,
    sighting: null,
    warnings: [],
    ...overrides,
  };
}

function resultStub(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const all = overrides.all ?? subsetStub();
  return {
    engineVersion: 'test',
    template: 'precision',
    position: 'prone',
    subsets: overrides.subsets ?? [all],
    all,
  };
}

function analysisStub(opts: {
  stageA?: StageState;
  stageB?: StageState;
  warnings?: Warning[];
  calibration?: object | null;
  alignmentMethod?: 'cv' | 'overlay' | 'manual' | 'none';
}) {
  const analysis = initialAnalysis('photo-1', '2026-01-01T00:00:00.000Z');
  analysis.pipeline.stageA = opts.stageA ?? 'done';
  analysis.pipeline.stageB = opts.stageB ?? 'done';
  analysis.pipeline.warnings = opts.warnings ?? [];
  if (opts.alignmentMethod !== undefined) analysis.pipeline.alignment.method = opts.alignmentMethod;
  if (opts.calibration !== undefined) {
    // calibration shape is irrelevant to photoStatus beyond null-ness
    analysis.calibration = opts.calibration as never;
  } else {
    analysis.calibration = {
      cx: 0,
      cy: 0,
      radiusPx: 1,
      axisRatio: 1,
      angleDeg: 0,
      anchorDiameterMm: 112.4,
      source: 'auto',
      confidence: 1,
    };
  }
  return analysis;
}

describe('photoStatus', () => {
  it('incomplete categorization, stageA running -> needs-metadata, []', () => {
    const out = photoStatus({
      categorization: emptyCategorization(),
      analysis: analysisStub({ stageA: 'running' }),
      result: null,
    });
    expect(out).toEqual({ status: 'needs-metadata', reasons: [] });
  });

  it('stageA error -> failed', () => {
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ stageA: 'error' }),
      result: null,
    });
    expect(out.status).toBe('failed');
    expect(out.reasons).toEqual([]);
  });

  it('stageA running -> processing', () => {
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ stageA: 'running' }),
      result: null,
    });
    expect(out.status).toBe('processing');
  });

  it('stageA done, stageB pending, warnings [image-blurry] -> ready, [image-blurry]', () => {
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ stageA: 'done', stageB: 'pending', warnings: ['image-blurry'] }),
      result: null,
    });
    expect(out).toEqual({ status: 'ready', reasons: ['image-blurry'] });
  });

  it('done/done, calibration null -> needs-attention, [target-not-found]', () => {
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ calibration: null }),
      result: null,
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['target-not-found'] });
  });

  it('done/done, identified 0 -> needs-attention, [no-shots-found]', () => {
    const result = resultStub({ all: subsetStub({ identified: 0 }) });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({}),
      result,
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['no-shots-found'] });
  });

  it('done/done, overcount 1, warnings [alignment-uncertain] -> needs-attention, [too-many-shots, alignment-uncertain]', () => {
    const all = subsetStub({ identified: 11, overcount: 1 });
    const result = resultStub({ all, subsets: [all] });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ warnings: ['alignment-uncertain'] }),
      result,
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['too-many-shots', 'alignment-uncertain'] });
  });

  it('done/done, warnings [extra-candidates-dropped] -> needs-attention, [extra-candidates-dropped]', () => {
    // REV-28: the shot set was capped to the declared rounds, so the owner confirms what was kept.
    const all = subsetStub({ identified: 10, missing: 0, overcount: 0 });
    const result = resultStub({ all, subsets: [all] });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ warnings: ['extra-candidates-dropped'] }),
      result,
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['extra-candidates-dropped'] });
  });

  it('orders the warnings extra-candidates-dropped, alignment-uncertain, image-blurry, template-mismatch', () => {
    const all = subsetStub({ identified: 10, missing: 0, overcount: 0 });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({
        warnings: ['template-mismatch', 'image-blurry', 'alignment-uncertain', 'extra-candidates-dropped'],
      }),
      result: resultStub({ all, subsets: [all] }),
    });
    expect(out.reasons).toEqual([
      'extra-candidates-dropped',
      'alignment-uncertain',
      'image-blurry',
      'template-mismatch',
    ]);
  });

  it('done/done, alignment.method overlay -> needs-attention, [alignment-uncertain] (REV-31, rule 9)', () => {
    const all = subsetStub({ identified: 10, missing: 0, overcount: 0 });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ alignmentMethod: 'overlay', warnings: ['alignment-uncertain'] }),
      result: resultStub({ all, subsets: [all] }),
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['alignment-uncertain'] });
  });

  it('rule 9 names alignment-uncertain even when the warning is absent, and keeps the other warnings after it', () => {
    const all = subsetStub({ identified: 10, missing: 0, overcount: 0 });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ alignmentMethod: 'overlay', warnings: ['image-blurry'] }),
      result: resultStub({ all, subsets: [all] }),
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['alignment-uncertain', 'image-blurry'] });
  });

  it('done/done, alignment.method cv with warnings [alignment-uncertain] (outsidePrior) -> analyzed, [alignment-uncertain]', () => {
    const all = subsetStub({ identified: 10, missing: 0, overcount: 0 });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({ alignmentMethod: 'cv', warnings: ['alignment-uncertain'] }),
      result: resultStub({ all, subsets: [all] }),
    });
    expect(out).toEqual({ status: 'analyzed', reasons: ['alignment-uncertain'] });
  });

  it('done/done, precision golden fixture (missing 0) -> analyzed, []', () => {
    const all = subsetStub({ identified: 10, missing: 0, overcount: 0 });
    const result = resultStub({ all, subsets: [all] });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({}),
      result,
    });
    expect(out).toEqual({ status: 'analyzed', reasons: [] });
  });

  it('done/done, golden with P8 multiplicity 1 (missing 1) -> analyzed, [rounds-unaccounted]', () => {
    const all = subsetStub({ identified: 9, missing: 1, overcount: 0 });
    const result = resultStub({ all, subsets: [all] });
    const out = photoStatus({
      categorization: completeCategorization,
      analysis: analysisStub({}),
      result,
    });
    expect(out).toEqual({ status: 'analyzed', reasons: ['rounds-unaccounted'] });
  });
});
