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

> Status: M01 scaffold in progress. Start with [`docs/milestones/README.md`](docs/milestones/README.md).

## Development

Requires Node 22 and pnpm 10 (`corepack enable` picks up the pinned `packageManager` version).

```bash
pnpm install
pnpm dev          # http://127.0.0.1:3874
pnpm dev:test     # same, with VITE_FAKE_CAMERA=1 (used by Playwright)
pnpm build        # tsc -b && vite build
pnpm preview      # http://127.0.0.1:4173

pnpm check        # typecheck + lint + unit tests + privacy check (the gate for every milestone)
pnpm typecheck
pnpm lint
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright, mobile Chromium + mobile WebKit
pnpm check:privacy
```

Pushing to `main` deploys to GitHub Pages at `https://komplexmojo.github.io/advanced-shooting-analysis/`
(`.github/workflows/pages.yml`). On the iPhone, open that URL in Safari, or open `#/diagnostics` directly
(`https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics`) to run the capability checks —
do this both in Safari and after **Add to Home Screen**, since some checks (storage persistence, share) behave
differently as a standalone app.

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
