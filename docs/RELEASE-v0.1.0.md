# Release evidence: v0.1.0 MVP

Built by milestone M15 (`docs/milestones/M15-mvp-release.md`). This document maps what was promised —
the three MVP steps (REV-15/16/20) and the original `docs/DESIGN.md` §"Delivery checklist" — to what
was actually built, with evidence, then records the owner's §9 performance measurements and sign-off.
`git tag v0.1.0 && git push origin v0.1.0` happens only after that sign-off (M15 Pitfalls).

**Refreshed 2026-10-03.** v0.1.0 now also covers what was built after the MVP (§3a), and the owner checks in §6 cover it.

## 1. MVP steps (REV-15, REV-16, REV-20)

| Step | Status | Evidence |
|---|---|---|
| REV-15: take picture(s) → add metadata → receive analysis | **Done** | Routes in `src/app/router.tsx` (analysis-pipeline.md §1); `tests/e2e/capture.spec.ts`, `metadata.spec.ts`, `results.spec.ts`; end to end in `tests/e2e/journey.spec.ts` (M15) |
| REV-16: automatic pipeline (review image, overlay on template, pull metadata, incorporate user metadata, generate analysis) with an optional Adjust screen | **Done** | `src/lib/pipeline/*`, `src/lib/cv/*`; `tests/e2e/pipeline.spec.ts`; adjusting now happens on the target's own screen (`src/routes/target/TargetPage.tsx`), `tests/e2e/adjust.spec.ts`, `tests/e2e/target.spec.ts` |
| REV-20: scoring is core and never deferred (ISSF ring scoring, sighting zones, multiplicity, missing-round misses; the `both` position was removed by REV-153) | **Done** | `src/lib/scoring/*`; `tests/unit/scoring/*` (every `geometry-scoring.md` test vector); declared-rounds handling in M20 |

## 2. `docs/DESIGN.md` §"Delivery checklist"

| Item | Status | Notes / evidence |
|---|---|---|
| Scaffold; README documenting the session → composite → Garmin flow (sources never uploaded) | **Changed by REV** | REV-10/REV-11: on-phone Vite + React app (not Next.js/server), static GitHub Pages hosting — the original checklist predates "runs entirely on the phone." REV-4: Garmin attach is manual, not an upload. See `README.md`, `AGENTS.md`. |
| Precision scoring from the Olympic 50 m sheet (Inner Circle = 10, 1st Ring = 10, 2nd Ring = 9, Total/100) | **Done** | `src/lib/defaults/biathlon.ts`, `src/lib/scoring/precision.ts`; `tests/unit/scoring/precision.test.ts` against `docs/spec/geometry-scoring.md` §9.1's golden 72/100 vector |
| Composite: ≤2 sighting + ≤2 precision + analysis; allow 1 precision only; user picks slots when >4 photos | **Done** | `src/lib/composite/*` (slot selection); `tests/unit/composite/*`; golden render `docs/reference/generated/` (M14 Completion notes) |
| Dual-template CV → categorize → publish analysis composite only; local keep/discard of sources | **Done** | `src/lib/cv/template-hint.ts`, `src/lib/composite/build.ts`, `src/lib/share/share-browser.ts` (Share rule: only the `CompositeArtifact` is shared, AGENTS.md hard invariant) |
| Fixtures: `IMG_5132` (precision) and `IMG_5057` (sighting) | **Done** | `docs/reference/IMG_5132-precision.jpg`, `docs/reference/IMG_5057-sighting.jpg`; `fixtures/reference/sample-shots-*.json` traced from them |
| Sequence player + harness aggregating multi-activity load with shooting metrics | **Backlog** | `docs/BACKLOG.md` B — explicitly out of scope for the MVP (AGENTS.md) |
| Dev server on an uncommon port; commit/push on current branch, no PR unless asked | **Done** | `vite.config.ts` binds `127.0.0.1:3874` (AGENTS.md hard invariant); every milestone commits directly to `main` per AGENTS.md rule 7 |

## 3. M15 scope: install, offline, polish

| Item | Status | Evidence |
|---|---|---|
| Manifest (name, description, `display: standalone`, `start_url`/`scope`, background/theme colour, icons 192/512/maskable) | **Done** | `vite.config.ts` `VitePWA({ manifest })`; generated `dist/manifest.webmanifest`; icons in `public/icons/` from `scripts/make-icons.ts` |
| iOS meta tags (apple-touch-icon, `apple-mobile-web-app-capable`, status-bar style, theme-color) | **Done** | `index.html` |
| Theme tokens: palette → shadcn variables; `AppHeader`; safe-area padding | **Done** | `src/index.css` (`rendering-composite.md` §1 palette reused as `--background`/`--card`/`--primary`/etc.); `src/components/layout/AppHeader.tsx`; wired into `src/app/router.tsx` `AppShell` |
| Stage timing (`debug=1`) | **Done** | `src/lib/pipeline/timing.ts`, recorded from `src/lib/pipeline/runner-browser.ts`; shown on `#/sessions/:sid/results?debug=1` (`TimingDebugPanel`) |
| Accessibility basics (contrast, focus-visible, `aria-label` on icon buttons, ≥44 px tap targets) | **Done** | `src/index.css` `:focus-visible`; icon-only controls audited (dialog/sheet close buttons already carry `sr-only` text); `tests/e2e/a11y.spec.ts` (axe, no serious/critical violations) |
| Journey e2e | **Done** | `tests/e2e/journey.spec.ts` |
| Offline e2e | **Done** | `tests/e2e/offline.spec.ts` + `playwright.offline.config.ts` + `pnpm test:e2e:offline` |
| Release evidence document, tag | **This document**; tag is an owner step (§5) |

