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

## Decisions this milestone needs before it is implementable (1, 2, 5, 6 decided; 3, 4 measured 2026-09-27)
Per AGENTS.md golden rule 2 ("if the spec is silent or ambiguous about something you need, stop"): this feature has no
spec at all yet. The six items below are the owner's to decide, not mine to guess. On 2026-09-27 the owner accepted the
recommendations for Decisions 2, 5 and 6 as written below, and answered Decision 1 in issue #52; 3 and 4 remain open.
The spec is `docs/spec/template-reference.md` (REV-121).

1. **Captured how often — DECIDED (owner, 2026-09-27, issue #52).** The app ships a default reference for each template,
   made from the owner's blank sheets. The user replaces it from Settings whenever their print changes, and can restore
   the default. One reference per template, not per backing colour. A reference keeps only the target circles and what
   is printed inside them (template-reference.md §1, §3).
2. **Where it fits the 3-step flow — DECIDED (owner, 2026-09-27).** Mirror the backing-card capture (M19): an
   optional, one-time capture reached from Settings, outside the three steps. The three-step flow (take picture(s) →
   add metadata → receive analysis) gains no new step, and nothing in it prompts for or requires a reference.
3. **Registration precision — MEASURED (2026-09-27).** Today's `detectAnchor`/`calibrationWithPerspective` is good
   enough: on the production benchmark the reference sits within 0.05 mm of the photo overall (p90) and 0.35 mm region by
   region (median). See template-reference.md §6.
4. **What gets differenced — MEASURED, not adopted (2026-09-27).** Local deviation minus the locally aligned reference's
   separates holes from print well for the standard detector on production photos, but the standard case uses the
   colour path. There it fails as a filter, and its promise as a rescue rests on only 3 missed holes. Needs a larger
   production sample before any detection code is written. See template-reference.md §6.
5. **Privacy — DECIDED (owner, 2026-09-27).** A reference photo is treated like any other captured photo: stored
   on the phone in IndexedDB only, never shared, downloaded or sent anywhere, and never part of a `CompositeArtifact`.
   The share rule and the no-network invariant apply unchanged. Correction to the earlier wording: `pnpm check:privacy`
   only scans images committed to the repo, not what the app stores, so it is not evidence here; the guarantee comes
   from the share rule and the CSP. Reference-photo fixtures committed for `cv:eval` must still pass
   `pnpm check:privacy` (no GPS EXIF). **Still open for the spec:** whether an owner-created backup
   (`docs/spec/backup.md`, REV-63) includes reference photos — `backup.md` today covers sessions, photos, analyses and
   settings only.
6. **Replace or supplement today's geometric masking — DECIDED (owner, 2026-09-27).** Additive. Geometric masking
   (`printedBandMap`/`inNumeralBox`) stays the default and is unchanged when no reference exists for the active
   template/backing combination. Where one exists, the reference signal may sharpen or replace masking for that
   combination only.

## Read first
- `docs/spec/template-reference.md` (the spec for this milestone; §6 is pending Decisions 3 and 4)
- `docs/spec/analysis-pipeline.md` §2 (A3 review image, A4 overlay/alignment, A5 shot detection), §3
- `docs/spec/backing-sheet.md` (the closest existing precedent: a once-measured reference reused across a session,
  including its Open Questions section as a model for how unresolved measurement questions were tracked before)
- `docs/spec/capture-overlay.md` §1 (the three-step flow, and where a template-reference capture would or would not fit)
- `src/lib/cv/print-mask.ts`, `holes.ts`, `hole-signal.ts` (what a reference-based signal would supplement)
- `src/lib/cv/rectify.ts` (the shared calibrated-space representation any differencing would need to operate in)
- This session's memory: `asa-detection-review-v2`, and the `NUMERAL_BOX_HALF_RADIAL_MM`/`AUTO_MIN_CHROMA` citations in
  `src/lib/cv/constants.ts`, which are the evidence trail behind this milestone

## In scope (once the Decisions above are resolved)
- A stored template reference per template id (template-reference.md §4), with shipped defaults in
  `public/templates/` (§5).
- The Settings **Target sheets** section and the sheet capture flow (§2, §3).
- A pure differencing module (pure/adapter split preserved, no DOM in `src/lib/cv/`) producing an additional signal
  `holes.ts`/`hole-signal.ts` can consume alongside — not instead of — the existing geometric masks.
- Fallback to today's geometric masking when no usable reference exists for the photo's template (§6).
- `pnpm cv:eval` and `pnpm review:detection` support for reference-photo fixtures.

## Out of scope
- Removing or weakening today's geometric masking as the no-reference default (Decision 6 sets this as additive).
- Any change to scoring math (`geometry-scoring.md`) — this is a detection-input quality change only.
- Guaranteeing the T16/T21 colour recall gap is fixed; this milestone makes it diagnosable and calibratable
  per-session, which is a narrower claim than "fixed."

## Files (from template-reference.md; the detection files follow Decisions 3 and 4)
- `public/templates/sighting-reference.jpg`, `public/templates/precision-reference.jpg` (shipped defaults, added with the spec)
- `src/lib/defaults/template-references.ts` (new: the defaults' calibration, size and hash)
- `src/lib/domain/template-reference.ts` (new, mirroring `backing.ts`)
- `src/lib/cv/template-reference.ts` (new, pure: keeping the circles and the refusal rule; §6's comparison would go here)
- `src/lib/cv/holes.ts`, `hole-signal.ts`, `print-mask.ts` (consume the new signal; fallback preserved)
- `src/components/settings/TemplateSheetSettings.tsx` and the `#/settings/template-sheet/:template` route (mirroring `BackingSettings`/`BackingCardPage`)
- `scripts/cv-eval.ts`, `scripts/detection-review/`

## Steps
M26 is built in two parts (owner, 2026-09-27: "Build what you can of M26").

**Part 1: reference sheets in Settings (template-reference.md §1–§5, §7, §8). Done 2026-09-27.**
1. Pure `keepTargetCircles` and `referenceRefusal` (`src/lib/cv/template-reference.ts`, §3 steps 2–3).
2. `TemplateReference` / `TemplateReferences` / `ReferenceUsed` schemas; `AppSettings.templateReferences` (default both
   `null`, older rows read back); blob key `reference:<template>:image`; optional `pipeline.detection.reference` (§4).
3. `DEFAULT_TEMPLATE_REFERENCE`: the shipped defaults' asset path, size, hash and calibration (§5).
4. Worker `makeReference` (§3 steps 2–5) and the service: `prepareTemplateReference`, `saveTemplateReference`,
   `restoreDefaultReference`, each change re-running that template's photos with nothing manual (`canRerunStageA`, §7).
5. Settings **Target sheets** section and `#/settings/template-sheet/:template` sheet capture, with the refusal messages
   (no rings, the other template, holes in the sheet) (§2, §3).

**Part 2: detection uses the reference (§6). Blocked.** Not started: the §6 measurements show no gain on the production
benchmark yet (see *Open questions*).

## Tests
Part 1:
- `tests/unit/cv/template-reference.test.ts`: the kept radius, the crop, painting beyond the radius, removing a mark
  outside the circles, input untouched, the crop clamped at an edge; the refusal rule's three cases.
- `tests/unit/defaults/template-references.test.ts`: each default's record parses, its hash matches the file, and the
  app's A4 finds the recorded disc (within 0.5% of R) and names the template.
- `tests/unit/services/template-reference.test.ts`: prepare (worker call, hash, refusal, non-image), save (blob and
  entry together), the §7 re-run (only that template's finished photos with nothing manual; shots and calibration
  untouched), and Restore default.
- `tests/unit/domain/settings.test.ts`, `tests/unit/app/nav.test.ts`: the new default and field, and the hidden tab bar.
- `tests/e2e/template-sheets.spec.ts`: both defaults shown and loading; a used sheet refused for its holes; a blank sheet
  stored as *Your sheet*, kept across a reload, then *Restore default*; the other template's photo refused; sheet mode
  opens full screen and Cancel returns.

## Acceptance
```bash
pnpm check
pnpm test:e2e --project=mobile-chromium tests/e2e/template-sheets.spec.ts   # and the WebKit project on the owner's Mac
pnpm cv:eval                                                                # part 2 only; needs the private fixtures
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
Part 2 (§6) waits on a larger production sample (issue #56 would supply one). Still open: whether backups include a
custom reference (template-reference.md §8). Decisions
3 and 4 need measurement and prototyping on the owner's photos in `fixtures/private/`; cloud sessions can do this when the
private fixtures repo is attached. The spec exists (`docs/spec/template-reference.md`); its §6 method stays pending until
those measurements are made, per AGENTS.md golden rule 2 ("never guess on scoring, geometry, or storage").

## Completion notes
**Part 1, 2026-09-27 (cloud session, private fixtures attached).**
- `pnpm check`: typecheck and lint pass (the 4 existing warnings), 1080/1080 unit tests pass (110 files), and the
  privacy check passes (37 images). `pnpm build` passes; the precache is unchanged at 23 entries.
- Chromium e2e: `template-sheets.spec.ts` 5/5; the full Chromium suite passed (87 + 1 skipped before the refusal change added one test). WebKit is not available in
  the cloud container; the owner runs that project on the Mac.
- Checked by hand in the dev build: the stored reference is a JPEG of the circles only, with no EXIF.
- Owner, same day: a sheet with holes must never become a reference. §3 step 5 changed from a warning (*Use anyway*) to a
  refusal, after measuring 0 detected holes on both blank defaults and 7–11 on used sheets.
- **Deviations:** none from the spec. §7's re-run is implemented as specified, although nothing reads a reference until
  part 2, so a re-run currently reproduces the same results.
- **Owner checks:** photograph a blank sheet with *Photograph sheet* on the iPhone (camera and HEIC path), and confirm
  whether backups should include a custom sheet (§8; today they do, as backups copy every blob).
