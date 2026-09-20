// backup.md: the owner's explicit backup and restore. Nothing here runs by itself.

import { backupFileName } from '@/lib/backup/format';
import { createBackup, type CreatedBackup } from '@/lib/backup/create';
import { isValidReminderDays } from '@/lib/backup/due';
import { applyRestore, planRestore, type ConflictPolicy, type RestorePlan, type RestoreReport } from '@/lib/backup/restore';
import type { VerifiedBackup } from '@/lib/backup/verify';
import { applyPreferences, collectPreferences } from '@/lib/backup/preferences-browser';
import { loadProvenanceKey } from '@/lib/services/provenance';
import { emitPipelineChanged } from '@/lib/pipeline/events';
import { pipelineHooks } from '@/lib/pipeline/hooks';
import { getSettings, putSettings } from '@/lib/store/settings-repo';

import type { ServiceContext } from './context';

export interface BackupFileToShare extends CreatedBackup {
  fileName: string;
}

export async function buildBackupFile(ctx: ServiceContext, appBuild: string): Promise<BackupFileToShare> {
  const nowIso = ctx.now().toISOString();
  const created = await createBackup(ctx.db, { appBuild, nowIso, preferences: collectPreferences() });
  return { ...created, fileName: backupFileName(nowIso) };
}

/** Called once the file has been handed to the share sheet or a download, so Settings can say when. */
export async function recordBackupMade(ctx: ServiceContext, made: BackupFileToShare): Promise<void> {
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
): Promise<RestoreReport & { preferences: number; needsUnlock: boolean }> {
  const report = await applyRestore(ctx.db, backup, plan, policy);
  const preferences = applyPreferences(backup.file.preferences ?? []);
  // The provenance key is never in a backup (docs/spec/provenance.md §1): after a restore the athlete enters the passphrase once more.
  const settings = await getSettings(ctx.db);
  const needsUnlock = settings.keyFingerprint !== null && (await loadProvenanceKey(ctx)) === null;
  emitPipelineChanged({ sessionId: '' });
  pipelineHooks.notify();
  return { ...report, preferences, needsUnlock };
}
