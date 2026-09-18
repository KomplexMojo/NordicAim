import { describe, expect, it } from 'vitest';

import { Shot } from '@/lib/domain/analysis';
import { Calibration } from '@/lib/domain/photo';
import { BiathlonSession } from '@/lib/domain/session';

function baseShot() {
  return {
    id: 's1',
    xMm: 1,
    yMm: 2,
    multiplicity: 1,
    positionOverrides: null,
    source: 'auto' as const,
    confidence: 0.9,
    cluster: false,
  };
}

function baseCalibration() {
  return {
    cx: 100,
    cy: 100,
    radiusPx: 50,
    axisRatio: 1,
    angleDeg: 0,
    anchorDiameterMm: 115,
    source: 'overlay' as const,
    confidence: null,
  };
}

describe('Shot', () => {
  it('rejects multiplicity 0', () => {
    expect(Shot.safeParse({ ...baseShot(), multiplicity: 0 }).success).toBe(false);
  });

  it('rejects override-length mismatch', () => {
    expect(
      Shot.safeParse({ ...baseShot(), multiplicity: 2, positionOverrides: ['prone'] }).success,
    ).toBe(false);
  });

  it('accepts a matching override length', () => {
    expect(
      Shot.safeParse({ ...baseShot(), multiplicity: 2, positionOverrides: ['prone', null] }).success,
    ).toBe(true);
  });
});

describe('Calibration', () => {
  it('rejects axisRatio 0.2', () => {
    expect(Calibration.safeParse({ ...baseCalibration(), axisRatio: 0.2 }).success).toBe(false);
  });

  it('rejects angleDeg 180', () => {
    expect(Calibration.safeParse({ ...baseCalibration(), angleDeg: 180 }).success).toBe(false);
  });

  it('accepts a valid calibration', () => {
    expect(Calibration.safeParse(baseCalibration()).success).toBe(true);
  });
});

describe('BiathlonSession', () => {
  it('parses data-model §8 example', () => {
    const example = {
      schemaVersion: 2,
      id: '6f1d7c1e-3b1e-4f5e-9a3e-1c2d3e4f5a6b',
      name: 'Session 2026-09-05',
      sessionDate: '2026-09-05',
      createdAt: '2026-09-05T23:40:00.000Z',
      updatedAt: '2026-09-06T00:05:00.000Z',
      photoIds: ['0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d'],
      analyzeRequestedAt: '2026-09-06T00:01:00.000Z',
      artifacts: [],
      shares: [],
      notes: '',
      // backing-sheet.md §3 (REV-38), schema version 2.
      backingMode: 'auto',
      backing: null,
    };
    const result = BiathlonSession.safeParse(example);
    expect(result.success).toBe(true);
  });
});
