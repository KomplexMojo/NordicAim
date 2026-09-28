# Agent guide: NordicAim

This guide is for any coding agent implementing this repo, including lower-reasoning models. Read it
fully before touching code.

**What we're building (MVP):** a Vite + React web app that runs **entirely on the iPhone**, with no backend. The user
experience is three steps: **take picture(s) → add metadata → receive analysis**. Behind the scenes an automatic
pipeline reviews the image, overlays it on the target template, pulls photo metadata, incorporates the user's metadata,
and generates the analysis. **Scoring is the core of the analysis** (`docs/spec/geometry-scoring.md`) and is never optional.
Code is hosted on GitHub Pages.

**Do not build anything listed in [`docs/BACKLOG.md`](docs/BACKLOG.md)** unless the owner asks. That includes the sequence player, harness trends, and a Capacitor shell. **Apple Health and Garmin integrations are out of scope entirely.**

## Golden rules

1. **One milestone at a time.** Pick the lowest-numbered `pending` milestone in
   [`docs/milestones/README.md`](docs/milestones/README.md) whose dependencies are all `done`. Read that milestone
   file completely, then **only** the spec sections it lists under *Read first*.
2. **Specs are the source of truth.** Numbers, formulas, type names, file paths, function names, store names, and
   string formats live in [`docs/spec/`](docs/spec/). Don't invent constants or rename anything.
   - If a milestone and a spec disagree, the **spec wins**. Record the conflict under *Open questions*.
   - If the spec is silent or ambiguous about something you need, **stop**. Add a bullet under *Open questions*
     and finish only the parts that don't depend on it. Never guess on scoring, geometry, privacy, or storage.
3. **Stay in scope.** *Out of scope* lists are binding. No drive-by refactors. No new dependencies beyond
   `docs/PLAN.md` §3 or the milestone.
4. **Tests come with the code.** Every spec test vector your milestone touches becomes a unit test with the exact
   expected value and stated tolerance.
5. **Before marking done**, run `pnpm check` plus every command in *Acceptance*. All must pass. Fill in
   *Completion notes* with the commands, results, and deviations.
6. **Update status** in `docs/milestones/README.md`: `pending` → `in-progress` → `done` (or `blocked: <reason>`).
7. **Commit once per milestone** on `main`, with message `MNN: <milestone title>`, and push. No PRs unless asked.
8. **Tier labels matter.** Work marked **Tier: high** or **Human required** must not be attempted by a
   low-reasoning agent beyond steps explicitly marked *safe for any tier*.

## Orchestrated runs (`run-milestones` workflow)

When milestones are run by the `run-milestones` workflow (`.claude/workflows/run-milestones.js`):

1. A **selector** picks the next ready milestone from `docs/milestones/README.md`. The *Implementer* and *Reviewer* columns set
   each agent's model and effort.
2. The **`milestone-implementer`** agent (`.claude/agents/`) does the work. It **does not commit, push, or mark `done`**
   (overrides golden rules 6–7) and returns human-required steps as owner checks.
3. The **`milestone-reviewer`** agent verifies independently (read-only). Up to 2 fix rounds.
4. A **finalizer** records owner checks in `docs/milestones/OWNER-CHECKS.md`, sets the status, then commits `MNN: <title>` and pushes.
5. The run stops at owner-gate milestones, blocking open questions, or a review that still fails after 2 fixes.

To start: ask Claude to run the `run-milestones` workflow (`mode: "run"`, the default; `mode: "step"` does one milestone;
`only: "M03"` targets one milestone).

## Owner working agreements

- **Never edit tracked files while a `run-milestones` run is active.** Its finalizer runs `git add -A` and commits
  everything under the milestone's name, so a concurrent edit lands in the wrong commit. Check `git status --short`
  and whether the run's agent transcripts were touched in the last few minutes. If a run is live, write the decision
  to `fixtures/private/drafts/<name>.md` (gitignored) with an APPLY section, then apply and commit it after the run stops.
  A run that died from a usage limit ("implementer did not return") may leave a half-edited tree, so check before
  relaunching. The finalizer can also leave a truncated `blocked: …` cell in `docs/milestones/README.md`. Fix that cell
  when you resolve the block.
