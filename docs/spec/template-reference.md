# Spec: template reference sheets (M26)

Implements REV-121 (owner decisions 2026-09-27, issue #52). **Status:** §1–§5, §7 and §8 are **implemented** (M26 part 1,
2026-09-27). §6, how detection uses a reference, is fixed in its constraints but not its method, and is **not implemented**:
the measurements in §6 have not shown a gain yet.

Code: `src/lib/domain/template-reference.ts` (schemas), `src/lib/defaults/template-references.ts` (shipped defaults),
`src/lib/cv/template-reference.ts` (pure: `keepTargetCircles`, `referenceRefusal`), the worker's `makeReference`,
`src/lib/services/template-reference.ts` (`prepareTemplateReference`, `saveTemplateReference`, `restoreDefaultReference`),
the **Target sheets** section (`src/components/settings/TemplateSheetSettings.tsx`, `useReferenceMaker.ts`,
`ReferenceHolesWarning.tsx`) and the sheet capture route (`src/routes/settings/TemplateSheetPage.tsx`,
`src/components/capture/TemplateSheetCapture.tsx`).

## 1. What it is

A **reference sheet** is a photo of a **blank** target sheet, cut down to its **target circles and what is printed inside
them** (owner, 2026-09-27: "The only thing we really need to keep from the sheet is the targeting circles (and their internal
contents). Everything else could be pulled."). There is one per template: `sighting` and `precision`.

Detection today removes printed marks by where the template's geometry says they are (`print-mask.ts`, REV-35). A reference
shows what this print actually looks like, so detection can tell a hole from ink it has already seen. It supplements the
geometric masks; it never replaces them where no usable reference exists (M26 Decision 6).

**A reference never changes scoring.** Ring and zone sizes are the mm formulas in `geometry-scoring.md` and nothing else
(issue #52 answer 1). A reference affects only which marks detection keeps as holes.

## 2. Where it lives (M26 Decision 2)

**Settings screen (`#/settings`), section Target sheets**, next to Backing sheet. It holds two rows, **Sighting sheet** and
**Precision sheet**, each with:
- a thumbnail of the reference in use, and a label: **Default** or **Your sheet · <date captured>**;
- **Photograph sheet**: opens the capture screen in sheet mode (`#/settings/template-sheet/:template`, full screen, no tab
  bar, the overlay of that template), like the backing card (`backing-sheet.md` §2);
- **Choose photo**: the same, from an imported photo;
- **Restore default**: shown only for **Your sheet**. It deletes the custom reference and goes back to the shipped default.

Nothing in the three-step flow (take picture(s) → add metadata → receive analysis) asks for or needs a reference.

## 3. Making a reference from a photo

On **Use photo**, all of this runs before anything is stored (the IndexedDB rule: prepare first, then one transaction):
1. The working image, as for any photo: JPEG, oriented, ≤ 3000 px, **no metadata** (`image-browser.ts`).
2. The worker's A3 and A4 against **that row's** template: the disc, then the sheet's tilt (`calibrationWithPerspective`,
   REV-44). The photo is **refused** when A4 finds no disc (`method` would be `overlay` or `none`), or when the template hint
   names the other template with confidence ≥ 0.5 (the same threshold as `template-mismatch`, analysis-pipeline §2 B4).
   Message: *The rings weren't found. Photograph the whole target, flat and in good light.* Nothing is stored.
3. **Keep only the circles:** every pixel farther than `outerRadiusMm(template) + REFERENCE_MARGIN_MM` from the target centre
   (measured in target mm through the calibration, `transform.ts`) is painted the median paper colour of the band 2–8 mm
   beyond that radius. The image is then cropped to a square of half-side `outerRadiusMm + 10` mm around the centre.
   `REFERENCE_MARGIN_MM = 3`.
4. A4 runs again on the result, and its calibration is what gets stored. A result without a disc is refused as in step 2.
5. A5 runs on the result, on the standard path (a blank sheet has no backing behind it). If it reports any shot, the user is warned: *This sheet seems to have holes in it. A reference
   should be a blank sheet.* The choices are **Use anyway** and **Retake**. (Detection's own false marks are why this is a
   warning and not a refusal.)

The source photo is **not kept**, only the result of step 3 (as with the backing card, REV-48).

## 4. Data model and storage

```ts
// src/lib/domain/template-reference.ts
export const TemplateReference = z.object({
  template: TemplateId,
  capturedAt: UtcIso,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),   // of the stored JPEG bytes
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  calibration: Calibration,                     // from §3 step 4, in this image's pixels
});
```

- **`AppSettings.templateReferences: { sighting: TemplateReference | null; precision: TemplateReference | null }`**, default
  `{ sighting: null, precision: null }` (data-model §5). `null` means **use the shipped default**.
- The image is a blob: **`reference:<template>:image`** (JPEG), next to `photo:*`, `diagram:*` and `artifact:*`
  (data-model §6). Writing a custom reference and its settings entry happens in one transaction. So does Restore default,
  which deletes the blob and sets the entry to `null`.
- **Shipped defaults** (§5) are app assets, not records: `public/templates/sighting-reference.jpg` and
  `public/templates/precision-reference.jpg`, with their calibration, size and hash in `src/lib/defaults/template-references.ts`.
- **Each analysis records the reference it used:** `pipeline.detection.reference: { template, source: 'default' | 'custom',
  sha256 } | null` (optional, so older analyses parse). It is `null` or absent when detection used the geometric masks
  alone (§6), which is every analysis until §6 is implemented.

