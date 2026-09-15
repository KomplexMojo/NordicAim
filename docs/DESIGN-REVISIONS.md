# Design revisions (owner decisions)

`DESIGN.md` is kept verbatim. This file records the product owner's later decisions. **Where this file and
`DESIGN.md` disagree, this file wins; within this file, a later revision wins over an earlier one.**
`PLAN.md` explains the reasoning.

## Current platform summary (as of 2026-09-14)

- **Phase 1:** an installable web app that runs **entirely on the owner's iPhone**. Its code is served as
  static files from GitHub Pages; all processing and storage happen on the phone, and it works offline.
- **Phase 2:** the same app wrapped with **Capacitor** and installed personally through Xcode, adding
  Apple Health workouts and native Photos saving.
- No backend server and no Garmin login in either phase.

## 2026-09-14

| ID | Decision | Supersedes | Reason |
|---|---|---|---|
| REV-10 | **Runs entirely on the phone.** Installable web app (Add to Home Screen): camera, CV, scoring, diagrams, composite, and storage all on-device, working offline. | REV-1, REV-7 | Owner asked to evaluate running entirely on the phone, then approved it. No server to run, maximum privacy, works at the range without signal. |
| REV-11 | **Static hosting on GitHub Pages** from this public repo. It hosts code only, never data. | REV-1 | Free and simple; the app has no secrets. |
| REV-12 | **No Garmin connection in Phase 1.** Phase 2 reads workouts from **Apple Health** (Garmin Connect writes workouts there). | REV-3 | No supported Garmin API for personal use, and a browser can't use the unofficial one. Apple Health gives workout context without a Garmin login. |
| REV-13 | **Phase 2 wraps the app with Capacitor** (mainstream web-to-native runtime), installed on the owner's iPhone via Xcode. No App Store publishing. The paid Apple Developer Program is recommended so installs don't expire weekly. | — | Adds native features (Apple Health, direct Photos save) while reusing the Phase 1 code. The owner confirmed Capacitor is mainstream enough. |
| REV-14 | **Backups are a core feature**: export/import to Files or iCloud Drive via the share sheet, with reminders. | — | On-device browser storage can be lost (for example, deleting the Home Screen app). Backups also move data into the Phase 2 app. |

## 2026-09-13

| ID | Decision | Status |
|---|---|---|
| REV-1 | Hosted web app on a small self-hosted server | **Superseded** by REV-10/11 |
| REV-2 | **Audience: single user** (the owner) for now | Active |
| REV-3 | Garmin optional, own account only | **Superseded** by REV-12 |
| REV-4 | **Attaching the composite to a Garmin activity is manual** in the Garmin Connect mobile app, after the app shares or saves the image | Active |
| REV-5 | **Photos are taken in the app with a live template overlay** (sighting or precision) to centre and align the target | Active |
| REV-6 | The overlay alignment becomes the **initial calibration**; the user or CV refines it | Active |
| REV-7 | Source photos stay on the owner's own server | **Superseded** by REV-10: source photos stay **on the phone**, leaving it only inside a backup the owner exports |
| REV-8 | **Quick start**: one button goes straight into the camera, creating or reusing today's session | Active |
| REV-9 | **Auto-review**: reviewed when categorized, calibrated, and the shot count matches the declared rounds; "Accept with N missing" otherwise; over-counts never reviewed | Active |

## What this supersedes in `DESIGN.md`

| DESIGN.md | Now |
|---|---|
| Next.js app with route handlers | Vite + React single-page app, no backend (Phase 1); Capacitor shell (Phase 2) |
| Per-session Garmin credential prompt, `garmin_mcp`, demo mode | No Garmin connection. Phase 2: Apple Health workouts. |
| "Upload analysis composite only to Garmin" | Share or save the composite; attach manually in Garmin Connect (REV-4) |
| Multi-select Garmin activities, EXIF-based activity alignment | Phase 2: workouts from Apple Health, suggested from in-app capture times |
| "Source photo workspace" on disk | On-device IndexedDB storage plus owner-exported backups |
| Import photos first | Capture in-app with the overlay first; import from Photos is a fallback |

## Unchanged from `DESIGN.md`

Both templates and their geometry; template × position independence; the `both` furthest-from-centre rule;
multiplicity; the optimistic/pessimistic/averaged range; derived diagrams; the composite (≤2 sighting +
≤2 precision + analysis); the sequence player; the harness (shooting metrics; workout load in Phase 2); derived
lighting with override; keep/discard sources; winter-range visual direction.
