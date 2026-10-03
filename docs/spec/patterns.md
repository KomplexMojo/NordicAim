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
ranges such as *30 days* went empty under a season out of its months). The slider's ticks read **All, 30, 20, 10, 5, Last**,
above the track; `PATTERN_RANGE_LABEL` is each stop's accessible name. A saved address with an old day range (`range=90`) or the dropped
3-session stop falls back to the latest session (an old `range=30` now reads as 30 sessions). The dots and the summary change together.

**What is shown, in a sentence** (`showingSentence`, `components/patterns/RangeShowing.tsx`): under the season row, on
Patterns and Analysis, e.g. *Showing your last 5 winter sessions.*, *Showing all 4 of your summer sessions.* (fewer than
asked for), *Showing your latest session.* A season with no sessions in the view reads *No fall sessions here yet.* with a
**Show every season** button.

### 3a. Season (REV-154, issue #29)

Under the range, one row of five small buttons (`components/patterns/SeasonFilter.tsx`, `testIdPrefix-season-<id>`):
**All** (default), then **Winter**, **Spring**, **Summer**, **Fall** as the summary image's season pictograms (REV-108,
`renderSeasonGlyph`). A shot's season is its target's (`targetSeason`): the season chosen on the photo (REV-79), else
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
plain sentences. Not shareable on its own; its four drawings are part of the coach image (`analysis.md` §5, REV-124).

**From a dot to its target (REV-140, issue #72).** The view and range are in the address (`#/patterns?view=confirm&range=90`,
`src/lib/patterns/url.ts`). A tap on the drawing lists, under it, every target with a shot within 22 CSS px of the tap (a 44 px
target at any zoom), nearest first (`pickTargets`, `src/lib/patterns/pick.ts`): its session's date and time, how many of its
shots are there, and **Open target** (`#/sessions/:sid/photos/:pid`). A tap with no shot near says so. Nothing opens on the
tap itself. The target screen's back link then reads **Back to Patterns** and returns to the same view and range; opened any
other way it is **Back to results**, as before (`backToFrom`, `src/lib/app/nav.ts`). The coach image has no links.
