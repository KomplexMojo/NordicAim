# M25: An imported photo is shown on the overlay screen

| Depends on | Tier | Size | MVP step |
|---|---|---|---|
| M07 | medium | S | take picture(s) |

## Goal
From the issue sweep ([#1](https://github.com/KomplexMojo/advanced-shooting-analysis/issues/1)). REV-50. The owner: "When I choose an
image from the local photo library, it should load the image into the screen showing the overlay, it indicate to the application
user that the image was loaded."

Today **Import from Photos** sends the chosen photo straight to storage; the only feedback is a progress line and the captured count
going up. The overlay review screen exists only for photos taken with the in-app shutter.

## Decisions (issue #1's open points; defaults, the owner may overrule)
1. **Informational, not functional.** The imported image is shown with the template overlay drawn on it, as confirmation that it
   loaded. It does **not** become a calibration prior: imports keep `prior: null`, and the pipeline still searches the whole frame
   (REV-25/26). Lining a target up by hand is what Adjust and Re-analyze (REV-46) are for — a second alignment step here would add a
   step to the three-step flow and duplicate them.
2. **Every imported image gets the screen, in turn**, with **Keep** / **Discard** — the same decision the shutter's review offers.
   With several images, the header reads "Imported photo 2 of 3".

## Read first
- `docs/spec/capture-overlay.md` §1.5 (the review screen), §1.8 (native camera and import)
- `src/components/capture/CaptureReview.tsx`, `CaptureFallbacks.tsx`, `CaptureScreen.tsx`
- Issue #1

## In scope
Routing imported images through the existing review screen (read-only overlay), Keep/Discard per image, the multi-image sequence.

## Out of scope
Any change to alignment, the pipeline's handling of imports, or the native-camera path beyond sharing the same review.

## Files
- `src/components/capture/CaptureFallbacks.tsx`, `CaptureReview.tsx`, `CaptureScreen.tsx`
- `docs/spec/capture-overlay.md` §1.5, §1.8
- `tests/e2e/capture.spec.ts`

## Steps
1. Update `capture-overlay.md` §1.8 and §1.5 for REV-50 first.
2. After the user picks images, show each in the review screen with the chosen template's overlay drawn over it (fitted to the image,
   not to the live camera frame), a clear "Loaded" confirmation, and **Keep** / **Discard**. Keep ingests it exactly as today
   (`origin: 'import'`, no prior); Discard drops it without storing anything.
3. Multiple images step through one at a time; cancelling part-way keeps those already kept.
4. HEIC and large images must still decode (they do today via the ingest path); show the review only once the image has rendered,
   so "Loaded" is true.

## Tests
- E2E (both projects): import one image → the review shows it with the overlay and "Loaded" → Keep → the captured count rises and
  the stored photo has `origin: 'import'` and no prior. Import two → "Imported photo 1 of 2" → Discard the first, Keep the second →
  exactly one stored.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human (owner):** on the iPhone, import a photo from the library and confirm it appears with the overlay before it is kept.

## Pitfalls
- Do not let the overlay here become a prior: an import's framing is unknown, and a wrong prior is worse than none (REV-25).
- Photos never leave the phone; the preview uses an object URL of the local file and revokes it.

## Open questions
- The Decisions section talks about "imports"; the Files/Out-of-scope lines also fold the native-camera fallback into
  "sharing the same review". I routed both `origin: 'import'` and `origin: 'camera-native'` through the same
  `CaptureReview` screen (they already shared one `ingestFiles`-style handler in `CaptureFallbacks.tsx`), with the header
  reading "Native photo" for the native-camera path (not specified verbatim anywhere) since it isn't numbered like
  imports are. Not blocking — the wording is my own choice where the spec was silent, and it doesn't change any stored
  data or scoring.
- When Import/Native camera is used before a template is picked (metadata.spec.ts's "Analyze is disabled…" test does
  this on purpose), the review screen has no template to overlay, so it shows the photo, "Loaded", and Keep/Discard with
  no overlay at all rather than blocking the import. Not specified either way; not blocking.

## Completion notes
- `CaptureReview.tsx` gained a `header` prop, a `loaded` state gated on the `<img>`'s `onLoad`, a `retakeLabel`/`useLabel`
  pair, and an `overlay` union: `{kind:'prior', frame, prior}` (unchanged shutter/backing-card behaviour) or
  `{kind:'template', template, outerDiameterFraction}` (new: renders the full `overlayLayout`/`renderOverlaySvg` template
  overlay via the existing `OverlaySvg` component, sized to the review container — never derived from any frame-space
  prior). `Use photo`/`Keep` is disabled until the image has rendered.
- `CaptureFallbacks.tsx` no longer ingests on file pick. It now steps through the picked files one at a time via a
  `Session` (`files`, `origin`, `index`, `url`), opening `CaptureReview` in `{kind:'template'}` mode with header
  "Imported photo *N* of *M*" (or "Imported photo" / "Native photo" for a single file). Keep calls `ingestPhoto` exactly
  as before (`capture: null`, so `prior` stays absent); Discard advances without storing. Object URLs are created in the
  event handlers (`pickFiles`/`goTo`) and revoked in a cleanup-only effect, to satisfy the `react-hooks/set-state-in-effect`
  lint rule already enforced in this repo.
- `CaptureScreen.tsx` and `BackingCardCapture.tsx` updated for `CaptureReview`'s new `overlay` prop shape; `CaptureScreen`
  now passes `template`/`outerDiameterFraction` down to `CaptureFallbacks`.
- `docs/spec/capture-overlay.md` §1 items 5 and 8 updated for REV-50 (informational-only overlay, header text, Loaded
  gating, prior stays absent).
- Updated `tests/e2e/capture.spec.ts`'s import test (it previously asserted immediate ingestion) to open the review
  screen, check `review-header`/`review-loaded`/the overlay, then click Keep; added the two-image Discard/Keep sequence
  test the milestone's Tests section describes. Updated `tests/e2e/metadata.spec.ts`'s "Analyze is disabled…" test (which
  imports before a template is picked) to click Keep on the new review screen.
- Commands run: `pnpm check` (typecheck + lint + 810 unit tests + privacy check) — pass. `pnpm test:e2e` — 72/72 pass
  (mobile Chromium + mobile WebKit). Note: `settings.spec.ts`'s "hole size … Reset returns 5.6" test is flaky
  independent of this change — confirmed it fails intermittently on a clean `main` checkout too (unrelated
  `hole-diameter-input` state-restoration timing), and it passed on the final `pnpm test:e2e` run reported here.
- Not run (human-only, capture.spec.ts's own note): the iPhone device checklist.
