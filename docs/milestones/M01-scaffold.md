# M01: Scaffold, diagnostics, CI, Pages deploy

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| — | low | M | foundation |

## Goal
A Vite + React app skeleton with every tool and quality gate working, deployed to GitHub Pages, plus a **diagnostics
page** that verifies the risky iPhone capabilities (OpenCV worker under CSP, SVG→PNG, HEIC, share, storage) before any
feature work.

## Read first
- `/AGENTS.md` (all)
- `docs/PLAN.md` §3
- `docs/spec/privacy-storage-hosting.md` §1–§4
- `docs/spec/rendering-composite.md` §2

## In scope
Vite/React/TS/Tailwind/shadcn, hash router, Vitest (+ fake-indexeddb), Playwright (mobile Chromium + WebKit), ESLint,
scripts, runtime deps, CV worker `ping`, diagnostics page, CSP hook, PWA plugin skeleton, privacy check, CI, Pages workflow.

## Out of scope
Domain logic and feature screens.

## Files
- `package.json`, `.npmrc`, `.nvmrc`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`
- `index.html`, `src/main.tsx`, `src/index.css`, `src/app/router.tsx`
- `src/routes/home/HomePage.tsx` (placeholder), `src/routes/diagnostics/DiagnosticsPage.tsx`
- `src/lib/diagnostics/checks-browser.ts`, `src/lib/diagnostics/summarize.ts` (pure)
- `src/lib/cv/opencv.ts`, `src/workers/cv.worker.ts`, `src/workers/cv-client.ts`
- `public/diagnostics/tiny-sighting.heic` (copy of `fixtures/reference/tiny-sighting.heic`)
- `public/dev-fixtures/sighting.jpg`, `precision.jpg` and `public/demo/sighting.jpg`, `precision.jpg` (copies of the `docs/reference` JPEGs)
- `scripts/check-privacy.mjs`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml`
- `tests/unit/diagnostics/summarize.test.ts`, `tests/e2e/smoke.spec.ts`, README Development section

## Steps
1. Scaffold in a temp dir: `pnpm create vite@latest /tmp/asa-scaffold --template react-ts`. Copy everything except `.git`,
   `README.md`, and `.gitignore`. Merge `.gitignore` lines (add `dist/`).
2. `.npmrc` `save-exact=true`; `.nvmrc` `22`; `package.json` `"packageManager": "pnpm@10.33.0"`, `"engines": { "node": ">=22" }`,
   `"version": "0.1.0"`.
