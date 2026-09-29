// Issue #45 (backup.md §3, REV-142): what a restore will not accept, checked while the file verifies, so nothing is written.
// A backup is a file from outside the app. Every record is already zod-checked when it is read back, and the CSP blocks
// inline script, but a stored diagram SVG is drawn inline, so a crafted file is refused here too (defence in depth). Pure.

import { AppSettings, upgradeSettings } from '../domain/settings';

/** The only content types the app itself stores: photos, rendered images, diagram SVGs and the summary/coach JSON. */
export const RESTORABLE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/svg+xml',
  'application/json',
]);

/** Markup this app's own SVG renderer never writes: scripts, event handlers, script URLs, embedded HTML or entities. */
const UNSAFE_SVG = /<script\b|\son[a-z]+\s*=|javascript:|<foreignObject\b|<iframe\b|<!ENTITY\b/i;

export function unsafeSvg(text: string): boolean {
  return UNSAFE_SVG.test(text);
}

interface CheckedFile {
  /** The file's image entries, as read (the type is whatever the file says). */
  blobs: Array<{ key: string; contentType: unknown }>;
  settings: unknown[];
}

/** The first reason this backup must not be restored, or null when it is safe. */
export function restoreProblem(file: CheckedFile, bytes: ReadonlyMap<string, Uint8Array>): string | null {
  for (const b of file.blobs) {
    if (typeof b.contentType !== 'string' || !RESTORABLE_CONTENT_TYPES.has(b.contentType)) {
      return `Image ${b.key} has a type (${String(b.contentType).slice(0, 40)}) this app never stores.`;
    }
    const data = bytes.get(b.key);
    if (b.contentType === 'image/svg+xml' && data !== undefined && unsafeSvg(new TextDecoder().decode(data))) {
      return `Image ${b.key} contains content this app never writes, so the backup is not restored.`;
    }
  }
  // REV-115: the settings row is always applied, so it must be one the app can read, or every screen would fail on it.
  for (const s of file.settings) {
    if (!AppSettings.safeParse(upgradeSettings(s)).success) return 'The settings in this backup are not ones this app can read.';
  }
  return null;
}
