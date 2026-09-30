# M28: Goals — replacing the numeric goal entry (shipped as up/down buttons, after a drag-a-star attempt)

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M27 | high | S | post-MVP · goals |

## Goal
From the owner's ideation, 2026-09-30 (issue [#97](https://github.com/KomplexMojo/NordicAim/issues/97)):

> "it will allow you to add a star onto the chart that indicates where you would like to set the goal at."

Replaces M27's numeric "Set goal" entry with a direct-manipulation input. **This milestone was built twice.** The
first build followed the owner's words literally: tap the chart to place a star at that Y position, drag it to
adjust, the resolved value shown live while dragging. After trying the shipped drag build and hitting a WebKit-
specific cross-browser bug in it (see Pitfalls below), the owner asked for a different mechanism instead — up/down
arrow buttons beside the chart's y-axis that step a horizontal goal line — and that is what shipped. Both attempts
are kept below as a real record of the investigation (the drag build's own bugs and fixes are genuine, reusable
lessons, not wasted work), with the final, shipped design described first. Either way this was purely an
input-mechanism change: `goals.md` §2's stored shape and §6's service never changed, since every version ends by
calling the same `setGoal`.

## Final design: up/down buttons, not a drag (owner, 2026-09-30, after trying the drag build)

> "The star isn't working as expected. Mock up a different option. On the left side where the y-axis shows, add up
> and down arrows. They should move a horizontal line up and down. That horizontal line represents the goal."

Two `size-11` (44 px) buttons, ▲ and ▼, stacked beside each chart's y-axis (`GoalChart.tsx`). Each press moves a
solid horizontal "live goal" line (goals.md §4) by one step (`STEP`, per metric: 1% score, 0.1 MOA group, 0.5 mm
RMS) and **saves immediately** — no draft/preview state, no separate Save button; a press is the decision, so a
burst of presses is a burst of append-only log entries (goals.md §2), accepted as a simplicity trade-off. Clamped
to a fixed, generous range per metric (`BOUNDS`: score 0–100%, group/RMS 0 and up) — **not** the chart's own
visible axis `domain`, which the drag build used and which, for a single session, is exactly
`[dataValue, currentGoal]`: clamping a stepper to that meant "up" stopped moving the instant a goal was set, since
there's no headroom above a value that's already one of the domain's own two points. Found via an e2e test that
kept clicking "up" and asserting the value changed each time — it didn't, past the first click. The `data.domain`
value never should have been reused as the clamp range for a discrete step; it's sized for rendering the visible
axis, not as a business rule about how far a goal may go.

This also **fully resolved** the drag build's WebKit `setPointerCapture` problem (see Pitfalls): a native
`<button>` needs no custom pointer-event code at all — Tab reaches it and Enter/Space activates it for free, and a
click is identical across every browser engine. No pointer events, no `setPointerCapture`, no SVG-vs-HTML question.

goals.md §4 also gained the solid "live value" line itself, on top of the pre-existing dashed history step-line
(the step-line's own rightmost segment already reaches the same value, so the solid line only highlights it, not a
new fact) — `chart.ts`'s `valueAt` (the drag build's pointer-to-value inverse) was removed as dead code once
nothing read a pointer position into a value any more; `valueToY` (value-to-pixel, needed to place the solid line)
stayed and kept its own direct unit test.

## Read first
- `docs/spec/goals.md` §4, §5
- `M27-goals-foundation.md`'s Completion notes (the chart geometry and component M28 builds on)

## In scope
The up/down-button stepper on `GoalChart` (final design, above); removing M27's numeric entry entirely — settling
the "fallback or not" question M27 left open, in favour of full replacement (unchanged from the drag attempt's own
answer to that question, just with a different mechanism in the end).

## Out of scope
Any change to storage, the service, or which metrics/views are goal-able. A new trend metric (still `goals.md` §7).

