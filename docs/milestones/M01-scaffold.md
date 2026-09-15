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

- The current `shadcn@latest init` CLI (v4.21.0) targets a newer shadcn generation than the milestone's step 4
  implied: it writes a `radix-nova` preset (`components.json` `style: "radix-nova"`) and pulls in
  `@fontsource-variable/geist`, `tw-animate-css`, `class-variance-authority`, `cn`, `radix-ui`, `lucide-react`,
  and (for the `sonner` component) `next-themes`, none of which are listed in the milestone or `docs/PLAN.md` §3.
  All are self-hosted (no CDN/network calls) and installed non-interactively with `--template vite --base radix
  -p nova -y`, matching the spirit of "shadcn init (Vite)" — but they are additional dependencies beyond what's
  named in the milestone. Not blocking; flagging per golden rule 3 ("no new dependencies beyond docs/PLAN.md §3
  or the milestone") in case the owner wants a different preset/base or to trim these.
- The scaffolded `shadcn` CLI also wrote its component files to a literal `./@/components/ui` and `./@/lib`
  directory instead of resolving the `@/*` alias to `src/*` (a quirk of this CLI version's alias detection). I
  moved the generated files into `src/components/ui` and `src/lib/utils.ts` by hand and deleted the stray `@/`
  directory; imports inside those files use bare specifiers (`"cn"`, `"radix-ui"`, etc.) so no path rewriting was
  needed. Confirmed no `./@` directory remains and `pnpm check`/`pnpm build` both pass.
- `docs/spec/rendering-composite.md` §2 requires SVG text to use the system font stack
  (`-apple-system, BlinkMacSystemFont, …`) with **no web fonts**. That applies to the diagram/summary-image
  renderer (a later milestone), not to this app shell's UI chrome — shadcn's default Geist font is only used for
  on-screen UI text, not for any SVG. Flagging so the M05/M09/M12 implementers don't reuse the Geist font for
  SVG text.
- `IndexedDB.deleteDatabase` inside the `indexeddb` diagnostic check resolves on `onblocked` (treated as
  non-fatal) rather than failing the check, since a blocked delete does not indicate the read/write roundtrip
  itself failed. Not in the spec; flagging the interpretation.

- **Owner decision (2026-09-15):** keep the shadcn `radix-nova` preset and its self-hosted dependencies; recorded as approved in `docs/PLAN.md` D1. The alias-quirk workaround and the `order: 'post'` CSP hook are accepted as implemented.

## Completion notes

Implemented exactly per the Steps above (scaffold copied from `pnpm create vite@latest --template react-ts`,
Tailwind v4 + shadcn init, all runtime/dev deps, `vite.config.ts` CSP/PWA/worker config, hash router, CV
worker+client, all 13 diagnostics checks, `summarizeDiagnostics`, `check-privacy.mjs`, CI + Pages workflows,
README Development section). See Open questions above for the two deviations worth the owner's attention
(shadcn CLI's current preset/deps, and its alias-resolution quirk).

One implementation note not covered by the spec: the `transformIndexHtml` CSP-injection hook had to use
`order: 'post'` rather than `'pre'` — with Vite 8/rolldown-vite, `ctx.bundle` (the check the spec's pseudo-code
implies for "build only") is not yet populated during the `'pre'` phase, so the CSP meta tag was silently
dropped. `order: 'post'` injects it correctly (verified below) while leaving `pnpm dev`/`pnpm dev:test` free of
the CSP meta tag, as required.

Commands run (all pass):

```
$ pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped

$ pnpm check
tsc -b --pretty false                        # 0 errors
eslint .                                     # 0 errors, 3 warnings (shadcn-generated ui/badge.tsx,
                                              #   ui/button.tsx, ui/toggle.tsx — react-refresh/only-export-components)
vitest run                                   # 3 tests passed (tests/unit/diagnostics/summarize.test.ts)
node scripts/check-privacy.mjs               # "privacy check passed (6 images)"

$ pnpm build
tsc -b && vite build                         # succeeds; dist/index.html carries the CSP meta tag
                                              # (confirmed absent from `pnpm dev`/`pnpm dev:test` output)

$ pnpm test:e2e
playwright test                              # 4/4 passed: mobile-chromium × {home, diagnostics},
                                              #   mobile-webkit × {home, diagnostics}
```

Diagnostics results observed under Playwright's headless mobile-chromium and mobile-webkit emulation (not the
real iPhone — see Human required below):

- **mobile-chromium** (Pixel 7 emulation, headless Chrome): pass — secure-context, camera-api, storage-estimate,
  wake-lock, offscreen-canvas, indexeddb, cv-worker (hasMat=true, ~870ms), svg-raster (object-url path).
  n/a — share-files (`canShare` unavailable in this Chromium build), standalone, user-agent (informational).
  fail — storage-persist (`persisted=false`, expected under headless automation without a real persistent-storage
  grant), heic-decode (Chromium has no native HEIC decoder — expected; iOS Safari does).
- **mobile-webkit** (iPhone 15 emulation): pass — secure-context, camera-api, share-files, storage-estimate,
  wake-lock, offscreen-canvas, indexeddb, cv-worker (hasMat=true, ~640ms), svg-raster (object-url path),
  heic-decode (naturalWidth=300). n/a — standalone, user-agent. fail — storage-persist (same headless-automation
  caveat as above).
- Acceptance-required checks (indexeddb, cv-worker, svg-raster pass; heic-decode row exists) hold on both
  projects, matching the milestone's Tests section.

`pnpm dlx shadcn@latest init --template vite --base radix -p nova -y` then
`pnpm dlx shadcn@latest add button card input label select dialog badge sonner separator slider sheet
toggle-group progress textarea -y` were used non-interactively for shadcn setup (see Open questions for the
resulting deviations). `pnpm approve-builds --all` was run once to approve `esbuild`'s postinstall script
(records the approval in the generated `pnpm-workspace.yaml`, committed so CI gets the same behavior).

**Human required (owner) — not run by this agent:**
1. Enable Pages (Settings → Pages → Source: GitHub Actions).
2. Push to `main`, then open `https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics` on the
   iPhone, in Safari and as a Home Screen app.
3. Paste both **Copy report** outputs into these Completion notes.
4. Resolve any `fail` on `cv-worker`, `svg-raster`, `heic-decode`, `indexeddb`, or `share-files` on the real
   device, or record it as an Open question. (`storage-persist` failing under Playwright's headless automation,
   as observed above, is expected and not itself a signal about real Safari behavior — the real-device run is
   what determines whether that check needs follow-up.)

### Owner device report (2026-09-15, iPhone Home Screen app)

User agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1`. Summary: **12 pass · 1 fail · 1 n/a**.

| Check | Result | Detail |
|---|---|---|
| secure-context | pass | isSecureContext=true |
| camera-api | pass | getUserMedia=true |
| share-files | pass | canShare(files)=true |
| storage-persist | pass | persisted=true |
| storage-estimate | pass | usage=0.8MB quota=39321.6MB |
| wake-lock | pass | wakeLock=true |
| offscreen-canvas | pass | OffscreenCanvas=true |
| indexeddb | pass | roundtrip 1MB ArrayBuffer ok=true |
| **cv-worker** | **fail** | `|this| is not a Promise` |
| svg-raster | pass | path=object-url rgb=255,0,0 |
| heic-decode | pass | naturalWidth=300 |
| ingest-pipeline | pass | working=1200x1600 thumb=360x480 |
| standalone | pass | standalone=true |
| user-agent | n/a | (above) |

**cv-worker follow-up (root cause and fix, 2026-09-15):** reproduced on the production build in WebKit ("|this| is not a Promise") and Chromium ("Promise.prototype.then called on incompatible receiver"). The dev server passed because it bundles OpenCV differently. **Cause:** Vite 8 / rolldown compiled `await import('@techstark/opencv-js')` to `import(chunk).then(e => interop(e.default))`. The interop helper wraps OpenCV's exported Promise in an object inheriting from `Promise.prototype`, and adopting it from the `.then` callback calls `Promise.prototype.then` on a non-Promise. **Fix:** `src/lib/cv/opencv-entry.ts` imports OpenCV statically and exposes it through a plain function, and `loadOpenCv()` (`resolveOpenCv`) unwraps `.default` before awaiting and only awaits genuine Promises. Unit tests: `tests/unit/cv/opencv-loader.test.ts`. Production regression test: `pnpm test:e2e:prod` (also in CI). The CSP was **not** the cause: the worker passes with and without `'unsafe-eval'`, so the strict CSP is kept (privacy-storage-hosting §3). The owner needs to re-run diagnostics on the iPhone after deploy to confirm. The Safari-tab (non-standalone) report is still to come.
