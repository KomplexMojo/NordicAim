# Design revisions (owner decisions)

`DESIGN.md` is kept verbatim. This file records the product owner's later decisions. **Where this file and
`DESIGN.md` disagree, this file wins; within this file, a later revision wins.** `PLAN.md` explains the reasoning.

## Current scope summary: MVP (as of 2026-09-14)

- **What the user does:** 1) take picture(s) of the targets, 2) add metadata, 3) receive the analysis.
- **What happens behind the scenes:** review the image → overlay it on the target template → pull photo metadata →
  incorporate the user's metadata → generate the analysis. **Scoring is the core of the analysis**: precision ring scores
  /100 with X count and tally, sighting hits/misses per zone, the `both` split, and ranges for unaccounted rounds. Also group
  size (mm, MOA, MRAD), MPI offset, per-target diagrams, and one session summary image to share.
- **Platform:** an installable web app that runs **entirely on the iPhone**, served as static files from GitHub Pages. No server.
- **Not part of the product:** Apple Health; any Garmin connection or upload (attaching the summary image in Garmin Connect is manual).
- **Everything else** is post-MVP, listed in [`BACKLOG.md`](BACKLOG.md).

## 2026-09-16: detection quality and correcting shots by hand

The owner compared real target photos with the diagrams the app produced and found the diagrams did not represent the photos.
Milestones **M16** (REV-27, REV-28) and **M17** (REV-29, REV-30); M15 now depends on both.

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-27 | **Printed ring numerals must not be detected as shots.** Detection rejects thin printed glyphs by shape (elongation and stroke width), with the thresholds measured on the owner's real photos. | M11 step 4 (printed *circles* erased; numerals survive) | "There needs to be some refinement of the image recognition. The diagrams don't represent the source images well." On `IMG_5132-precision.jpg` this produced 19 detections / 62 units against ~10 rounds. |
| REV-28 | **Always assume one hole to start, and never report more shots than the declared rounds.** Every automatic detection has `multiplicity` 1; overlapping holes stay one shot until the owner says otherwise. If detection finds more candidates than rounds fired, the best `declared` are kept, the rest are dropped and reported. A 10-round precision target can therefore never score above 100. | M11 step 5 (`multiplicity` inferred from blob area, 2–8) | "Some basic rules and constraints such as always assume one hole to start, and if there are 10 shots on a precision target the max score can be 100." |
| REV-29 | **Unfound shots are parked as draggable markers.** When detection finds fewer shots than rounds fired, the remainder appear as markers on the white margin beside the target; the owner drags each one onto the hole it belongs to. They are derived, never stored. | — | "If image recognition can only find 8 of 10 shots, place the shots it can't find as diagram images on the white somewhere out of the way. That will allow users to easily drag the icon over top of where it should be on the target." |
| REV-30 | **A compare slider under the target**: full left shows the diagram, full right shows the source photo, in between it wipes across. A fade mode (diagram's opacity over the photo) is the alternative the same control offers. | M12 step 4 ("a toggle to show the working photo") | "Add a horizontal slider where the diagram is so that the user can move it back and forth… If that is not possible try to use transparency to overlay a transparent diagram on top of a more opaque source image." |

## 2026-09-16 (evening): the rings must land on the paper

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-31 | **Alignment accuracy is measured, not assumed.** The template rings the app scores against must sit on the target's printed rings. `cv:eval` compares each detected calibration with the owner's hand-checked ground truth (centre, radius, axis ratio) on every real photo and fails when a photo is outside tolerance. A photo whose alignment cannot be verified says so rather than presenting a confident score. | M10/M11 acceptance (alignment judged only against two seed calibrations estimated by eye) | Owner's example analysis, 2026-09-16: on top of the numeral and multiplicity errors, the drawn rings were shifted up-and-left and too large — the outermost ring bulged past printed ring 1 on one side and cut inside it on the other. Scoring would be wrong even after the shots were fixed. |

## 2026-09-16: measuring the precision disc

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-26 | **Find the aiming mark inside a merged shape, and never measure the merged shape itself.** Two rules together: (1) a candidate's fill is measured on the **pre-CLOSE** binary, which rejects a blob at every kernel size; (2) when an outer candidate is rejected, its **child** contours are searched for the real disc, and a disc found that way is an ordinary detection. The overlay prior is used only when neither passes. **Refined 2026-09-16 after measurement:** the nested search reads the **pre-CLOSE** binary (in the CLOSEd tree the disc is not a contour at all), and ranking within a nested pool uses `fill² × area` (plain `fill × area` prefers a printed ring line). | M10 step 3.1–3.2 (outer contours only; fill from the contour's own area) | Owner chose "both: look inside + guard". On `IMG_5132-precision.jpg` the printed ring numbers bridge the aiming mark to ring 2, so the outer contour measured 24–39% too large and passed every check silently, compressing every shot's mm position ~28%. |

## 2026-09-16: off-centre photos

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-25 | **A measured target disc always beats the overlay prior.** If the disc is found but sits further from the overlay than the prior gate allows, the analysis still uses the measured disc and flags the photo `alignment-uncertain` (→ *needs attention*). The overlay prior is used only when no disc is found at all. | analysis-pipeline §3 and M10 step 3.3 (a detection outside the gate was discarded, falling back to the prior) | Owner asked what happens when a photo isn't exactly centred on the guidelines. The old rule threw away good evidence in favour of an assumption, and could score the wrong part of an off-centre photo. |

