# M22: Native Photos save and share (Phase 2)

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M20 | medium | S | garmin-diagram-upload (fewer taps to attach) |

> **Phase 2 outline.** Re-plan first: check the official Capacitor plugins (`@capacitor/share`, `@capacitor/filesystem`) and
> the options for saving an image to Photos (community plugin or a small local Swift plugin using `PHPhotoLibrary` add-only access).

## Goal
In the native app, **Save to Photos** stores the composite in one tap, and **Share** uses the native share sheet with the file.
This shortens the manual attach in Garmin Connect.

## Read first
- `docs/spec/rendering-composite.md` §6, §7 (the share rule still applies: only `CompositeArtifact`)
- `docs/DESIGN-REVISIONS.md` REV-4, REV-13

## In scope
A native share path, a native Photos save, platform switching in `share-browser.ts` (web path unchanged), and backup export via
the native share sheet.

## Out of scope
Automatic Garmin upload (no supported API).

## Outline of steps
1. Write the artifact PNG to a temp file (`@capacitor/filesystem`) → `@capacitor/share` with the file URL.
2. **Save to Photos**: a plugin using add-only permission (`NSPhotoLibraryAddUsageDescription`); success toast "Saved to Photos".
3. Update the Attach card for native: (1) Save to Photos (done) (2) Open Garmin Connect (3) Open the activity (4) Camera icon → choose image.
4. Backup export in native: write the zip to a temp file → share sheet (Save to Files).
5. Record `ShareRecord.method` values `native-share` or `photos-save` (extend the enum; migration not needed since it's additive —
   update the zod schema and backup validation).

## Acceptance (to refine at re-plan)
- Unit tests for the platform switch (mocked Capacitor).
- **Human:** on the iPhone, Save to Photos → the image is in Photos → attached in Garmin Connect; native backup export saves to iCloud Drive.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
