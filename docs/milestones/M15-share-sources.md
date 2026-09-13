# M15: Share and keep/discard sources

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M14 | low | M | garmin-diagram-upload (publish, manual attach, keep/discard) |

## Goal
The owner shares the composite to the phone's share sheet (then Photos), gets guided steps to attach it in
Garmin Connect, has the share recorded, and can keep or discard source photos.

## Read first
- `docs/spec/rendering-composite.md` §6, §7
- `docs/spec/data-model.md` §2 (`ShareRecord`), §7 (shares, sources)
- `docs/DESIGN-REVISIONS.md` REV-4, REV-7

## In scope
Share button and fallback, share record route, Attach card, sources keep/discard route and UI, and a
read-only review when sources are discarded.

## Out of scope
Any automatic upload to Garmin. The description text block is M21.

## Files
- `src/components/composite/ShareButton.tsx`, `AttachInGarminCard.tsx`, `SourcesPanel.tsx`
- `src/lib/client/share.ts`: `prefetchArtifact(url)`, `shareArtifact(blob, name, title)` →
  `'web-share' | 'open-image' | 'cancelled'`
- `src/app/api/sessions/[sessionId]/shares/route.ts`, `src/app/api/sessions/[sessionId]/sources/route.ts`
- `src/lib/sources/discard.ts`
- `tests/unit/sources/discard.test.ts`, `tests/unit/client/share.test.ts`, `tests/e2e/share.spec.ts`

## Steps
1. `share.ts` per §7: pre-fetch after build; `shareArtifact` returns `cancelled` on `AbortError`.
2. `ShareButton`: disabled until the blob is pre-fetched. On `web-share` or `open-image`, POST
   `/shares { artifactId, method }`.
3. Shares route: verify the artifact id is in `session.artifacts` → append a `ShareRecord`
   (`garminDescriptionWritten: false`).
4. `AttachInGarminCard`: the 4 steps from §7, shown after a share and always visible under the composite.
   Plain text only, no deep links.
5. **Sources panel** (Composite tab, below share):
   - lists photos with `sourceRetention`
   - actions **Keep all** and **Discard sources…**
   - the confirm dialog says: "Deletes the original, working and thumbnail images for N photos from this
     server. Scores, shots and diagrams are kept."
6. `discard.ts`: for each photo, delete `original.*`, `working.jpg`, and `thumb.jpg`, then set
   `sourceRetention = 'discarded'`. Keep `photo.json`, `analysis.json`, and diagrams.
7. With discarded sources:
   - the working and thumb routes → 410 `source_discarded`
   - the grid shows the diagram cell SVG instead of the thumbnail
   - the review page opens read-only with the diagram preview (no ImageStage)
   - auto-calibrate and auto-detect → 410.
8. Composite build still works after discard (it uses analyses, not images).

## Tests
- Unit: `shareArtifact` with a mocked `navigator.canShare/share` → `web-share`; `AbortError` → `cancelled`;
  no `canShare` → calls `window.open` and returns `open-image`.
- Unit: discard removes exactly the three files per photo and is idempotent.
- E2E (Chromium has no file share, so it takes the `open-image` path):
  1. seeded demo → build → Share
  2. a new page opens with the PNG URL
  3. `GET /api/sessions/:id` has 1 share
  4. discard → thumbnails replaced by diagrams
  5. `working` route 410
  6. rebuild composite succeeds.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** on the iPhone, Share → Save Image → attach in Garmin Connect → confirm the image
looks right on the activity. Record the outcome in Completion notes.

## Pitfalls
- iOS rejects `navigator.share` outside a user gesture, so never `await` a fetch inside the click handler
  before calling share.
- Don't delete `diagrams/`; the sequence player and composite depend on them.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
