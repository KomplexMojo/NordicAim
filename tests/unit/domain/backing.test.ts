// backing-sheet.md §3, §6 (REV-38). The backing's schemas, the v1 -> v2 session migration, and the
// new reason.

import { describe, expect, it } from 'vitest';

import { BackingSheet, ColourSignature, forSettings, isTargetPhoto, swatchCss } from '@/lib/domain/backing';
import { reasonMessage } from '@/lib/domain/reason-messages';
import { BiathlonSession, upgradeSession } from '@/lib/domain/session';
import { photoStatus } from '@/lib/domain/status';
import { initialAnalysis } from '@/lib/domain/analysis';

const SIGNATURE = { hueDeg: 15.9, hueSpreadDeg: 2.4, satP10: 0.73, valP10: 0.85, samples: 70610 };
const CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function v1Session() {
  return {
    schemaVersion: 1,
    id: '6f1d7c1e-3b1e-4f5e-9a3e-1c2d3e4f5a6b',
    name: 'Session 2026-09-05',
    sessionDate: '2026-09-05',
    createdAt: '2026-09-05T23:40:00.000Z',
    updatedAt: '2026-09-06T00:05:00.000Z',
    photoIds: ['0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d'],
    analyzeRequestedAt: '2026-09-06T00:01:00.000Z',
    artifacts: [],
    shares: [],
    notes: 'wind from the left',
  };
}

describe('ColourSignature / BackingSheet (backing-sheet.md §3)', () => {
  it('accepts a measured signature', () => {
    expect(ColourSignature.safeParse(SIGNATURE).success).toBe(true);
  });

  it('rejects a hue of 360 and a negative spread', () => {
    expect(ColourSignature.safeParse({ ...SIGNATURE, hueDeg: 360 }).success).toBe(false);
    expect(ColourSignature.safeParse({ ...SIGNATURE, hueSpreadDeg: -1 }).success).toBe(false);
    expect(ColourSignature.safeParse({ ...SIGNATURE, hueSpreadDeg: 91 }).success).toBe(false);
    expect(ColourSignature.safeParse({ ...SIGNATURE, samples: 0 }).success).toBe(false);
  });

  it('accepts a backing with no card and no colour yet', () => {
    const parsed = BackingSheet.safeParse({ kind: 'coloured', source: 'estimated', cardPhotoId: null, colour: null });
    expect(parsed.success).toBe(true);
  });

  it('drops the card photo id for AppSettings.lastBacking', () => {
    const backing = { kind: 'coloured' as const, source: 'card' as const, cardPhotoId: CARD_ID, colour: SIGNATURE };
    expect(forSettings(backing)).toEqual({ ...backing, cardPhotoId: null });
    expect(forSettings(null)).toBeNull();
  });

  it('draws the swatch from the measured hue, saturation and value', () => {
    // hue 15.9 with sat 0.73 and value 0.85 is the owner's orange card.
    expect(swatchCss(SIGNATURE)).toBe('rgb(217, 100, 59)');
    expect(swatchCss({ ...SIGNATURE, hueDeg: 0, satP10: 1, valP10: 1 })).toBe('rgb(255, 0, 0)');
  });
});

describe('isTargetPhoto (backing-sheet.md §3)', () => {
  it('is false only for a backing-card photo', () => {
    expect(isTargetPhoto({ origin: 'camera-overlay' })).toBe(true);
    expect(isTargetPhoto({ origin: 'camera-native' })).toBe(true);
    expect(isTargetPhoto({ origin: 'import' })).toBe(true);
    expect(isTargetPhoto({ origin: 'backing-card' })).toBe(false);
  });
});

describe('upgradeSession (schema version 1 -> 2)', () => {
  it('adds backingMode auto and backing null, leaving everything else untouched', () => {
    const upgraded = BiathlonSession.parse(upgradeSession(v1Session()));
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.backingMode).toBe('auto');
    expect(upgraded.backing).toBeNull();
    const { schemaVersion, ...rest } = v1Session();
    void schemaVersion;
    expect(upgraded).toMatchObject(rest);
  });

  it('leaves a v2 record exactly as it is', () => {
    const v2 = { ...v1Session(), schemaVersion: 2, backingMode: 'coloured' as const, backing: null };
    expect(upgradeSession(v2)).toBe(v2);
    expect(BiathlonSession.parse(v2).backingMode).toBe('coloured');
  });
});

describe('backing-colour-not-found (backing-sheet.md §6)', () => {
  it('has the spec message', () => {
    expect(reasonMessage('backing-colour-not-found')).toBe(
      'No backing colour showed through the holes, so standard detection was used. Check the backing card or lighting.',
    );
  });

  it('is appended after extra-candidates-dropped and before alignment-uncertain (analysis-pipeline §4)', () => {
    const analysis = initialAnalysis('0a8b2c4d-1111-4a2b-8c3d-9e8f7a6b5c4d', '2026-01-01T00:00:00.000Z');
    const { reasons } = photoStatus({
      categorization: { template: 'precision', position: 'prone', roundsProne: 10, roundsStanding: null },
      analysis: {
        ...analysis,
        pipeline: {
          ...analysis.pipeline,
          stageA: 'done',
          stageB: 'pending',
          warnings: ['image-blurry', 'alignment-uncertain', 'backing-colour-not-found', 'extra-candidates-dropped'],
        },
      },
      result: null,
    });
    expect(reasons).toEqual([
      'extra-candidates-dropped',
      'backing-colour-not-found',
      'alignment-uncertain',
      'image-blurry',
    ]);
  });
});
