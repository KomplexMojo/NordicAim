// REV-47 / REV-48: the Settings screen's writes (data-model §5, backing-sheet.md §2). Every change here
// only writes the settings row: **it re-runs nothing** and marks no photo pending, so a finished
// session's numbers never change behind the user's back. New photos, and any photo the user
// re-analyzes, read the setting when their detection runs.

import type { BackingMode, BackingSheet } from '@/lib/domain/backing';
import { DEFAULT_HOLE_DIAMETER_MM, isValidHoleDiameterMm, type AppSettings } from '@/lib/domain/settings';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';

export class InvalidHoleDiameterError extends Error {
  constructor(mm: number) {
    super(`Hole size must be 2–12 mm, got ${mm}`);
    this.name = 'InvalidHoleDiameterError';
  }
}

export async function getAppSettings(ctx: ServiceContext): Promise<AppSettings> {
  return getSettings(ctx.db);
}

/** One read-modify-write of the settings row, in one transaction that only awaits IndexedDB calls. */
async function updateSettings(ctx: ServiceContext, change: (s: AppSettings) => AppSettings): Promise<AppSettings> {
  const tx = ctx.db.transaction('settings', 'readwrite');
  const next = change(await getSettings(tx));
  await putSettings(tx, next);
  await tx.done;
  return next;
}

/** backing-sheet.md §2: Auto / None / Coloured backing. The measured colour is kept whatever the mode. */
export function setBackingMode(ctx: ServiceContext, backingMode: BackingMode): Promise<AppSettings> {
  return updateSettings(ctx, (s) => ({ ...s, backingMode }));
}

/** backing-sheet.md §2 **Clear**: removes the measured colour; the mode is left as it is. */
export function clearBacking(ctx: ServiceContext): Promise<AppSettings> {
  return updateSettings(ctx, (s) => ({ ...s, backing: null }));
}

/** backing-sheet.md §2, §4: stores a measured backing. Never carries a card photo id (REV-48). */
export function setBacking(ctx: ServiceContext, backing: BackingSheet): Promise<AppSettings> {
  return updateSettings(ctx, (s) => ({ ...s, backing: { ...backing, cardPhotoId: null } }));
}

/** data-model §5 Hole size: 2–12 mm. Out of range throws and stores nothing. */
export function setHoleDiameterMm(ctx: ServiceContext, mm: number): Promise<AppSettings> {
  if (!isValidHoleDiameterMm(mm)) return Promise.reject(new InvalidHoleDiameterError(mm));
  return updateSettings(ctx, (s) => ({ ...s, profileOverrides: { ...s.profileOverrides, holeDiameterMm: mm } }));
}

/** data-model §5 **Reset to 5.6** (.22 LR). */
export function resetHoleDiameterMm(ctx: ServiceContext): Promise<AppSettings> {
  return setHoleDiameterMm(ctx, DEFAULT_HOLE_DIAMETER_MM);
}
