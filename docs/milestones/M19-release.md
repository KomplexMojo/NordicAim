# M19: Release verification (Phase 1)

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M12, M18 | low | S | run-demo |

## Goal
Prove Phase 1 end-to-end in CI and on the owner's iPhone, map the design checklist and revisions to evidence, and tag `v0.1.0`.

## Read first
- `docs/DESIGN.md` "Delivery checklist"; `docs/DESIGN-REVISIONS.md`
- `docs/PLAN.md` §10

## In scope
Journey e2e, README refresh, evidence document, tag.

## Out of scope
New features (open new milestones for gaps).

## Files
- `tests/e2e/journey.spec.ts`
- `README.md`
- `docs/RELEASE-v0.1.0.md`

## Steps
1. `journey.spec.ts` (both projects, fresh context):
   1. landing → **Start & capture**
   2. capture precision (`fakeCamera=precision`, Prone) and sighting (`fakeCamera=sighting`, Both 5/5)
   3. review each: **Auto-detect target** → Accept; **Auto-detect shots** → Accept all; if scores differ from the fixtures,
      replace shots with fixture shots via `window.__asaTest` (the test checks flow, not CV accuracy); status chip **Reviewed ✓**
      (use Accept with N missing if needed)
   4. Composite: build → 1440×2160
   5. Share → download event → share recorded
   6. Settings → Back up now → download zip
   7. discard sources → rebuild still works
   8. sequence player steps through 2 diagrams
   9. Harness shows values.
2. README: Status "v0.1.0: Phase 1 complete", the Pages URL, install steps (Safari → Share → Add to Home Screen), backup advice.
3. `docs/RELEASE-v0.1.0.md`: a table with one row per DESIGN delivery-checklist bullet **and** each REV item, with status
   (done / changed-by-REV / deferred to Phase 2) and evidence (test file, generated image, or milestone Completion notes).
   Include the owner's device results from M01, M07, M14, M15, and M18. A sign-off checkbox at the bottom.
4. Confirm the GitHub Pages deploy of the release commit succeeded.
5. After the owner signs off: `git tag v0.1.0 && git push origin v0.1.0`.

## Tests
`journey.spec.ts` plus all existing tests.

## Acceptance
```bash
pnpm check
pnpm build
pnpm test:e2e
pnpm test:e2e:offline
```
**Human required (owner):** run the full workflow at a real range session on the iPhone (Home Screen app), then sign off
`docs/RELEASE-v0.1.0.md`.

## Pitfalls
- Don't tag before sign-off.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
