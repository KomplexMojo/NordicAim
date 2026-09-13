# M14: Composite build

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M11 | low | M | garmin-diagram-upload (build the composite) |

## Goal
The owner picks ≤2 sighting + ≤2 precision reviewed targets (with sensible defaults) and builds the single
composite PNG + JSON artifact.

## Read first
- `docs/spec/rendering-composite.md` §4–§6
- `docs/spec/data-model.md` §2 (`CompositeSelection`, `artifacts`), §6, §7
- `docs/DESIGN.md` "Composite layout", "Slot rules", "Choosing which photos fill the slots"

## In scope
Slot defaults, selection API, composite renderer, `buildComposite`, artifact route, Composite tab UI.

## Out of scope
Sharing (M15), Garmin lines beyond reading `session.garmin` if it exists.

## Files
- `src/lib/composite/select-defaults.ts`, `src/lib/composite/artifact.ts`, `src/lib/composite/build.ts`
- `src/lib/render/composite.ts`: `compositeHeight`, `renderCompositeSvg`
- `src/app/api/sessions/[sessionId]/composite-selection/route.ts` (GET, PUT)
- `src/app/api/sessions/[sessionId]/composite/route.ts` (POST)
- `src/app/api/sessions/[sessionId]/composite/[artifactId]/route.ts` (GET)
- `src/components/composite/CompositeTab.tsx`, `SlotPicker.tsx`
- `tests/unit/composite/*.test.ts`, `tests/e2e/composite.spec.ts`

## Steps
1. `selectDefaultSlots` per §5.
2. Selection PUT validation: ids exist in the session; each id's photo is `reviewed` and its categorization
   template matches the row; no duplicates; at least one non-null overall (else 400 `empty_selection`).
3. `renderCompositeSvg` per §5 (embed cells with the M06 `cell` renderer; reuse the M06 footer and caption
   line builders).
4. `buildComposite(sessionId, now)` per §6: brand the object only in this file (a module-private
   `brand` helper). The sha256 is computed over the PNG bytes.
5. POST composite: `assertSameOrigin` → `buildComposite(sessionId, new Date())` → 201
   `{ artifactId, widthPx, heightPx, sha256 }`.
6. GET artifact: only ids in `session.artifacts`, and re-verify the sha256 of the file on disk. Serve
   `image/png` with `Cache-Control: private, no-store`.
7. **Composite tab**:
   - Two rows (Sighting, Precision), each with two slot pickers (bottom sheet listing reviewed photos of that
     template: thumbnail, capture time, headline score) and a "—" option to leave a slot empty.
   - If the selection isn't confirmed, prefill from defaults and label it "Suggested".
   - A live SVG preview of the composite, rendered client-side with the same pure function.
   - **Build image** button → shows the built PNG and dimensions.

## Tests
- Height vectors (§5), including the throw.
- Defaults: 3 reviewed precision photos with captures 10:00, 11:00, 12:00 → slots [11:00, 12:00]; ties broken
  by score; unreviewed photos excluded.
- Render golden: the composite from both demo fixtures (1 sighting, 1 precision) → height 2160, contains
  `Session analysis`, `Precision 1 (prone): 72/100`, `Sighting 1 (prone): 9/10 hit @45 mm`, plus two stat cards.
- `buildComposite` writes PNG + JSON; the PNG is 1440×2160; the JSON has no `gps` key anywhere (deep scan).
- The artifact GET rejects an unknown id (404) and a file whose bytes were altered (404).
- E2E: seeded demo → Composite tab → suggested slots filled → Build → image visible.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Nested `<svg>` cells need `viewBox="0 0 720 720"` or they won't scale.
- Keep `generatedAtLocal` an input; don't read the clock inside the renderer.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
