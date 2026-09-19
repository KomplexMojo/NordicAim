# M22: Three main screens and a Settings screen

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M19, M21 | high | M | navigation · settings |

## Goal
From the owner's issue sweep ([#2](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/2), plus the spec edit asked
for in [#7](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/7)). REV-47 and REV-48:

- **REV-47:** the app has **three main screens** — **Shooting** (everything that views and analyzes shooting), **Settings**
  (defaults that apply across all sessions) and **Diagnostics** — reached from a bottom tab bar.
- **REV-48:** the **backing sheet is a Settings choice that applies to every session**, not a per-session option.

The owner: "The backing stock isn't something that is a per session setting. It really should go into a setting screen … there
should be three main screens … the setting screen is the one that has the back where you can set the colour of the back and any
other defaults that makes sense across all shooting sessions."

## Read first
- `docs/DESIGN-REVISIONS.md` REV-47, REV-48 (and REV-38 for what is being moved)
- `docs/spec/backing-sheet.md` §2–§5, §4a; `docs/spec/data-model.md` (`AppSettings`, `BiathlonSession`)
- `docs/spec/analysis-pipeline.md` §1 (routes), §2 (A5), §8 (Re-analyze)
- Issues #2 and #7 on GitHub (the owner's words and the defaults)

## In scope
The tab bar; a Settings route; moving the backing mode and card capture into Settings; the two migrations; A5 and Re-analyze
reading the backing from settings; removing Session options from the metadata screen; the backing-sheet.md spec edits.

## Out of scope
Detection itself (M16, M19 — no constant moves), default round counts, data export, any change to scoring.

## Files
- `src/components/nav/TabBar.tsx`, the layout in `src/app/router.tsx`
- `src/routes/settings/SettingsPage.tsx`, `src/components/settings/*`
- `src/lib/domain/settings.ts`, `src/lib/domain/session.ts` (+ their migrations), `src/lib/services/backing-card.ts`
- `src/lib/pipeline/stage-a.ts`, `src/lib/services/adjust.ts`, `src/routes/metadata/MetadataPage.tsx`
- remove `src/components/metadata/SessionOptions.tsx`
- `docs/spec/backing-sheet.md`, `docs/spec/data-model.md`, `docs/spec/analysis-pipeline.md` §1–§2
- tests under `tests/unit/domain/`, `tests/unit/services/`, `tests/e2e/settings.spec.ts`

## Steps
1. **Tab bar (REV-47).** Three tabs: **Shooting** (`/` and every `/sessions/...` route), **Settings** (`/settings`), **Diagnostics**
   (`/diagnostics`). Bottom, fixed, respects `env(safe-area-inset-bottom)`, three targets of at least 44 px each with an icon and a
   label, the active tab marked. **Hidden on the full-screen capture screen.** Home's "Diagnostics" text link goes; the tab replaces it.
2. **Settings route.** Three sections:
   - **Backing sheet** — mode select (Auto / None / Coloured); **Photograph backing card** opens the existing
     `BackingCardCapture` in card mode, then shows the measured colour as a swatch; **Clear**.
   - **Hole size** — `.22 LR` 5.6 mm. Already stored as `AppSettings.profileOverrides.holeDiameterMm` and used by detection and
     scoring but never exposed. Numeric, 2–12 mm, with **Reset to 5.6**.
   - **About** — "Nordic Aim" and the build version (the git SHA Vite embeds at build time), so a tester can say which build.
3. **Data model (REV-48)** — update `data-model.md` first, then the code:
   - `AppSettings.lastBackingMode` / `lastBacking` → **`backingMode` / `backing`** (the setting itself). Migration copies the values.
   - `BiathlonSession` **drops** `backingMode` / `backing`: schema **2 → 3**. Before dropping, if settings holds no backing yet,
     lift the most recently updated session's mode and colour into settings, so nothing the owner measured is lost.
   - **The card photo is not kept** (issue #2 default): measuring a card yields the colour signature, which is all detection uses,
     and the swatch is drawn from it. The migration deletes existing `backing-card` photos after their colour is lifted.
   - `origin: 'backing-card'` stays valid in the enum so an old record still parses during migration; nothing new is written with it.
4. **A5 and Re-analyze read the backing from settings.** Each analysis already records which backing it used
   (`pipeline.detection`). **Changing the setting re-runs nothing** (issue #2 default): it applies to new photos and to any photo
   the user re-analyzes, so a finished session's numbers never change behind the user's back.
5. **Remove Session options** from the metadata screen — it holds nothing but the backing.
6. **Spec edits** ([#7](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/7)): `backing-sheet.md` §2 and §3 rewritten
   for Settings (REV-38's session placement marked superseded by REV-48); §4a gains M19's two Auto rules — `AUTO_MIN_CHROMA` 124
   and "the coloured pixels' 10th-percentile distance must be at most the template's outer ring radius" — and their fallback
   reasons "colour too dull for a backing" and "colour outside the rings".

## Tests
- Unit: settings migration (values copied); session 2 → 3 migration including **"settings already has a backing — the session's
  is not lifted over it"** and "a `backing-card` photo is deleted after its colour is lifted"; A5 and Re-analyze pass the
  **settings** backing to the worker; changing the setting marks nothing pending.
- E2E (both projects): the three tabs navigate and mark the active one; no tab bar on the capture screen; set Coloured in Settings,
  analyze a photo, and its detection record says colour; the metadata screen has no Session options; Hole size reset returns 5.6.

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm cv:eval   # unchanged
```
**Human (owner):** on the iPhone, move between the three tabs one-handed; set the backing in Settings and analyze a backed target.

## Pitfalls
- Migrations run on real stored data: test each from a fixture of the old shape, and never lose a measured colour.
- The tab bar must not cover content: pad the scroll container by the bar's height plus the safe-area inset.
- Hole size feeds detection **and** scoring; changing it must not silently re-score stored results (same rule as the backing).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