- **New owner adjustments become GitHub issues, not mid-run edits.** File them on this repo with
  `gh issue create --label owner-request` (plus `enhancement` or `bug`). Quote the owner's words and record the
  decisions, storage consequences, defaults to confirm, and acceptance criteria, so a sweep can turn the issue straight
  into a milestone. The repo is public, so issue text must never hold photo content, GPS, or anything from
  `fixtures/private/`. Still answer the owner's question right away, and still act at once on anything that blocks the
  current run. Sweep with `gh issue list --label owner-request`.

## Project state (as of 2026-09-27)

- **MVP milestones M01–M25 are done** and deployed to Pages. The app is named **Nordic Aim** (REV-45). The repo and the
  Pages URL keep their old names on purpose.
- **Never tag or push `v0.1.0` without the owner's explicit sign-off.** The remaining release steps belong to the owner:
  device checks, a real range session end to end, the §9 timings, and the sign-off box. They are tracked in
  `docs/RELEASE-v0.1.0.md` §5/§7 and `docs/milestones/OWNER-CHECKS.md`. Don't re-run finished milestones.
- **M26** (template reference photos) is `blocked` on owner design decisions (see its *Decisions* section).
- **Detection benchmark (2026-09-27):** `pnpm cv:eval` gates on the owner's **production set**, 12 confirmed targets
  from three range sessions on a coloured backing (`fixtures/private/range-2026-09-26/`): recall **92.2%**, precision
  **90.5%** (floors 92% / 90%). That is the standard case. The 46 older photos below are the **worse case** (straight
  off the backing board, bad angles, no backing): reported, not gated, and not to be optimised around.
- **Worse-case baseline:** the owner's 2026-09-17 re-rating of all 46 photos (`pnpm review:detection`, export in
  `fixtures/private/review/`) measured **recall 76.9%** and **precision 94.7%**. These figures supersede the v1 labels
  and the R4 gate's own numbers. Most false positives come from printed form fields and text, holes in the backing
  board, and holes from neighbouring targets, not from thresholds. Relaxing REV-27 to recover misses was tested and
  rejected (`docs/DESIGN-REVISIONS.md`). Sample-set corrections: pull IMG_5084 (it has several targets) and treat
  IMG_5153 as a duplicate of IMG_5152.
- **Cloud sessions have no `fixtures/private/`** (the original HEICs, reviews and drafts) unless the private
  `KomplexMojo/NordicAim-fixtures` repo is attached to the session; then the SessionStart hook clones it there. Without it,
  tests that need it skip themselves, so work that measures detection accuracy must run on the owner's Mac.

## Hard invariants (never violate)

- **No backend, no runtime network calls** except the app's own same-origin static assets. No APIs, analytics, CDNs,
  external fonts, or telemetry (the CSP enforces this).
- **Share rule.** The only images handed to the share sheet or a download are a stored `CompositeArtifact` (the session
  summary image, `docs/spec/rendering-composite.md` §6) and a stored `TrendsArtifact` (the coach image, `docs/spec/analysis.md`
  §5, REV-124), each only on the owner's tap. Photos never leave the phone, with one exception (REV-63): a
  **backup the owner explicitly creates** (`docs/spec/backup.md`) may contain photos. Nothing else may leave the phone, and
  nothing is ever sent anywhere automatically.
- **Repo privacy.** Never commit `fixtures/private/`, `.env*` (except `.env.example`), or user data. Committed images
  carry no GPS EXIF (`pnpm check:privacy`).
- **Pure/adapter split.** Pixel algorithms take `RgbaImage { data: Uint8ClampedArray; width; height }` and don't touch
  the DOM. Only `*-browser.ts` files, `src/workers/*`, React components, and `src/lib/capture/camera.ts` may use
  `window`, `document`, canvas, or `navigator`.
- **IndexedDB transactions.** Prepare all data (including `await blob.arrayBuffer()`, rasterising, hashing, and worker
  calls) **before** opening a transaction. Inside it, only await IDB operations.
- **Never overwrite user edits.** The pipeline must not replace shots or a calibration whose `source` is `'manual'`
  (`docs/spec/analysis-pipeline.md` §8).
