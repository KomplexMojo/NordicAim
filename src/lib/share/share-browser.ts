// rendering-composite.md §7. Browser-only: shares (or downloads) the session summary image PNG. The
// share rule (AGENTS.md): this is the only image the app ever hands to the share sheet or a download, apart from
// a backup the owner explicitly creates (`shareBackup`, backup.md).

export type ShareOutcome = 'web-share' | 'download' | 'cancelled';

const DOWNLOAD_REVOKE_MS = 60_000;

/** §7 step 3: a temporary `<a download>`; the object URL is revoked after 60 s. */
function downloadViaAnchor(png: Blob, fileName: string): void {
  const url = URL.createObjectURL(png);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS);
}

/**
 * §7: `png` must already be loaded (not fetched here) — iOS requires `navigator.share` to run
 * directly inside the tap handler, so callers pre-load the artifact's PNG when the results screen
 * shows the summary card. Uses the Web Share API (files) when available and the browser says it can
 * share this file; otherwise downloads it. A share the person cancels resolves `'cancelled'`, not an
 * error.
 */
export async function shareArtifact(png: Blob, fileName: string, title: string): Promise<ShareOutcome> {
  const file = new File([png], fileName, { type: 'image/png' });

  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'web-share';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }

  downloadViaAnchor(png, fileName);
  return 'download';
}

/**
 * backup.md: hands an owner-created backup file to the share sheet (or downloads it). Only ever called from the
 * Back up now button, never automatically. Web Share cannot always take a very large file, so a refusal falls back
 * to a download rather than failing.
 */
export async function shareBackup(file: Blob, fileName: string): Promise<ShareOutcome> {
  const asFile = new File([file], fileName, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [asFile] })) {
    try {
      await navigator.share({ files: [asFile], title: 'Nordic Aim backup' });
      return 'web-share';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  downloadViaAnchor(file, fileName);
  return 'download';
}
