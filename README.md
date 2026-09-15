# advanced-shooting-analysis

**Biathlete Training Harness.** An app for biathlon shooting at 50 m that runs **entirely on your iPhone**.
Photograph paper targets **inside the app with a live template overlay** (sighting or precision, shot prone,
standing, or both). The phone scores them, and each session produces **one** shooting-analysis image, which you
share and attach to your Garmin activity. Photos never leave your phone except in backups you export yourself.

> Status: planning complete, implementation not started. Start with [`docs/milestones/README.md`](docs/milestones/README.md).

## Phases

| Phase | What | How you install it |
|---|---|---|
| **1** | Installable web app: capture with overlay, on-device shot detection and scoring, diagrams, summary image, backups, offline | Open the GitHub Pages URL in Safari → Add to Home Screen. No App Store, no Apple account. |
| **2** | The same app wrapped with **Capacitor**: adds Apple Health workouts (your Garmin workouts sync there) and direct saving to Photos | Installed on your own iPhone from Xcode. No App Store publishing. |

## Documentation map

| Doc | What it is |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Original product design (verbatim) |
| [`docs/DESIGN-REVISIONS.md`](docs/DESIGN-REVISIONS.md) | Owner decisions that supersede parts of the design (on-phone app, Capacitor later, backups, capture overlay, quick start, auto-review) |
| [`docs/PLAN.md`](docs/PLAN.md) | Plan: verified facts, decisions, corrections, enhancements, risks, open questions |
| [`docs/spec/`](docs/spec/) | Source-of-truth specs: geometry & scoring, data model & storage, capture overlay, metadata & lighting, rendering & composite, privacy/storage/hosting, Phase 2 workouts |
| [`docs/milestones/`](docs/milestones/README.md) | 22 milestones (19 for Phase 1, 3 outlined for Phase 2) sized for lower-reasoning agents |
| [`AGENTS.md`](AGENTS.md) | Rules for any agent implementing a milestone |
| [`docs/reference/`](docs/reference/) | Reference target photos (metadata stripped) and the owner's example diagrams |
| [`fixtures/reference/`](fixtures/reference/) | Golden shot fixtures, GPS-free EXIF sidecars and sample, seed calibrations, demo workouts, HEIC test image |

## Workflow (Phase 1)

1. Finish the outing and stop the watch.
2. Open the app from the Home Screen and tap **Start & capture**.
3. For each target, choose **Sighting** or **Precision** and a position, line up the printed rings with the overlay,
   and capture.
4. Review: the overlay sets the initial calibration and CV proposes shots. Targets are marked reviewed automatically
   when the shot count matches.
5. Build the summary image (up to 2 sighting + 2 precision targets plus analysis), **Share → Save Image**, and attach it
   to the activity in Garmin Connect.
6. Keep or discard source photos; back up to iCloud Drive when reminded.

## Privacy

There is no server: all data stays on the phone. This repository is public and contains code only. The original
target photos contain GPS and live only in the gitignored `fixtures/private/`. `pnpm check:privacy` (added in M01)
fails if any tracked image carries GPS EXIF.
