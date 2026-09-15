import { AppSettings, defaultAppSettings } from '@/lib/domain/settings';

import type { AppDb, AppTx } from './db';
import { CorruptRecordError } from './errors';

type Executor = AppDb | AppTx;

function isTx(x: Executor): x is AppTx {
  return 'objectStore' in x;
}

/** Returns `defaultAppSettings()` if no row is stored yet. */
export async function getSettings(dbOrTx: Executor): Promise<AppSettings> {
  const raw = isTx(dbOrTx) ? await dbOrTx.objectStore('settings').get('app') : await dbOrTx.get('settings', 'app');
  if (raw == null) return defaultAppSettings();
  const parsed = AppSettings.safeParse(raw);
  if (!parsed.success) throw new CorruptRecordError('settings', 'app');
  return parsed.data;
}

export async function putSettings(dbOrTx: Executor, settings: AppSettings): Promise<void> {
  if (isTx(dbOrTx)) await dbOrTx.objectStore('settings').put(settings);
  else await dbOrTx.put('settings', settings);
}
