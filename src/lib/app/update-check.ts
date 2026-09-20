// REV-101 (#43): is a newer build deployed than the one running? Pure.

const SHA = /^[0-9a-f]{7,40}$/;

/** A valid `version.json` body's sha, or null. */
export function parseVersionFile(text: string): string | null {
  try {
    const sha = (JSON.parse(text) as { sha?: unknown }).sha;
    return typeof sha === 'string' && SHA.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** True when `latest` names a different build from the one running. A dev build (no sha) never claims to be out of date. */
export function isNewer(running: string, latest: string | null): boolean {
  if (latest === null || !SHA.test(running) || !SHA.test(latest)) return false;
  const n = Math.min(running.length, latest.length);
  return running.slice(0, n) !== latest.slice(0, n);
}
