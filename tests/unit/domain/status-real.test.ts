// analysis-pipeline §4's status vectors, computed from real `analyzeTarget` output over the golden
// fixtures (tests/unit/domain/status.test.ts covers the same rules with hand-built stubs).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { initialAnalysis, type AnalysisResult, type Shot, type TargetAnalysis } from '@/lib/domain/analysis';
import { emptyCategorization } from '@/lib/domain/categorization';
import type { StageState, TemplateId, Warning } from '@/lib/domain/enums';
import type { Calibration, Categorization } from '@/lib/domain/photo';
import { photoStatus } from '@/lib/domain/status';
import { analyzeTarget } from '@/lib/scoring/analyze';

interface ShotsFixture {
  template: TemplateId;
  categorization: Categorization;
  shots: Shot[];
}

function readFixture(name: string): ShotsFixture {
  const path = fileURLToPath(new URL(`../../../fixtures/reference/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as ShotsFixture;
}

const fixture = readFixture('sample-shots-precision.json');

const CALIBRATION: Calibration = {
  cx: 620,
  cy: 838,
  radiusPx: 265,
  axisRatio: 0.934,
  angleDeg: 0,
  anchorDiameterMm: 112.4,
  source: 'auto',
  confidence: 0.96,
};

function analysisWith(
  opts: {
    stageA?: StageState;
    stageB?: StageState;
    warnings?: Warning[];
    calibration?: Calibration | null;
  } = {},
): TargetAnalysis {
  const base = initialAnalysis('photo-1', '2026-01-01T00:00:00.000Z');
  return {
    ...base,
    calibration: opts.calibration === undefined ? CALIBRATION : opts.calibration,
    pipeline: {
      ...base.pipeline,
      stageA: opts.stageA ?? 'done',
      stageB: opts.stageB ?? 'done',
      warnings: opts.warnings ?? [],
    },
  };
}

function score(shots: Shot[]): AnalysisResult {
  return analyzeTarget({ template: fixture.template, categorization: fixture.categorization, shots });
}

const golden = score(fixture.shots);
const withOneMissing = score(fixture.shots.map((s) => (s.id === 'P8' ? { ...s, multiplicity: 1 } : s)));
const empty = score([]);
const overcounted = score([
  ...fixture.shots,
  { id: 'P10', xMm: 12, yMm: 12, multiplicity: 1, positionOverrides: null, source: 'manual', confidence: null, cluster: false },
]);

describe('photoStatus over real analyzeTarget output (analysis-pipeline §4 vectors)', () => {
  it('incomplete categorization, stageA running -> needs-metadata, []', () => {
    const out = photoStatus({
      categorization: emptyCategorization(),
      analysis: analysisWith({ stageA: 'running', stageB: 'pending' }),
      result: null,
    });
    expect(out).toEqual({ status: 'needs-metadata', reasons: [] });
  });

  it('stageA error -> failed, []', () => {
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({ stageA: 'error', stageB: 'pending' }),
      result: null,
    });
    expect(out).toEqual({ status: 'failed', reasons: [] });
  });

  it('stageA running -> processing, []', () => {
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({ stageA: 'running', stageB: 'pending' }),
      result: null,
    });
    expect(out).toEqual({ status: 'processing', reasons: [] });
  });

  it('stageA done, stageB pending, warnings [image-blurry] -> ready, [image-blurry]', () => {
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({ stageB: 'pending', warnings: ['image-blurry'] }),
      result: null,
    });
    expect(out).toEqual({ status: 'ready', reasons: ['image-blurry'] });
  });

  it('done/done, calibration null -> needs-attention, [target-not-found]', () => {
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({ calibration: null }),
      result: null,
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['target-not-found'] });
  });

  it('done/done, no identified shots -> needs-attention, [no-shots-found]', () => {
    expect(empty.all.identified).toBe(0);
    const out = photoStatus({ categorization: fixture.categorization, analysis: analysisWith({}), result: empty });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['no-shots-found'] });
  });

  it('done/done, overcount 1, warnings [alignment-uncertain] -> needs-attention, [too-many-shots, alignment-uncertain]', () => {
    expect(overcounted.all.overcount).toBe(1);
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({ warnings: ['alignment-uncertain'] }),
      result: overcounted,
    });
    expect(out).toEqual({ status: 'needs-attention', reasons: ['too-many-shots', 'alignment-uncertain'] });
  });

  it('done/done, precision golden fixture (missing 0) -> analyzed, []', () => {
    expect(golden.all.missing).toBe(0);
    expect(golden.all.precision?.identifiedTotal).toBe(72);
    const out = photoStatus({ categorization: fixture.categorization, analysis: analysisWith({}), result: golden });
    expect(out).toEqual({ status: 'analyzed', reasons: [] });
  });

  it('done/done, golden with P8 multiplicity 1 (missing 1) -> analyzed, [rounds-unaccounted]', () => {
    expect(withOneMissing.all.missing).toBe(1);
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({}),
      result: withOneMissing,
    });
    expect(out).toEqual({ status: 'analyzed', reasons: ['rounds-unaccounted'] });
  });

  it('warnings are appended in spec order after the reason', () => {
    const out = photoStatus({
      categorization: fixture.categorization,
      analysis: analysisWith({ warnings: ['template-mismatch', 'alignment-uncertain', 'image-blurry'] }),
      result: withOneMissing,
    });
    expect(out).toEqual({
      status: 'analyzed',
      reasons: ['rounds-unaccounted', 'alignment-uncertain', 'image-blurry', 'template-mismatch'],
    });
  });
});
