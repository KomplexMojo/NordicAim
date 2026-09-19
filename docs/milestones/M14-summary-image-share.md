# M14: Session summary image and share

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M12 | low | M | **3. receive analysis** (summary image) |

## Goal
After analysis, the phone automatically builds one **session summary image** (≤2 sighting + ≤2 precision targets plus an analysis band
with the scores). It appears at the top of the results screen, where the owner can share or save it and attach it in Garmin Connect.

## Read first
- `docs/spec/rendering-composite.md` §4–§7
- `docs/spec/analysis-pipeline.md` §7
- `docs/spec/data-model.md` §2 (`ArtifactMeta`, `ShareRecord`), §6, §7
- `docs/DESIGN.md` "Composite layout", "Slot rules"

## In scope
`selectDefaultSlots`, `renderCompositeSvg`, `buildComposite` (with pruning to 3), `loadArtifact`/`latestArtifact`, the debounced
scheduler (registers `summaryHooks`), the Summary card, `shareArtifact`, `recordShare`, and the Attach card.

## Out of scope
The slot picker (backlog B5), native Photos save (backlog B10).

## Files
- `src/lib/composite/select-defaults.ts`, `artifact.ts`, `build.ts`, `scheduler-browser.ts`
- `src/lib/render/composite.ts`
- `src/lib/share/share-browser.ts`, `src/lib/services/shares.ts`
- `src/components/results/SummaryCard.tsx`, `AttachInGarminCard.tsx`
- `tests/unit/composite/*.test.ts`, `tests/unit/share/share-browser.test.ts`, `tests/unit/services/shares.test.ts`, `tests/e2e/summary.spec.ts`

## Steps
1. `selectDefaultSlots` per §5 (automatic).
2. `renderCompositeSvg` per §5, including the `+<n> more target(s) in the app` line.
3. `buildComposite`, `loadArtifact`, `latestArtifact` per §6 (prune to the newest 3).
4. `scheduler-browser.ts` per analysis-pipeline §7: `summaryHooks.schedule(sessionId)` debounced 1500 ms; builds only when no photo in the
   session is `processing` and ≥ 1 is `analyzed`; emits `pipeline-changed` after building.
5. **SummaryCard** at the top of results:
   - the latest artifact PNG (object URL), with "Updating summary…" while a build is scheduled or running
   - **Share** (`shareArtifact` with the pre-loaded Blob) → `recordShare`
   - `AttachInGarminCard` (4 steps)
   - if nothing is analyzed yet: "Your summary image appears once a target is analyzed."
6. `shareArtifact` per §7.

## Tests
- Height vectors, including the throw.
- Slot selection: 3 analyzed precision targets at 10:00/11:00/12:00 → slots [11:00, 12:00]; `needs-attention` targets excluded; ties by score.
- (from M20) A rejected target (`needs-attention`, reason `too-many-holes`, `computed` null) is absent from the summary image slots.
- Golden render with both demo fixtures: height 2160; contains `Session analysis`, `Precision 1 (prone): 72/100`, `Sighting 1 (prone): 9/10 hit @45 mm`; two stat cards.
- `buildComposite` (stub rasteriser): stores PNG + JSON; the JSON deep-scan has no `gps`; the 4th build prunes the oldest artifact
  (blobs gone); `loadArtifact` with tampered bytes → `ArtifactNotFoundError`.
- `shareArtifact`: `web-share` / `cancelled` / `download` with mocks. `recordShare` rejects an unknown artifact.
- E2E (both projects):
  1. `loadDemo` → results → the summary image loads at 1440×2160 (`naturalWidth/Height`)
  2. **Share** → Playwright download event named `*-shooting-analysis.png`
  3. one ShareRecord
  4. change sighting rounds → the summary rebuilds (a new artifact id).

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** on the iPhone, **Share → Save Image** → attach in Garmin Connect → confirm it looks right. Record the outcome.

## Pitfalls
- Pre-load the PNG so `navigator.share` runs directly in the tap handler.
- Rasterise and hash before the transaction.
- Nested cell `<svg>`s need a `viewBox`.

## Open questions

- **`CompositeInput` (rendering-composite.md §5) has no field for "how many more analyzed targets exist
  beyond the four slots"**, yet §5's analysis-band line 3 ("`+<n> more target(s) in the app`") needs
  exactly that count, and it isn't derivable from the four `SlotData | null` slots alone. Added an extra
  `moreCount: number` field to `CompositeInput` (computed in `composite/build.ts` from the full
  candidate list `selectDefaultSlots` saw). Not blocking.
- **The notes-wrapping algorithm for "≤ 2 lines" isn't specified** (word-boundary wrap vs. a flat
  character cut). Implemented as a flat cut at `MAX_LINE_CHARS` (110) with an ellipsis on line 2 if more
  remains — simplest reading consistent with the "≤110 chars (…)" rule stated for every other line. Not
  blocking (cosmetic only).
- **The `sha256` and stored `sizeBytes` do not go through the "≤16MB" note anywhere** — not relevant here
  since these are on-device blobs, not published Artifacts; noted only because the spec's "no image data
  and no GPS" JSON rule is the one this milestone's tests actually check (`build.test.ts`).

