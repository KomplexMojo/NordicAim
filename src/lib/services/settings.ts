// REV-47 / REV-48: the Settings screen's writes (data-model §5, backing-sheet.md §2). Every change here
// only writes the settings row: **it re-runs nothing** and marks no photo pending, so a finished
// session's numbers never change behind the user's back. New photos, and any photo the user
// re-analyzes, read the setting when their detection runs.
//
// The one exception is the scoring rule (REV-56): it changes how the same shots are read, not what is
// found, so `setScoringRule` / `setVisibleHoleDiameterMm` re-score every stored session (`rescoreAll`).

import type { BackingMode, BackingSheet } from '@/lib/domain/backing';
import {
  cleanIdentityText,
  DEFAULT_HOLE_DIAMETER_MM,
  MAX_ATHLETE_CLUB,
  MAX_ATHLETE_NAME,
  isValidHoleDiameterMm,
  isValidVisibleHoleDiameterMm,
  type AppSettings,
  type Handedness,
  type ScoringRule,
} from '@/lib/domain/settings';
import { scoringDiameterFromSettings } from '@/lib/scoring/rule';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';
import { rescoreAll, type RescoreReport } from './rescore';

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

export class InvalidVisibleHoleDiameterError extends Error {
  constructor(mm: number) {
    super(`Visible hole size must be 2–5.6 mm, got ${mm}`);
    this.name = 'InvalidVisibleHoleDiameterError';
  }
}

export interface ScoringChange {
  settings: AppSettings;
  /** Present only when the change altered what a hole is scored as, so stored sessions were re-scored. */
  rescored: RescoreReport | null;
}

/** Saves a scoring change, and re-scores stored sessions only if it changed the effective hole size. */
async function applyScoringChange(ctx: ServiceContext, change: (s: AppSettings) => AppSettings): Promise<ScoringChange> {
  const before = await getSettings(ctx.db);
  const settings = await updateSettings(ctx, change);
  const changed = scoringDiameterFromSettings(before) !== scoringDiameterFromSettings(settings);
  return { settings, rescored: changed ? await rescoreAll(ctx) : null };
}

/** REV-56: gauge touch / centre in ring / visible hole touch. Re-scores every stored session when it matters. */
export function setScoringRule(ctx: ServiceContext, scoringRule: ScoringRule): Promise<ScoringChange> {
  return applyScoringChange(ctx, (s) => ({ ...s, scoringRule }));
}

/** REV-56: the visible hole's size, 2–5.6 mm. Out of range throws and stores nothing. */
export function setVisibleHoleDiameterMm(ctx: ServiceContext, mm: number): Promise<ScoringChange> {
  if (!isValidVisibleHoleDiameterMm(mm)) return Promise.reject(new InvalidVisibleHoleDiameterError(mm));
  return applyScoringChange(ctx, (s) => ({ ...s, visibleHoleDiameterMm: mm }));
}

/**
 * REV-88: the shooter's trigger hand. The observed shooting issues are stored with each analysis, so changing it re-scores every stored
 * session (shots and alignment are never touched).
 */
export async function setHandedness(ctx: ServiceContext, handedness: Handedness): Promise<ScoringChange> {
  const before = await getSettings(ctx.db);
  const settings = await updateSettings(ctx, (s) => ({ ...s, handedness }));
  return { settings, rescored: before.handedness !== handedness ? await rescoreAll(ctx) : null };
}

/** REV-99: the athlete's name and ski club, cleaned before they are stored. Re-runs nothing. */
export async function setAthlete(ctx: ServiceContext, athlete: { name: string; club: string }): Promise<AppSettings> {
  return updateSettings(ctx, (s) => ({
    ...s,
    athleteName: cleanIdentityText(athlete.name, MAX_ATHLETE_NAME),
    athleteClub: cleanIdentityText(athlete.club, MAX_ATHLETE_CLUB),
  }));
}