## Steps
1. `GoalChart.tsx`: two `size-11` `<Button variant="outline" size="icon">` (▲/▼) beside the chart; `STEP` and
   `BOUNDS` per-metric tables; `step(direction)` reads `draft ?? goalNow?.value ?? dataValues.at(-1) ?? 0`, clamps
   to `BOUNDS` (not `data.domain` — see the Final design section above for why), sets `draft` for an instant visual
   move, then awaits `onSetGoal` and clears `draft`. Buttons disable at their bound (`atUpBound`/`atLowBound`) and
   while `saving`.
2. Render the solid "live goal" line (goals.md §4) via `chart.ts`'s `valueToY`, full-width, on top of the existing
   dashed history step-line.
3. Remove the drag build's machinery entirely: the SVG/HTML-overlay pointer handlers, `role="slider"`/`aria-value*`,
   the star glyph and its `STAR_PATH`/`STAR_SCALE`, the `-preview`/`-star`/`-plot` test ids. Remove `chart.ts`'s
   `valueAt` (now genuinely dead — nothing reads a pointer position into a value any more) and its dedicated tests;
   keep `valueToY` (still used to place the live line) and give it its own direct test, since it no longer has
   `valueAt`'s round-trip test exercising it indirectly.
4. `docs/spec/goals.md` §4 (two lines, not one) and §5 (full rewrite for the stepper) updated to match.

## Tests
Unit: `valueToY` in `tests/unit/analysis/chart.test.ts` (matches the y every point in the same domain actually
got; maps the domain's own ends to the plot's top/bottom edges) — `valueAt`'s tests were removed with the function.
E2E (`tests/e2e/goals.spec.ts`): an up-click sets a goal, shows the solid line, persists across reload, and further
clicks append rather than replace, each landing on a different value (not just "changed once", after the
domain-clamp bug below); a plain Tab-then-Enter on a button sets a goal with zero custom keyboard code, proving the
native-element accessibility claim rather than assuming it.

## Acceptance
```bash
pnpm check
pnpm test:e2e --project=mobile-chromium
```

## Pitfalls
- The chart's own visible `domain` is **not** a valid clamp range for a stepped value — see the Final design
  section above. This was a real bug in the first version of this final design too (caught by an e2e test before
  it shipped, not after): "up" silently stopped moving the instant a goal was set, because a single-session chart's
  domain is exactly `[dataValue, currentGoal]` with no headroom. Fixed with a fixed per-metric `BOUNDS` table
  instead (score 0–100%; group/RMS 0 and up).
- Each button press commits immediately — a burst of presses is a burst of append-only log entries (goals.md §2),
  not one. Deliberate (see the Final design section); revisit only if it actually becomes a problem.
- Disable the button at its own bound (`atUpBound`/`atLowBound`) rather than letting a press at the ceiling/floor
  silently re-save the same value — a no-op write that still stamps a new `setAt` would be a confusing, indistinct
  entry in the log.

## History: the drag-a-star attempt (built first, replaced above)

The subsections below describe the **first build** of this milestone — tap/drag a star directly on the chart's
plot, plus a keyboard equivalent. It shipped, was reviewed live by the owner, and was replaced by the up/down-button
design above in the same milestone. Kept for the record: the WebKit investigation in particular (a
`setPointerCapture` cross-browser bug, and a worse regression from the first fix attempt) is a real, reusable
lesson even though the mechanism it was fixing no longer exists.

### Steps (drag build, history)
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
   a goal's own history is visible, `goals.md` §4), but nothing on screen said so. (This hint survived the later
   pivot to the up/down-button design — it's still true and still shown.)

### Tests (drag build, history)
Unit: `valueAt`/`valueToY` round-tripped against `chartGeometry`'s own points and ticks, and against each other,
in `tests/unit/analysis/chart.test.ts`. E2E (`tests/e2e/goals.spec.ts`): a press-drag-release sets a goal, shows a
live preview while held, persists across reload, and a second drag appends rather than replaces; a keyboard
sequence (arrows, Escape with no save, arrows again, Enter with a save) previews without writing until committed.