## 5. Shipped defaults (issue #52 answers 3 and 5)

The owner photographed a blank sighting and a blank precision sheet on 2026-09-27 (originals in the private fixtures repo,
`templates/blank-*.heic`, 4284 × 5712). Each was cropped to the sheet, decoded, and put through §3 steps 2–4 with the app's own
`detectAnchor`, `hintTemplate` and `calibrationWithPerspective`:

| | sighting | precision |
|---|---|---|
| template hint | sighting, 0.89 | precision, 1.00 |
| result | 1516 × 1516 px, 11.2 px/mm, 363 KB | 1936 × 1936 px, 11.1 px/mm, 558 KB |

Both carry no EXIF or GPS (`pnpm check:privacy`), and nothing outside the circles, so no club name, form fields, hands or
background. They are precached with the rest of `public/` (vite-plugin-pwa), so the defaults work offline.

**Restore default** returns to these files. A new app build that changes a default changes which reference `null` means;
sessions analysed before record the old one's `sha256` (§4).

## 6. How detection uses a reference (A5): constraints fixed, method pending

Fixed now:
1. **Exclusions only.** A reference can only stop detection from reporting a mark as a hole, or confirm one it already
   found. It never moves a ring, changes a radius, or alters scoring (§1).
2. **Inside the circles only.** Beyond `outerRadiusMm + REFERENCE_MARGIN_MM`, detection behaves exactly as today (REV-36:
   holes anywhere on the paper, REV-43: ring-zero units).
3. **Additive.** With no usable reference (a failed load, or a reference whose calibration is missing), A5 uses the
   geometric masks alone, as today, and records `reference: null`.
4. **Per template.** The photo's template picks the reference. The backing colour path (`backing-sheet.md` §5) is unchanged;
   a reference is not per backing colour (issue #52 answer 4).
5. **Same space.** Reference and photo are compared in target mm, each through its own calibration, at
   `DETECTION_PX_PER_MM` (`cv/constants.ts`).
6. **Pure.** The comparison takes two `RgbaImage`s and two calibrations and lives in `src/lib/cv/template-reference.ts`,
   with no DOM access.

**The benchmark (owner, 2026-09-27).** The owner's 12 confirmed targets from three range sessions
(`fixtures/private/range-2026-09-26/`, 103 holes, coloured backing: orange on 21–22 Sept, lime on 26 Sept) are the
**standard case** and what `pnpm cv:eval` gates on (`scripts/cv-eval-production.ts`). Today's A5 at 3.3 mm, with each
session's backing colour: **recall 92.2%, precision 90.5%** (floors 92% / 90%). The 46 older photos in
`additional references/` (straight off the backing board, bad angles, no backing) are the **worse case**: reported, not
gated, and not to be optimised around.

**Measured 2026-09-27 (scratch probes; the default references of §5):**

| | production (12) | worse case (39) |
|---|---|---|
| reference vs photo, whole target, p90 | ≤ 0.05 mm | ≤ 0.18 mm |
| region by region (textured cells), median | 0.35 mm | 0.5 mm |
| per spot, best local shift within ±2 mm, median | — | 0.8 mm |

- **Decision 3, answered:** today's A4 aligns a reference well enough. A per-spot local search of ±2 mm (§6.5) absorbs
  the rest; no separate refinement pass is needed.
- **Decision 4, measured:** the compared signal is *photo deviation minus the locally aligned reference deviation*
  (both `|gray − median background|`, normalised by the surface's median). On the **standard detector's** candidates it
  separates real holes from false marks well on production photos (AUC 0.90; 0.86 on candidates the detector
  discarded), poorly on the worse case (0.58). On the **colour path**, which the standard case uses: as a filter it
  would remove at most 5 of 8 false holes while losing about 20 of 90 real ones, so it is **not** used as a filter.
  As a rescue it scored the colour path's misses above almost every non-hole candidate (AUC 0.97), but only 3 misses
  fell inside the circles, which is too few to adopt it.
- **Consequence:** there is no evidence yet that a reference improves the standard case. §6 stays unimplemented until a
  larger production sample shows the rescue gains holes without adding false ones against the benchmark.

## 7. Changing a reference (issue #52 answer 2)

Replacing a reference, or restoring the default, **re-runs Stage A on every stored photo of that template that has nothing
manual**: no `manual` calibration and no `manual` shot. This is REV-57's rule (`shouldRerunStageA`), applied to a sheet
change. Those photos get `stageA = 'pending'` and `stageB = 'pending'`, and their sessions' summaries rebuild.

A photo with anything manual is **not** re-run: the user's edits are protected (analysis-pipeline §8). **Re-analyze** in
Adjust uses the reference in force at that moment, like the Settings backing and hole size.

## 8. Privacy and backup

- A custom reference is a photo stored on the phone. It is never shared, downloaded, or part of a `CompositeArtifact`.
  The share rule and the no-network invariant apply unchanged (M26 Decision 5).
- **Backups:** a backup copies every blob (`backup/create.ts`), so a custom reference is included, and the settings row that
  points to it is always restored (REV-115). *Owner to confirm* (issue #52: whether backups include custom sheets).
- Shipped defaults are public, committed images: they must pass `pnpm check:privacy` and show nothing but the target circles.

## 9. Open

- M26 Decision 3 (registration precision) and Decision 4 (the compared signal): §6.
- Backups including a custom reference: §8.
- Whether a reference that has gone stale (a new print run, faded ink) can be detected and flagged, rather than silently used
  (M26 pitfall). Not required for the first version.
