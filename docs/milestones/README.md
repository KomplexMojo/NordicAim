# Milestone index (MVP)

Rules: [`/AGENTS.md`](../../AGENTS.md). Pick the lowest-numbered `pending` milestone whose dependencies are all `done`.
Post-MVP items live in [`../BACKLOG.md`](../BACKLOG.md) and have no milestones yet.

Status values: `pending` · `in-progress` · `done` · `blocked: <reason>`

**Orchestration:** the `run-milestones` workflow (`.claude/workflows/run-milestones.js`) reads this table. The
**Implementer** and **Reviewer** columns set the model and reasoning effort for each milestone. **Owner gate = yes** means the run
stops after that milestone so the owner can do its checks in [`OWNER-CHECKS.md`](OWNER-CHECKS.md). Keep the column formats exactly
as shown (`<model> · <effort>`).

| ID | Milestone | MVP step | Depends on | Implementer | Reviewer | Owner gate | Status |
|---|---|---|---|---|---|---|---|
| [M01](M01-scaffold.md) | Scaffold, diagnostics, CI, Pages deploy | foundation | — | sonnet · medium | sonnet · high | yes | done |
| [M02](M02-domain-model.md) | Domain model, defaults, status rules | foundation | M01 | sonnet · medium | sonnet · high | no | done |
| [M03](M03-scoring-engine.md) | Scoring engine | generate analysis | M02 | sonnet · high | opus · high | no | done |
| [M04](M04-local-store-ingest.md) | On-device storage and photo ingest | take picture(s) | M02 | sonnet · medium | sonnet · high | no | done |
| [M05](M05-diagram-renderer.md) | Diagram renderer | generate analysis | M03 | sonnet · high | opus · high | no | done |
| [M06](M06-overlay-geometry.md) | Capture overlay geometry | take picture(s) | M02 | sonnet · medium | sonnet · high | no | done |
| [M07](M07-capture-screen.md) | Capture screen with template overlay | **1. take picture(s)** | M04, M06 | opus · high | opus · high | yes | done |
| [M08](M08-metadata-lighting.md) | Pull photo metadata and lighting | pull photo metadata | M04 | sonnet · medium | sonnet · high | no | done |
| [M09](M09-add-metadata.md) | Add metadata screen, quick start, sessions | **2. add metadata** | M07, M08 | sonnet · medium | sonnet · high | no | done |
| [M10](M10-target-alignment.md) | Pipeline runner, image review, template alignment | review image · overlay on template | M04, M06 | opus · high | opus · high | no | done |
| [M11](M11-shot-detection.md) | Shot detection | generate analysis | M10 | opus · high | opus · high | no | done |
| [M12](M12-analysis-results.md) | Analysis generation and results screen | **3. receive analysis** | M05, M09, M11 | opus · high | opus · high | no | done |
| [M13](M13-adjust-shots.md) | Adjust shots (optional correction) | optional | M12 | opus · high | opus · high | no | done |
| [M14](M14-summary-image-share.md) | Session summary image and share | **3. receive analysis** | M12, M16, M18 | sonnet · medium | sonnet · high | no | pending |
| [M16](M16-detection-accuracy.md) | Detection accuracy and shot constraints (rework: polarity-free, geometry masks, sheet search) | generate analysis | M12 | opus · high | opus · high | yes | pending |
| [M17](M17-place-and-compare.md) | Unplaced shot markers and the diagram/photo compare slider | optional · receive analysis | M13 | opus · high | opus · high | no | pending |
| [M18](M18-alignment-perspective.md) | Alignment under perspective (the centre rings) | overlay on template · generate analysis | M16 | opus · high | opus · high | yes | pending |
| [M15](M15-mvp-release.md) | Install, offline, polish, MVP release | release | M13, M14, M16, M17, M18 | sonnet · medium | sonnet · high | yes | pending |

```mermaid
flowchart TD
  M01 --> M02
  M02 --> M03 --> M05
  M02 --> M04
  M02 --> M06
  M04 --> M07
  M06 --> M07
  M04 --> M08
  M07 --> M09
  M08 --> M09
  M04 --> M10
  M06 --> M10
  M10 --> M11
  M05 --> M12
  M09 --> M12
  M11 --> M12
  M12 --> M13
  M12 --> M14
  M12 --> M16
  M13 --> M17
  M16 --> M14
  M16 --> M18
  M18 --> M14
  M18 --> M15
  M13 --> M15
  M14 --> M15
  M16 --> M15
  M17 --> M15
```

**M16 and M17 are numbered after M15 but run before it** (M15 depends on them). They come from the owner's review of real
targets on 2026-09-16: detection quality (REV-27, REV-28, REV-31) and placing/comparing shots by hand (REV-29, REV-30).

**M14 now waits for M16.** The session summary image packages the analysis, so there is no point building it from numbers the
owner has shown to be wrong. Run order from here: **M16 → M17 → M18 → M14 → M15**.

**2026-09-17 owner review (REV-34 to REV-37).** The owner rated M16's first detector on 46 real photos: below 2/5, recall 53%,
precision 61%. M16 is reworked against the owner's 390 labelled holes and is now an **owner gate** — the run stops so the owner can
re-rate it with `pnpm review:detection` before anything is built on it. **M18** (new) fixes the centre-ring offset the owner reported;
it is also an owner gate, because the fix may change the stored calibration shape.

**Why these tiers:**
- **Sonnet · medium**: well-specified plumbing and UI.
- **Sonnet · high with an Opus reviewer** (M03 scoring, M05 diagrams): mechanical work where every number must match the spec exactly.
- **Opus · high** (M07 camera, M10–M13 CV/pipeline/results/adjust): browser quirks, computer vision, and state handling.

**Owner gates:**
- **M01**: enable GitHub Pages and run the diagnostics on the iPhone. This validates the platform before feature work.
- **M07**: the camera and overlay checklist on the device.
- **M15**: the release sign-off.

Other milestones' device checks are recorded in `OWNER-CHECKS.md` without stopping the run.

Each milestone has: header table · Goal · Read first · In scope · Out of scope · Files · Steps · Tests · Acceptance ·
Pitfalls · Open questions · Completion notes.
