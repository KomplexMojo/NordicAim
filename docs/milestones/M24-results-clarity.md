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
- `cellCaption` (rendering-composite.md §4, the cell-diagram caption band) still reads `<hits>/<declared> hit @ <zone> mm`
  — the same "hit @ mm" shape issue #6 flagged, just on the compact thumbnail caption rather than the card/detail
  headline. The Steps and Tests sections name only `targetHeadline`, so I left `cellCaption` as it is; flagging in case
  the owner wants it reworded too in a follow-up. Non-blocking — nothing downstream depends on its exact wording.
  **Fix round 1**: the reviewer raised this again and left it to the owner to decide; still unresolved, still non-blocking.
- The touch-credit marker (Step 3) is drawn only by `renderShots` (`diagram-shared.ts`), i.e. the `full`/`cell`
  `renderDiagramSvg` diagrams (results card, target detail, summary image). `TargetPage`'s compare-slider overlay
  (`diagram-overlay.ts`, `renderDiagramOverlaySvg`) draws shots at their true hole size already and is a separate,
  independent renderer not in the milestone's Files list, so I left it unmarked. Non-blocking.
- "Both" position headlines (`Prone <h> · Standing <h>`) omit each half's own position word (e.g. "Prone 7 hits · 3
  misses · Standing …") rather than repeating it after the "Prone "/"Standing " prefix, since the milestone gave
  only the single-position example. Non-blocking design choice, documented in `rendering-composite.md` §3.
  **Fix round 1**: also drops each half's zone size (`— 45 mm`/`— 115 mm`) for the same reason — see Completion notes.
