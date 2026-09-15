# advanced-shooting-analysis

**Biathlete Training Harness.** An app for biathlon shooting at 50 m that runs **entirely on your iPhone**.

**MVP in three steps:**
1. **Take picture(s)** of your sighting and precision targets, lining them up with a live template overlay.
2. **Add metadata**: template, position (prone / standing / both), rounds, lighting, notes.
3. **Receive analysis**: **scoring** (precision ring scores /100 with X count and tally; sighting hits and misses),
   group size (mm, MOA, MRAD), MPI offset, per-target diagrams, and one session summary image to share. Attach it to
   your Garmin activity in Garmin Connect.

Behind the scenes the phone reviews each image, overlays it on the target template, pulls the photo's metadata,
incorporates yours, and generates the analysis. Photos never leave the phone.

> Status: planning complete, implementation not started. Start with [`docs/milestones/README.md`](docs/milestones/README.md).

## Documentation map

| Doc | What it is |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Original product design (verbatim) |
| [`docs/DESIGN-REVISIONS.md`](docs/DESIGN-REVISIONS.md) | Owner decisions that define the MVP and supersede parts of the design |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Post-MVP items (not to be built without go-ahead) |
| [`docs/PLAN.md`](docs/PLAN.md) | Plan: verified facts, decisions, corrections, risks, open questions |
| [`docs/spec/`](docs/spec/) | Source-of-truth specs: analysis pipeline, geometry & scoring, data model & storage, capture overlay, metadata & lighting, diagrams & summary image, privacy/storage/hosting |
| [`docs/milestones/`](docs/milestones/README.md) | 15 MVP milestones sized for lower-reasoning agents |
| [`AGENTS.md`](AGENTS.md) | Rules for any agent implementing a milestone |
| [`docs/reference/`](docs/reference/) | Reference target photos (metadata stripped) and the owner's example diagrams |
| [`fixtures/reference/`](fixtures/reference/) | Golden shot fixtures, GPS-free EXIF sidecars and sample, seed calibrations, HEIC test image |

## Install (once built)

Open `https://komplexmojo.github.io/advanced-shooting-analysis/` in Safari on the iPhone → Share → **Add to Home Screen**.
No App Store and no Apple account needed. Works offline after the first load.

## Out of scope

Apple Health, Garmin connection or automatic upload, Strava, multi-user accounts.

## Privacy

There is no server: all data stays on the phone. This repository is public and contains code only. The original target
photos contain GPS and live only in the gitignored `fixtures/private/`. `pnpm check:privacy` (added in M01) fails if any
tracked image carries GPS EXIF.
