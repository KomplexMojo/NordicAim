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
`chart.ts`'s `yAt`, a new pure function alongside it); a visible star glyph at the current goal's chart position, in
place of (or alongside) the step line's rightmost segment; removing or keeping the numeric entry as a fallback
(decide during implementation — a fallback is friendlier for an imprecise tap, per `goals.md` §5's own note on
touch precision).

## Out of scope
Any change to storage, the service, or which metrics/views are goal-able. A new trend metric (still `goals.md` §7).

## Steps
(to be written by whoever picks this milestone up, once M27 is `done` and its actual chart/component shapes are
settled — deliberately not detailed further here, so this doesn't get ahead of M27's real implementation.)

## Tests
Unit: the Y-to-value inverse function, round-tripped against `chart.ts`'s `yAt`. E2E: drag (or tap, for a
touch-simulated test) sets a goal; the value shown while dragging matches what gets saved.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Touch imprecision (AGENTS.md: 44 px tap targets) — a bare tap-to-set can land a goal at an odd, unintended value.
- Don't regress M27's numeric entry path without a decision to remove it; the two should coexist unless that's
  explicitly settled.

## Open questions
None yet — this milestone is `pending` and not scoped down to implementation detail.

## Completion notes
(not started)