- The `settings.spec.ts` "hole size: a new value is kept, and Reset returns 5.6" test fails intermittently on
  `mobile-chromium` in a full `pnpm test:e2e` run (order-dependent: passes 6/6 in isolation with `--repeat-each=3` on
  both projects, and reproduces identically on `main` before this milestone's changes). M24 touches no Settings code
  and this milestone's Files list does not include `settings.spec.ts`, so fixing the test's isolation is out of scope
  here. Non-blocking for M24's own Acceptance intent, but it means `pnpm test:e2e` cannot be made to exit 0
  deterministically from inside this milestone — the owner should either accept it as a known flake or file a
  follow-up to isolate the test's stored hole-size setting.

## Completion notes
Commands run (all from the repo root):
- `pnpm check` — pass (typecheck, lint, 804 unit tests, privacy check).
- `pnpm test:e2e` (`npx playwright test`, both `mobile-chromium` and `mobile-webkit` projects) — 67/68 pass. The one
  failure, `settings.spec.ts` "hole size: a new value is kept, and Reset returns 5.6" on `mobile-chromium`, reproduces
  identically on `main` before this milestone's changes (verified with `git stash`) — pre-existing flake, unrelated to
  M24, out of scope to fix here.
- `pnpm render:samples` — regenerated the four `docs/reference/generated/*.png` samples and checked them by eye.
  `sample-precision-full.png` changed because the committed copy was stale (it still had M20's removed "Range:
  pessimistic … · averaged … · optimistic …" footer line); the other three were already current. None of the four
  golden fixtures contains a touch-credited unit, so no diagram shows the new marker; verified the marker renders
  correctly (dashed ring + footer note) with an ad-hoc synthetic fixture rendered and inspected outside the repo.
- Manually exercised the demo session in the dev-test server (`VITE_FAKE_CAMERA=1`) at a 375 px viewport: confirmed
  `target-headline` and `shots-found-line` render without horizontal overflow on both the results card and the target
  detail page.

What changed:
- `src/lib/scoring/precision.ts`, `src/lib/scoring/sighting.ts`: added `isTouchCredited`, delegating to the same
  ring/zone thresholds `scoreRing`/`zoneFor` already use.
- `src/lib/render/diagram-shared.ts`: added `isUnitTouchCredited`; `renderShots` now takes `holeDiameterMm` and draws a
  dashed ring at the true hole radius under a touch-credited shot's display dot (class `touch-credit`).
- `src/lib/render/diagram-sighting.ts`, `diagram-precision.ts`: pass `holeDiameterMm` through to `renderShots`.
- `src/lib/render/text-lines.ts`: `targetHeadline`'s sighting branch is now `<hits> hits · <misses> miss(es) — <zone>
  mm <position>` (REV-49, issue #6); added `shotsFoundLine` (the separate "found" line) and `touchCreditNote`
  (appended to `sightingFooterLines`/`precisionFooterLines` only when a unit is touch-credited).
- `src/lib/render/composite.ts`: `slotSummaryLine` now calls `targetHeadline` instead of duplicating the old format,
  so the summary image stays in step with the card and target detail (per the milestone's Step 1 instruction).
- `src/components/results/TargetCard.tsx`, `src/routes/target/TargetPage.tsx`: added the `shots-found-line` paragraph
  directly under the headline.
- `src/lib/domain/reason-messages.ts`: reworded `rounds-unaccounted` to drop "score shown as a range"; the reason
  itself is kept (still producible per analysis-pipeline §4 rule 10 for a pre-M20 unreanalyzed result), per the
  milestone's "or retire" alternative — recorded that decision in `docs/spec/analysis-pipeline.md` §4.
- `docs/spec/rendering-composite.md`, `docs/spec/analysis-pipeline.md`: updated ahead of the code, per the milestone's
  "Update rendering-composite.md first" instruction.
- Deliberately unchanged: `docs/spec/geometry-scoring.md` §4/§5 (touch rule) and every scoring value — this milestone
  is presentation-only, per its own scope statement.

### Fix round 1 (independent review)

Addressed every major/blocking finding and the cheap minor ones; left the two out-of-scope items (`cellCaption`,
the pre-existing `settings.spec.ts` flake) as recorded Open questions, per the review's own recommendation.

1. **Major — missing E2E touch-marker test (Tests, third bullet).** Added
   `tests/e2e/target.spec.ts` `'target: a touch-credited unit draws the dashed ring and footer note (M24, REV-49)'`.
   It uses the existing `__asaTest.setShots` hook (already used by `adjust.spec.ts`/`review.spec.ts`) to move the
   demo precision photo's shot `P1` to (7.05, 0) — the milestone's own precision vector, radial 7.05 mm, which
   scores ring 10 only via the touch rule (`scoring/precision.ts` `isTouchCredited`) — then opens the target detail
   route and asserts `[data-testid="diagram-full"] circle.touch-credit` has count 1 and the diagram contains
   "scored by touching the line". Passes on both Playwright projects.
2. **Minor — `sightingHeadline` always said "hits".** `src/lib/render/text-lines.ts`: added a `hitWord` (singular at
   exactly 1 hit, mirroring the existing `missWord`), so a 1-hit target now reads "1 hit · 9 misses — 45 mm prone"
   instead of "1 hits …". Updated the format note in `rendering-composite.md` §3 (`<hits> hit(s)`) to match. New unit
   test in `tests/unit/render/text-lines.test.ts`.
3. **Minor — milestone's literal test vectors not tested literally.** Added, in
   `tests/unit/render/text-lines.test.ts`: the sighting "7 of 10 → 7 hits · 3 misses — 45 mm prone" vector and a
   precision vector yielding exactly "86 / 100 · X 1" (10 shots: one X at radial 0, eight on ring 9 at radial 12.8,
   one on ring 4 at radial 52.8 → 10 + 8×9 + 4 = 86, X count 1). Added, in `tests/unit/render/diagram.test.ts`, a
   sighting touch-credit pair using the milestone's own reported distances: 23.4 mm (45 mm prone zone) draws
   `class="touch-credit"` and the footer note; 26.2 mm is a miss and draws neither.
4. **Minor — `cellCaption` still "hit @ mm".** Left as an owner decision (see Open questions); the review's own
   finding text says "the owner decides", so no code change.
5. **Minor — a `both`-position summary-image slot line could exceed the 110-char cap and cut off ES/MPI.** Traced
   the actual overflow: for a sighting `both` slot the old headline repeated `— 45 mm`/`— 115 mm` in both halves,
   which alone (before ES/MPI) already exceeded 110 chars, so truncation could cut into ES. Fixed at the shared
   `targetHeadline` level (`sightingHeadline` in `text-lines.ts`) rather than only in the composite: for a `both`
   headline (`positionWord === null`) the zone suffix is now omitted entirely, since each half is already labelled
   "Prone"/"Standing" and the zone size (45/115 mm) is fixed per position in this profile — repeating it added
   length without new information. This shortens the shared headline everywhere it is used (card, target detail,
   summary image), not just the composite. With this fix a `both` sighting slot line's head (label + headline + ES)
   stays at or under 110 chars, so ES is always visible; MPI (appended last, sighting only) may still be truncated
   with `…`, which is the outcome the review accepted ("or drop the MPI part"). Updated `rendering-composite.md` §3
   and §5 (new `both`-slot example) to match. New unit tests: `tests/unit/render/text-lines.test.ts` ("both" case,
   unaffected assertions still pass) and `tests/unit/composite/render.test.ts` (new describe block asserting the
   rendered `<text>` line for a sighting `both` slot is ≤ 110 chars, keeps `ES 27.7 mm (1.90 MOA)` visible, and ends
   in `…`).
6. **Minor — `settings.spec.ts` flake.** Re-ran `pnpm test:e2e` (both projects): 69/70 passed, the only failure the
   same pre-existing `settings.spec.ts` "hole size…" test on `mobile-chromium` (expected `5.6`, got `7.6` — a stale
   value bled in from an earlier test in the same worker). Re-ran it in isolation
   (`npx playwright test tests/e2e/settings.spec.ts -g "hole size" --repeat-each=3`, not re-run this round since fix
   round 0 already confirmed 6/6 passing there and this milestone touches no Settings file); left unfixed per the
   review's own recommendation that it is either an accepted known flake or a separate follow-up — recorded as an
   Open question above.

Re-ran commands after the fixes:
- `pnpm check` — pass (typecheck, lint 0 errors/4 pre-existing warnings, 810 unit tests, privacy check 16 images).
- `pnpm render:samples` — regenerated the four PNGs; only `sample-precision-full.png` differs from the committed
  copy, same as before this fix round (none of this round's wording/format changes touch a single-position
  headline with hits = 1 or a `both`-position target, so the golden samples are otherwise unaffected).
- `pnpm test:e2e` (`npx playwright test`, both projects) — 69/70 pass; the one failure is the pre-existing
  `settings.spec.ts` flake above, unrelated to M24.
- `npx playwright test tests/e2e/target.spec.ts tests/e2e/results.spec.ts tests/e2e/adjust.spec.ts --project=mobile-chromium`
  — 16/16 pass, including the new touch-marker E2E test.
