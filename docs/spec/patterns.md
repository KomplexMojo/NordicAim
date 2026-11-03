# Patterns screen (REV-64, issue #19)

Where every recorded shot from every session lands, per kind of target, over a long period. View-only. Reads stored
analyses; reads no photo; nothing leaves the phone.

## 1. Views (owner decisions 2026-09-20, recommendations of issue #19 accepted)

| View id | Label | Which targets |
|---|---|---|
| `sight-in` | Sight in | sighting targets whose effective role is `sight-in` |
| `confirm` | Confirm | sighting targets whose effective role is `confirm` |
| `precision-prone` | Precision prone | every precision **unit** whose `position` is `prone` |
| `precision-standing` | Precision standing | every precision **unit** whose `position` is `standing` |

**View buttons (issue #90).** On Patterns and Analysis the four views are one compact row: each button shows the view's
mark over a short name (*Sight in*, *Confirm*, *Prone*, *Standing*), 56 px tall, with the full label as its accessible name.
The date-range slider below is unchanged. Goals uses the same compact buttons for its two views (owner, 2026-10-01).

The role is the owner's choice (`categorization.sightingRole`, REV-67) or, when not chosen, inferred by
`sightingRoles`: the oldest unset target is Sight in (unless one is explicitly Sight in), every other unset one is Confirm.

Each view's drawing is headed by the results cards' own mark for it (REV-122, issue #58): the sight-in scatter, the
confirm scope sight, or the prone / standing bar (`renderPatternViewMark`, `render/diagram-marks.ts`), then the view's
label and the score star.

## 2. Which targets count

Included: `photo.status === 'analyzed'`, `analysis.computed !== null`, and `analysis.pipeline.alignment.method` is `cv` or
`manual` (a measured or owner-confirmed alignment; an unconfirmed overlay guess would place shots wrongly). Everything else
is **left out** and counted; the screen says `N targets left out`. Assumed misses have no position and are not drawn.
Shots are the located **units** of `computed.result.all.units`, in mm from the target centre.

## 3. Range: the most recent sessions (REV-156)

How many of the most recent sessions **that have shots in the view** to show (`filterByRange`, `RANGE_SESSIONS`): **Latest
session** (default, owner, 2026-09-30), **Last 5**, **10**, **20**, **30 sessions**, **All sessions** (owner, 2026-10-03, in place of 3, 5, 10 and 20). Newest is the latest
`session.sessionDate`, then the latest session creation time; each kept session brings all its shots. Fewer sessions than
the range asks for keeps them all. Nothing counts back from today, so `patterns/` needs no date (owner, 2026-10-02: day
ranges such as *30 days* went empty under a season out of its months). The slider's ticks read **Last, 5, 10, 20, 30, All**,
above the track, left to right — ascending from the smallest session count to the largest, as a slider's min-to-max
convention expects (owner, 2026-10-04; previously **All, 30, 20, 10, 5, Last**, descending, which read backwards). The
season row's own leftmost **All** is unrelated: it's a categorical reset, not a point on a magnitude scale, so it keeps
its own position. `PATTERN_RANGE_LABEL` is each stop's accessible name. A saved address with an old day range (`range=90`) or the dropped
3-session stop falls back to the latest session (an old `range=30` now reads as 30 sessions). The dots and the summary change together.

**What is shown, in a sentence** (`showingSentence`, `components/patterns/RangeShowing.tsx`): under the season row, on
Patterns and Analysis, e.g. *Showing your last 5 winter sessions.*, *Showing all 4 of your summer sessions.* (fewer than
asked for), *Showing your latest session.* A season with no sessions in the view reads *No fall sessions here yet.* with a
**Show every season** button.

### 3a. Season (REV-154, issue #29)

Under the range, one row of five small buttons (`components/patterns/SeasonFilter.tsx`, `testIdPrefix-season-<id>`):
**All** (default, all four season pictograms in a line, same size as the others, owner 2026-10-04 — the four season
buttons share whatever width is left over), then **Winter**, **Spring**, **Summer**, **Fall** as the summary image's
season pictograms (REV-108, `renderSeasonGlyph`). A shot's season is its target's (`targetSeason`): the season chosen
on the photo (REV-79), else
its capture date's (`suggestSeason`), else the session date's. `filterBySeason` runs **before** the range, so
*Last 5* under Winter is the last five winter sessions. The choice lives in the address (`season=`, absent = All)
with the view and range. The same row, with the same rule, is on Analysis (`analysis.md` §1), Goals (`goals.md` §3)
and Home, where a session shows under a season when any of its targets counts in it (a target with no season of its
own, or a session with no targets, goes by the session date; `sessions/seasons.ts`).

## 4. Summary (per view, over the shown points)

`shots`, `targets`, `sessions`; the mean point of impact (mm and MOA via `mpiOffset`, at 50 m); the group ellipse
(`groupEllipse`); and extreme spread. Precision views: the share of shots per ring (10 … 0) under the scoring rule in force
(the units already carry it) and the average ring. Sighting views: the share landing in the target's hit zone
(`unit.zone` is `clean` or `hit`). Fewer than **10** shots shows the numbers but says `Patterns need more shots` and draws
no ellipse. No conclusions are invented.

## 5. Drawing (`render/patterns.ts`, pure)

A 1200 px square SVG, no page background, of the printed target (the detail diagram's target drawing) with the **same outer diameter in all four views** (halo radius 525 px). One shared zoom-out
(`patternsSizeFactor`, from every recorded shot, not the range) makes it small enough that the farthest shot of any view is on
the paper (floor 0.5×), so **every** shot shows (strays included) and the size never changes between views or ranges. Each shot is an 8 px-radius dot, red-orange `#FF3B1F` at opacity 0.6 with a thin white edge (bright enough to see on a phone,
on both the black disc and the white rings), so overlap deepens. The mean point of impact marker is drawn; the ellipse only when the summary allows it. Above 5 000
points the dots are drawn as one path per 500 (still SVG; a canvas fallback is not needed at this size).

## 6. Screen

`#/patterns`, the **Patterns** tab on the bottom bar (REV-136). A view switch (four buttons), a range
switch (a six-stop slider, §3), the drawing, the summary, and the left-out count. The drawing can be zoomed. Empty and thin states are
plain sentences. Not shareable on its own; its four drawings are part of the Analysis coach image (`analysis.md` §5, REV-124) and the
Patterns coach image (§7, REV-163).

**From a dot to its target (REV-140, issue #72).** The view and range are in the address (`#/patterns?view=confirm&range=90`,
`src/lib/patterns/url.ts`). A tap on the drawing lists, under it, every target with a shot within 22 CSS px of the tap (a 44 px
target at any zoom), nearest first (`pickTargets`, `src/lib/patterns/pick.ts`): its session's date and time, how many of its
shots are there, and **Open target** (`#/sessions/:sid/photos/:pid`). A tap with no shot near says so. Nothing opens on the
tap itself. The target screen's back link then reads **Back to Patterns** and returns to the same view and range; opened any
other way it is **Back to results**, as before (`backToFrom`, `src/lib/app/nav.ts`). The coach image has no links.

## 7. The coach image: *Group patterns* (REV-163, owner 2026-11-03)

> "the analysis screen has "Coach Image" that generates an overview. Create the equivalent for patterns and goals … The
> "Coach Image" for groups should assess groupings and provide information related to groups."

- **From:** a **Coach image** card under the summary (`components/patterns/PatternsImageCard.tsx`), shown when any view has
  shots. Two taps, as on Analysis (`analysis.md` §5): **Make coach image** builds, stores and previews it; **Share** hands the
  stored PNG to the share sheet. Nothing leaves the phone until Share. The card resets when the range or season changes.
- **Covers:** the screen's **season, then range** (§3, §3a), for **all four views** whichever is selected. The drawings use
  every recorded shot's size factor, as on the screen. When the single-load filter (issue #112) lands, it applies here too and
  the header names it.
- **Numbers** (`patternsCoach`, `src/lib/patterns/coach.ts`, pure), per view over the shots shown:
  - the §4 summary and REV-88's characteristics of **all the shots as one group** (as the Observed patterns panel);
  - **typical single target**: the median of each target's own group size (extreme spread, MOA at 50 m) over targets with two
    distinct shots, beside all the shots together. The words stay neutral: the gap is how far the group moves from target to
    target;
  - **issue counts**: each target with at least `THRESHOLDS.minShots` shots is characterised on its own; each issue gives how
    many of those targets show it, and whether the whole set does. Most targets first, ties in rule order (`ISSUE_IDS`); an
    issue only the whole set shows reads `all shots together`.
- **Layout** (`render/patterns-coach.ts`, `render/patterns-coach-row.ts`), 1440 wide, drawn at the size it is rasterised:
  - **Header** (120, `render/coach-frame.ts`): `Group patterns`, the range, the season and the time.
  - **Key** (100): sizes are at 50 m and group size is the widest spread; issue rules are provisional, a starting point to
    talk through with a coach.
  - **One row per view** (600), in the order Sight in, Confirm, Precision prone, Precision standing: the Patterns drawing
    (520 px) on the left, with `Patterns need more shots (at least 10)` under it when thin; on the right the view's mark,
    name and totals (score or hit rate, shots, targets, sessions), then four boxes: **Group size** (MOA, and mm widest
    spread), **Mean radius** (MOA, and mm from its centre), **Centre (MPI)** in words, **Shape** and its flyer count; then
    **Target to target**, **Where the shots land** (precision: a bar of the share in each ring, the average ring and the
    share that would miss the position's hit zone; sighting: the share in the target's hit zone) and **Potential issues**
    (up to four chips, the last reading `+N more on the Patterns screen` when there are more). A view with no shots is a
    short row (140): `No shots in this range`.
  - **Footer** (110): the athlete line and the credit, as on the Analysis image.
- **Stored** as blobs `patterns-coach:<id>:png` and `:json` (the range, season, session count, renderer version
  `PATTERNS_COACH_RENDERER_VERSION`, sha256 and the stamped payload; no image data, no GPS), the newest **3** kept. It is a
  `TrendsArtifact` of kind `patterns` (`composite/coach-store.ts`), shared under the same rule. Backups copy it like every blob.
- **Stamp:** with a key set, over `buildPatternsCoachPayload` (`provenance/payload-coach.ts`): the athlete, filters, release,
  time, and per view its sessions and every number the image prints. `#/verify` does not yet recognise it.

