import { describe, expect, it } from 'vitest';

import type { BackingSheet } from '@/lib/domain/backing';
import {
  AppSettings,
  DEFAULT_HOLE_DIAMETER_MM,
  MAX_HOLE_DIAMETER_MM,
  MIN_HOLE_DIAMETER_MM,
  backingInputFromSettings,
  defaultAppSettings,
  isValidHoleDiameterMm,
  upgradeSettings,
} from '@/lib/domain/settings';

const ORANGE = { hueDeg: 15.9, hueSpreadDeg: 2.4, satP10: 0.73, valP10: 0.85, samples: 70610 };
const BACKING: BackingSheet = { kind: 'coloured', source: 'card', cardPhotoId: null, colour: ORANGE };

/** A settings row exactly as REV-38 (M19) stored it. */
function storedRev38(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    key: 'app',
    profileOverrides: { holeDiameterMm: 5.6 },
    persistRequested: true,
    persisted: true,
    lastBackingMode: 'coloured',
    lastBacking: BACKING,
    ...over,
  };
}

describe('defaultAppSettings', () => {
  it('returns the spec default', () => {
    expect(defaultAppSettings()).toEqual({
      schemaVersion: 1,
      key: 'app',
      profileOverrides: { holeDiameterMm: 5.6 },
      persistRequested: false,
      persisted: null,
      // REV-48 (data-model §5): the backing setting for every session.
      backingMode: 'auto',
      backing: null,
      // REV-56 (data-model §5): gauge touch is today's rule, so the default changes no score; 4.5 mm is provisional.
      scoringRule: 'gauge',
      handedness: 'right',
      athleteName: '',
      athleteClub: '',
      athleteSalt: null,
      keyFingerprint: null,
      visibleHoleDiameterMm: 4.5,
      // REV-58: 0 = no diagram renderer version recorded yet, so the first launch redraws stored diagrams once.
      diagramRendererVersion: 0,
      lastBackupAt: null,
      lastBackupSessions: 0,
      backupReminderDays: 14,
    });
  });

  it('validates against AppSettings', () => {
    expect(AppSettings.safeParse(defaultAppSettings()).success).toBe(true);
  });
});

describe('upgradeSettings (REV-48, data-model §5 migration)', () => {
  it('copies lastBackingMode / lastBacking to backingMode / backing and drops the old names', () => {
    const upgraded = AppSettings.parse(upgradeSettings(storedRev38()));
    expect(upgraded.backingMode).toBe('coloured');
    expect(upgraded.backing).toEqual(BACKING);
    expect(upgradeSettings(storedRev38())).not.toHaveProperty('lastBackingMode');
    expect(upgradeSettings(storedRev38())).not.toHaveProperty('lastBacking');
    expect(upgraded.persistRequested).toBe(true);
  });

  it('reads a row from before REV-38 as Auto with no backing', () => {
    const { lastBackingMode, lastBacking, ...old } = storedRev38();
    void lastBackingMode;
    void lastBacking;
    const upgraded = AppSettings.parse(upgradeSettings(old));
    expect(upgraded.backingMode).toBe('auto');
    expect(upgraded.backing).toBeNull();
  });

  it('leaves a current row exactly as it is', () => {
    const current = defaultAppSettings();
    expect(upgradeSettings(current)).toBe(current);
  });
});

describe('Hole size (data-model §5)', () => {
  it('defaults to .22 LR 5.6 mm and accepts 2-12 mm', () => {
    expect(DEFAULT_HOLE_DIAMETER_MM).toBe(5.6);
    expect(MIN_HOLE_DIAMETER_MM).toBe(2);
    expect(MAX_HOLE_DIAMETER_MM).toBe(12);
    expect(isValidHoleDiameterMm(2)).toBe(true);
    expect(isValidHoleDiameterMm(12)).toBe(true);
    expect(isValidHoleDiameterMm(5.6)).toBe(true);
    expect(isValidHoleDiameterMm(1.99)).toBe(false);
    expect(isValidHoleDiameterMm(12.01)).toBe(false);
    expect(isValidHoleDiameterMm(Number.NaN)).toBe(false);
  });
});

describe('backingInputFromSettings (backing-sheet.md §5, REV-48)', () => {
  it('is the Settings mode and the card colour', () => {
    expect(backingInputFromSettings({ ...defaultAppSettings(), backingMode: 'coloured', backing: BACKING })).toEqual({
      mode: 'coloured',
      colour: ORANGE,
    });
    expect(backingInputFromSettings(defaultAppSettings())).toEqual({ mode: 'auto', colour: null });
  });
});

describe('athlete identity (REV-99)', () => {
  it('trims, collapses spaces and cuts to the limit', async () => {
    const { cleanIdentityText } = await import('@/lib/domain/settings');
    expect(cleanIdentityText('  Jane   Doe ', 40)).toBe('Jane Doe');
    expect(cleanIdentityText('abcdefghij', 4)).toBe('abcd');
  });

  it('an older row without them reads back empty', () => {
    const { athleteName, athleteClub, athleteSalt, keyFingerprint, ...older } = defaultAppSettings();
    void [athleteName, athleteClub, athleteSalt, keyFingerprint];
    const parsed = AppSettings.parse(older);
    expect([parsed.athleteName, parsed.athleteClub]).toEqual(['', '']);
  });
});
