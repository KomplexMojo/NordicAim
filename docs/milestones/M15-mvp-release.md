# M15: Install, offline, polish, MVP release

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M13, M14 | low | M | release |

## Goal
The three-step MVP is installable to the Home Screen, works offline, has a clean consistent UI, meets the performance budget on the
owner's iPhone, is verified end to end, and is tagged `v0.1.0`.

## Read first
- `docs/spec/analysis-pipeline.md` §1, §9
- `docs/spec/rendering-composite.md` §1 (palette → UI tokens)
- `docs/spec/privacy-storage-hosting.md` §3–§6
- `docs/DESIGN-REVISIONS.md` (current scope), `docs/BACKLOG.md` (don't build)

## In scope
Manifest and icons, theme tokens, basic layout (header, safe areas, consistent buttons), offline e2e, basic accessibility, stage timing
display (`debug=1`), journey e2e, release evidence document, tag.

## Out of scope
Backlog B11 visual polish (illustrated landing, bottom nav, update prompt), any other backlog item.

## Files
- `vite.config.ts` (full manifest: name, short_name, description, `display: 'standalone'`, `start_url`/`scope` `./`, `background_color`
  `#F7FAFD`, `theme_color` `#1F2630`, icons 192/512/maskable)
- `index.html` (apple-touch-icon, `apple-mobile-web-app-capable`, status-bar style, theme-color)
- `scripts/make-icons.ts` (sharp; concentric-ring motif) → `public/icons/*`
- `src/index.css` (palette → shadcn variables), `src/components/layout/AppHeader.tsx`
- `src/lib/pipeline/timing.ts` (records per-job durations in memory; shown in `debug=1`)
- `playwright.offline.config.ts` + `"test:e2e:offline"` (webServer `pnpm build && pnpm preview`, with `VITE_FAKE_CAMERA=1` for this build only)
- `tests/e2e/offline.spec.ts`, `a11y.spec.ts` (`@axe-core/playwright`), `journey.spec.ts`
- `docs/RELEASE-v0.1.0.md`, `README.md` (status)

## Steps
1. Theme: palette tokens → shadcn variables (background `page`, card `panel`, primary `accent`, foreground `textPrimary`, muted
   `textSecondary`, border `panelBorder`); `AppHeader` in charcoal `header` with the app name and a Home link; `env(safe-area-inset-*)`
   padding. System font stack, bold tabular numerals for scores.
2. Manifest, icons, and iOS meta tags.
3. `timing.ts`: the runner records `{ kind, photoId, ms }`; `debug=1` shows the last 10 on the results screen.
4. Accessibility basics: contrast ≥ 4.5:1, focus-visible rings, `aria-label` on icon buttons, tap targets ≥ 44 px.
5. `journey.spec.ts` (both projects):
   1. `#/` → Start & capture → fake precision (Prone) and fake sighting (Both 5/5)
   2. Done → metadata → Analyze → `waitForIdle`
   3. both cards reach a terminal status
   4. replace shots with the fixture shots via `__asaTest.setShots` (flow test, not CV accuracy) → `waitForIdle` → precision `72 / 100 · X 1`
   5. summary image visible → Share → download event.
6. `offline.spec.ts` (preview build):
   1. load `#/` → wait for `navigator.serviceWorker.ready`
   2. `context.setOffline(true)` → reload
   3. `loadDemo` → results with scores and the summary image render offline
   4. the diagnostics `cv-worker` check passes offline.
7. `docs/RELEASE-v0.1.0.md`: a table mapping each MVP step (REV-15/16/20) and each DESIGN delivery-checklist bullet to
   done / changed-by-REV / backlog, with evidence (test files, generated images, milestone Completion notes); the §9 performance
   budget table with the owner's measured values; a sign-off checkbox.
8. README: status "v0.1.0 MVP", install steps.
9. After the owner signs off: `git tag v0.1.0 && git push origin v0.1.0`.

## Tests
- `a11y.spec.ts`: axe on home, metadata, results, target detail, adjust, diagnostics → no serious or critical violations.
- `offline.spec.ts` and `journey.spec.ts` as above; all earlier tests still pass.

## Acceptance
```bash
pnpm check
pnpm build
pnpm test:e2e
pnpm test:e2e:offline
```
**Human required (owner):**
1. Add to Home Screen; turn on airplane mode.
2. At a real range session, photograph sighting and precision targets.
3. Add metadata → Analyze → check the scores against your own count → share the summary image → attach in Garmin Connect.
4. Record the stage timings from `debug=1` against the §9 budget.
5. Sign off `docs/RELEASE-v0.1.0.md`.

## Pitfalls
- Workbox must precache the OpenCV chunk (20 MB limit set in M01); verify it in the build output.
- The offline preview build enables `VITE_FAKE_CAMERA=1`; the Pages workflow must never do this.
- Don't tag before sign-off.

## Open questions
_(none)_

## Completion notes

**Implemented:**
- Manifest: `description`, `background_color` (`#F7FAFD`), `theme_color` (`#1F2630`), and 192/512/maskable icons
  (`vite.config.ts`, `scripts/make-icons.ts` → `public/icons/*`, run via `pnpm make:icons`).
- `index.html`: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `theme-color`, `viewport-fit=cover`.
- Theme: `rendering-composite.md` §1 palette wired into `src/index.css` shadcn tokens exactly as named in the
  milestone (`page`→background, `panel`→card, `accent`→primary via the readable `accentText` shade, `textPrimary`→
  foreground, `textSecondary`→muted, `panelBorder`→border); `AppHeader` (`src/components/layout/AppHeader.tsx`)
  wired into `AppShell`; `:focus-visible` ring; `.tabular-score` applied to both target-headline elements.
- `src/lib/pipeline/timing.ts`: records `{kind, photoId, ms}` per job from `runner-browser.ts`; shown on
  `#/sessions/:sid/results?debug=1` (`TimingDebugPanel`).
- `tests/e2e/journey.spec.ts`, `a11y.spec.ts`, `offline.spec.ts` + `playwright.offline.config.ts` +
  `pnpm test:e2e:offline`. `playwright.config.ts` now excludes `offline.spec.ts` (needs the production build's
  service worker, not the dev server).
- `docs/RELEASE-v0.1.0.md` and `README.md` status/install/commands updated.

**Deviation from the literal spec text:** using `accent` (`#4B94C3`) directly for `--primary`/link text/`--ring`
gives only 3.17:1 contrast on `page` (axe: serious violation) and 3.32:1 for white-on-primary buttons. Used
`accentText` (`#2F6E99`, rendering-composite.md §1, "multiplicity labels") instead — same hue, already in the
palette, 5.26:1 on `page` and 5.51:1 for white text on it. `accent` itself stays available as `--accent-color`
for non-text decorative use. Also darkened the pre-existing (non-palette) shadcn `--destructive` token from
`oklch(0.577 0.245 27.325)` to `#B91C1C`: the diagnostics "fail" badge (`text-destructive` on `bg-destructive/10`)
was 3.81:1.

**Commands run:**
- `pnpm check` — pass (typecheck, lint — 4 pre-existing warnings, 0 errors — 814 unit tests, privacy check).
- `pnpm build` — pass; workbox precache 21 entries / 17,325.75 KiB, includes the OpenCV worker chunk
  (`opencv-entry-*.js`, ~15.5 MB) under the 20 MB per-file cap (M01).
- `pnpm test:e2e` — 40/40 pass on both `mobile-chromium` and `mobile-webkit` (includes the new `journey.spec.ts`
  and `a11y.spec.ts`; `offline.spec.ts` is excluded from this config by design).
- `pnpm test:e2e:offline` — pass. `mobile-chromium` runs the full offline flow end to end; `mobile-webkit` is
  skipped there with a stated reason (`test.skip`) — headless WebKit in this sandbox throws "encountered an
  internal error" on *any* navigation (`reload()` or `goto()`) once `context.setOffline(true)` is set, before
  the app's own code runs at all (confirmed with both `reload()` and `goto()`; not an app bug). The owner's
  airplane-mode check on the real iPhone (Acceptance item 1) covers Safari/WebKit. Runs against `pnpm build &&
  pnpm preview` with `VITE_FAKE_CAMERA=1` (the config's own webServer env, never the Pages workflow).
- `pnpm test:e2e:prod` — pass (regression guard, unaffected by this milestone's changes).

**Not done here (owner steps, §"Human required"):** Home Screen install + airplane mode, a real range session,
recording the §9 performance budget from `?debug=1` into `docs/RELEASE-v0.1.0.md` §5, and the sign-off checkbox
there. The `git tag v0.1.0` step happens only after that sign-off, per Pitfalls — not run by this agent.
