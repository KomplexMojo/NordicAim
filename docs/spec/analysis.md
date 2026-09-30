# Analysis screen: trends over time (REV-123, issue #57)

How each kind of target trends from session to session. View-only. It reads the same stored analyses as Patterns
(`patterns.md`), reads no photo, and nothing leaves the phone. Patterns shows **where** the shots land, pooled; Analysis
shows **how the numbers move**, one data point per session.

Code: `src/lib/analysis/trend.ts` and `chart.ts` (pure), `src/routes/analysis/AnalysisPage.tsx`,
`src/components/analysis/TrendChart.tsx`, the shared `src/components/patterns/ViewRangeControls.tsx`.

## 1. Where it lives, views and ranges (owner, 2026-09-27)

- Route **`#/analysis`**, reached from the **Analysis** tab (a small line chart) on the bottom tab bar, beside **Patterns** (REV-136; it was a header icon until then).
- The same four views as Patterns (`patterns.md` §1): **Sight in**, **Confirm**, **Precision prone**, **Precision
  standing**. They use the same buttons (`ViewRangeControls`).
- The same date ranges and slider as Patterns (`patterns.md` §3): latest session, 7 days, 14 days, 30 days, 90 days, all time.

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

- **Not on the MPI charts** (REV-133, owner 2026-09-28, `TrendMetric.trendLine`): they plot a signed position, so a line
  through 0 cannot tell swapping sides (6 mm left, then 6 mm right) from closing in; whether the group is getting closer to
  the centre is the Accuracy (RMS) chart's, and the coach image's MPI arrow's.
- Every other chart with **at least 3 sessions** that have a value (`MIN_TREND_SESSIONS`) gets a **trend line**: the ordinary
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
- **Layout** (`render/trends-sheet.ts`, `render/trends-averages.ts`), 1440 wide, drawn at exactly the size it is rasterised:
  - **Header** (120): `Shooting trends`, the range and generation time, and the NordicAim wordmark and mark.
  - **Grid** (1440): the four Patterns drawings in the order Sight in, Confirm (top), Precision prone, Precision standing
    (bottom). Each has its view mark (REV-122), name and totals (score or hit rate, shots, sessions), or `No shots in
    this range`.
  - **Averages band** (150 + 295 per view + 10; REV-131, owner 2026-09-28, in place of the trend charts, which stay on the
    Analysis screen):
    - the title `Averages in this range`, the session count and span, `each session counted once` and `charts over time are
      on the Analysis screen`, then the arrows' key (REV-132);
    - **one row per view**, in the grid's order: the view's mark, its name (two lines when it is two words and long) and
      its session count, or `No shots in this range`;
    - three small **number boxes** (270 × 270): **Score** (precision) or **Hit rate** (sighting), **Group size** and
      **Accuracy (RMS)**, each the view's **average** over the range (`coachAverages`: the mean of its session values,
      each session counted once), formatted as on the Analysis screen, with a one-line note; `—` with no value;
    - an **MPI box**: a simulated bullseye (two rings, at half and all of the scale, and a centre dot) on axes, **+x right
      and +y up**, with the ends labelled in mm; the **view's own mark** sits at the view's average MPI (x = mean of the
      session MPI x, y likewise), and under it the offset in words (`avg 10.0 mm right · 2.0 mm low`; an offset that rounds
      to 0.0 mm reads `centred`);
    - REV-133 (owner 2026-09-28): the average is the bias to dial out with the sights, but sessions on alternate sides
      average to about 0 and would look centred. So each session's MPI is also drawn as a **faint dot** under the mark
      (`mpiSessions`), and from 2 sessions a second line gives how far off a session **typically** sits, whichever way:
      the mean of each session's MPI distance from the centre (`mpiTypicalMm`), `sessions typically 6.0 mm off`;
    - every MPI box shares **one scale** (`mpiScale`): the first of 5, 10, 15, 20, 25 mm that is at least 15% past the
      largest offset of any session's MPI in any view, so positions compare across boxes. REV-134 (owner 2026-09-28): the
      scale is **never wider than ±25 mm** (`MPI_SCALE_MAX_MM`): an average drift of 25 mm is already large, and a wider box
      crowds everything near the centre. An MPI past the scale is **pinned just inside the rim** in its own direction
      (`placeMpi`): a session dot 4 px in, the view's mark far enough in to leave room for a small **arrowhead** between it
      and the rim, pointing out. The words under the box always give the exact offset;
    - **trend arrows** (REV-132, owner 2026-09-28): each box, from **3 sessions** with a value (as §4a), carries a small
      arrow at its top right that shows only the direction of the least-squares trend over the range (`trendOf`, the same
      fit as §4a): tilted **up** 30°, **level**, or tilted **down** 30°. The MPI box's arrow is the trend of the MPI's
      **distance from the centre** (per session `hypot(x, y)`): up is drifting away, down is closing in.
      - **Flat** when the fitted change across the range (slope × sessions spanned) is under **5% of the average** or
        under a floor in the box's unit (`FLAT_FLOOR`: score 1 %, group 0.02 MOA, accuracy and MPI 0.5 mm), whichever
        is larger, so a wobble never reads as a trend.
      - **Colour** says whether it is an improvement (`TREND_COLOUR`): green `#1E8E4E` improving (a score going up;
        a group, accuracy or MPI distance going down), red `#C8452F` worsening, grey `#5B6775` steady. The direction always
        carries the trend too, and each arrow has a `<title>` in words.
  - **Footer** (110): the athlete line `Athlete: <name> · <club> · Stamp: <stamp>` (REV-100, when set) and the credit
    `Generated by NordicAim created by KomplexMojo release <sha>`.
- **Colour:** each row is keyed by the view's mark and name, so the image needs no series colours.
- **Stored** as blobs `trends:<id>:png` and `trends:<id>:json`. The sidecar holds the range, session count, renderer
  version, sha256 and the stamped payload; it has no image data and no GPS. The newest **3** are kept
  (`KEEP_TRENDS_IMAGES`), and backups copy them like every blob. `TrendsArtifact` is branded only in
  `composite/trends-build.ts`.
- **Stamp:** with a key set, the image is stamped over `buildTrendsPayload` (`provenance/payload-trends.ts`): the
  athlete, the range, the release, the time, and every session value per view and metric (REV-131: the image draws their
  averages, which follow from them). `#/verify` does not yet recognise
  trends stamps (it looks up session summaries).

## 5a. From a point to its targets (REV-140, issue #72)

Tapping a chart point (already the readout, §4) also lists, under the chart, that session's targets of the view with **Open
target** each (`TrendPoint.photoIds`). The view and range are in the address (`#/analysis?view=…&range=…`), and the target
screen's back link reads **Back to Analysis** and returns to them. The points stay focusable, so it works from the keyboard.
Patterns does the same for a tapped dot (`patterns.md` §6).

## 6. Not in this version

- **Group-pattern notes** (BACKLOG B12).
- **Verifying a coach image's stamp** in `#/verify`.
