# M01: Scaffold, diagnostics, CI, Pages deploy

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| — | low | M | scaffold |

## Goal
A Vite + React app skeleton with every tool and quality gate working, deployed to GitHub Pages, plus a
**diagnostics page** that proves the risky iPhone capabilities (OpenCV worker under CSP, SVG→PNG, HEIC, share, storage)
before any feature work.

## Read first
- `/AGENTS.md` (all)
- `docs/PLAN.md` §3 (D1–D6, D10, D12–D14)
- `docs/spec/privacy-storage-hosting.md` §1, §2, §5, §6
- `docs/spec/rendering-composite.md` §2 (rasterisation)

## In scope
Vite/React/TS/Tailwind/shadcn, hash router, Vitest (+fake-indexeddb), Playwright (mobile Chromium + WebKit), ESLint,
scripts, runtime deps, CV worker ping, diagnostics page, CSP, PWA plugin skeleton, privacy check, CI, Pages workflow.

## Out of scope
Domain logic, real UI design (M18), full manifest/icons (M18).

## Files
- `package.json`, `.npmrc`, `.nvmrc`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`
- `index.html`, `src/main.tsx`, `src/index.css`, `src/app/router.tsx`
- `src/routes/home/HomePage.tsx`, `src/routes/diagnostics/DiagnosticsPage.tsx`
- `src/lib/diagnostics/checks-browser.ts`, `src/lib/diagnostics/summarize.ts` (pure)
- `src/lib/cv/opencv.ts`, `src/workers/cv.worker.ts`, `src/workers/cv-client.ts`
- `public/diagnostics/tiny-sighting.heic` (copy of `fixtures/reference/tiny-sighting.heic`)
- `public/dev-fixtures/sighting.jpg`, `public/dev-fixtures/precision.jpg` (copies of the `docs/reference` JPEGs)
- `scripts/check-privacy.mjs`
- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`
- `tests/unit/diagnostics/summarize.test.ts`, `tests/e2e/smoke.spec.ts`
- `README.md` (Development section)