## Completion notes

- Implemented `src/lib/composite/{select-defaults,artifact,build,scheduler-browser}.ts`,
  `src/lib/render/composite.ts`, `src/lib/share/share-browser.ts`, `src/lib/services/shares.ts`,
  `src/components/results/{SummaryCard,AttachInGarminCard}.tsx`. Wired `startSummaryScheduler` from
  `main.tsx` alongside the existing pipeline runner, and replaced the M12-era summary placeholder in
  `ResultsPage.tsx` with `<SummaryCard>`. Exported `fmtMm`/`fmtAngular` from `render/text-lines.ts` (were
  module-private) so `render/composite.ts` reuses the same mm/MOA formatting rule. Added a `getSession`
  test hook (`src/lib/testing/test-hooks-browser.ts`) so the new e2e spec can assert on `session.artifacts`
  / `session.shares` without a dedicated UI affordance for them.
- `selectDefaultSlots` filters `isTargetPhoto` defensively per backing-sheet.md §3's explicit statement
  that backing-card photos are excluded from the summary image (in practice a card photo's status can
  never be `analyzed`, since it never reaches Stage B, so this is belt-and-braces).
- Commands run: `pnpm check` passes end to end (`typecheck`, `lint` — 0 errors, the 4 warnings in
  `ui/badge.tsx`, `ui/button.tsx`, `ui/toggle.tsx`, `cv/opencv.ts` predate this milestone — `test`
  717/717, `check:privacy` 16 images). `pnpm test:e2e` (both projects, full suite): 52/52 pass; on the
  first parallel run one unrelated test (`adjust.spec.ts` REV-44, mobile-webkit) hit a `window.__asaTest`
  race under worker load and failed, then passed cleanly alone — a pre-existing flake, not touched by
  this milestone.
  - `tests/e2e/summary.spec.ts` itself: 3/3 on `mobile-chromium` and 3/3 on `mobile-webkit`.
  - **WebKit pitfall found and fixed**: `navigator.share()` opens WebKit's real OS share sheet even
    under Playwright automation, which has no UI to dismiss headlessly, so the Share test hung forever
    on `mobile-webkit` until killed. Fixed by having that one test disable `navigator.canShare` via
    `page.addInitScript` before navigating, forcing the same download fallback branch a browser without
    file-sharing support takes — this is also what the milestone's own acceptance line ("Playwright
    download event") describes, so this is a test-determinism fix, not a change to `shareArtifact`
    itself (still tries native share first on a real phone).
- **Human required (owner):** on the iPhone, Share → Save Image → attach in Garmin Connect → confirm it
  looks right, per the milestone's Acceptance note. Not attempted here (no physical device).

### Fix round 1 (review finding: §6 step 2 must run `analyzeTarget` per slot)

- The reviewer confirmed a real internal-consistency bug: `toSlotData` in `src/lib/composite/build.ts`
  reused each slot's stored `analysis.computed.result` (from that photo's own earlier Stage B run)
  instead of calling `analyzeTarget` fresh, while the stat-card/footer lines (`sightingFooterLines`,
  `precisionFooterLines`) were already built from *current* `holeDiameterMm`. If Settings' hole diameter
  changed between a photo's Stage B run and a later composite rebuild, the composite could show two
  disagreeing hit/miss counts for the same target in one shared image.
- **Fix**: `toSlotData` now calls `analyzeTarget({ template, categorization, shots: analysis.shots, profile })`
  per slot, with `profile` built from the *current* settings' `holeDiameterMm` (same
  `{ ...BIATHLON_50M, holeDiameterMm } as typeof BIATHLON_50M` pattern `runStageB` uses), exactly per
  rendering-composite.md §6 step 2's literal wording. `analysis.shots` is the final reconciled shot list
  Stage B stored (verified against `stage-b.ts`), so the recompute uses the same shots, just the current
  profile. Removed the now-resolved "not blocking" Open-questions bullet about this; the `moreCount` and
  notes-wrapping bullets stand as before (unaffected by this fix).
- Added a regression test in `tests/unit/composite/build.test.ts` reproducing the reviewer's exact repro:
  a sighting fixture analyzed at `holeDiameterMm=8` (stale, 9 hit / 1 miss) with current settings then
  changed to `holeDiameterMm=15`; asserts the rendered composite SVG contains neither a stale "9 hit / 1
  miss" nor a disagreement between the stat-card line (`vs 45 mm prone: …`) and the `Scored (Prone): …`
  line — both now read `10 hit / 0 miss`.
- Commands re-run after the fix: `pnpm check` (typecheck clean; lint 0 errors / the same 4 pre-existing
  warnings in `ui/badge.tsx`, `ui/button.tsx`, `ui/toggle.tsx`, `cv/opencv.ts`; test 718/718 across 73
  files — 717 prior + the new regression test; `check:privacy` 16 images) and `pnpm test:e2e` (52/52,
  both projects, no flake this run). Both pass end to end.
