# M16: Sequence player

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M11, M14 | low | S | sequence-player |

## Goal
Step or auto-play through a session's per-target diagrams in capture order, filter them, and assign targets to
composite slots from the player (useful when more than 4 photos exist).

## Read first
- `docs/DESIGN.md` "Sequence player", "Choosing which photos fill the slots"
- `docs/spec/rendering-composite.md` §3 (full variant), §5 (selection rules)
- `docs/spec/data-model.md` §7 (diagram, composite-selection routes)

## In scope
`/sessions/[id]/sequence` page and a link from the session page.

## Out of scope
Cross-session playback, video export.

## Files
- `src/app/sessions/[sessionId]/sequence/page.tsx`
- `src/components/sequence/SequencePlayer.tsx`, `ThumbStrip.tsx`, `SlotAssignMenu.tsx`
- `src/lib/sequence/order.ts`: `orderForSequence(photos)` (pure)
- `tests/unit/sequence/order.test.ts`, `tests/e2e/sequence.spec.ts`

## Steps
1. `orderForSequence`: include every photo whose categorization is complete (reviewed or not), sorted by
   `captureTime.utc` ascending (null last, ties by `importedAt` ascending). Unreviewed ones show a
   "not reviewed" badge.
2. The player shows the `full` diagram (from the diagram route; render on demand is fine) fitted to the screen width.
3. Controls:
   - Prev/Next buttons; swipe left/right (pointer events, threshold 60 px)
   - keyboard ←/→ and space (play/pause)
   - Play auto-advances every 3 s and stops at the end
   - position indicator `3 / 7`.
4. Filters: template (all/sighting/precision) and position (all/prone/standing/both).
5. `ThumbStrip`: horizontal scroll of cell SVG thumbnails; tap to jump. Badges "S1", "S2", "P1", "P2" on
   photos currently in the composite selection.
6. `SlotAssignMenu` for the current (reviewed) photo: "Use as Sighting 1/2" or "Precision 1/2" (only the
   matching template), or "Remove from composite". PUT the selection with `confirmed: true`. Enforce the
   ≤2-per-template rule: assigning to an occupied slot replaces it.

## Tests
- Unit: ordering with null capture times; filters.
- E2E: seeded demo → sequence → Next shows the second diagram → assign precision to Precision 2 while it
  already fills Precision 1 → the selection has it in slot 2 and slot 1 becomes null (no duplicates).

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Clear the auto-play interval on unmount and when the filters change.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