3. TS `strict` + `noUncheckedIndexedAccess`; alias `@/*` → `src/*` and `@fixtures/*` → `fixtures/reference/*` (tsconfig, Vite, Vitest).
4. Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`). shadcn init (Vite), then add
   `button card input label select dialog badge sonner separator slider sheet toggle-group progress textarea`.
5. Runtime deps: `react-router zod idb exifr comlink @techstark/opencv-js`.
   Dev deps: `vite-plugin-pwa vitest @vitest/coverage-v8 fake-indexeddb @playwright/test sharp exif-reader @resvg/resvg-js tsx @types/node`.
   Run `pnpm exec playwright install chromium webkit`.
6. `vite.config.ts`:
   - `base: process.env.VITE_BASE ?? '/'`
   - `server: { host: '127.0.0.1', port: 3874, strictPort: true }`, `preview: { host: '127.0.0.1', port: 4173 }`
   - `worker: { format: 'es' }`
   - `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Biathlete Harness', short_name: 'Harness', display: 'standalone', start_url: './', scope: './' }, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,heic,wasm,json,webmanifest}'], maximumFileSizeToCacheInBytes: 20 * 1024 * 1024 } })`
   - a `transformIndexHtml` hook injecting the CSP (privacy §3) only for build.
7. Router: `createHashRouter` with `/` (h1 **Biathlete Harness**, link "Diagnostics") and `/diagnostics`.
8. `src/lib/cv/opencv.ts`:
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
9. `cv.worker.ts`: `Comlink.expose({ async ping() { const t = performance.now(); const cv = await loadOpenCv(); return { loadedMs: performance.now() - t, hasMat: typeof cv.Mat === 'function' }; } })`.
   `cv-client.ts`: a singleton `Comlink.wrap(new Worker(new URL('./cv.worker.ts', import.meta.url), { type: 'module' }))`.
10. `checks-browser.ts`: each check returns `{ id, label, status: 'pass' | 'fail' | 'n/a', detail }`, each in its own try/catch:
    - `secure-context`
    - `camera-api` (`!!navigator.mediaDevices?.getUserMedia`)
    - `share-files` (`navigator.canShare?.({ files: [pngFile] })`)
    - `storage-persist` (detail `persisted=`) and `storage-estimate` (MB)
    - `wake-lock`
    - `offscreen-canvas`
    - `indexeddb` (open `asa-diagnostics`, put/get/delete a 1 MB ArrayBuffer, delete DB)
    - `cv-worker` (ping → `hasMat`; detail `loadedMs`)
    - `svg-raster` (100×100 red circle SVG → canvas via object URL, fallback data URL; `getImageData(50,50)` red; detail which path)
    - `heic-decode` (`diagnostics/tiny-sighting.heic` → `<img>` `naturalWidth === 300`)
    - `standalone`
    - `user-agent` (detail only).
11. `summarize.ts`: `summarizeDiagnostics(results)` → `{ pass, fail, na, text }` (one line per check: `<status> <id> <detail>`).
    The page shows a table plus **Copy report**.
12. Scripts:
    ```json
    "dev": "vite", "dev:test": "VITE_FAKE_CAMERA=1 vite",
    "build": "tsc -b && vite build", "preview": "vite preview",
    "typecheck": "tsc -b --pretty false", "lint": "eslint .",
    "test": "vitest run", "test:e2e": "playwright test",
    "check:privacy": "node scripts/check-privacy.mjs",
    "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm check:privacy"
    ```
13. Vitest: environment `node`, `include: ['tests/unit/**/*.test.ts']`, `setupFiles: ['fake-indexeddb/auto']`.
14. Playwright: `webServer: { command: 'pnpm dev:test', url: 'http://127.0.0.1:3874', reuseExistingServer: !process.env.CI }`;
    projects `mobile-chromium` (Pixel 7) and `mobile-webkit` (iPhone 15).
15. `check-privacy.mjs`:
    - fail if `git ls-files fixtures/private` prints anything
    - for each tracked or staged `.jpg .jpeg .png .heic .heif .tif .tiff` (not `node_modules`): sharp `metadata()`; if `exif`, parse with
      `exif-reader` and fail when `(e.GPSInfo ?? e.gps)?.GPSLatitude` exists
    - print `privacy check passed (<n> images)`.
16. `ci.yml`: push/PR, Node 22, pnpm, frozen install, `pnpm check`, `pnpm build`, Playwright install (`--with-deps chromium webkit`), `pnpm test:e2e`.
17. `pages.yml` per privacy §4.
18. README Development section (commands, Pages URL, "open `#/diagnostics` on the iPhone").

## Tests
- Unit: `summarizeDiagnostics`.
- E2E (both projects): home heading; diagnostics rows for every check; `indexeddb`, `cv-worker`, `svg-raster` pass (`heic-decode` row exists).

## Acceptance
```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:e2e
```
**Human required (owner):**
1. Enable Pages (Settings → Pages → Source: GitHub Actions).
2. Open `https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics` on the iPhone, in Safari and as a Home Screen app.
3. Paste both **Copy report** outputs into Completion notes.
4. Resolve any `fail` on `cv-worker`, `svg-raster`, `heic-decode`, `indexeddb`, or `share-files`, or record it as an Open question.

## Pitfalls
- Hash routes only (deep links 404 on Pages otherwise).
- Reference public assets relatively (`diagnostics/…`, not `/diagnostics/…`).
- Never bind `0.0.0.0`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
