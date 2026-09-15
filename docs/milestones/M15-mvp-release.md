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
_(add here)_

## Completion notes
_(fill in when done)_
