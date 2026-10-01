// Issue #87: one-time tips, dismissed for good on this device. localStorage can throw or be absent (private windows,
// blocked storage), so every access is guarded; a dismissal then holds for this run only.

const PREFIX = 'asa.tip.';
const memory = new Set<string>();

export function isTipDismissed(id: string): boolean {
  if (memory.has(id)) return true;
  try {
    return window.localStorage.getItem(PREFIX + id) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissTip(id: string): void {
  memory.add(id);
  try {
    window.localStorage.setItem(PREFIX + id, 'dismissed');
  } catch {
    // kept for this run via `memory`
  }
}
