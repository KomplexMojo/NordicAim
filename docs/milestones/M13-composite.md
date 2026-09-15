# M13: Composite build

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M10 | low | M | garmin-diagram-upload (build the composite) |

## Goal
The owner picks ≤2 sighting + ≤2 precision reviewed targets (with defaults) and builds the single composite PNG + JSON on the phone.

## Read first
- `docs/spec/rendering-composite.md` §4–§6
- `docs/spec/data-model.md` §2 (`CompositeSelection`, `ArtifactMeta`), §6 (artifact keys), §7
- `docs/DESIGN.md` "Composite layout", "Slot rules", "Choosing which photos fill the slots"

## In scope
Slot defaults, selection service, composite renderer, `buildComposite`, `loadArtifact`, Composite tab.

## Out of scope
Sharing (M14).

## Files
- `src/lib/composite/select-defaults.ts`, `artifact.ts`, `build.ts`, `selection.ts` (`setCompositeSelection(ctx, sessionId, selection)`)
- `src/lib/render/composite.ts`
- `src/components/composite/CompositeTab.tsx`, `SlotPicker.tsx`
- `tests/unit/composite/*.test.ts`, `tests/e2e/composite.spec.ts`

## Steps
1. `selectDefaultSlots` per §5.
2. `setCompositeSelection`: ids belong to the session; each photo is `reviewed` and its template matches the row; no duplicates;
   ≥ 1 non-null (else `EmptySelectionError`); sets `confirmed: true` and `lastChangeAt`.
3. `renderCompositeSvg` per §5 (cells via the M05 `cell` renderer; stat cards via M05 footer builders).
4. `buildComposite(ctx, sessionId, renderTools)` and `loadArtifact` per §6. Rasterise and hash before the transaction.
5. **Composite tab**: two rows × two slot pickers (bottom sheet listing reviewed photos of that template: thumbnail, time,
   headline score, and a "—" option); prefill defaults labelled "Suggested" if not confirmed; a live SVG preview
   (client render of `renderCompositeSvg`); **Build image** → shows the PNG (object URL) and its size.

## Tests
- Height vectors including the throw.
- Defaults: 3 reviewed precision photos at 10:00, 11:00, 12:00 → slots [11:00, 12:00]; unreviewed excluded; ties by score.
- Render golden with both demo fixtures (1 + 1): height 2160; contains `Session analysis`, `Precision 1 (prone): 72/100`,
  `Sighting 1 (prone): 9/10 hit @45 mm`; two stat cards.
- `buildComposite` (stub rasteriser returning a 1440×2160 PNG made in the test) stores both blobs and `ArtifactMeta`;
  the JSON has no `gps` key anywhere (deep scan); `loadArtifact` with altered bytes → `ArtifactNotFoundError`.
- E2E: demo session → Composite tab → suggested slots → **Build image** → image visible, 1440×2160 (read `naturalWidth/Height`).

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Nested `<svg>` cells need `viewBox="0 0 720 720"`.
- `generatedAtLocal` is an input; format it from `ctx.now()` in the service, not in the renderer.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
