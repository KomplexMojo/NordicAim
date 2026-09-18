import { describe, expect, it } from 'vitest';

import { TargetAnalysis, initialAnalysis } from '@/lib/domain/analysis';

const PHOTO_ID = '0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d';

describe('initialAnalysis', () => {
  it('returns the spec default shape', () => {
    const analysis = initialAnalysis(PHOTO_ID, '2026-01-01T00:00:00.000Z');
    expect(analysis).toEqual({
      schemaVersion: 1,
      photoId: PHOTO_ID,
      calibration: null,
      shots: [],
      pipeline: {
        stageA: 'pending',
        stageB: 'pending',
        error: null,
        alignment: { method: 'none', confidence: null },
        templateHint: null,
        sharpness: null,
        warnings: [],
        // backing-sheet.md §3: recorded on every analysis (REV-38).
        detection: { method: 'standard', backing: 'off', fallbackReason: null },
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
      computed: null,
    });
  });

  it('validates against TargetAnalysis', () => {
    const analysis = initialAnalysis(PHOTO_ID, '2026-01-01T00:00:00.000Z');
    expect(TargetAnalysis.safeParse(analysis).success).toBe(true);
  });
});
