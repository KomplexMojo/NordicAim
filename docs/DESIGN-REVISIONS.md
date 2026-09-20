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

## 2026-09-18: the owner's review moves into the app

The owner re-rated the reworked detector on all 46 photos (`pnpm review:detection`, export in
`fixtures/private/review/detection-review-v2-2026-09-17.json`). **These numbers supersede the first review's**, which was
measured against incomplete labels: recall **76.9%**, precision **94.7%**, mean quality **2.94** — against 53% / 61% / below 2
for the first detector and the 64.1% / 81.8% the R4 gate reported. Only **16 of 302 detections are false**.

Two measurements out of that review decide the work below.

**Relaxing REV-27 was tested and rejected.** Of the 86 real holes missed, 30 produced a candidate that a filter discarded, and 25
of those 30 died on REV-27's glyph test — but that test discards **807 candidates across the 41 targets, of which only 25 are
real holes**. Admitting them costs 493 false detections and drops precision to 37.9%; the best variant tried (a 40 mm radial gate
with relaxed thresholds) still trades 5 points of recall for 16 of precision. No measured feature separates the 25 from the 782:
detection score overlaps almost exactly, and distance from centre helps but not enough. **REV-27 stays**, which answers M16's open
question 3 by measurement rather than by the letter of R2.

**What the human does better is the small ambiguous set, not the thresholds.** That is what the owner's review page does and the
app does not, and it is the one place a person beats every rule tested.

