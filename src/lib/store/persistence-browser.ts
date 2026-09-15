import type { ServiceContext } from '@/lib/services/context';
import { getSettings, putSettings } from './settings-repo';

/** privacy-storage-hosting §2. Marks storage persistent; only meaningful the first time it's called. */
export async function requestPersistence(ctx: ServiceContext): Promise<boolean | null> {
  const settings = await getSettings(ctx.db);
  if (!navigator.storage?.persist) {
    await putSettings(ctx.db, { ...settings, persistRequested: true, persisted: null });
    return null;
  }
  const persisted = await navigator.storage.persist();
  await putSettings(ctx.db, { ...settings, persistRequested: true, persisted });
  return persisted;
}

/** Call after each successful capture or import; only prompts the first time. */
export async function maybeRequestPersistence(ctx: ServiceContext): Promise<void> {
  const settings = await getSettings(ctx.db);
  if (settings.persistRequested) return;
  await requestPersistence(ctx);
}

export async function storageStatus(): Promise<{
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}> {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  if (!navigator.storage?.estimate) {
    return { persisted, usageBytes: null, quotaBytes: null };
  }
  const { usage, quota } = await navigator.storage.estimate();
  return { persisted, usageBytes: usage ?? null, quotaBytes: quota ?? null };
}
