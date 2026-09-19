# Spec: diagrams, session summary image, sharing

Visual reference: the owner's examples, [`../reference/example-diagram-sighting.png`](../reference/example-diagram-sighting.png)
and [`../reference/example-diagram-precision.png`](../reference/example-diagram-precision.png) (1500×1700).

Implementation: `src/lib/render/*` (pure, returns SVG strings); `src/lib/render/rasterize-browser.ts` (phone);
`scripts/render-samples.ts` (Node, dev only, `@resvg/resvg-js`); `src/lib/composite/*`; `src/lib/share/share-browser.ts`.

"Composite" and "session summary image" mean the same artifact. Target drawing: `X = cx + xMm*s`, `Y = cy - yMm*s`.

## 1. Palette (`palette.ts`)

| Token | Hex | Use |
|---|---|---|
| `page` | `#F7FAFD` | background |
| `panel` | `#EAF2F8` | bands and panels |
| `panelBorder` | `#A9CFE3` | borders, halo outline |
| `haloFill` | `#DCEBF5` | sighting halo |
| `accent` | `#4B94C3` | left rail, guides |
| `accentText` | `#2F6E99` | multiplicity labels |
| `textPrimary` | `#1F2630` | titles, body |
| `textSecondary` | `#5B6775` | captions |
| `discSighting` | `#36404D` | sighting disc |
| `discPrecision` | `#1C1F24` | precision black |
| `ringOnDark` | `#FFFFFF` | ring lines on dark |
| `ringOnLight` | `#2A2F36` | ring lines on white |
| `guideOnDark` | `#CFE6F3` | 110 mm guide |
| `shotProne` | `#E8604C` | prone shots |
| `shotStanding` | `#8A5CF6` | standing shots |
| `mpi` | `#C8452F` | MPI marker |
| `ellipse` | `#2F7FB0` | group ellipse |
| `header` | `#1F2630` | summary image header |

The UI theme reuses these as CSS variables.

## 2. Fonts and rasterisation

- All SVG text: `font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"`
  (SF Pro on iPhone). No web fonts, no `<foreignObject>`, no external `href`s.
- Every SVG root has `xmlns="http://www.w3.org/2000/svg"`, `width`, `height`, `viewBox`.
- Browser:

  ```ts
  export async function svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Blob>;
  // Blob(svg, image/svg+xml) → object URL → Image → decode() → canvas → drawImage → toBlob('image/png'); revoke URL.
  // If getImageData throws SecurityError, retry with a data:image/svg+xml;charset=utf-8,<encodeURIComponent(svg)> source.
  export const browserRenderTools: RenderTools = { svgToPng };
  ```

- Node script: `new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'original' } }).render().asPng()`.
- Renderers are pure (time strings are inputs). Tests snapshot SVG strings; PNG tests check only dimensions.

## 3. Per-target diagram, `full` variant (1500 × 1700)

```ts
export interface DiagramInput {
  template: 'sighting' | 'precision';
  result: AnalysisResult;
  shots: Shot[];
  positionLabel: string;        // "Prone" | "Standing" | "Prone + standing"
  captureLocal: string | null;  // "2026-09-05T16:56:03"
  lighting: Lighting;
  holeDiameterMm: number;
}
export function renderDiagramSvg(input: DiagramInput, variant: 'full' | 'cell', slotLabel?: string): string;
```

Layout (px):
1. Background `page`; left rail (0, 0, 8, 1700) `accent`.
2. Title (48, 70) 34 bold: **"Sighting / Zeroing — Biathlon 50m"** or **"Precision — Olympic 50m Rifle"**.
3. Subtitle (48, 104) 19 `textSecondary`: `positionLabel · <declared> rounds · <YYYY-MM-DD HH:mm> · <Lighting>` (omit empty parts).
4. Legend band (48, 120, 1404, 52) rx 10 `panel`, text baseline 152, 17 px:
   - sighting: "45 mm prone zone" (x 110, icon x 83), "115 mm standing zone" (x 416, icon x 380), "Dotted: 40 mm / 110 mm guides" (x 760)
   - precision: "Scoring key:   Inner Circle = 10   ·   1st Ring = 10   ·   2nd Ring = 9" (x 72)
   - position `both`: prone and standing colour dots with labels at x 1200.
