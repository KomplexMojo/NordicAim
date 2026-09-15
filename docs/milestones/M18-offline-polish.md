# M18: Offline PWA, polish, landing

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M14, M15, M16, M17 | low | M | run-demo (visual: winter range ice-blue/charcoal, expressive type, full-bleed landing) |

## Goal
The app installs cleanly to the Home Screen, works fully offline at the range, prompts when a new version is available,
and looks like a finished winter-range tool.

## Read first
- `docs/DESIGN.md` "UI surfaces" (visual line)
- `docs/spec/rendering-composite.md` §1 (palette)
- `docs/spec/privacy-storage-hosting.md` §5, §6
- `docs/spec/capture-overlay.md` §1 (quick start)

## In scope
Theme tokens, typography, landing, navigation, states, manifest and icons, service worker precache and update prompt,
offline e2e, accessibility pass.

## Out of scope
New features.

## Files
- `src/index.css` (tokens), `src/routes/home/HomePage.tsx` (landing), `src/components/nav/AppNav.tsx`
- `src/components/pwa/UpdatePrompt.tsx` (`useRegisterSW` from `virtual:pwa-register/react`)
- `vite.config.ts` (full manifest: name, short_name, description, `display: 'standalone'`, `start_url: './'`, `scope: './'`,
  `background_color` = page, `theme_color` = header, icons 192/512/maskable)
- `index.html` (apple-touch-icon, `apple-mobile-web-app-capable`, status-bar style, theme-color)
- `scripts/make-icons.ts` (sharp, from an SVG ring motif) → `public/icons/*`
- `playwright.offline.config.ts` + script `"test:e2e:offline": "playwright test -c playwright.offline.config.ts"`
  (webServer `pnpm build && pnpm preview`)
- `tests/e2e/a11y.spec.ts` (`@axe-core/playwright`), `tests/e2e/offline.spec.ts`

## Steps
1. Map palette tokens to shadcn CSS variables (background `page`, card `panel`, primary `accent`, foreground `textPrimary`,
   muted `textSecondary`, border `panelBorder`). Headers and the hero use `header` charcoal with ice-blue accents.
2. Typography: the system font stack (SF Pro on iPhone), with an expressive treatment for headings and big numbers
   (condensed tracking, heavy weight, tabular numerals). No web fonts.
3. **Landing** `/`: a full-bleed charcoal hero with an abstract ring motif (inline SVG from template geometry at low opacity),
   the title "Biathlete Harness", the primary **quick-start** button (M09), and a secondary **All sessions**.
   `BackupBanner` (M15) when due.
4. `AppNav`: bottom tab bar on < 768 px (Sessions · Capture · Harness · Settings), top bar otherwise. Hidden on the capture
   screen. Respect `env(safe-area-inset-*)`.
5. States: skeletons, empty states, and an error boundary with retry.
6. PWA: full manifest; icons via `make-icons.ts`; `UpdatePrompt` toast "New version available — Reload" when the service worker
   has an update. Precache must include the OpenCV chunk (check the build output lists it).
7. Accessibility: contrast ≥ 4.5:1, focus rings, `aria-label`s on icon buttons, tap targets ≥ 44 px.
8. Remove "Coming in M…" placeholders.

## Tests
- `a11y.spec.ts`: axe on `/`, `#/sessions`, the demo session, review, composite, harness, and settings → no serious or critical violations.
- `offline.spec.ts` (preview build):
  1. load `/` and wait for `navigator.serviceWorker.ready`
  2. `context.setOffline(true)`
  3. reload → the landing renders
  4. Settings → Load demo session works offline
  5. build composite works offline
  6. `#/diagnostics` `cv-worker` passes offline.
- The manifest request returns `display: standalone`.

## Acceptance
```bash
pnpm check
pnpm test:e2e
pnpm test:e2e:offline
pnpm build
```
**Human required (owner):** Add to Home Screen, turn on **airplane mode**, open the app, capture a target, review, build and
share the composite. Record the result.

## Pitfalls
- Workbox's default max file size (2 MB) would skip OpenCV; M01 raised it to 20 MB, so verify.
- Hash routes: make sure `navigateFallback` isn't needed (hash routing serves `index.html` for all routes).

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
