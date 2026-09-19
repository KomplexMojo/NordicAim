// backing-sheet.md §3, §3a, §6 (REV-38, REV-48). The backing's schemas, the session migrations to
// schema 3, the lift of a session's backing into settings, and the reason.

import { describe, expect, it } from 'vitest';

import { BackingSheet, ColourSignature, isTargetPhoto, swatchCss, type BackingMode } from '@/lib/domain/backing';
import { reasonMessage } from '@/lib/domain/reason-messages';
import { BiathlonSession, BiathlonSessionV2, backingToLift, upgradeSession } from '@/lib/domain/session';
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

function v2Session(over: Partial<BiathlonSessionV2> = {}): BiathlonSessionV2 {
  return { ...v1Session(), schemaVersion: 2, backingMode: 'auto', backing: null, ...over };
}

function cardBacking(colour: ColourSignature | null = SIGNATURE, cardPhotoId: string | null = CARD_ID): BackingSheet {
  return { kind: 'coloured', source: 'card', cardPhotoId, colour };
}

describe('upgradeSession (schema 1 or 2 -> 3, backing-sheet.md §3a step 3)', () => {
  it('upgrades a v1 record straight to 3, leaving everything else untouched', () => {
    const upgraded = BiathlonSession.parse(upgradeSession(v1Session()));
    expect(upgraded.schemaVersion).toBe(3);
    const { schemaVersion, ...rest } = v1Session();
    void schemaVersion;
    expect(upgraded).toEqual({ ...rest, schemaVersion: 3 });
  });

  it('drops a v2 record\'s backingMode and backing', () => {
    const upgraded = upgradeSession(v2Session({ backingMode: 'coloured', backing: cardBacking() }));
    expect(upgraded).not.toHaveProperty('backingMode');
    expect(upgraded).not.toHaveProperty('backing');
    expect(BiathlonSession.parse(upgraded).schemaVersion).toBe(3);
  });

  it('leaves a v3 record exactly as it is', () => {
    const v3 = { ...v1Session(), schemaVersion: 3 };
    expect(upgradeSession(v3)).toBe(v3);
    expect(BiathlonSession.safeParse(v3).success).toBe(true);
  });

  it('a v2 record no longer parses as the current schema', () => {
    expect(BiathlonSession.safeParse(v2Session()).success).toBe(false);
  });
});

describe('backingToLift (backing-sheet.md §3a step 2)', () => {
  const at = (updatedAt: string, backingMode: BackingMode, backing: BackingSheet | null) =>
    v2Session({ id: crypto.randomUUID(), updatedAt, backingMode, backing });

  it('lifts the most recently updated session with a measured colour, without its card photo id', () => {
    const older = at('2026-09-01T00:00:00.000Z', 'auto', cardBacking({ ...SIGNATURE, hueDeg: 330 }));
    const newer = at('2026-09-10T00:00:00.000Z', 'coloured', cardBacking());
    const newestWithout = at('2026-09-12T00:00:00.000Z', 'none', null);
    expect(backingToLift(null, [older, newestWithout, newer])).toEqual({
      backingMode: 'coloured',
      backing: { ...cardBacking(), cardPhotoId: null },
    });
  });

  it('settings already has a backing — the session\'s is not lifted over it', () => {
    const settingsBacking = cardBacking({ ...SIGNATURE, hueDeg: 200 }, null);
    expect(backingToLift(settingsBacking, [at('2026-09-10T00:00:00.000Z', 'coloured', cardBacking())])).toBeNull();
  });

  it('lifts nothing when no session measured a colour', () => {
    expect(backingToLift(null, [])).toBeNull();
    expect(backingToLift(null, [at('2026-09-10T00:00:00.000Z', 'coloured', cardBacking(null))])).toBeNull();
    expect(backingToLift(null, [at('2026-09-10T00:00:00.000Z', 'none', null)])).toBeNull();
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
