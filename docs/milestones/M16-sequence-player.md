# M16: Sequence player

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M10, M13 | low | S | sequence-player |

## Goal
Step or auto-play through a session's diagrams in capture order, filter them, and assign targets to composite slots from
the player (useful with more than 4 photos).

## Read first
- `docs/DESIGN.md` "Sequence player", "Choosing which photos fill the slots"
- `docs/spec/rendering-composite.md` §3, §5
- `docs/spec/data-model.md` §6 (diagram keys)

## In scope
Route `/sessions/:sessionId/sequence` and a link from the session page.

## Out of scope
Cross-session playback, video export.

## Files
- `src/routes/sequence/SequencePage.tsx`
- `src/components/sequence/SequencePlayer.tsx`, `ThumbStrip.tsx`, `SlotAssignMenu.tsx`
- `src/lib/sequence/order.ts` (pure `orderForSequence`, `filterSequence`)
- `tests/unit/sequence/order.test.ts`, `tests/e2e/sequence.spec.ts`

## Steps
1. `orderForSequence`: every photo with complete categorization (reviewed or not), sorted by `captureTime.utc` ascending
   (null last, ties by `importedAt`). Unreviewed ones get a "not reviewed" badge.
2. The player shows the stored `diagram:<pid>:full-svg`; if missing (not reviewed), render on the fly from the analysis
   with `renderDiagramSvg`.
3. Controls: Prev/Next, swipe (60 px threshold), keyboard ←/→/space, **Play** (3 s, stops at the end), and `3 / 7`.
4. Filters: template and position.
5. `ThumbStrip` of cell SVGs; badges S1/S2/P1/P2 for current slots.
6. `SlotAssignMenu` (reviewed photos only): "Use as Sighting 1/2" or "Precision 1/2" (matching template), or "Remove from
   composite" → `setCompositeSelection` (≤2 per template; assigning to an occupied slot replaces it; no duplicates).

## Tests
- Unit: ordering with nulls; filters.
- E2E: demo → sequence → Next shows the second diagram → assign precision to Precision 2 while it fills Precision 1 → it
  ends up in slot 2 and slot 1 becomes null.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Clear the play interval on unmount and on filter change.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
