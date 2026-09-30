# Goals screen: set and track targets over time (issue #97)

A **Goals** tab lets the athlete mark where they want each trend metric to be, per view, and see that target drawn
on the same chart Analysis already draws — including how the target itself has changed over time. View-only except
for setting a goal's value; reads the same stored analyses as Patterns and Analysis (`patterns.md`, `analysis.md`),
reads no photo, and nothing leaves the phone.

## 1. What a goal is

A goal is **one number, in a metric's own unit, for one (view, metric) pair** — not a direction, not a percentage,
not a baseline. "Direction" (higher is better vs lower is better) is a property of the **metric** (`analysis.md`'s
`TrendMetric`), not of the goal: the goal is just a Y-value on that metric's chart, and whichever side of it counts
as "met" follows from the metric already knowing which way is better.

- **Views**: the same four as Patterns/Analysis (`patterns.md` §1) — Sight in, Confirm, Precision prone, Precision
  standing.
- **Metrics**: three of the five `trendMetrics()` computes (`analysis.md` §3, `src/lib/analysis/trend.ts`) —
  Score/Hit rate (%), Group size (MOA), Accuracy/RMS (mm). MPI left/right and MPI up/down are **not** goal-able
  (owner, 2026-09-30, after reviewing the shipped screen): each one plots a signed *position* along one axis, not a
  single magnitude, so a goal Y-value doesn't read as "better" or "worse" the way it does for the other three —
  Analysis still shows both MPI charts, only Goals narrows its set (`src/lib/domain/goals.ts`'s `GoalMetric` enum;
  `GoalsPage.tsx` filters `trendMetrics(kind)` down to it before rendering). No new metric is added to
  `trendMetrics()` itself (see §7 for the miss-rate idea that stays out of scope).
- A goal is **not** tied to a baseline or a date range. Setting "Group size ≤ 2.5 MOA" means exactly that, at any
  time, against whatever sessions the screen's own range filter is currently showing — the same range filter
  Patterns and Analysis already have (`patterns.md` §3), reused verbatim.

## 2. Storage: an append-only log, one row (`data-model.md` §2/§6 addition)

```ts
export const GoalLogEntry = z.object({
  id: z.string(),
  view: z.enum(['sight-in', 'confirm', 'precision-prone', 'precision-standing']),
  metric: z.enum(['score', 'group', 'rms', 'mpiX', 'mpiY']),
  value: z.number(),     // the metric's own unit: %, MOA or mm
  setAt: z.string(),     // UtcIso
});
export type GoalLogEntry = z.infer<typeof GoalLogEntry>;

export const GoalsStore = z.object({
  schemaVersion: z.literal(1),
  key: z.literal('app'),
  entries: z.array(GoalLogEntry),
});
export type GoalsStore = z.infer<typeof GoalsStore>;
```

Store `goals`, keyPath `key`, one row (`key: 'app'`), the same one-document-per-feature shape `settings` already
uses (`data-model.md` §5) — simplest possible schema for a handful of entries over a lifetime of use, no index
needed. **Setting a goal never edits or deletes a row**: it appends a new `GoalLogEntry`. There is no
`achievedAt`, no `baselineValue`, no `amountKind` — achievement and history both fall out of reading the log, never
out of a separately maintained flag (see §4).

- **Current goal** for a (view, metric) pair: the entry with that (view, metric) and the latest `setAt`.
- **Goal as of a date**: the entry with that (view, metric) and the latest `setAt` **at or before** that date; `null`
  before the first entry for that pair.
- `docs/spec/data-model.md` §6's store table gains `goals` (no indexes). `AsaDbSchema`'s IndexedDB version moves
  2 → 3 (`src/lib/store/db.ts`); the `upgrade` callback changes from its two early-return branches to cascading
  `if (oldVersion < N)` blocks (never skipping a store a still-older database is also missing).

## 3. Screen (`#/goals`, fourth tab)

- Tab bar (`src/lib/app/nav.ts`, `src/components/nav/TabBar.tsx`): `MAIN_TABS` gains `{ id: 'goals', label: 'Goals',
  to: '/goals' }`; the bar's `grid-cols-3` becomes `grid-cols-4`; a new icon in the existing stroke-SVG style (a
  star, echoing §4's marker). `activeTab()` recognises `/goals`.
- Route `/goals` → `GoalsPage`, inside the same `ServicesLayout`/`AppShell` every other main screen uses.
- **Same `ViewRangeControls`** as Patterns and Analysis (`testIdPrefix="goals"`), unmodified: the view switch and the
  six-stop date-range slider. The range filters which sessions' dots are plotted, exactly as it does on Analysis —
  and because the goal line (§4) is a step function over those same sessions' x-positions, widening the range is
  also how a goal's own history comes into view (there is no separate scrubber for it). A one-line hint under the
  slider on this screen only (`goals-range-hint`) says so, since nothing else on screen implies the range control
  does double duty (owner, 2026-09-30).
- Below it, one chart per metric for the selected view (`trendMetrics(kind)`, same `sessionTrend`/`filterByRange`
  pipeline Analysis already runs) — reusing `analysis.md` §4's geometry (`chartGeometry`) but each chart also draws
  the goal line (§4) and carries a **Set goal** control (§5).
