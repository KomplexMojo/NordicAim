# advanced-shooting-analysis

**Biathlete Training Harness.** A phone-first web app, running on your own small server, for biathlon
shooting at 50 m. You photograph paper targets **inside the app with a live template overlay** (sighting or
precision, shot prone, standing, or both). The app scores them, and each session produces **one**
shooting-analysis composite image, which you share and attach to your Garmin activity. Source photos never
go to any third party.

> Status: planning complete, implementation not started. Start with [`docs/milestones/README.md`](docs/milestones/README.md).

## Documentation map

| Doc | What it is |
|---|---|
| [`docs/DESIGN.md`](docs/DESIGN.md) | Original product design (verbatim) |
| [`docs/DESIGN-REVISIONS.md`](docs/DESIGN-REVISIONS.md) | Owner decisions that supersede parts of the design (hosted web app, single user, optional Garmin, capture overlay) |
| [`docs/PLAN.md`](docs/PLAN.md) | Plan: verified facts, decisions, corrections, enhancements, risks, open questions |
| [`docs/spec/`](docs/spec/) | Source-of-truth specs: geometry & scoring, data model & API, capture overlay, metadata & lighting, rendering & composite, access & deployment, optional Garmin |
| [`docs/milestones/`](docs/milestones/README.md) | 22 milestones (20 core + 2 optional Garmin) sized for lower-reasoning agents |
| [`AGENTS.md`](AGENTS.md) | Rules for any agent implementing a milestone |
| [`docs/reference/`](docs/reference/) | Reference target photos (metadata stripped) and the owner's example diagrams |
| [`fixtures/reference/`](fixtures/reference/) | Golden shot fixtures, GPS-free EXIF sidecars, seed calibrations, demo Garmin activities |

## Workflow (target)

1. Finish the outing and stop the watch.
2. On the phone, open the app (installed to the home screen, reached privately over Tailscale HTTPS) and start a session.
3. For each target, choose **Sighting** or **Precision** and a position. Line up the printed rings with the
   on-screen overlay, then capture.
4. Review: the overlay gives the initial calibration, and CV proposes shots. Correct multiplicity and positions.
5. Pick up to 2 sighting + 2 precision targets and build the composite.
6. **Share**, save to Photos, and attach it to the activity in Garmin Connect (the only manual step).
7. Keep or discard the source photos. Review trends in the sequence player and harness.

Optional (off by default): connect your own Garmin account to tag activities, add training load to the
harness, and write an analysis text block to the activity description.

## Privacy

This repository is public. The original target photos contain GPS and live only in the gitignored
`fixtures/private/`. `pnpm check:privacy` (added in M01) fails if any tracked image carries GPS EXIF.
