# M26: Template reference photos (blank-sheet differencing)

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16, M19 | high | L | post-MVP — generate analysis (detection quality) |

**Post-MVP.** `docs/milestones/README.md` says post-MVP items live in `BACKLOG.md` with no milestone yet; this one exists
as a full milestone file on the owner's explicit instruction (2026-09-26), because the evidence behind it came out of a
real debugging session and deserves the same rigor as an MVP milestone, not a one-line backlog bullet.

## Goal
Let the owner photograph a **blank** copy of each template sheet they actually shoot on (sighting, precision — and,
when a coloured backing is used, a blank shot with that backing behind it), so detection can difference a real target
photo against the literal print it was shot on, instead of a hand-measured geometric model of where its rings,
numerals and print artifacts are assumed to sit. This session hit the cost of the hand-measured approach repeatedly —
see *Evidence* below — and a real reference photo generalizes across whatever the next print run's surprise turns out
to be, instead of needing its own investigation each time.

## Evidence this is worth doing
2026-09-25/26 session — see memory `asa-detection-review-v2` and the constants.ts citations below.
- **Numeral box, print-specific.** `NUMERAL_BOX_HALF_RADIAL_MM`/`HALF_TANGENTIAL_MM` were measured at 2.5 mm on
  `IMG_4540` (10 px/mm). A different print run (the owner's T-series backing batch, 48 photos) measured a 3.75 mm p50
  real extent — the box had to widen to 4.2 mm/3.0 mm for that print, and would need re-measuring again for the next
  one. A blank reference of the print in hand would have given the true extent directly, no per-print measurement pass.
- **Backing-colour Auto probe.** `detectBackingPresence`'s no-reference self-derived colour signature mismeasured a
  real blob's size by up to ~4x versus using the owner's own measured signature (2.30x vs 8.96x, same target,
  `T10-lime.jpeg`) — the self-derived probe has no truth to compare against, so it partly confuses printed red ring
  numerals with the backing colour.
- **Colour recall gap.** Two targets (`T16-lime.jpeg`, `T21-lime.jpeg`) show real holes producing colour blobs too
  faint/small to register (9-43% of one hole's area), most plausibly lighting/exposure-specific to that photo. A blank
  reference shot in the same session's lighting would give a session-specific calibration point a fixed hue/chroma
  threshold cannot.
- **The standard-path gate is still failing** (`pnpm cv:eval`: 35% precision against an 85% floor, at the corrected
  3.3 mm hole diameter) after every geometric constant this session could measure and fix. The project's own
  `GATE_RECALL_MIN` comment already names the wall: "hand-written features are at their ceiling on bare paper — no
  measured feature separates them." Differencing against a real reference is the plausible way past that wall; nothing
  else tried this session got there.

## Decisions this milestone needs before it is implementable (none made yet)
Per AGENTS.md golden rule 2 ("if the spec is silent or ambiguous about something you need, stop"): this feature has no
spec at all yet. The six items below are the owner's to decide, not mine to guess — this milestone documents the
question precisely rather than picking an answer.

1. **Captured how often.** Once per template design, ever — or re-captured whenever a fresh batch is printed? Depends
   on the owner's own printing practice (a professionally offset-printed batch likely varies less print-to-print than
   a home/office-printed one), which I don't know.
2. **Where it fits the 3-step flow.** A new explicit step would violate the "three steps: take picture(s) → add
   metadata → receive analysis" invariant (AGENTS.md). The backing-card capture (M19) is the closest precedent: an
   optional, one-time, Settings-level capture outside the three steps. Recommend mirroring that shape, but the owner
   should confirm rather than have this milestone assume it.
3. **Registration precision.** Differencing needs the blank and the real photo aligned to at least the precision hole
   detection itself needs, done for two photos instead of one. Whether today's `detectAnchor`/`calibrationWithPerspective`
   is good enough, or this needs its own refinement pass first, is **unmeasured** — needs a real investigation before
   any differencing logic is written, not an assumption either way.
4. **What gets differenced.** Raw pixel subtraction across two separately-lit photos will manufacture false
   differences from lighting alone. The direction discussed this session: difference the same *local-deviation-from-
   background* signal `holeSignal` already computes (relative, not absolute, so less sensitive to overall exposure),
   read in the same calibrated target-mm space for both photos — but this needs prototyping against real reference +
   shot pairs before anyone trusts it, not a guess written straight into production code.
5. **Privacy.** A blank reference photo isn't a photo of the shooter's targets, but it's still a photo leaving the
   camera into IndexedDB. Almost certainly fine under the existing rules (same storage path as any other captured
   image, `pnpm check:privacy` already covers stored images), but should be explicitly confirmed as part of this
   milestone's spec, not assumed.
6. **Replace or supplement today's geometric masking.** A user who captures a reference could, in principle, skip
   `printedBandMap`/`inNumeralBox` entirely. A user who doesn't capture one still needs today's geometric fallback.
   Recommend: additive — the reference sharpens/replaces masking only where one exists, geometric masking remains the
   default. Owner should confirm this is the right default, not just implement it as taken for granted.

## Read first
- `docs/spec/analysis-pipeline.md` §2 (A3 review image, A4 overlay/alignment, A5 shot detection), §3
- `docs/spec/backing-sheet.md` (the closest existing precedent: a once-measured reference reused across a session,
  including its Open Questions section as a model for how unresolved measurement questions were tracked before)
- `docs/spec/capture-overlay.md` §1 (the three-step flow, and where a template-reference capture would or would not fit)
- `src/lib/cv/print-mask.ts`, `holes.ts`, `hole-signal.ts` (what a reference-based signal would supplement)
- `src/lib/cv/rectify.ts` (the shared calibrated-space representation any differencing would need to operate in)
- This session's memory: `asa-detection-review-v2`, and the `NUMERAL_BOX_HALF_RADIAL_MM`/`AUTO_MIN_CHROMA` citations in
  `src/lib/cv/constants.ts`, which are the evidence trail behind this milestone

## In scope (once the Decisions above are resolved)
- A stored template reference per template id (and per backing colour, when used) — a new domain concept, likely
  modelled on `BackingSheet`.
- A capture flow for a blank sighting sheet and a blank precision sheet, optionally over the chosen backing colour,
  shaped by Decision 2.
- A pure differencing module (pure/adapter split preserved, no DOM in `src/lib/cv/`) producing an additional signal
  `holes.ts`/`hole-signal.ts` can consume alongside — not instead of — the existing geometric masks.
- Fallback to today's geometric masking when no reference exists for the active template/backing combination.
- `pnpm cv:eval` and `pnpm review:detection` support for reference-photo fixtures.

## Out of scope
- Removing or weakening today's geometric masking as the no-reference default (Decision 6 sets this as additive).
- Any change to scoring math (`geometry-scoring.md`) — this is a detection-input quality change only.
- Guaranteeing the T16/T21 colour recall gap is fixed; this milestone makes it diagnosable and calibratable
  per-session, which is a narrower claim than "fixed."

## Files (anticipated — confirm once the Decisions above are resolved; this list is not authoritative yet)
- `src/lib/domain/template-reference.ts` (new, mirroring `backing.ts`)
- `src/lib/cv/template-reference.ts` (new, pure differencing)
- `src/lib/cv/holes.ts`, `hole-signal.ts`, `print-mask.ts` (consume the new signal; fallback preserved)
- `src/components/settings/` (capture entry point, mirroring `BackingSettings`/`BackingCardPage`)
- `docs/spec/template-reference.md` (new spec — nothing exists for this feature yet)
- `scripts/cv-eval.ts`, `scripts/detection-review/`

## Steps
Not written. Per golden rule 1 ("read the milestone file completely, then only the spec sections it lists"), there is
no spec for this feature yet — Steps cannot be written responsibly before the Decisions above have owner answers and a
real spec document exists. The next work on this milestone is the owner resolving the Decisions section and a spec
draft, not code.

## Tests
Not written, for the same reason as Steps.

## Acceptance (draft — will change once the Decisions above are resolved)
```bash
pnpm check
pnpm cv:eval
pnpm review:detection
```
**Human (owner):** photograph a blank sighting sheet and a blank precision sheet — with and without your backing
colour — in the same conditions you actually shoot in, plus a few real sessions shot under matching conditions, so the
differencing can be validated against real reduce-false-positives-without-losing-real-holes evidence, not a synthetic
guess.

## Pitfalls
- **Torn paper inflates measured area, independent of anything a reference photo can fix.** Owner note, 2026-09-26: a
  tight, high-energy cluster can tear away the paper "web" between adjacent holes, so the opening measures larger than
  N clean punctures would. This is a property of the paper and the impact, not a detection artifact a blank-sheet
  reference resolves — it affects `suggestedMultiplicityFromArea` (`multiplicity.ts`) directly, and this milestone's
  differencing signal inherits the same ambiguity for the same reason. Multi-shot counts should stay a confirm-by-eye
  prompt, never an automatic count, regardless of what this milestone builds.
- A stale reference (captured once, reused for months while the print or lighting drifts) could silently degrade
  rather than help — the design needs at least a way for the owner to tell a reference looks off, not just a
  fire-and-forget capture.
- Never let a photographed reference become a second, undocumented source of truth for template geometry that drifts
  from `docs/spec/geometry-scoring.md`'s mm formulas — a reference should inform *masking*, never the scoring math.
- Registration error compounds when the blank and the real photo are each warped independently — Decision 3 needs a
  real measurement before any detection logic is written against the assumption that alignment is good enough.

## Open questions
Every item in the Decisions section above is open. This milestone is intentionally not implementable as written — it
exists to record the evidence and the exact questions precisely, per AGENTS.md golden rule 2 ("never guess on scoring,
geometry, or storage"), rather than to guess at answers those decisions call for.

## Completion notes
Not started.
