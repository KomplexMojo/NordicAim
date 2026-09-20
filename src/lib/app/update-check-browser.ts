// REV-101 (#43): the browser half of the update check. One same-origin GET of a static file; nothing is sent.

import { parseVersionFile } from './update-check';

/** The deployed build's sha, or null when offline, missing or unreadable. */
export async function fetchDeployedSha(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? parseVersionFile(await res.text()) : null;
  } catch {
    return null;
  }
}

/**
 * Updates the installed app in place: ask the service worker for the new build, wait (briefly) for it to take over, then reload.
 * With no worker (or none that changes), a cache-busting reload. Stored sessions, photos and settings are untouched.
 */
export async function updateApp(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg !== undefined) {
      const changed = new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
        setTimeout(resolve, 6000);
      });
      await reg.update();
      await changed;
    }
  } catch {
    // fall through to the plain reload
  }
  const url = new URL(window.location.href);
  url.searchParams.set('u', String(Date.now()));
  window.location.replace(url.toString());
}
