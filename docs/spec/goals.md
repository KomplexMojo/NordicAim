# Goals screen: set and track targets over time (issue #97)

A **Goals** tab lets the athlete mark where they want each trend metric to be, per view, see that target drawn on
the same chart Analysis already draws, and see whether the sessions shot since setting it have hit it. Only the
**current** goal is ever shown: changing a goal starts over, and earlier goals are not drawn (owner, 2026-10-01).
View-only except
for setting a goal's value; reads the same stored analyses as Patterns and Analysis (`patterns.md`, `analysis.md`),
reads no photo, and nothing leaves the phone.

## 1. What a goal is

A goal is **one number, in a metric's own unit, for one (view, metric) pair** — not a direction, not a percentage,
not a baseline. "Direction" (higher is better vs lower is better) is a property of the **metric** (`analysis.md`'s
`TrendMetric`), not of the goal: the goal is just a Y-value on that metric's chart, and whichever side of it counts
as "met" follows from the metric already knowing which way is better.

- **Views**: the two precision views, Precision prone and Precision standing (`GoalView` in
  `src/lib/domain/goals.ts`). Sight in and Confirm were dropped from Goals (owner, 2026-09-30); a URL naming one
  falls back to Precision prone.
- **Metrics** (`GoalMetric` in `src/lib/domain/goals.ts`; the charts are `goalMetrics(view)` in
  `src/lib/goals/metrics.ts`), in order:
  - Three of the five `trendMetrics()` computes (`analysis.md` §3, `src/lib/analysis/trend.ts`): Score (%), Group
    size (MOA), Accuracy/RMS (mm). MPI left/right and MPI up/down are **not** goal-able (owner, 2026-09-30): each
    plots a signed *position* along one axis, not a single magnitude, so a goal Y-value doesn't read as "better" or
    "worse". Analysis still shows both MPI charts.
  - **Biathlon hits** (`zoneHit`, %), Goals only (REV-146, owner, 2026-10-01): per session, the share of shots that
    would hit the biathlon hit zone for the view's position — 45 mm prone, 115 mm standing — with the scoring rule's
    touch (`hitsZone` in `src/lib/scoring/sighting.ts`: `r − h ≤ R`, h half the scoring rule's hole diameter,
    REV-56). The same test as Observed patterns' outside-the-zone share (`shooting-issues.md`'s `q`), so the two
    agree. The precision sheet has rings, not hit zones, so this measures the real zone sizes rather than a ring
    (the nearest, ring 8, is 1.3 mm tighter than the prone zone; standing's zone sits between rings 4 and 3).
    `goalTrend` adds it to each session's `TrendPoint` as `zoneHitPercent`; `trendMetrics()` is not touched, so
    Analysis and the coach image don't chart it.
- A goal is **not** tied to a baseline or a date range. It is measured from the moment it was set (its `setAt`)
  against the sessions shot since (§4). There is no date-range control on Goals (owner, 2026-10-01: the slider
  "is just going to confuse people").

## 2. Storage: an append-only log, one row (`data-model.md` §2/§6 addition)

```ts
export const GoalLogEntry = z.object({
  id: z.string(),
  view: z.enum(['sight-in', 'confirm', 'precision-prone', 'precision-standing']),   // every view ever written
  metric: z.enum(['score', 'group', 'rms', 'mpiX', 'mpiY']),                       // every metric ever written
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
`achievedAt`, no `baselineValue`, no `amountKind` — whether a goal is hit is computed on read (§4), never stored as
a separately maintained flag. Earlier entries for a pair stay in the log but are never shown.

- **Stored vs goal-able.** The stored entry schema accepts every view and metric an entry has ever been written
  with; the narrower `GoalView` (the two precision views) and `GoalMetric` (score, group, rms) only limit what the
  screen offers and what `setGoal` (§6) will write. Entries saved before the narrowing (Sight in, Confirm, MPI) stay
  in the log, readable but never shown. Validating stored rows against the narrowed sets instead made a single old
  entry fail the whole row, so every read and write threw and the arrow buttons silently did nothing (owner's
  phone, 2026-10-01). Any future narrowing must keep the stored enums wide.
- **Current goal** for a (view, metric) pair: the entry with that (view, metric) and the latest `setAt`; `null`
  before the first entry for that pair. It is the only goal the screen reads.
- `docs/spec/data-model.md` §6's store table gains `goals` (no indexes). `AsaDbSchema`'s IndexedDB version moves
  2 → 3 (`src/lib/store/db.ts`); the `upgrade` callback changes from its two early-return branches to cascading
  `if (oldVersion < N)` blocks (never skipping a store a still-older database is also missing).

## 3. Screen (`#/goals`, fourth tab)

- Tab bar (`src/lib/app/nav.ts`, `src/components/nav/TabBar.tsx`): `MAIN_TABS` gains `{ id: 'goals', label: 'Goals',
  to: '/goals' }`; the bar's `grid-cols-3` becomes `grid-cols-4`; a new star icon in the existing stroke-SVG style.
  `activeTab()` recognises `/goals`.
- Route `/goals` → `GoalsPage`, inside the same `ServicesLayout`/`AppShell` every other main screen uses.
- **View switch only** (`ViewSwitch` from `ViewRangeControls.tsx`, `testIdPrefix="goals"`, offering only the two
  `GoalView`s): no date-range slider and no range hint (owner, 2026-10-01). The view lives in the address
  (`?view=`), as on Patterns and Analysis. Patterns and Analysis keep their full `ViewRangeControls`, unchanged.
- Below it, one chart per goal-able metric for the selected view (`trendMetrics('precision')` filtered to
  `GoalMetric`), plotting **every** session for that view (`sessionTrend`, no `filterByRange`) — reusing
  `analysis.md` §4's geometry (`chartGeometry`) plus its least-squares trend line, the current goal line and status
  (§4), and a pair of up/down buttons to set it (§5).
- Empty/thin states match Analysis: "No sessions here yet" with none; a chart with no goal yet just shows the data
  line, no "not enough shots" floor beyond what `chartGeometry` already does (an empty chart says "No sessions with
  this measure yet": Analysis's "in the range" wording doesn't apply without a range).

## 4. The current goal: one line, and whether it's hit

Each chart draws the **current goal** (§2) as one **solid**, full-width horizontal line (`goal-<metric>-indicator`)
at its value, or at the value being stepped to while a press saves (§5). The goal value joins the chart's y-domain
(`chartGeometry`'s `domainFrom`), so the line stays on the chart even when it sits outside every session's value;
`valueToY` (`src/lib/analysis/chart.ts`) places it. No goal yet: no line. Earlier goals are never drawn — there is
no history line and no "goal as of a date" (owner, 2026-10-01: "Going back in time is no longer a thing").

A status line under the chart title (`goal-<metric>-status`) says whether the current goal is hit:

- **Window**: the sessions whose `sessionStamp` (the session's `createdAt`, UTC ISO) is **at or after** the goal's
  `setAt`. Sessions from before the goal was set are charted but don't count. Sessions with no value for the metric
  are skipped.
- **Measure**: the plain mean of those sessions' per-session metric values (the same values the chart plots).
- **Hit**: compared in the metric's better direction (`GOAL_DIRECTION` in `src/lib/goals/model.ts`):

  | Metric | Better | Hit when |
  |---|---|---|
  | `score` (Score/Hit rate, %) | higher | average ≥ goal |
  | `group` (Group size, MOA) | lower | average ≤ goal |
  | `rms` (Accuracy/RMS, mm) | lower | average ≤ goal |
  | `zoneHit` (Biathlon hits, %) | higher | average ≥ goal |

- **Text**: "No sessions since this goal was set" while the window is empty (`data-hit="pending"`); otherwise
  "Average since set: {value} over N session(s) · **Hit**" or "· **Not yet**" (`data-hit="true"|"false"`).
- No goal yet: no status line.

The data line and the least-squares trend line (`analysis.md` §4a) are drawn as on Analysis; the goal line uses a
colour distinct from both (a sky blue, the `PALETTE.ellipse`/`#3AA8F8` family that reads as "a marked target"
elsewhere in the app).

## 5. Setting a goal: up/down buttons beside the chart

**M27** shipped a numeric entry (a **Set goal** button opening a small text field). **M28** tried replacing it with
a drag-a-star-on-the-chart gesture, then — after the owner tried the shipped drag build and asked for something
clearer, and a cross-browser pointer-capture issue in the drag gesture turned out to need its own fix — settled on
a plain **stepper**: two `size-11` (44 px) buttons, ▲ and ▼, stacked to the left of the chart, by the y-axis. Each
press moves the goal line (§4) by one step (`STEP` in `GoalChart.tsx`: 1% for score, 5% for Biathlon hits, 0.1 MOA for group,
0.5 mm for RMS) and **saves immediately** — there is no separate draft/preview state and no Save button; a press is
the decision. Clamped to a fixed, sensible range per metric (`BOUNDS` in `GoalChart.tsx`: score 0–100%, group and
RMS 0 and up — deliberately *not* the chart's own visible axis range, which for a single session is exactly
`[dataValue, currentGoal]` and would make "up" stop working the instant a goal is set); the button at a bound
disables rather than silently no-opping.

Native `<button>` elements need no custom pointer or keyboard code at all: Tab reaches them and Enter/Space
activates them for free, and a click behaves identically in every browser engine, which a drag gesture reading a
pointer position off an SVG element did not (WebKit's `setPointerCapture` support there lagged Chromium's). This
was the deciding factor alongside the plainer interaction model, once the drag build was in front of the owner.

Each press is one append-only `GoalLogEntry` (§2) — a burst of presses is a burst of entries, not one. This was a
deliberate trade favouring simplicity (no debounce, no batching) over a tighter log; only the latest entry is ever
read, so a busy log is invisible. **Changing a goal restarts its window** (§4): the new entry's `setAt` is now, so
the status goes back to "No sessions since this goal was set" until the next session.

## 6. Service (`src/lib/services/goals.ts`)

```ts
export async function listGoals(ctx: ServiceContext): Promise<GoalLogEntry[]>;
export async function setGoal(
  ctx: ServiceContext,
  input: { view: GoalView; metric: GoalMetric; value: number },
): Promise<GoalLogEntry>;
```

Pure helpers live in `src/lib/goals/model.ts` and `src/lib/goals/metrics.ts` (no clock, no storage, unit-tested
directly):

```ts
export const GOAL_DIRECTION: Record<GoalMetric, 'higher' | 'lower'>;
export function currentGoal(entries: readonly GoalLogEntry[], view: GoalView, metric: GoalMetric): GoalLogEntry | null;
export interface GoalProgress { sessions: number; average: number | null; hit: boolean | null } // hit null = pending
export function goalProgress<P extends Pick<TrendPoint, 'sessionStamp'>>(
  goal: Pick<GoalLogEntry, 'value' | 'setAt'>,
  metric: GoalMetric,
  trend: readonly P[],
  value: (p: P) => number | null,
): GoalProgress;

// metrics.ts
export interface GoalPoint extends TrendPoint { zoneHitPercent: number | null }
export function goalTrend(points: readonly PatternPoint[], view: GoalView, holeDiameterMm: number): GoalPoint[];
export function goalMetrics(view: GoalView): GoalTrendMetric[]; // Score, Group size, Accuracy (RMS), Biathlon hits
```

`holeDiameterMm` is the scoring rule's (`scoringDiameterFromSettings`), which `loadPatterns` now returns alongside
`handedness`.

`setGoal` reads the stored row, appends (`id: ctx.newId()`, `setAt: ctx.now().toISOString()`), writes it back — the
same prepare-then-one-transaction shape every other write in this app follows (`data-model.md` §6 rules).

## 7. Out of scope

- A new "miss rate" trend metric for goals like "zero misses on Confirm" (the owner's own example). `PatternPoint`
  already carries the real, position-aware scoring `zone` for sighting shots (`patterns/collect.ts`), so a 6th
  `TrendMetric` — the share with `zone === 'miss'` — is well-defined and cheap to add later, but `trendMetrics()`
  and its charts are shared with the already-shipped Analysis screen and the coach image's fixed three-box layout
  (`analysis.md` §5), so it is deliberately not touched in the same change that adds Goals. Until then, "no misses"
  reads approximately as "Hit rate = 100%" on the existing Score/Hit rate chart. (For the precision views this is
  now Biathlon hits, §1.)
- Any view of past goals (a history list or a history line on the chart). Only the current goal is drawn
  (owner, 2026-10-01); §8's checks name the goal a session was judged against, nothing more.
- A date-range control on Goals.
- Deleting or editing a past log entry. The log is append-only; a mistaken goal is corrected by setting a new one.
- Goals for precision's ring (score already reflects ring performance) or any other metric beyond §1's four.

## 8. Did a session meet its goals? (REV-148)

The owner (2026-10-01): "stamp the session image and data if we achieved the goals that we're set at the time of the
session".

- **Goal in effect** for a session and (view, metric): the entry with the latest `setAt` **at or before** the session's
  `createdAt` (`goalInEffect` in `src/lib/goals/model.ts`; the same boundary as §4's window). A goal set later never
  reaches back, so a session's checks never change when goals change; only a re-score (a scoring-rule change) can
  change its values.
- **Judged on the session's own value**, the point the Goals chart plots for it (`goalTrend`, from `collectPatterns`'s
  points, so the same targets count), in the metric's better direction (`meetsGoal`). A metric with no value for the
  session (e.g. one shot's group size) reads "—" and is not met.
- `sessionGoalChecks(entries, points, session, holeDiameterMm)` (`src/lib/goals/session.ts`) gives, per goal view with
  shots in the session and at least one goal in effect, the checks (`metric`, `goal`, `value`, `met`) in `goalMetrics`
  order and `allMet` (every check met). `goalChecksFor` / `loadSessionGoalChecks` (`services/goals.ts`) load it for a
  stored session under the scoring rule in Settings.
- **Shown:**
  - **Summary image** (`rendering-composite.md` §5): a green **seal** with a white tick on a precision target whose
    position's goals were all met, and a **Goals** table in the analysis band: one row per goal in effect (view on its
    first row, metric, *This session*, *Goal*, ✓ or ✗; "—" with no value).
  - **Results screen**: a *Goals* card (`results-goals`) with each view's checks and "All goals met" or "N of M met".
  - **Target screen**: a precision prone or standing target shows its position's card (`target-goals`).
  - **Goals chart**: a session that met the goal in effect when it was created has its dot ringed in green
    (`goal-<metric>-met`), with a one-line legend. The ring follows the goal of its own time, not the current one.
- Nothing is stored: the checks are worked out on read, and the summary image is rebuilt like any other change
  (`COMPOSITE_RENDERER_VERSION` 20).

