// REV-117: what the delete screen can honestly say about backups. Pure.

export type BackupCoverage =
  | { kind: 'never' }
  /** The last backup is newer than the session's last change, so it holds this session as it is. */
  | { kind: 'covered'; backupAt: string }
  /** The session changed after the last backup. */
  | { kind: 'changed-since'; backupAt: string }
  /** A backup exists but the session's own dates are unreadable. */
  | { kind: 'unknown'; backupAt: string };

export function backupCoverage(lastBackupAt: string | null, sessionUpdatedAt: string | null): BackupCoverage {
  if (lastBackupAt === null) return { kind: 'never' };
  if (sessionUpdatedAt === null) return { kind: 'unknown', backupAt: lastBackupAt };
  return sessionUpdatedAt <= lastBackupAt ? { kind: 'covered', backupAt: lastBackupAt } : { kind: 'changed-since', backupAt: lastBackupAt };
}
