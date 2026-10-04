# M27: Goals — append-only goal log, the Goals tab and chart screen, numeric goal entry

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M22 | high | M | post-MVP · goals |

## Goal
From the owner's ideation, 2026-09-30 (issue [#97](https://github.com/KomplexMojo/NordicAim/issues/97)):

> "Let's start simple. Add a goals button on the bottom of the screen. It will take you to a screen that has the
> same filtering mechanics as the patterns and analysis screen. It will show you charts of your current averages
> for each of the goals, and it will allow you to add a star onto the chart that indicates where you would like to
> set the goal at. The goals are stored with a date and a time on them, and you can go backwards and forwards in
> time to show the goal as it sat at that time."

A fourth **Goals** tab, reusing Patterns/Analysis's own view switch and six-stop date-range slider verbatim, shows
the same five trend charts Analysis draws, each with a goal line overlaid — a step function read straight off the
chart's own x-axis, so "going backwards and forwards in time" is just widening the range slider, no separate
control. This milestone builds the storage, the screen, and a numeric way to set a goal's value; the star-drag
gesture is M28, once this milestone's chart and storage exist to drag against (`docs/spec/goals.md` §5, §7).

## Read first
- `docs/spec/goals.md` (all of it — new this milestone)
- `docs/spec/analysis-pipeline.md` §1 (routes, the four-tab bar)
- `docs/spec/analysis.md` §2–§4 (the trend pipeline and chart geometry this reuses)
- `docs/spec/patterns.md` §1, §3 (views, date range — `ViewRangeControls` is reused unmodified)
- `docs/spec/data-model.md` §6 (`goals` store), §7 (services table)
- Issue #97 on GitHub (the owner's words, both messages, and the converged design)

## In scope
The `goals` IndexedDB store and its schema/migration; `src/lib/goals/model.ts` (pure); `src/lib/services/goals.ts`;
the Goals tab, route and screen; a chart component that draws the goal step line on top of the existing chart
geometry; a numeric "Set goal" entry per chart.

## Out of scope
The drag-a-star gesture (M28). A new "miss rate" trend metric (`goals.md` §7 — a real but separate idea, not
touched here since `trendMetrics()` is shared with the shipped Analysis screen and the coach image). Editing or
deleting a past goal log entry. Any change to scoring, detection, or an existing store's schema.

## Files
- `src/lib/domain/goals.ts` (new: `GoalLogEntry`, `GoalsStore` schemas)
- `src/lib/store/db.ts` (version 2 → 3, `goals` store, cascading upgrade)
- `src/lib/store/goals-repo.ts` (new)
- `src/lib/goals/model.ts` (new, pure: `currentGoal`, `goalAsOf`, `goalSeries`)
- `src/lib/services/goals.ts` (new: `listGoals`, `setGoal`)
- `src/lib/app/nav.ts` (`MAIN_TABS` gains `goals`; `activeTab` recognises `/goals`)
- `src/components/nav/TabBar.tsx` (fourth icon, `grid-cols-4`)
- `src/app/router.tsx` (`/goals` route)
- `src/routes/goals/GoalsPage.tsx` (new)
- `src/components/goals/GoalChart.tsx` (new)
- `docs/spec/goals.md`, `docs/spec/data-model.md` §6/§7, `docs/spec/analysis-pipeline.md` §1
- Tests under `tests/unit/domain/`, `tests/unit/store/`, `tests/unit/goals/`, `tests/unit/services/`, `tests/e2e/goals.spec.ts`

## Steps
1. **Storage.** `GoalLogEntry` / `GoalsStore` zod schemas (`goals.md` §2). `goals` store, keyPath `key`, one row
   (`key: 'app'`). Bump `AsaDbSchema`'s version to 3; rewrite `openAppDb`'s `upgrade` callback from its two
   early-return branches to cascading `if (oldVersion < 1)` / `< 2` / `< 3` blocks so a database at **any** older
   version (0, 1, or 2) ends up with every store it's missing, never just the newest one.
2. **Repo and service.** `goals-repo.ts` mirrors `settings-repo.ts` (`getGoals`/`putGoals`, default `{ schemaVersion:
   1, key: 'app', entries: [] }` when no row exists). `services/goals.ts`'s `setGoal` reads the row, appends a
   `GoalLogEntry` (`ctx.newId()`, `ctx.now().toISOString()`), writes it back in one transaction.
