# Spec: privacy, storage, hosting

The MVP runs entirely on the phone (REV-10). There is no server and no login.

## 1. Privacy invariants

1. **No runtime network requests** except the app's own same-origin assets (HTML, JS, CSS, wasm, icons, `demo/`,
   `dev-fixtures/`, `diagnostics/`). No APIs, analytics, CDNs, external fonts, or error reporting.
2. **Photos never leave the phone** — except in a backup file the owner explicitly creates (`backup.md`, REV-63).
3. **The only image shared** is a stored `CompositeArtifact` (rendering-composite §6–§7); the one other file that may be handed to the share sheet or a download is an owner-created backup.
4. **Repo privacy**: the public repo never contains `fixtures/private/` or images with GPS; `pnpm check:privacy` (M01) enforces this in CI.
5. Nothing logs EXIF GPS values.
6. **Athlete identity (REV-100, `provenance.md`)**: the summary image, the one thing that is shared, may carry the athlete's name, club and stamp, which the athlete set in Settings. The passphrase is never stored; the derived key stays on the phone and out of backups.

## 2. Storage persistence (`src/lib/store/persistence-browser.ts`)

Facts: Home Screen web apps aren't subject to Safari's 7-day eviction; quotas scale with disk size (iOS 17+);
`navigator.storage.persist()` marks storage persistent; **deleting the Home Screen app deletes its data**.

```ts
export async function requestPersistence(ctx: ServiceContext): Promise<boolean | null>;
// no navigator.storage?.persist → settings.persisted = null → null; else r = await persist(); store { persistRequested: true, persisted: r }
export async function maybeRequestPersistence(ctx: ServiceContext): Promise<void>; // only if !settings.persistRequested
```

Call `maybeRequestPersistence` after each successful capture or import (it only prompts the first time).

## 3. Content Security Policy

Injected as `<meta http-equiv="Content-Security-Policy">` by a Vite `transformIndexHtml` hook **for production builds only**:

```text
default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'
```

**OpenCV and the CSP (investigated 2026-09-15).** OpenCV.js (Emscripten embind) calls `new Function()` while initialising,
so it cannot run on the **page** under this CSP. It runs in the **module Web Worker** (`src/workers/cv.worker.ts`), which this
page-level meta CSP does not govern. That is verified on the production build in WebKit and Chromium with and without
`'unsafe-eval'`. **Do not add `'unsafe-eval'`, and never load OpenCV on the main thread.**

The owner's iPhone `cv-worker` failure (`|this| is not a Promise`) had a different cause: production bundler interop wrapped
OpenCV's exported Promise in a fake Promise-like object. The fix is `src/lib/cv/opencv-entry.ts` plus the hardened
`loadOpenCv()`; see M01 Completion notes.

**Regression guard:** `pnpm test:e2e:prod` (`playwright.prod.config.ts`, `tests/e2e-prod/`) runs the diagnostics page against the
production build, in CI too.

## 4. Hosting on GitHub Pages

- `.github/workflows/pages.yml` runs on push to `main` and on `workflow_dispatch`:
  - **build**: checkout → pnpm → Node 22 → `pnpm install --frozen-lockfile` → `pnpm check` →
    `VITE_BASE=/advanced-shooting-analysis/ pnpm build` → `actions/upload-pages-artifact` (`dist`)
  - **deploy** (`needs: build`, `permissions: { pages: write, id-token: write }`, environment `github-pages`): `actions/deploy-pages`
  - Pin the current major versions of these official actions.
- `vite.config.ts` `base: process.env.VITE_BASE ?? '/'`; **hash routing**; PWA manifest `start_url`/`scope` = `./`.
- URL: `https://komplexmojo.github.io/advanced-shooting-analysis/`.
- **Owner step:** repo Settings → Pages → Source: **GitHub Actions**.
- The Pages build never sets `VITE_FAKE_CAMERA`.

## 5. Testing on the iPhone

- Push to `main`, wait for the Pages deploy, then open the URL in Safari and as a Home Screen app.
- Optional faster loop: `pnpm dev` + `tailscale serve --bg 3874` (HTTPS on your tailnet; the camera requires HTTPS).

## 6. Known MVP limitation

There are **no backups** in the MVP (backlog B1). If the Home Screen app is deleted or website data is cleared, sessions are lost.
Summary images the owner saved to Photos are unaffected. The results screen shows a one-line note:
"Results are stored only on this phone."
