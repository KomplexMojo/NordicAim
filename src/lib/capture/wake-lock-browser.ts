// capture-overlay.md §2. Screen wake lock while the camera runs.

/** `navigator.wakeLock?.request('screen')`; unavailable or any error → null. */
export async function acquireWakeLock(): Promise<{ release(): Promise<void> } | null> {
  try {
    const wakeLock = (globalThis.navigator as Navigator | undefined)?.wakeLock;
    if (!wakeLock?.request) return null;
    const sentinel = await wakeLock.request('screen');
    return { release: () => sentinel.release() };
  } catch {
    return null;
  }
}