5. **Target**:
   - **Sighting**: centre (750, 720), s = 8 px/mm; halo r 62.5 fill `haloFill` stroke `panelBorder` 1.5; disc r 57.5 fill `discSighting`
     stroke `#232A33` 3; guide r 55 stroke `guideOnDark` 2 dash `18 14`; prone disc r 22.5 fill white stroke `#232A33` 2; guide r 20
     stroke `accent` 2 dash `14 10`; centre dot r 0.6 mm.
     Zone labels (class `zone-label`, `full` only, 14 px): "45 mm" at (cx + 22.5·s + 10, cy − 8) `guideOnDark`; "115 mm" at
     (cx + 400, cy − 434) `accentText` (owner decision REV-22).
   - **Precision**: centre (790, 690), s = 6.35 px/mm; halo r 82.7 white stroke `panelBorder` 1.5; ring lines n = 1…3 stroke
     `ringOnLight` 2.5; black disc r 56.2 `discPrecision`; ring lines n = 4…10 `ringOnDark` 2; inner ten r 2.5 `ringOnDark` 1.5 dash
     `4 3`; labels (class `ring-label`) n = 1…9 at x = cx + ((r_n + r_{n+1})/2)·s, y = cy + 6, 17 bold, `ringOnDark` if midpoint < 56.2
     else `textPrimary`; "10" at (cx + 1.5·s, cy − 3·s) 13 px.
6. **Group ellipse** (non-null): at the MPI, rx = rxMm·s, ry = ryMm·s, stroke `ellipse` 2, `transform="rotate(${-angleDeg} X Y)"`
   (negative: CCW target angle → clockwise SVG rotation).
7. **Shots** (class `shot`): one circle per `Shot`, fixed display marker r = 8 px (not the true hole size, so tight groups stay
   readable; REV-22), × 1.25 if multiplicity > 1; fill by the position
   of unit 0; white stroke 2. `x<k>` label 15 bold `accentText` when k > 1, preferred position (X + 10, Y − 14), placed per item 11.
7a. **Touch-credit ring** (class `touch-credit`, M24, REV-49, issues #4/#6/#8): drawn under the shot's display dot, only for a
   shot whose unit was credited only because its hole's edge touches the line it scored — its centre sits outside the ring or
   zone's own solid circle (`scoring/precision.ts` `isTouchCredited`, `scoring/sighting.ts` `isTouchCredited`; the same
   thresholds `scoreRing`/`zoneFor` use, never a second copy). A thin dashed ring, r = `holeDiameterMm/2 · s` (the true hole
   radius, not the fixed display size), stroke `textSecondary` 1.5, dash `3 3`, fill none, centred on the shot. `renderShots`
   takes `holeDiameterMm` to size it. When any unit in the diagram carries this marker, the footer panel (item 10) gets one
   extra line explaining it; a diagram with no touch-credited unit is unchanged.
8. **MPI** (`all` subset): ±14 px lines stroke `mpi` 2.5, circle r 6, "MPI" 15 bold `mpi`, preferred position (X + 18, Y − 8), placed per item 11.
   The `x<k>` and "MPI" labels carry a white outline (`stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round"
   paint-order="stroke"`) so they stay legible on the black precision disc and over shots (REV-23).
9. **Precision RESULTS panel** (48, 210, 272, 510) rx 10:
   - "RESULTS" 18 at (68, 244); `<declared> shots` 13 at (68, 268)
   - rows (class `results-row`) n = 10…0 at y = 304 + 28·i: number right-aligned x 96; `x<count>` or `-` at x 108
   - divider y 650
   - total 22 bold at (68, 686): `Total  <identifiedTotal> / <maxPossible>` — definite; a missing round scores 0 (REV-39, M20).
10. **Footer panel** (48, 1240, 1404, 420) rx 16; lines at x 72 from y 1290, step 34, 17 px (first line 18 px). Formats: mm 1 dp,
    MOA/MRAD 2 dp, averages 1 dp; unavailable `—`.
    - **Sighting**:
      1. `Group metrics`
      2. `Shots: <identified> identified of <declared>` (+ ` · largest cluster x<k>`)
      3. `Group size (extreme spread): <es> mm`
      4. `Angular size @ 50 m: <moa> MOA · <mrad> MRAD`
      5. `vs 45 mm prone: <h> hit / <m> miss   ·   vs 115 mm standing: <h> hit / <m> miss`
      6. `Scored (<positionLabel>): <hits> hit / <misses> miss` (`misses` includes every missing round, REV-39)
      7. `MPI offset: <|x|> mm <R|L> · <|y|> mm <U|D> (<|xMoa|> / <|yMoa|> MOA)`
    - **Precision**:
      1. `Scoring summary`
      2. `Shots: <identified> identified of <declared>` (+ cluster note)
      3. `Total: <identifiedTotal> / <maxPossible> · X count <xCount>` (+ ` · <n> miss` / ` · <n> misses` when missing > 0)
      4. `Group size: <es> mm · <moa> MOA · <mrad> MRAD @ 50 m`
      5. `MPI offset: …`
      6. (both) `Prone: <total>/<max> · Standing: <total>/<max>`
      (M20 removed the former line 4, `Range: pessimistic … · averaged … · optimistic …`.)
    - **Both templates, appended only when item 7a's marker is present** (M24): one more line,
      `Dashed ring around a shot: scored by touching the line, not a solid hit` (`touchCreditNote`).
