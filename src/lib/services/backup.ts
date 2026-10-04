// backup.md: the owner's explicit backup and restore. Nothing here runs by itself.

import { encryptBackup, ENCRYPTED_SUFFIX } from '@/lib/backup/encrypt';
import { backupFileName } from '@/lib/backup/format';
import { createBackup, type CreatedBackup } from '@/lib/backup/create';
import { isValidReminderDays } from '@/lib/backup/due';
import { applyRestore, planRestore, type ConflictPolicy, type RestorePlan, type RestoreReport } from '@/lib/backup/restore';
import type { RebuildTools } from '@/lib/backup/rebuild';
import type { VerifiedBackup } from '@/lib/backup/verify';
import { applyPreferences, collectPreferences } from '@/lib/backup/preferences-browser';
import { restoreBoard } from '@/lib/services/board';
import { restoreGoals } from '@/lib/services/goals';
import { removeStoredLocations } from '@/lib/services/location';
import { isStampPassphrase, loadProvenanceKey, WrongPassphraseError } from '@/lib/services/provenance';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';

export interface BackupFileToShare extends CreatedBackup {
  fileName: string;
  /** REV-151: encrypted with the stamp passphrase (backup.md §2d). */
  protected: boolean;
}

/**
 * `sessionIds` (REV-143, backup.md §2c): back up only those sessions; absent, everything. `protect` (REV-151, §2d): encrypt the file
 * with the athlete's stamp passphrase, which must match this phone's stamp key (`WrongPassphraseError` otherwise, before anything
 * is built). `iterations` is for tests.
 */
export async function buildBackupFile(
  ctx: ServiceContext,
  appBuild: string,
  sessionIds?: string[],
  protect?: { passphrase: string; iterations?: number },
): Promise<BackupFileToShare> {
  const now = ctx.now();
  const nowIso = now.toISOString();
  const settings = await getSettings(ctx.db);
  if (protect !== undefined && !(await isStampPassphrase(ctx, protect.passphrase, protect.iterations))) throw new WrongPassphraseError();
  // REV-158: any photo still holding its location (stored before, or restored) has it taken out before it goes in a file.
  await removeStoredLocations(ctx);
  const created = await createBackup(ctx.db, { appBuild, nowIso, preferences: collectPreferences(), sessionIds });
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileName = backupFileName({
    localDate,
    athleteName: settings.athleteName,
    keyFingerprint: settings.keyFingerprint,
    sessions: sessionIds === undefined ? undefined : created.manifest.counts.sessions,
  });
  if (protect === undefined) return { ...created, fileName, protected: false };
  const blob = await encryptBackup(created.blob, protect.passphrase, { keyFingerprint: settings.keyFingerprint, iterations: protect.iterations });
  return { ...created, blob, fileName: fileName + ENCRYPTED_SUFFIX, protected: true };
}

/**
 * Called once the file has been handed to the share sheet or a download, so Settings can say when. Only a full backup counts:
 * a backup of chosen sessions (REV-143) leaves the last-backup date and the reminder as they were, since the rest is not in it.
 */
export async function recordBackupMade(ctx: ServiceContext, made: BackupFileToShare): Promise<void> {
  if (made.manifest.scope !== undefined) return;
  const tx = ctx.db.transaction('settings', 'readwrite');
  const settings = await getSettings(tx);
  await putSettings(tx, { ...settings, lastBackupAt: made.manifest.createdAt, lastBackupSessions: made.manifest.counts.sessions });
  await tx.done;
  pipelineHooks.notify();
  emitPipelineChanged({ sessionId: '' });
}

export async function setBackupReminderDays(ctx: ServiceContext, days: number): Promise<void> {
  if (!isValidReminderDays(days)) throw new Error('Reminder days must be a whole number from 1 to 365');
  const tx = ctx.db.transaction('settings', 'readwrite');
  const settings = await getSettings(tx);
  await putSettings(tx, { ...settings, backupReminderDays: days });
  await tx.done;
  emitPipelineChanged({ sessionId: '' });
}

export function planBackupRestore(ctx: ServiceContext, backup: VerifiedBackup): Promise<RestorePlan> {
  return planRestore(ctx.db, backup);
}

export async function restoreBackup(
  ctx: ServiceContext,
  backup: VerifiedBackup,
  plan: RestorePlan,
  policy: ConflictPolicy,
  tools: RebuildTools,
): Promise<RestoreReport & { preferences: number; needsUnlock: boolean; boardShooters: number; goals: number }> {
  const report = await applyRestore(ctx.db, backup, plan, policy, tools);
  const preferences = applyPreferences(backup.file.preferences ?? []);
  // leaderboard.md §8: received submissions are checked again and merged, newest per shooter winning.
  const boardShooters = await restoreBoard(ctx, backup.file.board);
  // goals.md §2a: the goal log, merged with this phone's own.
  const goals = await restoreGoals(ctx, backup.file.goals);
  // REV-158: photos from an older backup still hold their location; take it out now.
  await removeStoredLocations(ctx);
  // The provenance key is never in a backup (docs/spec/provenance.md §1): after a restore the athlete enters the passphrase once more.
  const settings = await getSettings(ctx.db);
  const needsUnlock = settings.keyFingerprint !== null && (await loadProvenanceKey(ctx)) === null;
  emitPipelineChanged({ sessionId: '' });
  pipelineHooks.notify();
  return { ...report, preferences, needsUnlock, boardShooters, goals };
}
