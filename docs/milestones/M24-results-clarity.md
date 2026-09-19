# M24: Results that say what they count

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M14, M20 | high | S | receive analysis |

## Goal
From the issue sweep: [#6](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/6), the diagram half of
[#4](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/4), and point 5 of
[#8](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/8). REV-49.

1. **"7/10 hits @ 45 mm" reads as "7 of 10 shots found".** The owner, looking at a sighting target where all 10 shots were found and
   7 were hits: "it still says that seven out of 10 shots are recognized. There's actually 10 in the image." The headline must say
   what it counts, and "found" must be stated separately so the two can never be confused.
2. **The diagram contradicts its own score.** Shots are drawn as small dots (REV-22), but scoring uses the full 5.6 mm hole with the
   touch rule, so a shot credited for touching a line is drawn clearly outside it. The owner saw two such 10s on a precision target
   and two such hits on a sighting target and read both as errors.
3. **A stale message.** `rounds-unaccounted` still says "score shown as a range", which stopped being true in M20.

This milestone changes **presentation only**. Which scoring rule is right is still the owner's decision in #4 — do not change
`geometry-scoring.md` §4 or §5.

## Read first
- `docs/spec/rendering-composite.md` §3 (diagrams), §5–§6 (card and summary text)
- `docs/spec/analysis-pipeline.md` §4 (reason messages)
- `docs/spec/geometry-scoring.md` §4–§5 (touch rule — read, do not change)
- `src/lib/render/text-lines.ts` (`targetHeadline`, footers, `missesSuffix`)
- Issues #4, #6, #8

## In scope
Headline and footer wording on the results card, target detail and summary image; a "shots found" line; marking touch-credited
shots on every diagram; rewording or retiring `rounds-unaccounted`.

## Out of scope
The scoring rule itself (#4, owner), detection, alignment.

## Files
- `src/lib/render/text-lines.ts`, `src/lib/render/diagram-shared.ts` (and the renderers that call it)
- `src/components/results/TargetCard.tsx`, `SummaryCard.tsx`, `src/routes/target/TargetPage.tsx`
- `docs/spec/rendering-composite.md`, `docs/spec/analysis-pipeline.md` §4
- `tests/unit/render/text-lines.test.ts`, diagram tests, the e2e results/target specs, regenerated `docs/reference/` samples

## Steps
1. **Headline (REV-49).** Say what is counted:
   - sighting: **"7 hits · 3 misses — 45 mm prone"** (the zone and position as today);
   - precision: **"86 / 100 · X 1"** with misses appended as M20 does (e.g. "· 1 miss").
   Update `rendering-composite.md` first; the card, the target detail and the summary image (M14) all use the same helper, so they
   stay in step.
2. **A separate "found" line.** Directly under the headline: **"10 of 10 shots found"**, or **"8 of 10 shots found — 2 not
   placed"** when rounds are unaccounted/scored as miss. "Hit" and "found" never share a sentence.
3. **Mark touch credit on the diagrams.** A unit whose *centre* is outside the ring or zone it scored — credited only because its
   hole edge touches the line — is drawn with a distinct marker (for example a thin ring at the true hole radius, or a small tick)
   and explained in the diagram's key/footer ("scored by touching the line"). Compute it from the same thresholds scoring uses
   (geometry-scoring §4, §5), never from a second copy. The dot size of REV-22 stays.
4. **`rounds-unaccounted`.** Since M20 it appears only on results stored before M20 and not yet re-scored. Reword it to drop
   "score shown as a range" (e.g. "`<N>` round(s) not found — re-analyze to score them as misses"), or retire the reason if
   nothing can still produce it; record which in analysis-pipeline §4.
5. Regenerate the committed sample diagrams (`pnpm render:samples`) and check them by eye.

## Tests
- `targetHeadline`: sighting 7 of 10 → "7 hits · 3 misses — 45 mm prone"; precision → "86 / 100 · X 1"; the found line for
  10/10 and for 8/10 with 2 unplaced.
- Touch credit: a precision unit at 7.05 mm scores 10 and is flagged touch-credited; one at 3.55 mm is not; a sighting unit at
  23.4 mm (45 mm zone) is a touch-credited hit; one at 26.2 mm is a miss and unflagged. (Distances from the owner's two reports.)
- E2E: the results card shows both lines; the target detail diagram contains the touch marker for a touch-credited unit.

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm render:samples
```

## Pitfalls
- Do not touch scoring. If a test would need a score to change, stop — that is #4's decision.
- Keep the headline short enough for a phone card; check at 375 px.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