11. **Marker label placement** (`label-placement.ts`, both variants; REV-24). Labels are drawn after the shots and the MPI marker:
    "MPI" first, then `x<k>` in shot order. Text origin (x, y) = left edge, baseline.
    - Label box: left x − 2, right x + 0.62·size·chars + 2, top y − 0.75·size − 2, bottom y + 0.25·size + 2.
    - Obstacles: every shot circle at its drawn r + 1, the MPI marker as a circle r 14 px, and labels already placed.
    - Candidates, in order: the preferred position; then for gap g = 4, 12, 20 px around the anchor circle (x, y, r) — the shot
      circle (r + 1) or the MPI circle (r 14) — with d = r/√2, w = 0.62·size·chars, a = 0.75·size: NE (x+d+g, y−d−g),
      E (x+r+g, y+0.35·size), SE (x+d+g, y+d+g+a), S (x−w/2, y+r+g+a), SW (x−d−g−w, y+d+g+a), W (x−r−g−w, y+0.35·size),
      NW (x−d−g−w, y−d−g), N (x−w/2, y−r−g).
    - Skip candidates whose box leaves the label area (full x 8–1500, y 180–1230; cell x 8–720, y 60–664). Take the first with
      no collisions; if none is clear, the one with the fewest (earliest wins ties); if none fits the area, the preferred position.

