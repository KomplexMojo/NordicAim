// Issue #14 / REV-62: whether a collapsible review panel is open, remembered per panel on this device.
// localStorage can throw or be absent (private windows, blocked storage), so every access is guarded and the
// panel simply uses its default when nothing can be stored.

const PREFIX = 'asa.panel.';
const listeners = new Set<() => void>();
/** What was chosen this run, so the choice holds even when storage refuses to keep it. */
const memory = new Map<string, boolean>();

export function readPanelOpen(id: string, defaultOpen: boolean): boolean {
  const remembered = memory.get(id);
  if (remembered !== undefined) return remembered;
  try {
    const raw = window.localStorage.getItem(PREFIX + id);
    if (raw === 'open') return true;
    if (raw === 'closed') return false;
  } catch {
    // storage unavailable: fall through to the default
  }
  return defaultOpen;
}

export function writePanelOpen(id: string, open: boolean): void {
  memory.set(id, open);
  try {
    window.localStorage.setItem(PREFIX + id, open ? 'open' : 'closed');
  } catch {
    // not kept across launches, but still honoured for this run via `memory`
  }
  for (const listener of listeners) listener();
}

export function subscribePanels(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
