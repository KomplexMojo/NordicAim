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
| **Accuracy (RMS)** (REV-128) | the **root-mean-square distance of every shot in the session from the bullseye**, `sqrt(mean(x² + y²))` in mm: the target screen's accuracy (`accuracyRmse`, REV-60), pooled over the session's shots. Lower is closer |
| **MPI left / right** | the mean point of impact of every shot in the session, x in mm (+ right) |
| **MPI up / down** | the same, y in mm (+ high) |

The group size averages each target's spread rather than spreading the whole session: shots from different targets would
otherwise add the drift between them to the group. Accuracy needs no such care: every shot is measured from the same fixed
point, the bullseye, so pooling the session's shots is exact.

Accuracy (RMS) is one number for "how far from the centre", combining how big the group is and how far off centre it sits
(RMS² = MPI offset² + the shots' mean squared distance from their own centre). Unlike the score it is not rounded to rings or
zones, so it keeps moving when most shots already score 10 or hit; unlike the two MPI charts it has no sign, and lower is
always better. It uses every shot, not just the widest two, so it is steadier from session to session than the group size.

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

## 4a. Trend lines (REV-129, owner 2026-09-28)

- Every chart with **at least 3 sessions** that have a value (`MIN_TREND_SESSIONS`) gets a **trend line**: the ordinary
  least-squares fit of the value on the session's **index**, the same evenly spaced x the chart uses (§4), over the
  sessions that have a value (`leastSquares`, `chart.ts`). Two points would only restate the line between them.
- It runs from the first to the last session with a value, **dashed** (1.5 px, `5 3`) in the text colour so it never
  reads as another series, drawn over the data line. A fitted end that falls past the chart's domain is **clipped** to it;
  the domain is not widened, because several series can share one (§5).
- Under the chart's note it is written out as a signed change per session in the metric's unit (`formatChange`):
  `Trend: +1.3% per session`, `−0.12 MOA per session`, `−0.3 mm per session`; `±` when it rounds to zero. The slope
  is per session, not per day, because sessions are spaced evenly. The words stay neutral: for Score and Hit rate up is
  better, for Group size and Accuracy down is better, and for the MPI charts better is towards 0.

## 5. The coach image (REV-124, owner 2026-09-27)

> "Create an aggregate image like we have on the brag sheet, but … the trending analysis charts on the same image down below
> the diagrams of each of sighting in, confirmation, precision standing and precision prone … from the entire left to the
> entire right of the image … The horizontal axis should show the sessions and it should be aligned for all of the analysis
> items … stamped with the athlete's information."

- **From:** a **Coach image** card on the Analysis screen. **Make coach image** builds and stores it and shows a preview;
  **Share** then hands the stored PNG to the share sheet (`shareArtifact`). There are two taps because iOS opens the share
  sheet only directly inside a tap, and building the image takes longer than that allows. Nothing leaves the phone
  until Share. The card is shown when any view has shots, and it resets when the range changes.
- **Covers:** the screen's **date range** (§1), for every view. The Patterns drawings use every recorded shot's size
  factor, so they match the Patterns screen.
- **Layout** (`render/trends-sheet.ts`, `render/trends-band.ts`), 1440 wide, drawn at exactly the size it is rasterised:
  - **Header** (120): `Shooting trends`, the range and generation time, and the NordicAim wordmark and mark.
  - **Grid** (1440): the four Patterns drawings in the order Sight in, Confirm (top), Precision prone, Precision standing
    (bottom). Each has its view mark (REV-122), name and totals (score or hit rate, shots, sessions), or `No shots in
    this range`.
  - **Trends band** (170 + 300 per chart + 10):
    - a title, the session count and span, and a legend showing each view's mark and line colour;
    - one **full-width chart per metric** (§3, five since REV-128), each with **one line per view**, all on **one shared session axis**: a
      session sits at the same x in every chart, evenly spaced, with up to 8 dates (always the first and the last);
    - all four lines of a chart share one y axis (`chartGeometry`'s `domainFrom`), with a zero line on the MPI charts;
    - from 3 sessions, each view's **trend line** (§4a), dashed (2.5 px, `12 8`) in the view's own colour; the subtitle
      adds `dashed: the trend`;
    - a column at the right gives each view's latest value;
    - points are marked while there are ≤ 40 sessions. Past that the line alone reads better, but a lone point between
      gaps is always marked.
  - **Footer** (110): the athlete line `Athlete: <name> · <club> · Stamp: <stamp>` (REV-100, when set) and the credit
    `Generated by NordicAim created by KomplexMojo release <sha>`.
- **Colours:** the reference categorical palette's first four slots (Sight in blue `#2a78d6`, Confirm orange `#eb6834`,
  Prone aqua `#1baf7a`, Standing yellow `#eda100`), validated on the panel `#EAF2F8` with the dataviz validator.
  Lightness, chroma, CVD (worst adjacent ΔE 9.1) and normal-vision separation all pass. Three are below 3:1 contrast, so
  every series is also named, with its view mark, in the legend and in the latest-value column: colour is never the
  only key.
- **Stored** as blobs `trends:<id>:png` and `trends:<id>:json`. The sidecar holds the range, session count, renderer
  version, sha256 and the stamped payload; it has no image data and no GPS. The newest **3** are kept
  (`KEEP_TRENDS_IMAGES`), and backups copy them like every blob. `TrendsArtifact` is branded only in
  `composite/trends-build.ts`.
- **Stamp:** with a key set, the image is stamped over `buildTrendsPayload` (`provenance/payload-trends.ts`): the
  athlete, the range, the release, the time, and every number the trends band draws. `#/verify` does not yet recognise
  trends stamps (it looks up session summaries).

## 6. Not in this version

- **Group-pattern notes** (BACKLOG B12).
- **Verifying a coach image's stamp** in `#/verify`.
