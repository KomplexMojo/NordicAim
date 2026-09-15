# Owner checks

Checks only the owner can do: iPhone device tests, GitHub settings, and sign-offs. The `run-milestones` workflow appends a
section here after each milestone that has them.

- **Owner-gate milestones** (M01, M07, M15 in the index) stop the run until their items are done. Tick the boxes, paste any
  requested reports into the milestone's *Completion notes*, commit, then start the workflow again.
- **Other milestones** record their checks here and the run continues. Do them when convenient; if one fails, note it in the
  milestone's *Open questions* and tell Claude.

<!-- The workflow appends sections below this line. -->

## M01 — Scaffold, diagnostics, CI, Pages deploy

- [x] Enable GitHub Pages: repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. Then re-run the
      "Deploy to GitHub Pages" workflow (Actions tab → Run workflow), because the first deploy ran before Pages was enabled.
      _Done 2026-09-15 via `gh api` (build_type=workflow); deploy run 34988887060 succeeded and the site returns 200._
- [ ] On the iPhone, open https://komplexmojo.github.io/advanced-shooting-analysis/#/diagnostics in Safari, then Add to
      Home Screen and open it from there.
- [ ] Tap **Copy report** in both, and paste both reports into `docs/milestones/M01-scaffold.md` → Completion notes.
- [ ] Any `fail` on `cv-worker`, `svg-raster`, `heic-decode`, `indexeddb`, or `share-files` on the real phone: record it
      under M01 Open questions and tell Claude. (`storage-persist` failed only under headless automation; the phone result is what counts.)
- [ ] Decide on the non-blocking M01 open questions: keep the shadcn "radix-nova" preset and its extra self-hosted
      dependencies (Geist font, radix-ui, lucide-react, next-themes, tw-animate-css, class-variance-authority), or trim them.