## 3a. Built since the MVP

| Feature | Spec / REV | Evidence |
|---|---|---|
| Backup and restore, optionally locked with the stamp passphrase; backups of chosen sessions | `backup.md`, REV-63, REV-143, REV-151 | `src/lib/backup/*`; `tests/e2e/backup.spec.ts` |
| Provenance stamp on shared images, and Verify a stamp | `provenance.md`, REV-99/100 | `tests/e2e/provenance.spec.ts` |
| Patterns and Analysis (trends, coach image), counting the most recent sessions, with a *Showing …* sentence | `patterns.md`, `analysis.md`, REV-123/124, REV-156 | `tests/e2e/patterns.spec.ts`, `analysis.spec.ts`, `drilldown.spec.ts` |
| Goals, and each session's goal checks | `goals.md`, M27–M28, REV-148 | `tests/e2e/goals.spec.ts` |
| Seasons on Sessions, Patterns, Analysis and Goals | `patterns.md` §3a, REV-154 | `tests/e2e/season-filter.spec.ts` |
| The Board: signed submissions exchanged as files, edited and flagged marks, Clear board (challenges built but hidden) | `leaderboard.md`, REV-155 | `tests/e2e/board.spec.ts`, `tests/unit/leaderboard/*` |
| Athlete picture in Settings and on the Board | REV-157 | `tests/e2e/athlete-picture.spec.ts`, `tests/unit/domain/athlete-picture.test.ts` |
| Photos never keep their location (on import, and for photos stored before) | `metadata-lighting.md` §1.1, REV-158 | `tests/unit/media/strip-location.test.ts`, `tests/unit/services/location.test.ts`; checked against the owner's 47 private photos with a location |
| Five-tab bar, update banner, printable sheets, template reference sheets (M26 part 1) | REV-136, REV-135, REV-121 | `tests/e2e/navigation.spec.ts`, `update-banner.spec.ts`, `template-sheets.spec.ts` |

## 4. Backlog items not built (by design)

Per `docs/BACKLOG.md` and AGENTS.md scope rules: the sequence player, a Capacitor shell, Board challenges (hidden) and
QR exchange, the illustrated landing and a full accessibility audit (B11), cause suggestions for group patterns (B12), and
M26 part 2. Apple Health and Garmin integrations are out of scope entirely. None of these block the three-step flow.

## 5. §9 performance budget (iPhone 16 Pro Max)

Budgets from `docs/spec/analysis-pipeline.md` §9. Read the owner's iPhone values from `#/sessions/:sid/results?debug=1`
(`src/lib/pipeline/timing.ts`) after a real capture session, and the summary-image build time from the same
debug panel or the console.

| Operation | Budget | Measured (owner, iPhone 16 Pro Max) |
|---|---|---|
| OpenCV first load in worker (cold) | ≤ 5 s | _(owner to fill in)_ |
| Stage A per photo (after load) | ≤ 3 s | _(owner to fill in)_ |
| Stage B per photo | ≤ 1 s | _(owner to fill in)_ |
| Summary image build | ≤ 2 s | _(owner to fill in)_ |

## 6. Human-required checks (M15 Acceptance)

These cannot be run by an agent; see `docs/milestones/OWNER-CHECKS.md` for the running log.

1. Add to Home Screen; turn on airplane mode; confirm the app still works (offline.spec.ts is the automated
   proxy for this, run against the same production build).
2. At a real range session, photograph sighting and precision targets.
3. Add metadata → Analyze → check the scores against your own count → share the summary image → attach it
   in Garmin Connect.
4. Record the stage timings from `?debug=1` into §5 above.
5. Since the MVP: import a photo from Photos and confirm it is added (its location is removed); make a protected
   backup and restore it; set a goal and check a later session's goal card; add your athlete picture, share your Board
   submission to a second phone and import it there.
6. Sign off below.

## 7. Sign-off

- [ ] **Owner sign-off**: the MVP (three-step flow, install, offline, performance budget) and the features built
      since (§3a) meet expectations for a v0.1.0 release. Tag `v0.1.0` only after this box is checked.

Signed: _______________________  Date: _______________________
