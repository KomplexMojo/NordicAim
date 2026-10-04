// Issue #92: the backup reminder's dismissal, kept on this device only (never in a backup). localStorage can throw or be absent,
// so every access is guarded; a dismissal then holds for this run only.

import type { ReminderDismissal } from './due';

const KEY = 'asa.backupReminder.dismissed';
let memory: ReminderDismissal | null = null;

export function readReminderDismissal(): ReminderDismissal | null {
  if (memory !== null) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'atMs' in parsed && 'sessions' in parsed) {
      const { atMs, sessions } = parsed as { atMs: unknown; sessions: unknown };
      if (typeof atMs === 'number' && typeof sessions === 'number') return { atMs, sessions };
    }
  } catch {
    // storage unavailable or unreadable: no dismissal
  }
  return null;
}

export function writeReminderDismissal(dismissal: ReminderDismissal): void {
  memory = dismissal;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(dismissal));
  } catch {
    // kept for this run via `memory`
  }
}
