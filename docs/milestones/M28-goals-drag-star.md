# M28: Goals — drag-a-star-on-the-chart in place of the numeric entry

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M27 | high | S | post-MVP · goals |

## Goal
From the owner's ideation, 2026-09-30 (issue [#97](https://github.com/KomplexMojo/NordicAim/issues/97)):

> "it will allow you to add a star onto the chart that indicates where you would like to set the goal at."

Replaces M27's numeric "Set goal" entry with a direct-manipulation gesture: tap the chart to place a star at that Y
position, drag it to adjust, the resolved value shown live while dragging — the same pattern the capture overlay's
own sliders already use (`docs/spec/capture-overlay.md`). This is purely an input-mechanism change: `goals.md` §2's
stored shape and §6's service are unchanged, since a drag still ends by calling the same `setGoal`.

## Read first
- `docs/spec/goals.md` §4, §5
- `M27-goals-foundation.md`'s Completion notes (the chart geometry and component M28 builds on)
- Whatever capture-overlay slider code M27's implementer points to as the touch-drag precedent

## In scope
The drag/tap gesture on `GoalChart`'s plot area; converting a pointer Y position to a metric value (the inverse of
`chart.ts`'s `yAt`, a new pure function alongside it, plus its own forward mapping exported for placing the star);
a visible star glyph at the current goal's chart position; a keyboard-accessible equivalent (arrow keys, Page
Up/Down, Home/End, Enter to save, Escape to cancel); removing M27's numeric entry entirely, per the owner's review
of the shipped M27 screen ("instead of having the user enter a number they should be able to drop and move a
star") — this settles the "fallback or not" question M27 left open, in favour of full replacement.

## Out of scope
Any change to storage, the service, or which metrics/views are goal-able. A new trend metric (still `goals.md` §7).

## Steps
1. **`chart.ts`**: export `valueToY` (the value-to-y mapping `chartGeometry` already computed internally — exposed
   so a goal marker can be drawn at an arbitrary value, not just a `ChartPoint`) and `valueAt` (its inverse, for
   reading a pointer or key press back into a value, clamped to the chart's own `domain`).
2. **`GoalChart.tsx`**: replace the "Set goal"/"Change goal" button and its numeric `Input` with a transparent,
   `touch-none` `<rect>` over the plot area. Pointer Events (not the capture-overlay's native range inputs, which
   turned out to be a 1-D horizontal precedent that doesn't fit a Y-only value on a chart's own plot — the closer
   match already in this codebase is `ImageStage.tsx`'s own `onPointerDown`/`onPointerMove`/`onPointerUp` +
   `setPointerCapture` pattern for dragging a shot marker, which this mirrors): press to start a live `draft`
   preview, move to update it, release to call `onSetGoal`. A star (`TabBar.tsx`'s own path, scaled down) renders
   at the plot's right edge, at `draft ?? currentGoal(...)`.
3. Keyboard: `tabIndex={0}`, `role="slider"`, `aria-value*`, `onKeyDown` for Arrow/Page/Home/End (adjust `draft`
   only) and Enter (commit `draft`) / Escape (clear it); `onBlur` commits a live `draft` too, so tabbing away from
   an in-progress keyboard adjustment doesn't silently discard it.
4. `GoalsPage.tsx`: a one-line hint under `ViewRangeControls` (`goals-range-hint`) — the owner asked, reviewing the
   shipped M27 screen, whether the range slider "still ma[de] sense" for Goals; it does (it doubles as how far back
   a goal's own history is visible, `goals.md` §4), but nothing on screen said so.

## Tests
Unit: `valueAt`/`valueToY` round-tripped against `chartGeometry`'s own points and ticks, and against each other,
in `tests/unit/analysis/chart.test.ts`. E2E (`tests/e2e/goals.spec.ts`): a press-drag-release sets a goal, shows a
live preview while held, persists across reload, and a second drag appends rather than replaces; a keyboard
sequence (arrows, Escape with no save, arrows again, Enter with a save) previews without writing until committed.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Touch imprecision (AGENTS.md: 44 px tap targets) is resolved by making the *entire plot* the drag target (roughly
  300×130 px rendered), not a small star glyph — there is no small hit target to miss.
- A key-press-per-log-entry keyboard implementation would flood the append-only log (`goals.md` §2) with every
  incidental nudge; the local-preview-then-commit-on-Enter/blur design (§5) is deliberate, not an oversight, even
  though it departs from a native `<input type="range">`'s per-step commit.
- Some browsers blur a focused control on Escape; the e2e keyboard test re-focuses the plot before its second key
  sequence rather than assuming focus survived Escape (a real discovery from this milestone's own flake-hunting,
  not a product bug — Escape only clears the local preview, it never needs to keep focus for correctness).
- The draggable Y range is clamped to the chart's *currently visible* domain (padded out to "nice" tick bounds, so
  there's some headroom) — a goal further outside the current data's range takes two gestures (drag to the edge,
  release, drag again), not one. Documented in `goals.md` §5 rather than silently expanding the domain live during
  a drag, which would make the chart's scale chase the pointer instead of staying put.
- A focusable, `tabIndex={0}` SVG `<rect>` gets the browser's default focus outline the instant a mouse-drag focuses
  it (visible in a screenshot taken mid-drag) — visually noisy for a pointer user, but a keyboard user genuinely
  needs it. Fixed with `outline-none` plus `focus-visible:outline` rather than removing the outline altogether.
- **WebKit-specific `setPointerCapture` failure (CI, 2026-09-30, caught after the first push):** a multi-step drag
  (`{ steps: 4 }` in the e2e test) stopped updating partway through in CI's `mobile-webkit` project, three times in
  a row across CI's own retries — Chromium never showed it locally (this container has no WebKit to test against
  at all, per `CLAUDE.md`). First fix attempt replaced `setPointerCapture` with `window`-level `pointermove`/
  `pointerup` listeners, reasoning that WebKit's pointer capture might be unreliable on SVG specifically; this
  introduced a *new*, worse, reproducible-in-Chromium bug (~40% local failure rate) — Chromium's mouse pointer
  always reports `pointerId: 1`, so if a drag's cleanup doesn't fire before some unrelated later mouse action
  (even a button click elsewhere on the page), a leftover `window` listener matches that later event's `pointerId`
  too, stealing it. Reverted that attempt. The actual fix: kept the original, proven `setPointerCapture` approach
  entirely (state-based `pointerId`, fresh `getBoundingClientRect()` per event — already correct, never the
  problem), but moved *which element* it's attached to from the SVG `<rect>` to an absolutely-positioned HTML
  `<div>` overlaid on the SVG's plot area (percentage-positioned from `BOX`, so it scales with the SVG). This
  targets the actual documented gap — WebKit's `setPointerCapture`/pointer-event support is more mature on HTML
  elements than SVG ones — while reusing the exact capture pattern already proven across this app's own WebKit e2e
  coverage (`ImageStage.tsx`'s shot-dragging). Verified the overlay div's screen position matches the SVG's plot
  rect to sub-pixel precision (not just "looks right") before trusting it. Unverified locally beyond that: this
  container has no WebKit, so the real confirmation is the next CI run.

## Open questions
None. The one thing this milestone's own stub left open — whether to keep the numeric entry as a fallback — was
resolved by the owner's direct review of the shipped M27 screen: replace it entirely.

## Completion notes
Implemented as scoped: `chart.ts` gained `valueToY`/`valueAt`; `GoalChart.tsx`'s numeric entry was removed and
replaced by the drag/tap/keyboard star; `GoalsPage.tsx` gained the range-slider hint. The least-squares trend line
(`goals.md` §4, already documented there since before this milestone) was also added to `GoalChart` in the same
pass — M27's own implementation had missed it, caught during the owner's review alongside the star-vs-numeric-entry
feedback, tracked as its own fix commit rather than folded silently into this one.

Commands run, all green:
```
pnpm check
pnpm test:e2e --project=mobile-chromium
```
Also verified: the drag/keyboard e2e tests re-run several times back to back (not just once) to catch the render-
race flakiness described in the Pitfalls section, until stable.

**Follow-up (2026-09-30, same day):** the owner asked to remove MPI left/right and MPI up/down from Goals
entirely, after seeing the shipped screen — a goal Y-value doesn't read as "better" or "worse" against a signed
position the way it does for Score, Group size and Accuracy. `domain/goals.ts`'s `GoalMetric` enum narrowed from
five metrics to three (`score`/`group`/`rms`); `GoalsPage.tsx` filters `trendMetrics(kind)` down to `GoalMetric`
before rendering, with a type-narrowing predicate so `GoalChart` only ever receives a goal-able metric. `goals.md`
§1 updated. `trendMetrics()` itself is untouched — Analysis still shows both MPI charts. Covered by a new domain
test (MPI rejected by `GoalLogEntry.safeParse`) and a new e2e test (Goals shows exactly three charts; Analysis
still shows MPI). `pnpm check` and the full `pnpm test:e2e --project=mobile-chromium` both green.
