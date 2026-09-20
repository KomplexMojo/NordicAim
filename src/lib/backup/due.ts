// backup.md §5: when to remind the owner. Pure: the caller supplies the time.

export const DEFAULT_BACKUP_REMINDER_DAYS = 14;
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
