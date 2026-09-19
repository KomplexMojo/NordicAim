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
_(add here)_

## Completion notes
_(fill in when done)_