- Empty/thin states match Analysis: "No sessions here yet" with none; a chart with no goal yet just shows the data
  line, no "not enough shots" floor beyond what `chartGeometry` already does (an empty chart says "No sessions with
  this measure in the range", as today).

## 4. The goal line: a step function over the same x-axis as the data

The chart's x-axis is one session per evenly-spaced position, in order (`analysis.md` §4 — deliberately not a true
time scale, "so a burst of sessions stays readable"). The goal line **reuses exactly those x-positions**: for each
session in the trend, look up the goal in effect **as of that session's date** (§2's "goal as of a date"), giving a
second `Array<number | null>` the same length as the data values. Both series are run through the existing
`chartGeometry()` (`analysis.md` §4a) with a shared `domainFrom` (data values ++ goal values), so they share one
y-axis and the same x-position per index — no date-to-pixel interpolation, no change to `chart.ts`'s geometry
functions.

Reading the result left to right **is** the goal's history: flat until the first session on/after a `setAt`, then a
step to the new value, flat again until the next one. Widening the range slider to "All time" shows more of that
history; there is no separate scrubber. **Achieved** is not a stored state — it's the data line meeting or crossing
the goal line, visible on the chart by construction. A session before any goal was ever set for that pair draws no
goal line (not zero, not the first goal retroactively).

Drawn as a second path, distinct from the data line and the existing least-squares trend line (`stroke-dasharray`,
a colour distinct from both — `PALETTE.ellipse`/`#3AA8F8`-family blue reads as "a marked target" elsewhere in the
app's diagrams and is free here since the trend chart draws neither the group ellipse nor the MPI marker).

## 5. Setting a goal: drag (or tap) a star on the chart

**M27** shipped a numeric entry (a **Set goal** button opening a small text field). **M28** replaced it entirely
with direct manipulation, per the owner's own review of the shipped M27 screen: pressing and dragging anywhere on
the chart's plot area places the star at that Y position, with a live preview (`Setting: <value>`) shown while the
pointer is down; releasing calls the service (§6) and appends a `GoalLogEntry`. A bare tap (press, no move, release)
works the same way — it's a zero-distance drag. The star always sits at the plot's right edge (the same x every
metric's "now" reads at), since a goal is a Y-only quantity with no x of its own (§1).

The draggable range is clamped to the chart's own currently visible y-domain (`chart.ts`'s `domain`, the same nice-
rounded bounds the axis ticks use) — a drag can't leave the visible axis in one gesture. Saving a value at that
edge widens the domain on the next render (it's now one of the values `chartGeometry`'s `domainFrom` sees), so a
goal further outside the current data's range is reached by dragging to the edge, releasing, then dragging again.

**Keyboard** (desktop, and anyone who can't drag): the plot is a focusable `role="slider"` — Left/Down and
Right/Up nudge the value by a per-metric step (`KEYBOARD_STEP` in `GoalChart.tsx`: 1% for score, 0.1 MOA for group,
0.5 mm for RMS and each MPI axis), Page Up/Down nudge by five times that, Home/End jump to the domain's ends. Unlike
a native `<input type="range">`, a key press only updates a **local, unsaved preview** — nothing is written to the
append-only log (§2) until **Enter** (or the control loses focus); **Escape** cancels the preview, restoring
whatever the current goal already was. This is a deliberate departure from native range-input semantics, forced by
§2's storage model: committing a `GoalLogEntry` on every arrow-key repeat would flood the log with incidental
in-progress values instead of the goal-setting decisions it's meant to hold.

The stored shape (§2) did not change for this milestone: dragging and the keyboard both just call the same
`setGoal` (§6) M27 already built.

## 6. Service (`src/lib/services/goals.ts`)

```ts
export async function listGoals(ctx: ServiceContext): Promise<GoalLogEntry[]>;
export async function setGoal(
  ctx: ServiceContext,
  input: { view: PatternView; metric: GoalMetric; value: number },
): Promise<GoalLogEntry>;
```

Pure helpers live in `src/lib/goals/model.ts` (no clock, no storage, unit-tested directly):

```ts
export function currentGoal(entries: GoalLogEntry[], view: PatternView, metric: GoalMetric): GoalLogEntry | null;
export function goalAsOf(entries: GoalLogEntry[], view: PatternView, metric: GoalMetric, atIso: string): GoalLogEntry | null;
export function goalSeries(entries: GoalLogEntry[], view: PatternView, metric: GoalMetric, trend: TrendPoint[]): Array<number | null>;
```

`setGoal` reads the stored row, appends (`id: ctx.newId()`, `setAt: ctx.now().toISOString()`), writes it back — the
same prepare-then-one-transaction shape every other write in this app follows (`data-model.md` §6 rules).

## 7. Out of scope

- A new "miss rate" trend metric for goals like "zero misses on Confirm" (the owner's own example). `PatternPoint`
  already carries the real, position-aware scoring `zone` for sighting shots (`patterns/collect.ts`), so a 6th
  `TrendMetric` — the share with `zone === 'miss'` — is well-defined and cheap to add later, but `trendMetrics()`
  and its charts are shared with the already-shipped Analysis screen and the coach image's fixed three-box layout
  (`analysis.md` §5), so it is deliberately not touched in the same change that adds Goals. Until then, "no misses"
  reads approximately as "Hit rate = 100%" on the existing Score/Hit rate chart.
  A precision-specific "ring 8" goal (the prone-equivalent boundary `characterize-result.ts`'s `discRadiusMm` now
  uses) is not part of this idea at all — `PatternPoint` carries no ring-8 hit/miss flag, only the scored `ring`.
- A separate goal-history list screen. The step-line (§4) is the history view for v1.
- Deleting or editing a past log entry. The log is append-only; a mistaken goal is corrected by setting a new one.
- Goals for precision's ring (score already reflects ring performance) or any metric not already in `trendMetrics()`.
