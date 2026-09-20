// REV-115: the browser half of preferences in a backup: read the app's localStorage entries, and put a backup's back.

import { PREFERENCE_PREFIX, type BackupPreference } from './format';

export function collectPreferences(): BackupPreference[] {
  const out: BackupPreference[] = [];
  try {
    const store = window.localStorage;
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null || !key.startsWith(PREFERENCE_PREFIX)) continue;
      const value = store.getItem(key);
      if (value !== null) out.push({ key, value });
    }
  } catch {
    // storage blocked: the backup simply carries no preferences
  }
  return out;
}

/** Returns how many were written. */
export function applyPreferences(preferences: BackupPreference[]): number {
  let written = 0;
  try {
    for (const { key, value } of preferences) {
      if (!key.startsWith(PREFERENCE_PREFIX)) continue;
      window.localStorage.setItem(key, value);
      written += 1;
    }
  } catch {
    // storage blocked or full: the rest are skipped
  }
  return written;
}
