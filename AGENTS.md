# Agent guide: advanced-shooting-analysis

This guide is for any coding agent implementing this repo, including lower-reasoning models. Read it
fully before touching code.

## Golden rules

1. **One milestone at a time.** Pick the lowest-numbered `pending` milestone in
   [`docs/milestones/README.md`](docs/milestones/README.md) whose dependencies are all `done` (M20–M21 are
   optional; skip them unless the owner asks). Read that milestone file completely, then **only** the spec
   sections it lists under *Read first*.
2. **Specs are the source of truth.** Numbers, formulas, type names, file paths, routes, env vars, and string
   formats live in [`docs/spec/`](docs/spec/). Don't invent constants or rename anything.
   - If a milestone and a spec disagree, the **spec wins**. Record the conflict under *Open questions*.
   - If the spec is silent or ambiguous about something you need, **stop**. Add a bullet under *Open questions*
     and finish only the parts that don't depend on it. Never guess on scoring, geometry, privacy, auth, or
     credentials.
3. **Stay in scope.** *Out of scope* lists are binding. No drive-by refactors or renames. No new dependencies
   beyond those the milestone names (ask via *Open questions*).
4. **Tests come with the code.** Every spec test vector your milestone touches becomes a unit test with the
   exact expected value and the tolerance the spec states.
5. **Before marking done**, run `pnpm check` plus every command in *Acceptance*. All must pass. Fill in
   *Completion notes* with the commands run, results, and deviations.
6. **Update status** in `docs/milestones/README.md`: `pending` → `in-progress` → `done` (or `blocked: <reason>`).
7. **Commit once per milestone** on `main`, with message `MNN: <milestone title>`, and push. No PRs unless asked.
8. **Tier labels matter.** Work marked **Tier: high** or **Human required** must not be attempted by a
   low-reasoning agent beyond steps explicitly marked *safe for any tier*.

## Hard invariants (never violate)

- **Publish rule.** The only image that may leave the server to another party is a registered
  `CompositeArtifact` (`docs/spec/rendering-composite.md` §6), delivered to the owner's own browser for the
  owner to share. Source photos, working images, thumbnails, and per-target diagrams are served only to the
  authenticated owner, with `Cache-Control: private, no-store`. None of them ever goes to Garmin, Strava,
  CDNs, analytics, or any other third party.
- **Privacy.** Never commit `fixtures/private/`, workspace data, `.env*` (except `.env.example`), tokens, or
  credentials. Never log passphrases, Garmin passwords, MFA codes, cookies, or token contents. Committed
  images must have no GPS EXIF (`pnpm check:privacy`).
- **Auth.** Every page and API route except those listed in `docs/spec/access-deployment.md` §3 requires a
  valid session. Mutating routes also call `assertSameOrigin(req)`.
- **Network.** The Next.js server binds `127.0.0.1:3874` in every environment. HTTPS exposure is handled
  only by Tailscale (`docs/spec/access-deployment.md` §7–8). Never bind `0.0.0.0`.
- **No third-party runtime resources.** No external scripts, fonts, images, or analytics. Fonts are
  self-hosted (`next/font/local` or bundled files).
- **Units.** Target geometry is in **millimetres**, origin at the target centre, **+x right, +y up**.
  Image and CSS pixels are +y **down**. Convert only through `src/lib/geometry/transform.ts` and
  `src/lib/capture/overlay.ts`.
- **Determinism.** Pure modules (`src/lib/scoring`, `geometry`, `capture/overlay.ts`, `alignment`, `render`,
  `harness`) do no I/O and never call `Date.now()` or `Math.random()`. Pass time and ids in.

## Commands (after M01)

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server on http://127.0.0.1:3874 (use `tailscale serve` to test on the phone, see M08) |
| `pnpm check` | typecheck + lint + unit tests + privacy check (the gate for every milestone) |
| `pnpm test` / `pnpm test -- <path>` | Vitest unit tests |
| `pnpm test:e2e` | Playwright end-to-end tests (temp workspace, fake camera) |
| `pnpm build` | Production build |

## Repo map (target state)

```text
src/app/                 App Router pages; src/app/api/** route handlers
src/middleware.ts        auth gate (Web Crypto only); named src/proxy.ts on Next.js >= 16
src/components/          React components (shadcn primitives in components/ui)
src/lib/domain/          zod schemas + inferred types           (spec/data-model.md)
src/lib/defaults/        biathlon profile + template geometry   (spec/geometry-scoring.md §1)
src/lib/geometry/        px<->mm transforms, calibration scaling
src/lib/capture/         overlay layout math (pure) + browser camera helpers (client-only)
src/lib/scoring/         pure scoring, groups, splits, missing-round modes
src/lib/auth/            passphrase hashing, session tokens, same-origin guard
src/lib/workspace/       file-system repositories
src/lib/media/           ingest (decode), EXIF, capture time, image stats, lighting
src/lib/cv/              OpenCV.js calibration refine + hole detection
src/lib/render/          SVG diagrams, composite SVG, PNG rasterisation
src/lib/composite/       slot selection + composite build (CompositeArtifact)
src/lib/harness/         shooting trends (+ Garmin load when enabled)
src/lib/garmin/          OPTIONAL: provider interface, demo, live MCP, auth, alignment
tests/unit/  tests/e2e/  tests/helpers/
fixtures/reference/      committed, privacy-safe fixtures
fixtures/private/        gitignored originals (may be absent: tests must SKIP, not fail)
deploy/                  Dockerfile, compose, Tailscale serve config, backup script (M19)
docs/                    DESIGN, DESIGN-REVISIONS, PLAN, spec/, milestones/, reference/
```

## Private fixtures

```ts
import { hasPrivateFixture, privateFixturePath } from '../helpers/fixtures';
describe.skipIf(!hasPrivateFixture('IMG_5132.HEIC'))('HEIC decode (private fixture)', () => { /* ... */ });
```

## Style

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` in `src/lib`. Validate every JSON boundary
  (files, HTTP bodies, MCP results) with zod.
- Route handlers: `export const runtime = 'nodejs'`. Errors return `{ "error": { "code", "message" } }`.
- Mobile-first UI: tap targets ≥ 44 px, works one-handed in portrait, and must not break on desktop.
- Keep files under ~300 lines and pure logic out of React components.
