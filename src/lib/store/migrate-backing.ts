// backing-sheet.md §3a (REV-48, M22). The backing moved from each session into AppSettings. This runs
// once per app open, before any screen or the pipeline reads a record, in ONE transaction that only
// awaits IndexedDB calls (data-model §6). On a database already migrated it reads and writes nothing
// else, so it is safe to run on every open.

import { BACKING_CARD_ORIGIN } from '@/lib/domain/backing';
import { BiathlonSessionV2, backingToLift, upgradeSession } from '@/lib/domain/session';
import { AppSettings, defaultAppSettings, upgradeSettings } from '@/lib/domain/settings';

import { photoPrefix, diagramPrefix } from './blob-keys';
import { deleteByPrefix } from './blobs-repo';
import type { AppDb } from './db';

export interface BackingMigrationReport {
  /** Schema-1/2 sessions rewritten as schema 3. */
  sessionsUpgraded: number;
  /** True when a session's backing was lifted into settings (§3a step 2). */
  lifted: boolean;
  /** Backing-card photos deleted with their analyses and blobs (§3a step 4). */
  cardPhotosDeleted: number;
}

function schemaVersionOf(raw: unknown): unknown {
  return raw !== null && typeof raw === 'object' && 'schemaVersion' in raw ? raw.schemaVersion : undefined;
}

function cardPhotoIdOf(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  if (!('origin' in raw) || raw.origin !== BACKING_CARD_ORIGIN) return null;
  return 'id' in raw && typeof raw.id === 'string' ? raw.id : null;
}

/**
 * §3a, in order: (1) settings `lastBacking*` -> `backing*`; (2) if settings has no backing, lift the
 * most recently updated schema-2 session's measured backing; (3) rewrite every schema-1/2 session as
 * schema 3; (4) delete every `backing-card` photo, its analysis and its blobs. Records that do not
 * parse are left exactly as they are, for the repositories to report as corrupt.
 */
export async function migrateBackingToSettings(db: AppDb): Promise<BackingMigrationReport> {
  const tx = db.transaction(['sessions', 'photos', 'analyses', 'blobs', 'settings'], 'readwrite');
  const sessions = tx.objectStore('sessions');
  const photos = tx.objectStore('photos');

  const rawSessions: unknown[] = await sessions.getAll();
  const oldSessions = rawSessions.filter((raw) => {
    const v = schemaVersionOf(raw);
    return v === 1 || v === 2;
  });
  const cardPhotoIds = (await photos.getAll())
    .map((raw: unknown) => cardPhotoIdOf(raw))
    .filter((id): id is string => id !== null);

  // (1) settings, migrated field names.
  const rawSettings: unknown = await tx.objectStore('settings').get('app');
  const needsSettingsRename =
    rawSettings !== undefined &&
    rawSettings !== null &&
    typeof rawSettings === 'object' &&
    ('lastBackingMode' in rawSettings || 'lastBacking' in rawSettings || !('backingMode' in rawSettings));
  const parsedSettings =
    rawSettings === undefined || rawSettings === null
      ? null
      : AppSettings.safeParse(upgradeSettings(rawSettings));
  let settings = parsedSettings === null ? defaultAppSettings() : parsedSettings.success ? parsedSettings.data : null;
  let settingsChanged = parsedSettings !== null && parsedSettings.success && needsSettingsRename;

  // (2) lift, only onto readable settings that hold no backing.
  const v2Sessions = oldSessions
    .map((raw) => BiathlonSessionV2.safeParse(raw))
    .filter((r) => r.success)
    .map((r) => r.data);
  const lift = settings === null ? null : backingToLift(settings.backing, v2Sessions);
  if (settings !== null && lift !== null) {
    settings = { ...settings, backingMode: lift.backingMode, backing: lift.backing };
    settingsChanged = true;
  }
  if (settings !== null && settingsChanged) await tx.objectStore('settings').put(settings);

  // (3) sessions -> schema 3.
  let sessionsUpgraded = 0;
  for (const raw of oldSessions) {
    const upgraded = upgradeSession(raw);
    if (upgraded === raw) continue; // did not parse as v1 or v2: leave it for the repository to report
    await sessions.put(upgraded as never);
    sessionsUpgraded += 1;
  }

  // (4) card photos: the colour was lifted above; the photo itself is not kept (REV-48).
  for (const id of cardPhotoIds) {
    await tx.objectStore('analyses').delete(id);
    await photos.delete(id);
    await deleteByPrefix(tx, photoPrefix(id));
    await deleteByPrefix(tx, diagramPrefix(id));
  }

  await tx.done;
  return { sessionsUpgraded, lifted: lift !== null && settings !== null, cardPhotosDeleted: cardPhotoIds.length };
}
