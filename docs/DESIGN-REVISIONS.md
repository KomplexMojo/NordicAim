# Design revisions (owner decisions)

`DESIGN.md` is kept verbatim. This file records the product owner's later decisions. **Where this file and
`DESIGN.md` disagree, this file wins.** `PLAN.md` explains the reasoning.

## 2026-09-13

| ID | Decision | Owner's words / reason |
|---|---|---|
| REV-1 | **Platform: hosted web app** used from the phone's browser (home-screen installable). No native iOS app. | "The issue with a native iPhone App is that I would need Apple permission to publish." A web app needs no store approval. |
| REV-2 | **Audience: single user** (the owner) for now. | "Just me for now, go with the web app plan." |
| REV-3 | **Garmin is optional**, not part of the core flow. When enabled it connects the owner's own account only. | Garmin's official developer program is business-only (and reportedly paused). The unofficial login broke in March 2026, and its replacement impersonates the Garmin mobile app. Neither exposes activity photo upload. |
| REV-4 | **Attaching the composite to an activity is a manual step** in the Garmin Connect mobile app, after the web app shares or saves the image. | Garmin only lets users add activity photos in its mobile app. There is no supported API. |
| REV-5 | **Photos are taken inside the app with a live template overlay.** A sighting target shows the sighting overlay; a precision target shows the precision overlay. The user lines up the printed target with the overlay to centre the image. | "Ideally we would have a template overlay when the user is taking the photo … This will allow the user to centre the image correctly." |
| REV-6 | The overlay alignment also becomes the **initial calibration** for each photo (centre and scale), which the user or CV then refines. | Follows from REV-5. Removes most perspective and centring error before analysis. |
| REV-7 | Source photos stay on the **owner's own server** and are never sent to Garmin, Strava, or any third party. The only image that leaves is the composite, via the owner's own share action. | Adapts the design's "sources never uploaded" rule to a hosted app. |

## What this supersedes in `DESIGN.md`

| DESIGN.md | Now |
|---|---|
| Per-session Garmin credential prompt as the entry point | Optional Garmin feature (M20–M21), own account only. The core works with no Garmin at all. |
| "Upload analysis composite only to Garmin" (automatic) | Share or save the composite, then attach manually in Garmin Connect mobile (REV-4) |
| EXIF `DateTimeOriginal` as the primary alignment key | In-app capture time (client clock + offset). EXIF is still read for imported photos. |
| GPS ranking of activities | Dropped (not available through any Garmin route) |
| "Source photos = local workspace only" | Owner's own server only (REV-7) |
| Import photos, then categorize | Choose template and position **before** capture (drives the overlay). Importing from Photos remains a fallback. |

## Unchanged

Both templates and their geometry; template × position independence; the `both` furthest-from-centre rule;
multiplicity; the optimistic/pessimistic/averaged range; derived diagrams; the composite (≤2 sighting +
≤2 precision + analysis); the sequence player; the harness (shooting metrics first, Garmin load when
enabled); derived lighting with override; keep/discard sources; winter-range visual direction.
