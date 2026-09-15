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
