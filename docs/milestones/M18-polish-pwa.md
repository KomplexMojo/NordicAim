# M18: Visual polish, PWA, landing

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M15, M16, M17 | low | M | run-demo (visual: winter range ice-blue/charcoal, expressive type, full-bleed landing) |

## Goal
The app looks and feels like a finished winter-range tool on the phone. It is installable to the home screen,
passes accessibility checks, and has a full-bleed landing screen.

## Read first
- `docs/DESIGN.md` "UI surfaces" (visual line)
- `docs/spec/rendering-composite.md` §1 (palette tokens)
- `docs/spec/access-deployment.md` §5 (CSP: self-hosted assets only)

## In scope
Theme tokens → Tailwind/shadcn theme, display font, landing page, navigation, empty/loading/error states,
PWA manifest and icons, accessibility pass.

## Out of scope
Offline mode/service worker, new features.

## Files
- `src/app/globals.css` (tokens), `src/app/layout.tsx` (fonts, metadata, viewport, theme colour)
- `src/app/page.tsx` (landing), `src/components/nav/AppNav.tsx` (bottom tab bar on mobile: Sessions · Capture · Harness)
- `src/app/manifest.ts`, `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- `assets/fonts/` + `next/font/local` config for a display face (e.g. Barlow Condensed SemiBold, OFL) and Inter for body
- `tests/e2e/a11y.spec.ts` (with `@axe-core/playwright`)

## Steps
1. Map palette tokens to shadcn CSS variables: background `page`, card `panel`, primary `accent`,
   foreground `textPrimary`, muted-foreground `textSecondary`, border `panelBorder`. Header and landing hero
   use `header` (charcoal) with ice-blue accents.
2. Fonts via `next/font/local` (no Google fetch at runtime). Display font for headings and big numbers
   (scores); Inter for body.
3. **Landing** `/`:
   - full-bleed charcoal hero with a large abstract ring motif (inline SVG built from the template
     geometry: concentric rings at low opacity)
   - title "Biathlete Harness"
   - primary CTA = the M10 quick-start button (`quickStartLabel` / `quickStart`): straight into the camera
   - secondary **All sessions** (→ `/sessions`).
4. `AppNav`: bottom bar on < 768 px, top bar otherwise. The current route is highlighted. Hidden on the capture
   screen, which is full-screen.
5. States: skeletons for lists; empty states ("No sessions yet — start one after your next range visit");
   error boundary page with a retry.
6. PWA: `manifest.ts` (`name` Biathlete Harness, `short_name` Harness, `display: 'standalone'`,
   `start_url: '/'`, `background_color` = page, `theme_color` = header, icons). iOS meta via `metadata.appleWebApp`.
   Generate icons from an SVG ring motif using sharp in `scripts/make-icons.ts`.
7. Accessibility: colour contrast ≥ 4.5:1 for text; visible focus rings; every icon button has an
   `aria-label`; tap targets ≥ 44 px.
8. Remove "Coming in M…" placeholders that are now implemented.

## Tests
- `a11y.spec.ts`: axe on `/login`, `/`, `/sessions`, the seeded session page, review page, composite tab, and
  harness → **no `serious` or `critical` violations**.
- E2E: `/manifest.webmanifest` returns JSON with `display: standalone`.
- All existing e2e tests still pass (update selectors only if text changed; prefer roles or test ids).

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm build
```
**Human required (owner):** add to Home Screen on the iPhone and confirm it launches standalone and the
camera still works (re-run the M08 checklist items 1–4 in standalone mode).

## Pitfalls
- CSP forbids external fonts or images; everything must be local.
- iOS standalone apps don't share cookies with Safari tabs, so you log in once more there. Expected.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
