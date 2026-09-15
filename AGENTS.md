# Agent guide: advanced-shooting-analysis

This guide is for any coding agent implementing this repo, including lower-reasoning models. Read it
fully before touching code.

**What we're building (Phase 1):** a Vite + React web app that runs **entirely on the iPhone** (Home Screen
install, offline), with no backend. Code is hosted on GitHub Pages. **Phase 2** (M20–M22) wraps it with
Capacitor; don't start Phase 2 unless the owner asks.

## Golden rules

1. **One milestone at a time.** Pick the lowest-numbered `pending` milestone in
   [`docs/milestones/README.md`](docs/milestones/README.md) whose dependencies are all `done`. Read that
   milestone file completely, then **only** the spec sections it lists under *Read first*.
2. **Specs are the source of truth.** Numbers, formulas, type names, file paths, function names, store names,
   and string formats live in [`docs/spec/`](docs/spec/). Don't invent constants or rename anything.
   - If a milestone and a spec disagree, the **spec wins**. Record the conflict under *Open questions*.
   - If the spec is silent or ambiguous about something you need, **stop**. Add a bullet under *Open questions*
     and finish only the parts that don't depend on it. Never guess on scoring, geometry, privacy, or storage.
3. **Stay in scope.** *Out of scope* lists are binding. No drive-by refactors or renames. No new dependencies
   beyond those in `docs/PLAN.md` §3 or the milestone (ask via *Open questions*).
4. **Tests come with the code.** Every spec test vector your milestone touches becomes a unit test with the exact
   expected value and stated tolerance.
5. **Before marking done**, run `pnpm check` plus every command in *Acceptance*. All must pass. Fill in
   *Completion notes* with the commands, results, and deviations.
6. **Update status** in `docs/milestones/README.md`: `pending` → `in-progress` → `done` (or `blocked: <reason>`).
7. **Commit once per milestone** on `main`, with message `MNN: <milestone title>`, and push. No PRs unless asked.
8. **Tier labels matter.** Work marked **Tier: high** or **Human required** must not be attempted by a
   low-reasoning agent beyond steps explicitly marked *safe for any tier*.

## Hard invariants (never violate)

- **No backend, no runtime network calls.** The app may fetch only its own same-origin static assets. No APIs,
  analytics, CDNs, external fonts, or telemetry. The CSP in `index.html` enforces this.
- **Share rule.** The only image the app hands to the share sheet or a download is a stored `CompositeArtifact`
  (`docs/spec/rendering-composite.md` §6). Source photos leave the phone **only** inside a backup the owner
  explicitly exports (`docs/spec/privacy-storage-hosting.md` §3).
- **Repo privacy.** Never commit `fixtures/private/`, `.env*` (except `.env.example`), or real user data.
  Committed images must have no GPS EXIF (`pnpm check:privacy`).
- **Pure/adapter split.** Every pixel algorithm takes `RgbaImage { data: Uint8ClampedArray; width; height }`
  and has no DOM access. Only files named `*-browser.ts`, `src/workers/*`, React components, and
  `src/lib/capture/camera.ts` may touch `window`, `document`, canvas, or `navigator`.
- **IndexedDB transactions.** Prepare all data, including `await blob.arrayBuffer()`, **before** opening a
  transaction. Never `await` anything except IDB operations inside a transaction (it auto-commits).
- **Units.** Target geometry is in **millimetres**, origin at the target centre, **+x right, +y up**. Image and CSS
  pixels are +y **down**. Convert only via `src/lib/geometry/transform.ts` and `src/lib/capture/overlay.ts`.
- **Determinism.** Pure modules (`scoring`, `geometry`, `capture/overlay.ts`, `render`, `harness`, `backup/reminder.ts`,
  `sequence`) never call `Date.now()`, `new Date()`, or `Math.random()`. Services receive a `ServiceContext`
  (`docs/spec/data-model.md` §7).
- **Dev server** binds `127.0.0.1:3874`. The fake camera exists only when `VITE_FAKE_CAMERA=1` and must never be
  enabled in the Pages build.

## Commands (after M01)

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server on http://127.0.0.1:3874 |
| `pnpm dev:test` | Same with `VITE_FAKE_CAMERA=1` (used by Playwright) |
| `pnpm build` / `pnpm preview` | Production build / preview on 127.0.0.1:4173 |
| `pnpm check` | typecheck + lint + unit tests + privacy check (the gate for every milestone) |
| `pnpm test` / `pnpm test -- <path>` | Vitest unit tests (Node + fake-indexeddb) |
| `pnpm test:e2e` | Playwright (mobile Chromium + mobile WebKit) |

Testing on the iPhone: push to `main`. GitHub Pages deploys to
`https://komplexmojo.github.io/advanced-shooting-analysis/`. Open `#/diagnostics` there.

## Repo map (target state)

```text
index.html                    CSP meta, root element
src/main.tsx                  app bootstrap + service worker registration
src/app/router.tsx            createHashRouter route table
src/routes/                   page components (one folder per route)
src/components/               UI components (shadcn primitives in components/ui)
src/lib/domain/               zod schemas + types + nextStatus       (spec/data-model.md)
src/lib/defaults/             biathlon profile + template geometry   (spec/geometry-scoring.md §1)
src/lib/geometry/             mm<->px transforms, calibration scaling
src/lib/scoring/              pure scoring, groups, splits, missing-round modes
src/lib/capture/              overlay.ts (pure), camera.ts, fake-camera.ts, wake-lock-browser.ts, tilt.ts
src/lib/media/                format.ts, capture-time.ts, image-stats.ts, lighting.ts (pure); exif.ts; image-browser.ts
src/lib/store/                db.ts + repositories (idb) + persistence-browser.ts
src/lib/services/             ingest, photos, analysis, shares, sources, quick-start, demo
src/lib/cv/                   pure CV over RgbaImage (anchor, template-hint, rectify, holes, split-cluster) + opencv loader
src/workers/                  cv.worker.ts + cv-client.ts (Comlink)
src/lib/render/               SVG diagrams + composite SVG (pure); rasterize-browser.ts
src/lib/composite/            slot defaults, artifact brand, build
src/lib/share/                share-browser.ts
src/lib/backup/               export, import, reminder (pure)
src/lib/harness/              shooting summaries (pure)
src/lib/sequence/             ordering (pure)
tests/unit/  tests/e2e/  tests/helpers/
scripts/                      Node-only tools: check-privacy, render-samples, cv-eval, make-icons
public/                       demo/, dev-fixtures/, diagnostics/, icons/
fixtures/reference/           committed, privacy-safe fixtures
fixtures/private/             gitignored originals (may be absent: tests must SKIP, not fail)
docs/                         DESIGN, DESIGN-REVISIONS, PLAN, spec/, milestones/, reference/
```

## Private fixtures

```ts
import { hasPrivateFixture, privateFixturePath } from '../helpers/fixtures';
describe.skipIf(!hasPrivateFixture('IMG_5132.HEIC'))('uses the private original', () => { /* ... */ });
```

## Style

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` in `src/lib` (the OpenCV handle is typed as
  `OpenCv = any` in one place, `src/lib/cv/opencv.ts`). Validate data read from IndexedDB and backups with zod.
- Mobile-first UI: tap targets ≥ 44 px, portrait one-handed use, must not break on desktop.
- Keep files under ~300 lines and pure logic out of React components.
