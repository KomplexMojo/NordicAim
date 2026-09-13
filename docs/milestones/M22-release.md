# M22: Release verification

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M13, M18, M19 | low | S | run-demo |

## Goal
Prove the core slice works end-to-end, map the design's delivery checklist to evidence, and tag `v0.1.0`.

## Read first
- `docs/DESIGN.md` "Delivery checklist"; `docs/DESIGN-REVISIONS.md`
- `docs/PLAN.md` §10 (definition of done)

## In scope
A full e2e journey test, a README refresh, the evidence table, the tag.

## Out of scope
New features and fixes beyond small bugs found during verification (bigger issues go into new milestones).

## Files
- `tests/e2e/journey.spec.ts`
- `README.md` (status, workflow, deploy link, privacy)
- `docs/RELEASE-v0.1.0.md` (evidence table)

## Steps
1. `journey.spec.ts` (Pixel 7, logged in):
   1. from the landing page tap **Start & capture** (quick start opens the camera directly)
   2. capture precision via `?fakeCamera=precision` (Prone) and sighting via `?fakeCamera=sighting` (Both 5/5)
   3. review each: accept auto-calibrate, run auto-detect, accept all, and if the scores differ from the fixture,
      replace the shots with the fixture shots through the API (the test is about flow, not CV accuracy)
   4. confirm each target's status chip shows **Reviewed** automatically once its shot count matches the declared rounds
   5. Composite tab: build → dimensions 1440×2160
   6. share (open-image path) → share recorded
   7. discard sources → rebuild still works
   8. sequence player steps through 2 diagrams
   9. Harness shows values.
2. README: update Status to "v0.1.0: core slice complete". Keep the workflow section in line with
   DESIGN-REVISIONS (capture with overlay → review → composite → share → attach in Garmin Connect). Link
   `docs/DEPLOY.md`.
3. `docs/RELEASE-v0.1.0.md`: a table with one row per DESIGN delivery-checklist bullet **and** each REV item:
   status (done / changed-by-REV / deferred) and evidence (test file, screenshot path under
   `docs/reference/generated/`, or Completion notes of the milestone). Include the owner's device results from
   M08, M15, M18, and M19.
4. Run everything below. Then `git tag v0.1.0 && git push origin v0.1.0`.

## Tests
`journey.spec.ts` passes; all others pass.

## Acceptance
```bash
pnpm check
pnpm build
pnpm test:e2e
docker build -f deploy/Dockerfile -t asa:release .
```
**Human required (owner):** sign off `docs/RELEASE-v0.1.0.md` (a checkbox at the bottom) before tagging.

## Pitfalls
- Don't tag before the owner signs off.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