## Steps
1. Scaffold in a temp dir (the repo isn't empty): `pnpm create vite@latest /tmp/asa-scaffold --template react-ts`.
   Copy everything except `.git`, `README.md`, and `.gitignore` into the repo root. Merge `.gitignore` lines
   without removing existing ones; add `dist/`.
2. `.npmrc` `save-exact=true`; `.nvmrc` `22`; `package.json`: `"packageManager": "pnpm@10.33.0"`,
   `"engines": { "node": ">=22" }`, `"version": "0.1.0"`.
3. TS: `strict`, `noUncheckedIndexedAccess`, path alias `@/*` → `src/*` (tsconfig + `vite.config.ts` `resolve.alias`).
4. Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`; `@import "tailwindcss";` in `src/index.css`). shadcn:
   `pnpm dlx shadcn@latest init` (Vite), then add
   `button card input label select dialog tabs badge sonner separator checkbox radio-group slider scroll-area sheet toggle-group progress`.
5. Runtime deps: `react-router zod idb exifr comlink fflate @techstark/opencv-js`.
   Dev deps: `vite-plugin-pwa vitest @vitest/coverage-v8 fake-indexeddb @playwright/test sharp exif-reader @resvg/resvg-js tsx @types/node`.
   Run `pnpm exec playwright install chromium webkit`.
6. `vite.config.ts`:
   - `base: process.env.VITE_BASE ?? '/'`
   - `server: { host: '127.0.0.1', port: 3874, strictPort: true }`; `preview: { host: '127.0.0.1', port: 4173 }`
   - `worker: { format: 'es' }`
   - plugins: react, tailwind, `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Biathlete Harness', short_name: 'Harness', display: 'standalone', start_url: './', scope: './' }, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,heic,wasm,json,webmanifest}'], maximumFileSizeToCacheInBytes: 20 * 1024 * 1024 } })`
   - a `transformIndexHtml` hook that injects the CSP meta (privacy §5) **only** for `vite build`.
7. `src/app/router.tsx`: `createHashRouter` with `/` → HomePage (h1 **Biathlete Harness**, link "Diagnostics") and
   `/diagnostics` → DiagnosticsPage.
8. `src/lib/cv/opencv.ts` (lazy singleton; the only file allowed an `any`-typed `OpenCv`):
   ```ts
   export type OpenCv = any;
   let p: Promise<OpenCv> | undefined;
   export function loadOpenCv(): Promise<OpenCv> {
     p ??= (async () => {
       const mod: any = await import('@techstark/opencv-js');
       let cv = mod.default ?? mod;
       if (typeof cv.then === 'function') cv = await cv;
       else if (!cv.Mat) await new Promise<void>(r => { cv.onRuntimeInitialized = () => r(); });
       return cv;
     })();
     return p;
   }
   ```
9. `src/workers/cv.worker.ts`: `Comlink.expose({ async ping() { const t = performance.now(); const cv = await loadOpenCv(); return { loadedMs: performance.now() - t, hasMat: typeof cv.Mat === 'function' }; } })`.
   `cv-client.ts`: `new Worker(new URL('./cv.worker.ts', import.meta.url), { type: 'module' })` wrapped with `Comlink.wrap`, as a singleton.
10. `checks-browser.ts`: each check returns `{ id, label, status: 'pass' | 'fail' | 'n/a', detail }`, run independently with try/catch:
    - `secure-context`: `window.isSecureContext`
    - `camera-api`: `!!navigator.mediaDevices?.getUserMedia` (don't request permission here)
    - `share-files`: `navigator.canShare?.({ files: [new File([pngBytes], 't.png', { type: 'image/png' })] })`
    - `storage-persist`: `navigator.storage?.persisted` exists → detail `persisted=<bool>`
    - `storage-estimate`: usage and quota in MB
    - `wake-lock`: `'wakeLock' in navigator`
    - `offscreen-canvas`: `typeof OffscreenCanvas !== 'undefined'`
    - `indexeddb`: open `asa-diagnostics`, put/get/delete a 1 MB `ArrayBuffer`, delete the DB
    - `cv-worker`: `ping()` → pass if `hasMat`, detail `loadedMs`
    - `svg-raster`: draw a 100×100 SVG red circle into a canvas via object URL (fallback data URL); `getImageData(50,50)`
      must be red; detail which path worked
    - `heic-decode`: load `diagnostics/tiny-sighting.heic` into an `<img>` → pass if `naturalWidth === 300`
    - `standalone`: `matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true`
    - `user-agent`: detail only.
11. `summarize.ts` (pure): `summarizeDiagnostics(results)` → `{ pass, fail, na, text }`, where `text` is one line per check,
    `<status> <id> <detail>`. The page shows a table plus **Copy report** (`navigator.clipboard.writeText`).
12. Scripts:
    ```json
    "dev": "vite",
    "dev:test": "VITE_FAKE_CAMERA=1 vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "check:privacy": "node scripts/check-privacy.mjs",
    "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm check:privacy"
    ```
13. `vitest.config.ts`: environment `node`, `include: ['tests/unit/**/*.test.ts']`, `setupFiles: ['fake-indexeddb/auto']`, alias `@`.
14. `playwright.config.ts`: `webServer: { command: 'pnpm dev:test', url: 'http://127.0.0.1:3874', reuseExistingServer: !process.env.CI }`;
    projects `mobile-chromium` (`devices['Pixel 7']`) and `mobile-webkit` (`devices['iPhone 15']`).
15. `scripts/check-privacy.mjs`:
    - fail if `git ls-files fixtures/private` prints anything
    - for each tracked or staged file (`git ls-files -co --exclude-standard`) ending in `.jpg .jpeg .png .heic .heif .tif .tiff`
      (not `node_modules`): `sharp(file).metadata()`; if it has `exif`, parse with `exif-reader` and fail when
      `(e.GPSInfo ?? e.gps)?.GPSLatitude` exists
    - print `privacy check passed (<n> images)`.
16. `ci.yml`: push and PR on ubuntu-latest, Node 22, pnpm; `pnpm install --frozen-lockfile`; `pnpm check`; `pnpm build`;
    `pnpm exec playwright install --with-deps chromium webkit`; `pnpm test:e2e`.
17. `pages.yml` exactly per privacy-storage-hosting §6.
18. README: a Development section (commands table from AGENTS.md; the Pages URL; "open `#/diagnostics` on the iPhone").

## Tests
- Unit: `summarizeDiagnostics` counts and text format.
- E2E (both projects): `/` shows **Biathlete Harness**. `#/diagnostics` shows rows for every check id. `indexeddb`,
  `cv-worker`, and `svg-raster` are `pass`. (`heic-decode` may fail in Chromium; assert only that the row exists.)

## Acceptance
```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:e2e
```
**Human required (owner):**
1. Enable GitHub Pages (Settings → Pages → Source: GitHub Actions). Push; wait for the deploy.
2. On the iPhone, open `https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics` in Safari, then Add to
   Home Screen and open it again from there.
3. Tap **Copy report** in both, and paste both reports into Completion notes.
4. Any `fail` on `cv-worker`, `svg-raster`, `heic-decode`, `indexeddb`, or `share-files` must be resolved or recorded as an
   Open question before M04.

## Pitfalls
- Don't use `BrowserRouter`; deep links 404 on GitHub Pages. Use hash routes.
- If OpenCV fails under the production CSP, follow privacy-storage-hosting §5 (add `'unsafe-eval'`, record why).
- Vite serves `public/` at the base path; reference assets relatively (`diagnostics/tiny-sighting.heic`, not `/diagnostics/...`).
- Never bind `0.0.0.0`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
