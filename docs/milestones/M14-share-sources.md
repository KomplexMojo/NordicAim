# M14: Share and keep/discard sources

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M13 | low | M | garmin-diagram-upload (share, manual attach, keep/discard) |

## Goal
The owner shares the composite through the iPhone share sheet (Save Image → Photos), gets guided steps to attach it in
Garmin Connect, has the share recorded, and can keep or discard source photos.

## Read first
- `docs/spec/rendering-composite.md` §6, §7
- `docs/spec/data-model.md` §2 (`ShareRecord`), §6, §7 (`recordShare`, `discardSources`)
- `docs/DESIGN-REVISIONS.md` REV-4, REV-10

## In scope
Share button and download fallback, share records, Attach card, sources panel, read-only review for discarded sources.

## Out of scope
Any automatic upload; native Photos save (Phase 2, M22).

## Files
- `src/lib/share/share-browser.ts` (`shareArtifact`)
- `src/lib/services/shares.ts` (`recordShare`), `src/lib/services/sources.ts` (`discardSources`)
- `src/components/composite/ShareButton.tsx`, `AttachInGarminCard.tsx`, `SourcesPanel.tsx`
- `tests/unit/services/shares.test.ts`, `sources.test.ts`, `tests/unit/share/share-browser.test.ts` (mocked navigator), `tests/e2e/share.spec.ts`

## Steps
1. `shareArtifact` per §7. The PNG Blob is loaded when the tab opens (`loadArtifact`), not in the tap handler.
2. `ShareButton`: disabled until the blob is ready; result `web-share` or `download` → `recordShare`; `cancelled` → nothing.
3. `recordShare`: verify the artifact id is in `session.artifacts` → append a `ShareRecord`.
4. `AttachInGarminCard`: the 4 steps from §7, shown after a share and always visible below the composite.
5. **Sources panel**:
   - lists photos with `sourceRetention`
   - **Keep all**
   - **Discard sources…**, whose confirm reads: "Deletes the original, working and thumbnail images for N photos from this
     phone. Scores, shots and diagrams are kept."
6. `discardSources(ctx, sessionId, photoIds?)`: delete `photo:<pid>:original|working|thumb` and set
   `sourceRetention = 'discarded'` and `lastChangeAt` in one transaction. Idempotent.
7. With discarded sources:
   - the grid shows the `diagram:<pid>:cell-svg` instead of the thumbnail
   - the review page opens read-only with the diagram preview (no ImageStage)
   - Auto-detect is hidden
   - the composite still builds.

## Tests
- Unit: `shareArtifact` → `web-share` (mocked `canShare`/`share`); `AbortError` → `cancelled`; no `canShare` → `download`
  (mock `document.createElement('a').click`).
- Unit: `discardSources` removes exactly three keys per photo and is idempotent; `recordShare` rejects an unknown artifact.
- E2E (Playwright has no file share, so the download path is used):
  1. demo → build → **Share** → `page.waitForEvent('download')` named `*-shooting-analysis.png`
  2. one ShareRecord
  3. discard → thumbnails replaced by diagram cells
  4. rebuild composite OK.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** on the iPhone, **Share → Save Image**, attach in Garmin Connect, and confirm it looks right on the
activity. Record the outcome.

## Pitfalls
- iOS rejects `navigator.share` if the tap handler awaits storage first, so preload.
- Never delete `diagram:*` keys when discarding sources.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