### Pitfalls (drag build, history)
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
  a drag, which would make the chart's scale chase the pointer instead of staying put. (This exact reasoning is
  what the final up/down-button design found broken in practice — see the Pitfalls above.)
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
  too, stealing it. Reverted that attempt. The fix that shipped instead kept the original, proven `setPointerCapture`
  approach entirely (state-based `pointerId`, fresh `getBoundingClientRect()` per event — already correct, never
  the problem), but moved *which element* it's attached to from the SVG `<rect>` to an absolutely-positioned HTML
  `<div>` overlaid on the SVG's plot area (percentage-positioned from `BOX`, so it scales with the SVG). This
  targeted the actual documented gap — WebKit's `setPointerCapture`/pointer-event support is more mature on HTML
  elements than SVG ones — while reusing the exact capture pattern already proven across this app's own WebKit e2e
  coverage (`ImageStage.tsx`'s shot-dragging). Verified the overlay div's screen position matched the SVG's plot
  rect to sub-pixel precision before trusting it. This fix was pushed and CI was still running against it — with
  an unresolved result — when the owner tried the shipped drag build directly and asked for the up/down-button
  design instead, making the CI result moot: the whole drag mechanism this fix touched was removed in the same
  milestone.

## Open questions
None. The one thing this milestone's own stub left open — whether to keep the numeric entry as a fallback — was
resolved by the owner's direct review of the shipped M27 screen: replace it entirely. Which *mechanism* replaced
it changed once (drag → up/down buttons) after the owner tried the shipped drag build directly; nothing is still
open.

## Completion notes
Final, shipped design: two up/down buttons per chart, stepping a solid horizontal goal line, saving immediately.
Replaces the drag-a-star build (History section above) after the owner tried it live and asked for something
clearer — and, independently, the button design also fully sidesteps the drag build's WebKit `setPointerCapture`
issue, since a native `<button>` needs no custom pointer-event code in any browser engine. Caught and fixed a real
clamp-range bug in the button design itself before it shipped (see Pitfalls): the chart's visible axis domain is
not a valid bound for a stepped value. `chart.ts`'s `valueAt` was removed as dead code once nothing read a pointer
position into a value any more; `valueToY` stayed, with its own direct test replacing the indirect coverage
`valueAt`'s round-trip tests used to give it. The least-squares trend line (`goals.md` §4, already documented there
since before this milestone) and the MPI-metric narrowing (`domain/goals.ts`'s `GoalMetric`, three metrics not
five) both predate this final design and are unaffected by it — still shown, still in place.

Commands run, all green:
```
pnpm check
pnpm test:e2e --project=mobile-chromium
```
Also verified: the up/down-button e2e tests re-run several times back to back (not just once), to catch the same
class of render-race flakiness the drag build's own e2e tests hit (documented in the History Pitfalls above).

**Follow-up (2026-09-30, same day):** the owner asked to remove MPI left/right and MPI up/down from Goals
entirely, after seeing the shipped screen — a goal Y-value doesn't read as "better" or "worse" against a signed
position the way it does for Score, Group size and Accuracy. `domain/goals.ts`'s `GoalMetric` enum narrowed from
five metrics to three (`score`/`group`/`rms`); `GoalsPage.tsx` filters `trendMetrics(kind)` down to `GoalMetric`
before rendering, with a type-narrowing predicate so `GoalChart` only ever receives a goal-able metric. `goals.md`
§1 updated. `trendMetrics()` itself is untouched — Analysis still shows both MPI charts. Covered by a new domain
test (MPI rejected by `GoalLogEntry.safeParse`) and a new e2e test (Goals shows exactly three charts; Analysis
still shows MPI). `pnpm check` and the full `pnpm test:e2e --project=mobile-chromium` both green.
