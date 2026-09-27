# Analysis screen: trends over time (REV-123, issue #57)

How each kind of target trends from session to session. View-only. It reads the same stored analyses as Patterns
(`patterns.md`), reads no photo, and nothing leaves the phone. Patterns shows **where** the shots land, pooled; Analysis
shows **how the numbers move**, one data point per session.

Code: `src/lib/analysis/trend.ts` and `chart.ts` (pure), `src/routes/analysis/AnalysisPage.tsx`,
`src/components/analysis/TrendChart.tsx`, the shared `src/components/patterns/ViewRangeControls.tsx`.

## 1. Where it lives, views and ranges (owner, 2026-09-27)

- Route **`#/analysis`**, reached from an **Analysis** icon in the app header, beside **Patterns** (a small line chart).
- The same four views as Patterns (`patterns.md` §1): **Sight in**, **Confirm**, **Precision prone**, **Precision
  standing**. They use the same buttons (`ViewRangeControls`).
- The same date ranges and buttons as Patterns (`patterns.md` §3): latest session, this week, 30 days, 90 days, all time.

## 2. Which shots, and one point per session

The shots are exactly the ones Patterns would show for the view and range (`collectPatterns`, then `filterByRange`), so
the same targets are left out (`patterns.md` §2) and the screen says how many. They are grouped by session: **one data
point per session** that has shots in the view, oldest first (session date, then creation time). A session with no shots
in the view has no point.

## 3. Metrics (one chart each)

| Chart | Value per session |
|---|---|
| **Score** (precision) | the average ring over the session's shots, as a percentage of 10: the Patterns score star (`patternsScorePercent`) |
| **Hit rate** (sighting) | the share of the session's shots in the hit zone (`hit` or `clean`): the Patterns score star |
| **Group size** | the **mean of each target's extreme spread**, in MOA at 50 m. A target with fewer than two distinct shots has no spread and is skipped; with none left, the session has no value |
| **MPI left / right** | the mean point of impact of every shot in the session, x in mm (+ right) |
| **MPI up / down** | the same, y in mm (+ high) |

The group size averages each target's spread rather than spreading the whole session: shots from different targets would
otherwise add the drift between them to the group.

## 4. Charts

- Small multiples: one chart per metric, each **one series on one axis**. Never a dual axis. A single series needs no
  legend; the title names it.
- Sessions are spaced **evenly** left to right in order, not to a time scale, so a burst of sessions stays readable. The
  first and last session dates label the ends.
- The y axis covers every value, rounded out to 1/2/5 × 10ⁿ ticks (`niceStep`, about four intervals), with hairline
  gridlines. The MPI charts always include 0 and draw a **zero line** (0 = centred).
- A 2 px line, and points of r 4 with a 2 px ring in the card colour. A session with no value breaks the line.
- The chart's header shows the **latest** value. Tapping a point, or focusing it and pressing Enter, reads that
  session's date and value there instead. Every point also carries a native tooltip.
- **Show data** opens a table of every session and value as text: the accessible view of the same numbers.
- With one session in the range, the charts still draw that point, and the screen says a trend needs at least two.

## 5. Not in this version

- **Exporting a coach image** (issue #57, questions 4–6). A trends image would be a new shareable artifact type, so it
  needs the owner's decision on the share rule first.
- **Group-pattern notes** (BACKLOG B12).
