# M19: Coloured backing sheet option

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M16 | high | M | add metadata (option) · generate analysis |

## Goal
Let the shooter say, from a tucked-away option, that a coloured backing sheet was used — and optionally photograph the backing card —
so detection can find holes by the colour showing through them (REV-38). On the owner's first backing photo this found exactly the
8 holes with no fragments and no false marks, where the standard detector reported 17.

## Read first
- `docs/spec/backing-sheet.md` (all)
- `docs/spec/analysis-pipeline.md` §2 (A5), §4, §8
- `docs/spec/data-model.md` §2 (session), §5 (settings), photo `origin`
- `docs/milestones/M09-add-metadata.md` Steps (the metadata screen this extends)
- `docs/milestones/M16-detection-accuracy.md` *Rework* R3–R5 (sheet area, the labelled gate, the review page)

## In scope
The Session options panel, card capture/import, the data model and migration, colour measurement, the colour path in A5 with fallback,
the new reason, re-running detection when the backing changes, and backing support in `pnpm review:detection` and `cv:eval`.

## Out of scope
Assigning multiplicity from coloured area (only the `possibleOverlap` flag), the Adjust UI for that flag (M17), any change to the
three-step flow.

## Files
- `src/lib/domain/backing.ts`; `session.ts` (schema v2 + migration), `settings.ts` (`lastBacking`), `enums.ts` (`'backing-card'`,
  `backing-colour-not-found`), `reason-messages.ts`
- `src/lib/cv/backing-colour.ts` (pure: `backingColourFromCard`, `estimateBackingColour`, `detectByBackingColour`), `constants.ts`
- `src/lib/pipeline/stage-a.ts` (A5 branch, fallback, re-run on change), the store migration
- `src/components/metadata/SessionOptions.tsx`; capture screen card mode (no target overlay, a "fill the frame" guide)
- `scripts/cv-eval.ts`, `scripts/detection-review/` (backing photos, card swatch, method used)
- Tests under `tests/unit/cv/`, `tests/unit/domain/`, `tests/unit/pipeline/`, `tests/e2e/`

## Steps
1. Data model and migration per spec §3. Existing sessions load as `backing: null`; a v1 session round-trips to v2 unchanged otherwise.
2. `backingColourFromCard` and `estimateBackingColour` per §4, with their constants in `constants.ts`.
2a. `detectBackingPresence` per §4a, and `Auto` as the default mode; record `pipeline.detection.backing` on every analysis.
3. `detectByBackingColour` per §5 steps 1–5, and the A5 branch with the §5.6 fallback and `pipeline.detection` record.
4. Session options panel per §2: collapsed by default; `Auto` (default) / `None` / `Coloured backing`; swatch + source; **Photograph backing card** opens the
   capture screen in card mode; **Choose card photo** imports. A card photo that yields `null` shows the §4 message and is not saved as
   the session's card. New sessions inherit `AppSettings.lastBacking`.
5. Card photos: `origin: 'backing-card'`, excluded everywhere §3 lists. Deleting the session deletes them.
6. Changing the backing re-queues A5 per §5 for auto-only photos.
7. Reason `backing-colour-not-found` per §6.
8. `cv:eval`: a backing section over `fixtures/private/backing/` (skipped with a notice when absent) reporting, per photo, colour vs
   standard detections, recall and precision against labels when present, and the colour signature used. Gate per spec §7 **only when
   ≥ 10 labelled backing photos exist**; otherwise print the counts and `UNVERIFIED`.
9. `pnpm review:detection`: include `fixtures/private/backing/`, show which method ran, the card swatch, and `possibleOverlap` blobs.

## Tests
- `backingColourFromCard`: a synthetic pink card → hue within 3° of the true hue; a grey card → `null`; a card half in shadow still
  measures the hue within 5°.
- `detectByBackingColour` on a synthetic sheet with pink showing through 9 holes (one overlapping pair) and **blue handwriting** on the
  paper → 8 blobs, one flagged `possibleOverlap`, no blob on the handwriting or on any printed numeral or ring.
- On `fixtures/private/backing/IMG_5189.jpeg` (skip when absent): 8 detections, each within one hole radius of a real hole.
- With card `IMG_5190.jpeg` and target `IMG_5191.jpeg` (skip when absent): card hue within 3° of 15.9°; exactly 8 detections, one
  flagged `possibleOverlap`; and with the 3×3 opening removed the result is still 8 (the size guard catches the fringes) — pinning
  both defences.
- A synthetic sheet with 1-px coloured fringes along every printed ring edge → no detection on the fringes.
- `Auto` on every photo in `fixtures/private/` (skip when absent): all backed photos present, all unbacked photos absent, including the four with large coloured areas (IMG_4743, 4770, 4771, 5057 2).
- Fallback: backing set but the colour absent from the photo → standard detector runs, warning `backing-colour-not-found`, method `standard`.
- Card photos never appear in counts, results, the summary image or share payloads.
- Migration: a stored v1 session loads, validates and saves as v2 with `backing: null`.
- Changing the backing re-queues A5 for auto-only photos and leaves a photo with a manual shot untouched.
- E2E: open Session options, choose Coloured backing, import a card photo → swatch shown; the three-step flow is unchanged with the
  panel collapsed.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
pnpm review:detection
```
**Human (owner):** photograph at least 10 targets with the backing in varied light, each with a card photo in the same light; place them in
`fixtures/private/backing/`; label them with `pnpm review:detection`; paste the export. Until then the colour path is **unverified** and
the Completion notes must say so.

## Pitfalls
- A card photographed in different light from the target shifts the hue — measure it on the owner's set before trusting one card for a session.
- Coloured ink on the sheet (scores written in pen) can match the backing; hue plus the sheet area limit it, but test it.
- Never write the card photo, or anything derived from any photo, outside the phone's store or `fixtures/private/`.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