3. **Pure model** (`src/lib/goals/model.ts`): `currentGoal`, `goalAsOf` (latest entry for a (view, metric) pair at or
   before a given ISO timestamp, comparing `setAt` lexicographically since it's always `UtcIso`), and `goalSeries`
   (maps a `TrendPoint[]` to `Array<number | null>` by calling `goalAsOf` per point's `sessionDate` — end of that
   day, so a goal set the same day as a session counts for it).
4. **Tab bar and route.** `MAIN_TABS` gains `{ id: 'goals', label: 'Goals', to: '/goals' }`; `TabBar`'s grid becomes
   4 columns; a new star icon (stroke SVG, matching the existing icons' style). `/goals` → `GoalsPage`, inside
   `ServicesLayout`.
5. **`GoalsPage`.** Mirrors `AnalysisPage`'s structure exactly: `ViewRangeControls` (`testIdPrefix="goals"`),
   `sessionTrend`/`trendMetrics(kind)` over the filtered points, one `GoalChart` per metric.
6. **`GoalChart`.** Starts from `TrendChart`'s rendering (data line, points, y-ticks, zero line) but is its own
   component (not a shared prop on `TrendChart`, to keep this change additive and the shipped Analysis screen
   untouched). Adds: the goal step line (`chartGeometry(goalSeries(...), BOX, metric.zeroLine, 4, [...dataValues,
   ...goalValues])`, called once for the data series and once for the goal series sharing that `domainFrom` so both
   share one y-axis and matching x-positions — no changes to `chart.ts`); a **Set goal** button opening a small
   numeric input (pre-filled with the current goal's value, formatted like `metric.format`) that calls `setGoal` on
   submit.
7. **Empty/thin states** match Analysis verbatim (`goals.md` §3): "No sessions here yet" with none; per-chart "No
   sessions with this measure in the range" when a metric has no values, from the existing `chartGeometry` empty
   path.

## Tests
- Unit: `domain/goals.test.ts` (schema parse/defaults); `store/db.test.ts` or extend an existing db test (fresh
  install creates `goals`; a v1-only fixture DB upgraded straight to v3 gets **both** `secrets` and `goals`, not
  just the newest); `store/goals-repo.test.ts` (default row, round-trip); `goals/model.test.ts` (`currentGoal`,
  `goalAsOf` — before any goal, after one, after a change, exactly at a `setAt` boundary; `goalSeries` against a
  small synthetic `TrendPoint[]`); `services/goals.test.ts` (`setGoal` appends, never edits, in one transaction);
  `app/nav.test.ts` (four tabs, `/goals` active).
- E2E (`tests/e2e/goals.spec.ts`): the Goals tab navigates and is marked active; with demo sessions loaded, a chart
  shows data; setting a goal via the numeric entry persists across reload and is reflected in the chart; changing an
  existing goal appends rather than replaces (both values readable somewhere, e.g. via the step visible once two
  sessions straddle the change — or, if that's too fiddly for a demo fixture in this milestone, assert the two log
  entries directly through a test hook); the tab bar stays at four ≥ 44 px targets.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
No device check needed for this milestone (no camera, no detection).

## Pitfalls
- The `db.ts` upgrade rewrite is the one place this milestone touches shipped storage: get the cascading-blocks
  version right and test a v1 **and** a v2 fixture upgrading to v3, not just a fresh install — the existing
  early-return shape silently did the wrong thing the moment a third version was added (it was correct only because
  there were exactly two).
- `chartGeometry`'s `domainFrom` must include both series' values or the goal line can render outside the visible
  y-range (or worse, one call's domain drifts from the other's, misaligning the two lines on a shared axis).
- `goalSeries` must return `null` (not 0, not the nearest goal) for any session before the first goal was ever set
  for that pair — a drawn goal line of 0 reads as "your target is zero", which is wrong.
- Keep this additive: no edits to `TrendChart.tsx`, `AnalysisPage.tsx`, or `chart.ts`. `GoalChart` is free to
  duplicate the parts of `TrendChart`'s rendering it needs.

## Open questions
None. `goals.md` resolved every ambiguity from the original ideation before implementation started, and nothing
encountered during the build required a new decision.

## Completion notes
Implemented as scoped. `src/lib/store/db.ts`'s `upgrade` callback was rewritten from two early-return branches to
three cascading `if (oldVersion < 1/2/3)` blocks (data-model.md §6); `tests/unit/store/db-migration.test.ts` checks a
fresh install, a v1-only fixture, and a v2 fixture all reach the full v3 store set. `GoalChart` is a standalone
component (not a `TrendChart` prop) that calls `chartGeometry` twice, once for the data series and once for
`goalSeries`, sharing one `domainFrom` so both lines sit on the same axis and x-positions — `chart.ts` and
`TrendChart.tsx` were not touched. A `listGoals` test hook was added to `src/lib/testing/test-hooks-browser.ts`
(fake-camera builds only) so the e2e append-not-replace assertion doesn't depend on two demo sessions landing on
different calendar days.

Commands run, all green:
```
pnpm check            # typecheck + lint (4 pre-existing warnings, no new ones) + 1228 unit tests + privacy check
pnpm test:e2e --project=mobile-chromium   # 103 passed, 1 pre-existing skip, including tests/e2e/goals.spec.ts
```
Also verified visually: dev server + fake camera, demo session loaded, `#/goals` with `precision-prone`/`all` —
five charts render, "Set goal" → numeric entry → "Goal: 70%" with the dashed goal line, value survives a reload; the
four-column tab bar (`Sessions`/`Analysis`/`Patterns`/`Goals`) doesn't wrap or crowd its labels.

No device check needed (no camera, no detection touched).
