# M20: Capacitor iOS shell (Phase 2)

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M19 | **high** | M | REV-13 |

> **Phase 2 outline.** Start only with the owner's go-ahead. First do a re-plan pass: re-verify the current Capacitor
> major version, iOS/Xcode requirements, and WKWebView camera support, then update this file with exact commands and
> versions.

## Goal
The Phase 1 app runs as a native iOS app on the owner's iPhone via Capacitor, installed from Xcode, with full feature parity
and data migrated from the Home Screen app through backup/restore.

## Read first
- `docs/DESIGN-REVISIONS.md` REV-13, REV-14
- `docs/PLAN.md` F10–F12, D15
- `docs/spec/privacy-storage-hosting.md` §3 (backups carry the data across)

## Prerequisites (owner)
- Full Xcode installed (this Mac currently has only Command Line Tools).
- An Apple ID signed into Xcode. The **Apple Developer Program** ($99/yr) is recommended; a free account works, but installs
  expire after 7 days.
- iPhone connected, with **Developer Mode** enabled.

## In scope
Capacitor core/CLI/iOS setup, a build target flag, Info.plist permissions, platform detection, a device run, the migration path.

## Out of scope
HealthKit (M21), native Photos (M22), App Store or TestFlight distribution.

## Outline of steps
1. Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` (exact current major). `npx cap init "Biathlete Harness" <bundle id>`
   with `webDir: 'dist'`.
2. Build target flag `VITE_TARGET=capacitor`: `base: '/'`, **disable the PWA plugin** (assets are bundled), omit the CSP
   meta or adapt it to `capacitor://localhost`.
3. `npx cap add ios`; Info.plist `NSCameraUsageDescription` ("Photograph shooting targets") and
   `NSPhotoLibraryAddUsageDescription` (for M22).
4. `src/lib/platform.ts`: `isNativeApp()` via `Capacitor.isNativePlatform()`. Hide "Add to Home Screen" hints in native.
5. Verify `getUserMedia` inside WKWebView on the device (the capture screen, overlay, torch, wake lock).
6. Scripts: `"build:ios": "VITE_TARGET=capacitor pnpm build && npx cap sync ios"`, `"open:ios": "npx cap open ios"`.
7. Migration: document "Home Screen app → Settings → Back up now → Files; native app → Settings → Restore".
8. Diagnostics page: add `native-platform` and plugin availability rows.

## Acceptance (to refine at re-plan)
- `pnpm check`, `pnpm build`, `pnpm build:ios` succeed.
- **Human:** the app installs from Xcode on the iPhone; diagnostics pass; capture → review → composite → share works;
  restore from a Phase 1 backup shows all sessions.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
