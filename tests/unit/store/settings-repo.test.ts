import { describe, expect, it } from 'vitest';

import { defaultAppSettings } from '@/lib/domain/settings';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import { openTestDb } from '../../helpers/db';

describe('settings-repo', () => {
  it('returns defaultAppSettings when no row is stored', async () => {
    const db = await openTestDb();
    expect(await getSettings(db)).toEqual(defaultAppSettings());
    db.close();
  });

  it('round-trips settings', async () => {
    const db = await openTestDb();
    const settings = { ...defaultAppSettings(), persistRequested: true, persisted: true };
    await putSettings(db, settings);
    expect(await getSettings(db)).toEqual(settings);
    db.close();
  });
});
