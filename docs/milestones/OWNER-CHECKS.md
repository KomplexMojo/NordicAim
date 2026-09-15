# Owner checks

Checks only the owner can do: iPhone device tests, GitHub settings, and sign-offs. The `run-milestones` workflow appends a
section here after each milestone that has them.

- **Owner-gate milestones** (M01, M07, M15 in the index) stop the run until their items are done. Tick the boxes, paste any
  requested reports into the milestone's *Completion notes*, commit, then start the workflow again.
- **Other milestones** record their checks here and the run continues. Do them when convenient; if one fails, note it in the
  milestone's *Open questions* and tell Claude.

<!-- The workflow appends sections below this line. -->

## M01 — Scaffold, diagnostics, CI, Pages deploy

- [ ] Enable GitHub Pages: repo Settings -> Pages -> Source: GitHub Actions.
- [ ] Push to main, then open https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics on the iPhone, in Safari and as a Home Screen (Add to Home Screen) app.
- [ ] Paste both 'Copy report' outputs (Safari tab + Home Screen app) into docs/milestones/M01-scaffold.md Completion notes.
- [ ] Resolve any fail on cv-worker, svg-raster, heic-decode, indexeddb, or share-files on the real device, or record it as an Open question. Note: storage-persist failed under this agent's headless Playwright runs on both mobile-chromium and mobile-webkit (persisted=false) -- that is expected under headless automation without a real persistent-storage grant, not necessarily a signal about real Safari; the real-device run determines whether it needs follow-up.
- [ ] Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) — not done yet, appropriately left as owner step.
- [ ] Push to main and open https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics on a real iPhone in Safari and as a Home Screen app; paste both Copy report outputs into Completion notes as the milestone's Acceptance section requires.
- [ ] Resolve any real-device fail on cv-worker, svg-raster, heic-decode, indexeddb, or share-files, or record as an Open question.
- [ ] Owner should weigh in on the two disclosed Open Questions (shadcn CLI's radix-nova preset + extra transitive deps; the shadcn CLI's alias-resolution quirk requiring manual file moves) since they touch AGENTS.md's 'no new dependencies beyond the milestone' rule, even though both were handled transparently and functionally verified.
