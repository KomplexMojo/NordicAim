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
_(add here)_

## Completion notes
_(fill in when done)_
