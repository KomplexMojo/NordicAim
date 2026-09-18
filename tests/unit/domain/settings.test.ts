import { describe, expect, it } from 'vitest';

import { AppSettings, defaultAppSettings } from '@/lib/domain/settings';

describe('defaultAppSettings', () => {
  it('returns the spec default', () => {
    expect(defaultAppSettings()).toEqual({
      schemaVersion: 1,
      key: 'app',
      profileOverrides: { holeDiameterMm: 5.6 },
      persistRequested: false,
      persisted: null,
      // backing-sheet.md §3: the last backing a new session inherits.
      lastBackingMode: 'auto',
      lastBacking: null,
    });
  });

  it('validates against AppSettings', () => {
    expect(AppSettings.safeParse(defaultAppSettings()).success).toBe(true);
  });
});
