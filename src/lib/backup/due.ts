// backup.md §5: when to remind the owner. Pure: the caller supplies the time.

export const MIN_BACKUP_REMINDER_DAYS = 1;
export const MAX_BACKUP_REMINDER_DAYS = 365;

export function isValidReminderDays(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_BACKUP_REMINDER_DAYS && n <= MAX_BACKUP_REMINDER_DAYS;
}

export function backupDue(
  settings: { lastBackupAt: string | null; backupReminderDays: number },
  nowMs: number,
  sessionCount: number,
): boolean {
  if (sessionCount === 0) return false;
  if (settings.lastBackupAt === null) return true;
  const last = Date.parse(settings.lastBackupAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last > settings.backupReminderDays * 86_400_000;
}

/** Issue #92: when the owner dismissed the reminder, and how many sessions there were then (device-local, never backed up). */
export interface ReminderDismissal {
  atMs: number;
  sessions: number;
}

/**
 * Issue #92: whether the reminder shows. It needs `backupDue`; a dismissal hides it until a new session is recorded or
 * `backupReminderDays` pass since the dismissal, whichever comes first. A backup clears the need itself (`backupDue`).
 */
export function backupReminderShown(
  settings: { lastBackupAt: string | null; backupReminderDays: number },
  nowMs: number,
  sessionCount: number,
  dismissal: ReminderDismissal | null,
): boolean {
  if (!backupDue(settings, nowMs, sessionCount)) return false;
  if (dismissal === null) return true;
  return sessionCount > dismissal.sessions || nowMs - dismissal.atMs > settings.backupReminderDays * 86_400_000;
}