| ID | Decision | Supersedes | Owner's words / evidence |
|---|---|---|---|
| REV-40 | **The app offers the holes it was unsure about.** Detection already measures every candidate it discards; instead of throwing them away, the few plausible ones near the target are offered in Adjust as **suggested holes** — hollow, dashed, visibly not shots. A tap turns one into a manual shot; ignored, it scores nothing and is never stored. The user decides the ambiguous cases that no threshold can. | M16 R1's rejected candidates being discarded at the worker boundary (analysis-pipeline §6 returns only `shots`) | "The user should be able to perform the same corrections through the application that I can when I review the photos as a group." Measured on the owner's 41 targets: a rule of `radialMm ≤ 60`, `elongation ≤ 6`, `strokeRadiusMm ≥ 0.70`, capped at the 3 best, shows a **median of 3 suggestions per photo** and contains **22 of the 30 real holes the filters discarded** (24 at a cap of 4). Accepting every real one would take recall to **83.3% with precision unchanged at 94.7%** — better than any automatic variant measured, because a suggestion scores nothing until it is confirmed. |
| REV-41 | **A hole too wide to be one shot is offered as a double punch.** A .22 hole is 5.6 mm ± 5%; a detected hole materially wider is flagged in Adjust with a one-tap "2 shots", which sets the multiplicity the Inspector already supports. The app proposes, never decides — REV-28's "always assume one hole to start" is unchanged. | Nothing: M13's multiplicity control exists but nothing ever suggests using it | "#5 is a double punch this can be determined by width. #6 is a double punch that can be determined by width." **13 of the 41 rated targets contain a multi-shot hole**, which is scoring error that the detection numbers do not capture at all — the detector correctly found one hole. |
| REV-42 | **Reviewing a session is a single pass, not a hunt.** A review route walks a session's photos one at a time — needing attention first — with the existing Adjust surface embedded and Confirm / Next, so a session is checked the way the owner checks a folder of photos. It adds no editing capability of its own. | M12's results screen as the only way in (one target at a time, by navigation) | "…the same corrections … that I can when I review the photos as a group." |
| REV-43 | **A hole on the paper outside the scoring area is a ring-zero unit.** It scores zero and enters the group metrics like any other located shot, because its position was measured, not invented. A declared round with **no hole found anywhere** stays an assumed miss (REV-39) and enters no group metric, because it has no position. | M17's unresolved "off target" question; narrows REV-33's control to "this round is not in this photo" | "If a round is on the paper off the scoring area, treat it as a ring-zero unit." Also, on why off-paper hits are rare in practice: "The photo should be focused on the circular target. Most of the time it won't include off paper hits." The distinction that matters is whether a position exists, not whether the round scored — so nothing fabricated ever reaches extreme spread, MPI, mean radius or the ellipse (geometry-scoring §6). |
| REV-44 | **The calibration carries the sheet's tilt.** `Calibration` gains `perspective: { p, q } \| null` — the target plane's vanishing line in target mm, applied before the ellipse map — so the drawn rings land on the printed rings when the photo is not square on. `null` means square on and computes bit-for-bit what the app did before, so nothing stored is migrated or rewritten. **A manual handle drag in Adjust keeps the measured perspective**; clearing it is a separate "reset alignment" action. | The ellipse-only `Calibration` of data-model §3, which cannot represent perspective at all | "yes, ratify it, and keep the perspective on manual drag" — answering M18's owner gate. Measured, not guessed: concentric circles make only 7 of a homography's 8 degrees of freedom observable (the sheet's rotation in its own plane is invisible), the five existing fields carry 5, and the vanishing line carries the other 2. Verified on 12 of the owner's photos — decomposing each fitted homography into those seven numbers and rebuilding it reproduces every sampled ring point to within **2.3e-4 px**. The owner's report this fixes: "the centre rings are always slightly off". |
| REV-45 | **The app is called Nordic Aim** (short name the same). The page title, the install manifest, the iOS Home Screen label and the home heading all use it. The repository name and the Pages URL are **unchanged**: changing the URL would break every installed Home Screen copy and move the app to a new address. | "Biathlete Harness" (DESIGN.md's working name) | "Change the application name to Nordic Aim." An existing Home Screen icon keeps the label it was installed with until it is removed and added again. |
| REV-46 | **After adjusting, re-analyze.** Adjust's *Re-detect shots* becomes **Re-analyze**: it saves what is on screen, re-runs detection against the alignment the user just set, keeps their manual shots, drops any detection that duplicates one, and re-scores. Correcting the alignment **re-projects every shot** so it stays on its hole — the rings move, the holes do not — and re-projection alone never marks a shot as hand-edited. | analysis-pipeline §8's *Re-detect shots*, which used the **saved** alignment and discarded unsaved edits; and shots keeping stale millimetre positions after a re-alignment | "After I adjust the shots or the alignment, I should be able to re-analyze." Found while implementing it: correcting the alignment could never fix a score, because shots kept millimetre positions measured against the old rings — on screen they slid off their holes with the rings. And pressing *Re-detect* after re-aligning ran against the old alignment and threw the new one away. |
| REV-47 | **Three main screens, one tap apart:** **Shooting** (sessions, capture, metadata, results, target, adjust), **Settings** (defaults that apply across all sessions) and **Diagnostics**, on a bottom tab bar hidden on the full-screen camera. | Home's small "Diagnostics" text link; no settings screen | Issue #2: "there should be three main screens. There should be the screen that allows you to view and analyze your shooting, there should be the diagnostic screen, and there should be a setting screen". M22. |
| REV-48 | **The backing sheet is a Settings choice for every session.** Settings holds the mode and the colour measured from a card photo (the photo itself is not kept); A5 and Re-analyze read it from there; changing it re-runs nothing. The per-session "Session options" is removed. | REV-38's placement on the metadata screen, per session | Issue #2: "The backing stock isn't something that is a per session setting. It really should go into a setting screen". M22. |
| REV-49 | **Results say what they count.** The headline states hits and misses (sighting) or points and X (precision); a separate line states how many shots were **found**; a shot scored only because its hole touches a line is marked as such on every diagram. Presentation only — the scoring rule is unchanged pending the owner's answer on #4. | "7/10 hits @ 45 mm", read by the owner as "7 of 10 found"; diagrams that drew touch-credited shots outside the line they scored | Issues #6 and #4: "it still says that seven out of 10 shots are recognized. There's actually 10 in the image." M24. |
| REV-50 | **An imported photo is shown on the overlay screen before it is kept**, as confirmation that it loaded (Keep / Discard, one image at a time). Informational only: an import still has no calibration prior. | Imports going straight to storage with only a progress line | Issue #1: "it should load the image into the screen showing the overlay, it indicate to the application user that the image was loaded." M25. |
| REV-51 | **The summary image always has four positions** — Sighting 1 and 2 on top, Precision 1 and 2 below — and a position with no target shows its **blank template**, faded, captioned "No target". The analysis band is sized to its content; one target also gets its detailed stats there. Each cell zooms out so a shot on the paper beyond the printed target is always drawn, and is clipped above its caption. Captions use REV-49's wording; the footer says Nordic Aim. | rendering-composite §5's one-row-per-template grid: a filler "stat card" (in an unfilled black border) in any half-empty row, a fixed 600 px band, and cells whose shots and ellipse could spill into the caption | "Create a better template for the scoring summary. It should handle cases where there's one, two, three, or four images and format correctly." Then: "Keep a blank template slot for each of the 4 targets." From the owner's screenshot of a two-sighting, one-precision session. |
| REV-52 | **Every target in the shareable image is drawn at the same scale**, so two targets can be compared by eye. One scale serves the whole image: the largest template's halo sets it (the precision sheet, 3.6276 px/mm, so a sighting target is drawn smaller than its cell), and a shot beyond its printed target zooms every cell out together. A standalone cell diagram (a result card's thumbnail) still fits itself. | REV-51's per-cell fit, which zoomed only the cell that needed it | "In the images, make sure that the targets all show at the same scale. Currently now in the shareable image, the two sighting targets are at different scales." |
| REV-53 | **A sighting session's two targets are named for what they are: Sight in, then Confirm.** In the summary image the chips read `SIGHT IN` and `CONFIRM` and the analysis band's lines `Sight in (prone): …` / `Confirm (prone): …`; precision positions stay numbered. Slot 1 is the earlier target, which is the one sighted in on. | "Sighting 1" / "Sighting 2" as the summary's slot names | "For the sighting targets, typically how a session works is you sight in on one target and then you confirm on a second target. So the first sighting target should be sight in and the second one should be confirm." |
| REV-54 | **Every shared summary image is credited**: its footer reads `Developed using Nordic Aim by KomplexMojo · generated <time>`. | REV-45's footer, which named only the app | "I'd like to somehow stamp so that it has my developer name … and it has the application name. So it should say something like developed using Nordic shot by Complex Mojo." Written as **Nordic Aim** (REV-45's name) and **KomplexMojo** (the owner's GitHub account); the owner's dictation gave "Nordic shot" and "KompkexMojo". |
| REV-55 | **A screen gets an action when it is the obvious next step from what it shows.** Target detail — where a wrong shot is noticed — gains **Adjust shots** and Adjust returns to wherever it was opened from; results gains **Add photos**; and Home is the Shooting tab alone, so each screen's own link is its parent ("All sessions", "Back to session") instead of a third route Home. | Target detail as a dead end (back → find the card → Adjust); "Add photos" three taps deep behind the metadata screen; a Home link in the app header, in each page and on the tab bar | "I don't want the user to have to click three or four buttons to go back and forth when they should be able to do things from the same screens. At the same time, I don't want the screens to become overly cluttered … I don't want to build it into another screen so that the screen becomes an everything screen or a Swiss Army knife." Deliberately **not** added: Review session on target detail (session-level), Re-analyze outside Adjust (its target would be ambiguous), renaming on results. |

**Deliberately not brought across from the review page:** quality ratings, alignment ratings, free-text comments and the ratings
export. Those exist to judge the *detector*, not to correct a target, and the owner's own page keeps that job. Nothing in the app
sends anything anywhere (no runtime network calls).

**The 46-photo sample set is worst-case, not typical.** The owner: they "were those I had on my phone before this work was
started so will represent the worst photos available" — taken before the capture overlay existed, with no framing guidance.
Every detection number measured on them (M16's recall 76.2% / precision 93.8%) is therefore a **pessimistic floor**. The gate
keeps them because a bar should sit on hard cases, but the figures should be re-measured once photos taken *through* the app
exist (M16 open questions, and M15's release notes).

## 2026-09-17: coloured backing sheet and declared rounds

| ID | Decision | Supersedes | Owner's words / evidence |
|---|---|---|---|
| REV-38 | **Optional coloured backing sheet.** A tucked-away session option (Session options on the metadata screen, collapsed) records that a coloured backing was used, optionally with a photo of the backing card. Detection then finds holes by the colour showing through them, falling back to standard detection when no colour is found. The three-step flow does not change. | — | "Add an option for the user to indicate that a backing sheet was used. This should not be a main interface element, it could be buried on an interface screen. Ideally they would be able to take a picture of the backing 'card' and you would be able to use that in your processing." On the owner's first pink-backing photo (IMG_5189, 9 shots, one overlap) colour alone found the 8 holes exactly, with no fragments or false marks; the standard detector reported 17. One photo — thresholds are provisional until 10+ labelled backing photos exist. |
| REV-39 | **Declared rounds are fact.** Clearly more holes than rounds → the target is **rejected** (no score, `needs-attention`, `too-many-holes`). Fewer → check for **double punches first**, then count the remainder as **misses** and give a definite score (no range). Owner edits always win. | REV-28's cap as the only response to extra holes; REV-18's score range for unaccounted rounds; REV-29's parked markers default to "unplaced" (now "scored as miss") | "Yes, it was 10 rounds. This should be treated as fact if specified by the user. I say 10 rounds and 15 are obviously detected with high confidence, the target should be rejected. If I say 10 rounds and less than that are counted, check of double punches (this happens often), then assume it was a pure miss (sometimes I shoot on one target, then realign and actually shoot on the wrong target, especially when sighting in)." Evidence for why "every round accounted for" suppresses doubles: on IMG_5193 (10 rounds, 10 holes found) two long tears measured 2.31× and 1.87× the median area and would otherwise have become false doubles. |

## 2026-09-16: detection quality and correcting shots by hand

The owner compared real target photos with the diagrams the app produced and found the diagrams did not represent the photos.
Milestones **M16** (REV-27, REV-28) and **M17** (REV-29, REV-30); M15 now depends on both.

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-27 | **Printed ring numerals must not be detected as shots.** Detection rejects thin printed glyphs by shape (elongation and stroke width), with the thresholds measured on the owner's real photos. | M11 step 4 (printed *circles* erased; numerals survive) | "There needs to be some refinement of the image recognition. The diagrams don't represent the source images well." On `IMG_5132-precision.jpg` this produced 19 detections / 62 units against ~10 rounds. |
| REV-28 | **Always assume one hole to start, and never report more shots than the declared rounds.** Every automatic detection has `multiplicity` 1; overlapping holes stay one shot until the owner says otherwise. If detection finds more candidates than rounds fired, the best `declared` are kept, the rest are dropped and reported. A 10-round precision target can therefore never score above 100. | M11 step 5 (`multiplicity` inferred from blob area, 2–8) | "Some basic rules and constraints such as always assume one hole to start, and if there are 10 shots on a precision target the max score can be 100." |
| REV-29 | **Unfound shots are parked as draggable markers.** When detection finds fewer shots than rounds fired, the remainder appear as markers on the white margin beside the target; the owner drags each one onto the hole it belongs to. They are derived, never stored. | — | "If image recognition can only find 8 of 10 shots, place the shots it can't find as diagram images on the white somewhere out of the way. That will allow users to easily drag the icon over top of where it should be on the target." |
| REV-30 | **A compare slider under the target**: full left shows the diagram, full right shows the source photo, in between it wipes across. A fade mode (diagram's opacity over the photo) is the alternative the same control offers. | M12 step 4 ("a toggle to show the working photo") | "Add a horizontal slider where the diagram is so that the user can move it back and forth… If that is not possible try to use transparency to overlay a transparent diagram on top of a more opaque source image." |

## 2026-09-17: owner review of detection on 46 real photos

The owner rated the M16 detector (region method) on every photo in `fixtures/private/additional references/`, marking each false
detection, each missed hole and each wrongly rejected hole. Mean quality was **below 2 out of 5**. Against the owner's marks, recall
was **53%** and precision **61%** (about 387 real holes). Precision sheets were worse: 47% of their detections were false. The marks
are kept as 390 labelled holes in `fixtures/private/review/ground-truth-holes-2026-09-17.json` (gitignored).

| ID | Decision | Supersedes | Owner's words / evidence |
|---|---|---|---|
| REV-34 | **Detect holes without assuming their brightness.** A hole may be darker than, brighter than, or as bright as the surface around it; the detector keys on what makes a hole a hole (a torn edge, local deviation either way), not on the sign of the difference. | M11 step 3 and REV-32's signed tests ("brighter than the mark", "darker than paper") | "Missed most of the obvious holes." Measured on holes on the black mark: **158 of 191 correct detections were brighter** than the black, but of the **155 missed holes, 66 were darker and 60 about the same** — only 29 brighter. The two kinds sit side by side in one photo, depending on what is behind each hole. **182 of 183 missed holes produced no candidate at all.** On the owner's labels, polarity-free signals separate holes from plain black at AUC 0.97–0.98 (edge energy, pixels deviating either way); the old signed test manages 0.71. |
| REV-35 | **Remove printed marks by where they are printed, not by what they look like.** Ring lines, dashed guides and the ring numerals are at known positions in target geometry; the numerals sit at band centres on four axes, so the sheet's rotation is estimated first and those positions are masked. | REV-27's shape filter as the means of rejecting numerals | "Identifying precision target numbers as hits." "Still seeing the dividing circles as shots." No shape measure separates holes from the owner's flagged false detections (circularity, elongation, stroke, fill, area and confidence all overlap), and the best local signal reaches only AUC 0.81 against them, because a printed numeral has edges as strong as a hole. On upright sheets the false detections sit **1–2° from the numeral axes** (IMG_5152, IMG_5153). |
| REV-36 | **Search the paper sheet, not a circle around the rings.** Find the sheet the target is printed on and search all of it, so holes on the white paper are found; the backing board beside the sheet stays excluded (REV-33's intent). | REV-33's candidate bound (`outerRadiusMm + 5`) | "Missed all of the shots that were on the white outside of the rings." Every sighting hole on paper was outside the old bound: the owner's paper holes lie at 61–97 mm (sighting, bound 62.5) and 56–103 mm, a few beyond 110 (precision, bound 82.2). A fixed radius cannot follow a rectangular sheet — it runs onto the backing board at the side edges while still missing the corners. |
| REV-37 | **Detection is judged against the owner's labelled holes, and the owner re-rates each rework.** `cv:eval` gates recall and precision on the labelled set; the review page (`pnpm review:detection`) is part of the repo so every rework ends with the owner rating it again. | M16 step 7's gate (detections ≤ declared rounds) | The previous acceptance passed at 14% recall. Labels can be incomplete — a hole the owner never noticed counts against a detector that finds it — which is why the owner re-rates rather than the numbers alone deciding. |

**Also found, handled elsewhere:** the owner rated ring alignment "close" on 30 photos, "good" on 8 and "wrong" on 1, noting "the centre
rings are always slightly off" — probably perspective, which an ellipse fit cannot represent (new milestone M18). IMG_5085
analysed the wrong one of two targets; IMG_4447's target was not found. The review page itself misled in two ways — rank numbers
were read as shot counts, and a tap near a marker toggled it instead of adding a hole — so those photos' labels carry caveats.

## 2026-09-16 (evening): the backing board is not the target

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-33 | **Detection never searches outside the rectified target crop.** A round that landed off the scoring area stays unidentified and is accounted for by the owner in Adjust, where a parked marker can be marked **off target** rather than placed on the diagram. | M11 step 1 (the crop bounded the rectify step, but nothing said it bounded the *search*) | The owner's reference photos, 2026-09-16: the backing board beside the sheet is peppered with old holes, dozens of them. Nothing stopped the detector collecting those, and combined with the REV-28 cap it could have kept backing-board holes and dropped real ones. |

## 2026-09-16 (evening): scan the target in regions

| ID | Decision | Supersedes | Owner's words / reason |
|---|---|---|---|
| REV-32 | **Detection scans the target region by region with local statistics**, instead of two thresholds applied to the whole sheet. A region with no candidate is skipped; a region with candidates is refined further. Refinement is bounded and never runs until a shot quota is met — whatever is missing stays missing and becomes a parked marker (REV-29). | M11 step 3 (`gray > median(disc) + 45` inside the mark, `gray < median(paper) − 50` outside) | "Break the image down into regions, examine the region. If there are 0 shots identified in that region, ignore it and move to the next. This should be done for all the regions until all the shots within the affected regions are identified." Global thresholds cannot cope with shadow, glare, or the different contrast of a hole on the black mark versus on paper. Note this does **not** by itself fix the printed numerals — a numeral region is not empty, so REV-27's shape filter is still required. |

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
