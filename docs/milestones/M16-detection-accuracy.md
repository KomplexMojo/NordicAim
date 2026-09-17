# M16: Detection accuracy and shot constraints

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M12 | high | M | generate analysis (detection quality) |

## Goal
Make a real photo produce a **plausible** shot set. Owner review of real targets against their diagrams (2026-09-16) found the
diagrams do not represent the photos: printed ring numerals are detected as shots, and blob area invents multiplicities, so a
10-round precision sheet reported 19 detections / 62 units. Three rules fix it (REV-27, REV-28): reject printed glyphs, start every
detection at **one hole**, and never report more shots than the declared rounds.

## Read first
- `docs/spec/analysis-pipeline.md` §2 (A5), §4
- `docs/spec/geometry-scoring.md` §7, §8
- `docs/milestones/M11-shot-detection.md` Steps 4–5 and Open questions 1–4

## In scope
`src/lib/cv/holes.ts` (glyph rejection, multiplicity), a pure `capShots` helper, its use in Stage A and Stage B, `cv:eval` reporting.

## Out of scope
The Adjust screen (M17), the summary image (M14), any change to ring scoring maths.

## Files
- `src/lib/cv/holes.ts`, `src/lib/cv/constants.ts` (new thresholds)
- `src/lib/scoring/cap-shots.ts` (pure) — or the nearest existing pure module; do not put it in a `*-browser.ts` file
- `src/lib/pipeline/stage-a.ts`, `stage-b.ts`
- `scripts/cv-eval.ts`
- `tests/unit/cv/holes.test.ts`, `tests/unit/scoring/cap-shots.test.ts`, `tests/unit/pipeline/stage-a.test.ts`

## Steps
1. **Reject printed glyphs (REV-27).** M11 step 4 erases printed *circles* only, so the numerals at 12 and 6 o'clock survive and
   are detected as shots. Add a shape filter to M11 step 5, before the component is accepted:
   - `elongation = major/minor` of the fitted ellipse; reject `elongation > ELONGATION_MAX`.
   - `strokeRadius` = the maximum inscribed radius (distance transform peak) of the component; reject
     `strokeRadius < STROKE_MIN_FRACTION × (holeDiameterMm/2)`. A bullet hole is a compact blob; a printed glyph is a thin stroke.
   - Both constants live in `constants.ts`. **Measure them** on `fixtures/private/additional references/` and the two reference
     JPEGs, then record the measured separation and the chosen values in Completion notes, the way M10 did for `BLUR_THRESHOLD`.
     If no single pair of values separates glyphs from holes on real photos, stop and record it under Open questions rather than
     tuning until the reference photo passes.
2. **One hole to start (REV-28).** In M11 step 5 replace `multiplicity = cluster ? clamp(round(k), 2, 8) : 1` with
   `multiplicity = 1`, always. Keep computing `cluster` and use it only for `confidence` and for the `cluster` flag on the shot.
   Overlapping holes are therefore one shot until the owner says otherwise in Adjust — which is the point: the app never invents
   rounds the owner did not fire.
3. **Never exceed the declared rounds (REV-28).** Add pure
   `capShots(shots: Shot[], declared: number): { kept: Shot[]; dropped: Shot[] }`: when `shots.length > declared`, keep the best
   `declared` ranked by `confidence` descending, ties by larger area then by smaller radial distance, so the ranking is total and
   deterministic; everything else is `dropped`.
   - Stage A applies it after A5 **when the categorization is already complete** (declared rounds are known); otherwise it leaves
     the shots alone, because Stage A runs before metadata.
   - Stage B applies it again after metadata, so the rule always holds by the time anything is scored or drawn.
   - When anything is dropped, add the warning `extra-candidates-dropped` so the photo reports it rather than hiding it.
4. **Reason and status.** Add `extra-candidates-dropped` to `Reason` in `docs/spec/analysis-pipeline.md` §4 and to
   `reason-messages.ts` ("Some detected marks were ignored because you fired N rounds."). A capped photo is still
   `needs-attention`, since the owner should confirm which marks were kept.
5. **`cv:eval`** reports, per reference photo: detections, units, recall and precision against the fixture/ground-truth shots, and
   how many candidates the cap dropped. It exits non-zero if a reference photo yields more detections than its declared rounds.

## Tests
- Glyph rejection: on `IMG_5132-precision.jpg`, no detection falls inside the numeral sectors, and total detections ≤ 10.
- Multiplicity: every auto shot from `detectShots` has `multiplicity === 1`, including on a deliberately overlapping synthetic pair.
- `capShots` vectors: 12 shots / declared 10 → 10 kept, 2 dropped, lowest confidence first; a tie broken by area then radius;
  `shots.length <= declared` → unchanged, `dropped` empty.
- Stage A: complete categorization → capped and warned; incomplete categorization → not capped.
- Stage B: re-caps after metadata; `identified <= declared` always, so `overcount` is unreachable from auto detection.
- E2E: the demo precision fixture still analyses without `too-many-shots`.

## Acceptance
```bash
pnpm check
pnpm cv:eval
pnpm test:e2e
```
Paste the `cv:eval` table and the measured glyph-filter values into Completion notes.
**Human (owner):** on the iPhone, photograph both sheets → Analyze → confirm the shot count is plausible and the diagram
resembles the photo.

## Pitfalls
- Don't tune the thresholds until one photo passes; they must separate glyphs from holes on the whole `additional references` set.
- `capShots` is pure: no `Date.now()`, no DOM.
- Never drop or renumber a shot whose `source` is `'manual'` (analysis-pipeline §8) — cap only `auto` shots.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