Expose line builders as pure functions: `sightingFooterLines`, `precisionFooterLines`, `cellCaption`, `targetHeadline`,
`shotsFoundLine`, `touchCreditNote` (M24). `targetHeadline` is used by result cards, the target detail screen and the summary
image's per-slot line (`composite.ts` `slotSummaryLine`) — all three call the same helper, so they stay in step: precision
`72 / 100 · X 1`, or `68 / 100 · 1 miss · X 1` when rounds were scored as misses (REV-39: never a range); sighting `<hits>
hit(s) · <misses> miss(es) — <45|115> mm <prone|standing>` (REV-49, issue #6: never "hits @ mm", which reads as a shot count;
"hit" singular at exactly 1, matching `miss`/`misses`); both: `Prone <hits> hit(s) · <misses> miss(es) · Standing <hits>
hit(s) · <misses> miss(es)`, each half without its own position word (the "Prone "/"Standing " prefix already names it) and
without the zone size (fix round 1: repeating "— 45 mm"/"— 115 mm" in both halves is redundant once each is already labelled,
and it is what pushed the summary image's per-slot line, below, past its 110-char cap).

`shotsFoundLine(result)` (REV-49, issue #6) is a second line, always shown directly under the headline, never merged into it:
`<identified> of <declared> shots found`, or `<identified> of <declared> shots found — <missing> not placed` when
`result.all.missing > 0`. "Hit" and "found" never share a sentence.

**Golden check** (from `fixtures/reference/sample-shots-*.json`): precision SVG contains `Total  72 / 100`, `x2`, `41.9 mm`, `2.88 MOA`,
`0.84 MRAD`. Sighting SVG contains `9 hit / 1 miss`, `10 hit / 0 miss`, `27.7 mm`, `1.90 MOA`, `0.55 MRAD`, `x4`.

## 4. `cell` variant (720 × 720)

- Target centre (360, 350); base scale s₀ = 300 / haloRadiusMm (sighting 4.8, precision ≈ 3.6276). Same target, ellipse, shots
  (r 5 px), MPI. Precision ring labels omitted when s < 4; sighting zone labels omitted.
- **In the summary image every cell shares one scale (REV-52).** `DiagramInput.cellScaleOverride`, set by
  `sharedCellScale` (§5), replaces the per-cell fit below, so two targets in one image can be compared by eye. A standalone cell
  (a result card's thumbnail) leaves it undefined and fits itself.
- **Every shot stays inside the drawing (REV-51).** With `reach` = the largest `hypot(xMm, yMm) + holeDiameterMm / 2 + 2` over the
  shots, `s = max(0.5 · s₀, min(s₀, 300 / reach))`: a shot on the paper beyond the printed target zooms the cell out until it fits,
  never below half scale (2 × the halo radius — beyond anything detection can produce). The rings shrink with it; nothing is hidden.
- **Nothing crosses the caption.** The target, ellipse, shots, MPI and marker labels are clipped to (0, 0, 720, 668) with a
  `clipPath` whose id is unique in the composite (`cellclip-<template>-<slot>`); the group ellipse of a scattered group is cut at
  the edge rather than drawn over the caption band.
- Chip (20, 20, 16 + 9·chars, 36) rx 18 `panel`; 15 bold uppercase `<TEMPLATE> <slot> · <POSITION>`.
- Caption band (0, 668, 720, 52) `panel`; centred 17 px at y 700 (REV-49 wording, so the cell never reads as "N of M found"):
  - sighting `<h> hit(s) · <m> miss(es) — <45|115> mm · ES <es> mm · <moa> MOA`
    (both: `Prone <h> hit(s) · Standing <h> hit(s) · ES <es> mm · <moa> MOA`)
  - precision `<total> / <max> · X <x> · ES <es> mm · <moa> MOA`
  - (M20: no range suffix; the total is definite.)

## 5. Session summary image (`src/lib/render/composite.ts`)

```ts
export interface SlotData { photo: TargetPhoto; analysis: TargetAnalysis; result: AnalysisResult }
export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: [SlotData | null, SlotData | null]; precision: [SlotData | null, SlotData | null] };
  generatedAtLocal: string;     // "2026-09-05 17:20"
  holeDiameterMm: number;
}
export function renderComposite(input: CompositeInput): { svg: string; width: number; height: number }; // REV-51
export function renderCompositeSvg(input: CompositeInput): string; // renderComposite(input).svg
export interface SlotIds { sighting: [string | null, string | null]; precision: [string | null, string | null] }
export function selectDefaultSlots(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>): SlotIds;
```

**Layout: four fixed positions (REV-51).** The owner asked for "a better template for the scoring summary. It should handle cases
where there's one, two, three, or four images and format correctly", then: "Keep a blank template slot for each of the 4 targets."
So the image always has the same shape — **Sighting 1 and 2 on the top row, Precision 1 and 2 on the bottom row** — and a position
with no selected target shows its **blank template** (the template alone at `BLANK_CELL_OPACITY` 0.35, the chip without a
position, e.g. `SIGHTING 2`, and the caption `No target`). A target is always found in the same place. This replaces the old
one-row-per-template grid, which dropped an empty row entirely and put a filler "stat card" in a half-empty one (with an unfilled
black border), described only that one target, and left a fixed 600 px band mostly empty.

- **Positions** (x, y within the grid, all 720 × 720): sighting 1 (0, 0), sighting 2 (720, 0), precision 1 (0, 720),
  precision 2 (720, 720). Grid height **1440**. At least one filled slot is required; 0 throws `EmptyCompositeError`.
- **Canvas.** Width **1440**. A full-canvas `panel` rect is drawn first, so no area is ever unfilled (transparent renders black).
- **Header** (0, 0, 1440, 120) `header`: `Shooting analysis — <session.name>` 36 bold white at (40, 58); subtitle 18 `#CFE6F3` at
  (40, 94): `<sessionDate> · <lightingSummary>` (shared label if all filled slots agree, else `mixed lighting`).
- **One scale for the whole image (REV-52).** `sharedCellScale(input)` is the tightest fit any of the four positions needs:
  every template's halo must fit within the 300 px drawing radius — the precision sheet is larger, so it sets the baseline
  3.6276 px/mm, and sighting targets are drawn smaller than their cell rather than at their own fit — and a shot out on the paper
  beyond its printed target zooms **every** cell out together, never only its own. Floored at half the precision baseline, so one
  wild manual shot cannot shrink the image away (a shot beyond that is clipped).
- **Cells** start at y = 120, each nested as `<svg x y width="720" height="720" viewBox="0 0 720 720">` — the `cell` diagram (§4)
  for a filled slot, the blank template for an empty one.
- **Analysis band** at y = 120 + 1440, **sized to its content**: `panel`, 8 px `accent` rail.
  - `Session analysis` 24 bold at (40, y+56).
  - Lines 18 px from y+100, step 34, each ≤ 110 chars (`…`):
    1. `Targets: <nS> sighting · <nP> precision · <lightingSummary>`, leaving out a zero count (`Targets: 1 precision · Daylight`)
    2. One per filled slot, built from `targetHeadline` (M24: the same helper the card and target detail use), e.g.
       `Sighting 1 (prone): 9 hits · 1 miss — 45 mm prone · ES 27.7 mm (1.90 MOA) · MPI 9.7 R / 3.9 U mm`,
       `Precision 1 (prone): 72 / 100 · X 1 · ES 41.9 mm (2.88 MOA)`; for a `both` slot the `targetHeadline` `both` form.
    3. **N = 1 only:** that target's `full`-variant footer lines (§3), which the old stat card carried — the only place the
       summary has room for them — **minus** the lines that repeat line 2: the `Scoring summary` heading, precision's `Total: …`
       and sighting's `Scored (…): …`.
    4. If there are more analyzed targets than slots: `+<n> more target(s) in the app`
    5. If `session.notes`: `Notes: <notes>` (≤ 2 lines).
  - Footer 13 `textSecondary`, 28 px above the band's bottom: `Nordic Aim · generated <generatedAtLocal>` (REV-45).
  - Band height = `100 + 34 × lines + 64`.
- **Height** = 120 + 1440 + band height. `renderComposite(input)` returns `{ svg, width, height }` so `buildComposite`
  rasterises at exactly the drawn size.

**Height vectors** (no notes, `moreCount` 0, single-position slots): 1 filled precision slot → 120 + 1440 + (100 + 34·5 + 64) =
1894 (targets, its slot line, its 3 non-repeating footer lines); 2 filled → 120 + 1440 + 100 + 34·3 + 64 = 1826; 3 filled → 1860;
4 filled → 1894; 0 filled → throws.

**Slot selection (automatic, pure)**: candidates per template = photos with `status === 'analyzed'`, sorted by `captureTime.utc`
descending (null last, then `importedAt` descending). Break ties with the better result (precision: higher `identifiedTotal`;
sighting: smaller `extremeSpreadMm`, null worst). Take the first two, then order chronologically (older = slot 1). Returns photo ids. A rejected target (`too-many-holes`,
REV-39) is `needs-attention`, never `analyzed`, so it is never a candidate: it is **excluded** from the summary image.

## 6. `CompositeArtifact` and the share rule

```ts
declare const artifactBrand: unique symbol;
export interface CompositeArtifact { readonly [artifactBrand]: true; id: string; sessionId: string;
  widthPx: number; heightPx: number; sha256: string; createdAt: string }
// Brand applied ONLY inside src/lib/composite/build.ts.
export async function buildComposite(ctx: ServiceContext, sessionId: string, render: RenderTools): Promise<CompositeArtifact>;
export async function loadArtifact(ctx: ServiceContext, sessionId: string, artifactId: string): Promise<{ artifact: CompositeArtifact; png: Blob }>;
export async function latestArtifact(ctx: ServiceContext, sessionId: string): Promise<{ artifact: CompositeArtifact; png: Blob } | null>;
```

- `buildComposite`:
  1. Select slots (§5); if none, throw `EmptyCompositeError`.
  2. Run `analyzeTarget` per slot, render the SVG, rasterise it, and compute sha256 with `crypto.subtle.digest` (lowercase hex). All before the transaction.
  3. In one transaction: store `artifact:<id>:png` and `artifact:<id>:json`; append `ArtifactMeta`; prune to the newest 3 (delete older blobs and metas).
- JSON sidecar: `{ sessionId, createdAt, slots, perSlot: [{ photoId, template, position, result }], lightingSummary }`. It carries no image data and no GPS.
- `loadArtifact` re-verifies sha256; a mismatch or unknown id → `ArtifactNotFoundError`. Share code only accepts `loadArtifact`/`latestArtifact` results.

## 7. Sharing (`share-browser.ts`)

```ts
export async function shareArtifact(png: Blob, fileName: string, title: string): Promise<'web-share' | 'download' | 'cancelled'>;
```

1. Pre-load the PNG when the results screen shows the summary (iOS requires `navigator.share` to be called directly in the tap).
2. `File([png], '<session-slug>-shooting-analysis.png', { type: 'image/png' })`. If `navigator.canShare?.({ files: [file] })` →
   `navigator.share({ files: [file], title })`; `AbortError` → `cancelled`.
3. Otherwise download via a temporary `<a download>` (object URL, revoked after 60 s) → `download`.
4. On `web-share`/`download` → `recordShare`.
5. **Attach in Garmin Connect** card: (1) In the share sheet choose **Save Image**. (2) Open the Garmin Connect app. (3) Open the
   activity (usually the most recent). (4) Tap the camera icon and choose the saved image.
