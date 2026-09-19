# Owner ground truth for the reference targets

Hand-checked calibrations and shots for the committed reference photos, exported from the app's **Adjust shots**
screen (M13 step 7). `pnpm cv:eval` reads any file it finds here and reports the shot detector against it, so these
files are how "what the CV should have found" stops being guesswork.

They supersede `fixtures/reference/seed-calibrations.json`, which was estimated by eye.

## What a file holds

```json
{
  "calibration": { "cx": 620, "cy": 838, "radiusPx": 265, "axisRatio": 0.934, "angleDeg": 0,
                   "anchorDiameterMm": 112.4, "source": "manual", "confidence": null,
                   "perspective": { "p": 0.00012, "q": -0.00041 } },
  "shots": [ { "id": "…", "xMm": 1.4, "yMm": -0.8, "multiplicity": 1, "positionOverrides": null,
               "source": "manual", "confidence": null, "cluster": false } ],
  "imageSize": { "widthPx": 1200, "heightPx": 1600 }
}
```

- `calibration` is in **working image pixels** (`imageSize`), the space `docs/reference/*.jpg` are stored in.
- `calibration.perspective` (REV-44, M18) is the sheet's tilt: its vanishing line in target mm, applied before the
  ellipse map (geometry-scoring §2.1). `null` means square on. A file exported before M18 has no `perspective` at all,
  which reads as `null` — exactly how that calibration was drawn when it was exported.
- `shots` are in **millimetres**, origin at the target centre, +x right, +y up (geometry-scoring §2).
- **No image data and no EXIF** — nothing here identifies where or when the photo was taken.

## How to create one

1. Open the app with the test build (`pnpm dev:test`) and run `__asaTest.loadDemo()` from the console, or import the
   reference JPEG from `docs/reference/` into a session and fill in its metadata. The demo session's two photos are
   metadata-free copies of exactly these reference sheets, at the same 1200 × 1600 working size.
2. On the results screen tap **Adjust shots** on that target.
3. In **Alignment**, drag the centre and edge handles (or type `cx` / `cy` / `radius`) until the drawn rings sit on the
   printed ones. In **Shots**, add, move or delete holes until every real hole is marked, using the multiplicity field
   for holes that hold more than one round. The preview shows the score you are about to record.
4. Tap **Save**, then re-open Adjust and choose **More… → Export ground truth JSON**.
5. Rename the downloaded file to the reference photo's key and commit it here:

   | Reference photo | File to commit |
   |---|---|
   | `docs/reference/IMG_5057-sighting.jpg` | `fixtures/reference/ground-truth/IMG_5057-sighting.jpg.json` |
   | `docs/reference/IMG_5132-precision.jpg` | `fixtures/reference/ground-truth/IMG_5132-precision.jpg.json` |

   The name must match the `key` in `scripts/cv-eval.ts`'s `REFERENCE` table exactly — `cv:eval` looks for
   `fixtures/reference/ground-truth/<key>.json` and silently skips a file it cannot find.

6. Run `pnpm cv:eval`. The shot-detection table gains an `… (owner ground truth)` row per file. That row is
   **reported, not gated** (M11 step 8 sets no bar for real photos), so it can never fail the build — it is there to
   show whether a CV change moved the needle on real paper.

Re-export and re-commit whenever you decide the old truth was wrong; keep one file per reference photo.