- **Units.** Target geometry is in **millimetres**, origin at the target centre, **+x right, +y up**. Pixels are +y
  **down**. Convert only via `src/lib/geometry/transform.ts` and `src/lib/capture/overlay.ts`.
- **Determinism.** Pure modules (`scoring`, `geometry`, `capture/overlay.ts`, `render`, `domain/status.ts`,
  `pipeline/plan.ts`) never call `Date.now()`, `new Date()`, or `Math.random()`. Services receive a `ServiceContext`.
- **Dev server** binds `127.0.0.1:3874`. The fake camera and `window.__asaTest` exist only when `VITE_FAKE_CAMERA=1`,
  never in the Pages build.

## Commands (after M01)

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server on http://127.0.0.1:3874 |
| `pnpm dev:test` | Same with `VITE_FAKE_CAMERA=1` (Playwright) |
| `pnpm build` / `pnpm preview` | Production build / preview on 127.0.0.1:4173 |
| `pnpm check` | typecheck + lint + unit tests + privacy check (every milestone's gate) |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright (mobile Chromium + mobile WebKit) |
| `pnpm docs:screens` | Regenerate the README and guide screenshots (`docs/assets/`) from the fake-camera demo data |

iPhone testing: push to `main`, then open `https://komplexmojo.github.io/NordicAim/` (use `#/diagnostics` for checks).

## Repo map (target state)

```text
index.html                     CSP meta, root element
src/main.tsx                   bootstrap, service worker registration, pipeline resume
src/app/router.tsx             createHashRouter route table (routes: spec/analysis-pipeline.md §1)
src/routes/                    home, patterns, analysis, capture, metadata, results, target, review, settings, diagnostics (sessions/ is only the redirect)
src/components/                UI components (shadcn primitives in components/ui)
src/lib/domain/                zod schemas, types, categorization helpers, status.ts (photoStatus)
src/lib/defaults/              biathlon profile + template geometry
src/lib/geometry/              mm<->px transforms, calibration scaling
src/lib/scoring/               pure scoring, groups, splits, missing-round modes, characteristics (observed patterns)
src/lib/backup/  src/lib/patterns/   backup create/restore/verify/rebuild (REV-63, REV-125/126); cross-session Patterns collect/summarize
src/lib/analysis/              Analysis trends (trend, chart incl. least-squares), coach image data and averages (REV-123/124, REV-128–132)
src/lib/capture/               overlay.ts (pure), camera.ts, fake-camera.ts, wake-lock-browser.ts
src/lib/media/                 format, capture-time, image-stats, lighting (pure); exif.ts; image-browser.ts
src/lib/store/                 db.ts + repositories (idb) + persistence-browser.ts
src/lib/services/              sessions, ingest, photos, quick-start, shares
src/lib/pipeline/              plan.ts (pure), runner-browser.ts, stage-a.ts, stage-b.ts, hooks.ts, events.ts
src/lib/cv/                    pure CV over RgbaImage (anchor, sharpness, template-hint, rectify, holes, split-cluster) + opencv loader
src/workers/                   cv.worker.ts + cv-client.ts (Comlink)
src/lib/render/                SVG diagrams + summary image SVG (pure); rasterize-browser.ts
src/lib/composite/             slot selection, artifact brand, build
src/lib/share/                 share-browser.ts
tests/unit/  tests/e2e/  tests/helpers/
scripts/                       Node-only: check-privacy, render-samples, cv-eval
public/                        demo/, dev-fixtures/, diagnostics/, icons/
fixtures/reference/            committed, privacy-safe fixtures
fixtures/private/              gitignored originals (tests must SKIP if absent)
docs/                          DESIGN, DESIGN-REVISIONS, BACKLOG, PLAN, spec/, milestones/, reference/
```

## Style

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` in `src/lib` except `OpenCv` in `src/lib/cv/opencv.ts`.
  Validate data read from IndexedDB with zod.
- Mobile-first UI: tap targets ≥ 44 px, portrait one-handed use, and it must still work on desktop.
- Keep files under ~300 lines and pure logic out of React components.
