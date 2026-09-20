# Nordic Aim brand kit

<p align="center">
  <img src="wordmark-light.svg" alt="Nordic Aim" height="72">
</p>

One page that says how Nordic Aim looks and sounds, so the app, the repository, the guide and anything shared outside them all read as the same thing.

## The idea

Nordic Aim is a measuring tool for biathletes. It should feel calm, precise and honest: it shows what it measured, says what it is unsure about, and leaves the decision to the athlete. The mark says the same thing in one picture: the rings of a target, and a small group of shots with the ellipse the app draws around them.

**Name.** Nordic Aim. Two words, capital N and A. Never "NordicAim" or "Nordic AIM".

**One line.** Shot analysis for biathletes.

**Supporting line.** Photograph your target. Get the score, the group and the point of impact.

**Promise line.** Free. Runs on your phone. Nothing leaves your device.

**Repository description** (GitHub, About box):

> Free shot analysis for biathletes. Photograph a sighting or precision target and get scores, group size and point of impact on your iPhone. No server, no account.

**Topics to add** (Settings, About, Topics): `biathlon`, `shooting-analysis`, `target-shooting`, `rifle`, `pwa`, `offline-first`, `privacy`.

## Voice

Athlete to athlete. Plain words, short sentences, numbers when there are numbers.

- **Say what it measures.** "Extreme spread", "mean point of impact", "hits and misses". Use the range's own words: sight in, confirm, prone, standing, group.
- **Give the athlete the last word.** "You can correct any shot." "Suggested holes score nothing until you confirm them."
- **Be exact about privacy.** "Photos never leave your phone" is true and specific. Keep it that way.
- **Do not oversell.** No claims of accuracy figures, no "AI-powered", no "revolutionary". Nordic Aim does not give coaching advice today, so do not imply it.
- **Do not promise team features that do not exist.** There is no shared roster or dashboard. Results move as summary images.

## Colour

These are the app's own tokens (`docs/spec/rendering-composite.md`, section 1), so the brand and the product match by construction.

| Name | Hex | Use |
|---|---|---|
| Slate | `#1F2630` | Header, dark backgrounds, primary text |
| Ice | `#4B94C3` | The accent: rings, rules, highlights on dark |
| Deep ice | `#2F6E99` | Accent text and buttons on light backgrounds |
| Pale ice | `#CFE6F3` | Secondary text on dark |
| Page | `#F7FAFD` | Light background |
| Panel | `#EAF2F8` | Cards and bands |
| Panel border | `#A9CFE3` | Borders |
| Muted text | `#5B6775` | Captions |
| Shot | `#E8604C` | Shots on a target, and the one warm note in the mark |

Slate and ice carry the brand. **Shot** is the accent of the accent: use it only for shots, never as a general highlight or a button colour.

## Type

**Geist** (variable), the typeface the app already bundles. Nordic in weight 500 and Aim in weight 700, tight tracking, for the wordmark. Body text in weight 400, headings in 500 to 700.

Text inside the SVG files here is converted to outlines, so those files look the same on GitHub and everywhere else without the font installed.

## The mark

Three rings and a solid bull, as on the printed target, with three shots in a group and the dashed ellipse the app draws around a group. The shots are the only warm colour.

- **Clear space.** Keep at least one quarter of the mark's width free on every side.
- **Minimum size.** The mark: 24 px. The wordmark: 24 px tall. Below that, use the favicon, which drops the ellipse and one ring.
- **Backgrounds.** `mark-light` / `wordmark-light` on Page, Panel or white. `mark-dark` / `wordmark-dark` on Slate or any dark image.
- **Do not** recolour it, stretch it, add effects, or put the shots anywhere else.

## Files

| File | Use |
|---|---|
| `banner.svg` | Top of the repository README. |
| `social-card.png` | GitHub social preview (1280 by 640). Upload it in **Settings, General, Social preview**. |
| `wordmark-light.svg`, `wordmark-dark.svg` | Mark plus name, horizontal. |
| `mark-light.svg`, `mark-dark.svg` | The mark alone, transparent background. |
| `app-icon.svg`, `app-icon-1024.png` | Rounded icon for web and documents. |
| `favicon.svg` | Browser tab icon. |
| `app-icons/` | Drop-in replacements for `public/icons/` (same file names): `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. |
| `app-icon-square.svg`, `app-icon-maskable.svg` | Sources for the icon set. |

## Using the icons in the app

The app still ships the default Vite favicon (a purple bolt) at `public/favicon.svg`, and the ring-only icons in `public/icons/`. To adopt the brand:

1. Copy `docs/brand/favicon.svg` over `public/favicon.svg`.
2. Copy the four files in `docs/brand/app-icons/` over `public/icons/`.
3. `pnpm make:icons` regenerates the old ring icons and would overwrite step 2, so change or remove `scripts/make-icons.ts` in the same commit.
4. Run `pnpm check` and reinstall the Home Screen app on a phone to see the new icon. iOS keeps the icon a Home Screen app was installed with.

## The credit line

Every summary image ends with **Developed using Nordic Aim by KomplexMojo**, followed by the time it was generated. That line is part of the brand and is how your name travels with shared results. Keep it on every export and in any screenshot of a summary image.