## 2026-09-15: diagram readability

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-22 | **Diagram shot markers are small fixed-size dots** (full 8 px, cell 5 px), not drawn at the true 5.6 mm hole size. **Sighting diagrams show the "45 mm" and "115 mm" labels on the target** (full variant). Scoring still uses the true hole size. | rendering-composite §3 item 7 (true-size markers) | "use smaller shot dots and restore the mm labels" — true-size markers overlapped in tight groups and hid the x<k> and MPI labels. |
| REV-23 | **Diagram `x<k>` and "MPI" labels have a white outline** so they are legible on the black precision disc and where they overlap shots. | rendering-composite §3 items 7–8 (plain coloured labels) | "fix the precision label contrast too" — blue/red labels were nearly invisible on black. |
| REV-24 | **Diagram `x<k>` and "MPI" labels are placed clear of shots**, the MPI marker and each other, trying the spec position first and then nearby positions (deterministic). | rendering-composite §3 items 7–8 (fixed label offsets) | "move the labels clear of the shots too" — in tight groups, especially the small summary-image square, labels sat on top of shots. |

## 2026-09-15: future requirement

| ID | Decision | Status | Owner's words / reason |
|---|---|---|---|
| REV-21 | **Coaching suggestions from group patterns**: when shots form an obvious pattern, the analysis suggests what could be affecting performance (for example vertical stringing → breathing routine or sling tension, tight but offset group → zero). | **Future (post-MVP)**, backlog B12, draft spec `spec/group-patterns.md` | "If there is an obvious pattern to the shots it should provide a recommendation of what could be affecting the shooter's performance." Source: Biathlon Canada Technical Coaching Manual (2010), fig. 4.43. |

## 2026-09-14: MVP scope

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-15 | **MVP user experience is three steps**: take picture(s), add metadata, receive analysis. | — | "The overall user UX for an MVP, take picture(s), add metadata, receive analysis." |
| REV-16 | **The analysis pipeline is automatic**: review image, overlay on template, pull photo metadata, incorporate user metadata, generate analysis. The user doesn't calibrate or place shots by default. An optional **Adjust shots** screen exists for when detection is wrong. | REV-6 (now automatic; the overlay prior is still used) | "Behind the scenes, review image, overlay it on the target template, pull photo metadata, incorporate user metadata, generate analysis." The Adjust screen remains because overlapping holes can't always be detected. |
| REV-17 | **No Apple Health integration** in any phase. | REV-12 (Phase 2 part), REV-13 | "There doesn't need to be any integration with apple health." |
| REV-18 | **Pipeline status replaces auto-review**: a target is *analyzed* or *needs attention* (with plain-language reasons). Unaccounted rounds are shown as a score range, with no Accept step. | REV-9 | Simpler for the three-step MVP. |
| REV-20 | **Scoring is part of the analysis and part of the core MVP**: ISSF ring scoring for precision (/100, Inner Circle = 10, 1st Ring = 10, 2nd Ring = 9), zone hits/misses for sighting, multiplicity, the `both` split, and missing-round ranges. It is never deferred. | — | "The scoring is part of the analysis. It is part of the core MVP." |
| REV-19 | **Deferred to the backlog**: backups/restore, sequence player, harness trends, keep/discard sources, composite slot picker, extra sheet fields, torch and tilt indicator, sight-correction hint, Capacitor native shell. | REV-13, REV-14 (deferred, not cancelled) | Not needed for the MVP flow. |

## Earlier revisions and their status

| ID | Decision (short) | Status |
|---|---|---|
| REV-1 | Hosted server web app | Superseded by REV-10/11 |
| REV-2 | Single user (the owner) | **Active** |
| REV-3 | Optional Garmin connection | Superseded (no Garmin connection) |
| REV-4 | Attaching the image to a Garmin activity is manual in Garmin Connect | **Active** |
| REV-5 | Capture inside the app with a live template overlay | **Active** |
| REV-6 | Overlay alignment becomes the initial calibration | Folded into REV-16 (used as the prior for automatic alignment) |
| REV-7 | Photos on the owner's server | Superseded: photos never leave the phone |
| REV-8 | Quick start straight into the camera | **Active** |
| REV-9 | Auto-review with "Accept with N missing" | Superseded by REV-18 |
| REV-10 | Runs entirely on the phone | **Active** |
| REV-11 | Static hosting on GitHub Pages | **Active** |
| REV-12 | No Garmin in Phase 1; Apple Health in Phase 2 | Garmin part active; Apple Health part superseded by REV-17 |
| REV-13 | Phase 2 Capacitor shell | Deferred to backlog (no Apple Health) |
| REV-14 | Backups as a core feature | Deferred to backlog (REV-19) |

## What this means for `DESIGN.md`

| DESIGN.md | Now |
|---|---|
| Next.js app with route handlers, Garmin via `garmin_mcp`, credentials, demo mode | On-phone web app; no Garmin connection |
| "Upload analysis composite only to Garmin" | Share or save the summary image; attach manually in Garmin Connect |
| Multi-activity sessions, EXIF activity alignment | A session is simply one outing's photos; no activities |
| CV review with interactive correction as a main step | Automatic pipeline; optional Adjust shots |
| Composite picker for more than 4 photos | Automatic selection (most recent 2 sighting + 2 precision); picker in backlog |
| Sequence player, harness | Backlog |

## Unchanged from `DESIGN.md`

Both templates and their geometry; template × position independence; the `both` furthest-from-centre rule;
multiplicity; the optimistic/pessimistic/averaged range; derived diagrams in the style of the owner's examples; the
composite layout (≤2 sighting + ≤2 precision + analysis); derived lighting with override.
