// Issue #47 (privacy-storage-hosting.md §3a): GitHub Pages can't send `X-Frame-Options`, and a `<meta>` CSP can't set
// `frame-ancestors`, so the app checks for itself whether another page has put it in a frame.

/** True when the app is inside a frame (or the check itself is blocked, which only happens across origins). */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
