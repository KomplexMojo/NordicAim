# Spec: diagrams, composite, sharing

Visual reference: the owner's examples, [`../reference/example-diagram-sighting.png`](../reference/example-diagram-sighting.png)
and [`../reference/example-diagram-precision.png`](../reference/example-diagram-precision.png) (1500×1700).
Implementation: `src/lib/render/*` (pure: returns SVG strings), `src/lib/render/rasterize.ts` (resvg),
`src/lib/composite/*`.

Target drawing uses `X = cx + xMm*s`, `Y = cy - yMm*s` (flip y). All text uses `font-family="Inter"`.

## 1. Palette (`palette.ts`, sampled from the examples)

| Token | Hex | Use |
|---|---|---|
| `page` | `#F7FAFD` | canvas background |
| `panel` | `#EAF2F8` | legend band, footer, result panels |
| `panelBorder` | `#A9CFE3` | panel borders, halo outline |
| `haloFill` | `#DCEBF5` | sighting halo fill |
| `accent` | `#4B94C3` | left rail, guide dashes, multiplicity labels |
| `accentText` | `#2F6E99` | multiplicity label text |
| `textPrimary` | `#1F2630` | titles, body |
| `textSecondary` | `#5B6775` | subtitles, captions |
| `discSighting` | `#36404D` | sighting dark disc |
| `discPrecision` | `#1C1F24` | precision black aiming mark |
| `ringOnDark` | `#FFFFFF` | ring lines on dark |
| `ringOnLight` | `#2A2F36` | ring lines on white |
| `guideOnDark` | `#CFE6F3` | sighting 110 mm dashed guide |
| `shotProne` | `#E8604C` | shot fill, prone |
| `shotStanding` | `#8A5CF6` | shot fill, standing |
| `mpi` | `#C8452F` | MPI crosshair and label |
| `ellipse` | `#2F7FB0` | group ellipse stroke |
| `header` | `#1F2630` | composite header band |

The UI theme (M18) reuses these tokens as CSS variables.

## 2. Fonts and rasterisation

- Bundle `assets/fonts/Inter-Regular.ttf` and `Inter-Bold.ttf` plus `assets/fonts/OFL.txt` (SIL OFL,
  from the official Inter release).
- `svgToPng(svg: string): Buffer` uses `new Resvg(svg, { font: { fontFiles: [regular, bold], loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'original' } })`.
- Renderers are pure. They take `generatedAtLocal` and similar values as inputs; no `Date.now()`.
- Tests snapshot the **SVG string**. PNG tests assert only dimensions and non-zero size.

## 3. Per-target diagram, `full` variant (1500 × 1700)

```ts
export interface DiagramInput {
  template: 'sighting' | 'precision';
  result: AnalysisResult;                 // from analyzeTarget
  shots: Shot[];                          // for multiplicity labels
  positionLabel: string;                  // "Prone" | "Standing" | "Prone + standing"
  captureLocal: string | null;            // "2026-09-05T16:56:03"
  lighting: Lighting;
  clickValueMm: number | null;
}
export function renderDiagramSvg(input: DiagramInput, variant: 'full' | 'cell', slotLabel?: string): string;
```

Layout (px):
1. Background rect `page`. Left rail `x0 y0 w8 h1700` fill `accent`.
2. Title at (48, 70), 34 bold `textPrimary`: sighting **"Sighting / Zeroing — Biathlon 50m"**; precision
   **"Precision — Olympic 50m Rifle"**.
3. Subtitle at (48, 104), 19 `textSecondary`: parts joined by `" · "`, empty parts omitted:
   `positionLabel`, `"<declared> rounds"`, `captureLocal` as `YYYY-MM-DD HH:mm`, lighting label capitalised.
4. Legend band: rect (48, 120, 1404, 52) rx 10 `panel`. Text baseline y 152, 17 px.
   - Sighting: "45 mm prone zone" at x 110 (icon: ringed dot at x 83), "115 mm standing zone" at x 416
     (icon: dark ring at x 380), "Dotted: 40 mm / 110 mm guides" at x 760.
   - Precision: "Scoring key:   Inner Circle = 10   ·   1st Ring = 10   ·   2nd Ring = 9" at x 72.
   - If position is `both`: at the right end (x 1200), a prone dot + "prone" and a standing dot + "standing".
5. **Target**:
   - **Sighting**: centre (750, 720), s = 8 px/mm. Halo r 62.5 mm fill `haloFill` stroke `panelBorder` 1.5.
     Disc r 57.5 fill `discSighting` stroke `#232A33` 3. Dashed guide r 55 stroke `guideOnDark` 2
     dasharray `18 14`. Prone zone disc r 22.5 fill `#FFFFFF` stroke `#232A33` 2. Dashed guide r 20 stroke
     `accent` 2 dasharray `14 10`. Centre dot r 0.6 mm stroke `accent` fill white.
   - **Precision**: centre (790, 690), s = 6.35 px/mm. Halo r 82.7 mm fill `#FFFFFF` stroke `panelBorder` 1.5.
     Ring lines n = 1…3 at r_n (geometry-scoring §1.3) stroke `ringOnLight` 2.5. Black disc r 56.2 fill
     `discPrecision`. Ring lines n = 4…10 stroke `ringOnDark` 2. Inner ten r 2.5 stroke `ringOnDark` 1.5
     dasharray `4 3`. **Ring labels** n = 1…9 at x = cx + ((r_n + r_{n+1})/2)·s, y = cy + 6, 17 bold, fill
     `ringOnDark` if the midpoint radius < 56.2 else `textPrimary`. Label "10" at (cx + 1.5·s, cy − 3·s), 13 px.
6. **Group ellipse** (if non-null): `<ellipse>` at the MPI, rx = rxMm·s, ry = ryMm·s, stroke `ellipse` 2,
   fill none, `transform="rotate(${-angleDeg} X Y)"`. The minus is required: the spec angle is CCW in target
   space, and SVG rotate is clockwise on screen.
7. **Shots**: one circle per `Shot` (not per unit). r = max(7, (holeDiameterMm/2)·s), times 1.25 if
   multiplicity > 1. Fill `shotProne` or `shotStanding` by the position of unit 0; stroke white 2. If
   multiplicity > 1, label `x<k>` 15 bold `accentText` at (X + 10, Y − 14).
8. **MPI** (all subset, if non-null): lines ±14 px through (X, Y) stroke `mpi` 2.5, circle r 6 stroke `mpi` 2,
   label "MPI" 15 bold `mpi` at (X + 18, Y − 8).
9. **Precision RESULTS panel**: rect (48, 210, 272, 510) rx 10 fill `panel` stroke `panelBorder`. "RESULTS" 18
   at (68, 244). `"<declared> shots"` 13 `textSecondary` at (68, 268). Rows for n = 10…0 at y = 304 + 28·i:
   number right-aligned at x 96 (`text-anchor="end"`), then `x<count>` or `-` at x 108 (`-` in `textSecondary`).
   Divider line at y 650. Total 22 bold at (68, 686): `Total  <identifiedTotal> / <maxPossible>`; when
   missing > 0, `Total  <pessimistic>–<optimistic> / <maxPossible>`.
10. **Footer panel**: rect (48, 1240, 1404, 420) rx 16 fill `panel`. Lines at x 72 from y 1290, step 34, 17 px
    (first line 18 px). Number formats: mm 1 dp, MOA 2 dp, MRAD 2 dp, averaged values 1 dp. An unavailable
    value is `—`.
    - **Sighting**:
      1. `Group metrics`
      2. `Shots: <identified> identified of <declared>` + (` · largest cluster x<k>` if any k > 1)
      3. `Group size (extreme spread): <es> mm`
      4. `Angular size @ 50 m: <moa> MOA · <mrad> MRAD`
      5. `vs 45 mm prone: <h> hit / <m> miss   ·   vs 115 mm standing: <h> hit / <m> miss` (all identified units, informational)
      6. `Scored (<positionLabel>): <hits> hit / <misses> miss` + (` · range <pess>–<opt> hits (avg <avg>)` if missing > 0)
      7. `MPI offset: <|x|> mm <R|L> · <|y|> mm <U|D> (<|xMoa|> / <|yMoa|> MOA)`
      8. (if clickValueMm) `Correction: <sightCorrection text>`
    - **Precision**:
      1. `Scoring summary`
      2. `Shots: <identified> identified of <declared>` + cluster note
      3. `Total: <identifiedTotal> / <maxPossible> · X count <xCount>`
      4. `Range: pessimistic <p> · averaged <a> · optimistic <o>`
      5. `Group size: <es> mm · <moa> MOA · <mrad> MRAD @ 50 m`
      6. `MPI offset: …` (same as sighting line 7)
      7. (both only) `Prone: <total>/<max> · Standing: <total>/<max>`

**Golden check** (render from `fixtures/reference/sample-shots-*.json`): the precision SVG contains
`Total  72 / 100`, `x2`, `41.9 mm`, `2.88 MOA`, `0.84 MRAD`. The sighting SVG contains `9 hit / 1 miss`,
`10 hit / 0 miss`, `27.7 mm`, `1.90 MOA`, `0.55 MRAD`, `x4`.

## 4. `cell` variant (720 × 720)

- Background `page`. Target centre (360, 350); s = 300 / haloRadiusMm (sighting 300/62.5 = 4.8; precision
  300/82.7 ≈ 3.6276).
- Same target drawing, ellipse, shots (min radius 5 px), and MPI. Precision ring labels are **omitted** when
  s < 4.
- Chip: rect (20, 20, auto width = 16 + 9·chars, 36) rx 18 fill `panel`; text 15 bold `textPrimary`
  uppercase `<TEMPLATE> <slot> · <POSITION>` (for example `PRECISION 1 · PRONE`).
- Caption band: rect (0, 668, 720, 52) fill `panel`; centred text 17 px at y 700:
  - sighting: `<hits>/<declared> hit @ <45|115> mm · ES <es> mm · <moa> MOA` (`both` uses `P <h>/<d> · S <h>/<d>`)
  - precision: `<total>/<max> · X <x> · ES <es> mm · <moa> MOA`
  - append ` · range <p>–<o>` when missing > 0.

## 5. Composite (`src/lib/render/composite.ts`, `src/lib/composite/*`)

```ts
export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: Array<SlotData | null>; precision: Array<SlotData | null> }; // length 2 each
  generatedAtLocal: string;               // "2026-09-05 17:20"
}
export interface SlotData { photo: TargetPhoto; analysis: TargetAnalysis; result: AnalysisResult; shots: Shot[] }
export function compositeHeight(nSightingRows: 0 | 1, nPrecisionRows: 0 | 1): number;
export function renderCompositeSvg(input: CompositeInput): string;
```

- Width **1440**. Height = `120 + 720 × rows + 600`, where rows = (any sighting slot ? 1 : 0) + (any
  precision slot ? 1 : 0). Zero rows throws `EMPTY_COMPOSITE`.
- **Header** (0, 0, 1440, 120) fill `header`: title `Shooting analysis — <session.name>` 36 bold white at
  (40, 58); subtitle 18 `#CFE6F3` at (40, 94): `<sessionDate> · <lightingSummary>`, plus
  ` · Activity: <primary activity name>` if `session.garmin?.primaryActivityId`. `lightingSummary` = the
  shared lighting label if all slot photos agree, else `mixed lighting`.
- **Rows**, in order: sighting row, then precision row, each 720 tall at y = 120 + 720·rowIndex. Slot 1 cell
  at x 0, slot 2 at x 720 (`cell` variant, embedded as a nested `<svg x y width="720" height="720" viewBox="0 0 720 720">`).
  If a row has only one filled slot, it goes at x 0 and a **stat card** fills x 720: rect (744, y+24, 672,
  672) rx 16 fill `panel`, holding that target's full-variant footer lines at 20 px from (776, y+84), step 40.
- **Analysis band** at y = 120 + 720·rows, height 600: rect fill `panel`, left rail 8 px `accent`.
  - Heading `Session analysis` 24 bold at (40, y+56).
  - Lines 18 px from y+100, step 34, each truncated to 110 characters with `…`:
    1. `Targets: <nS> sighting · <nP> precision · <lightingSummary>`
    2. One line per filled slot, ≤ 4:
       - `Sighting 1 (prone): 9/10 hit @45 mm · ES 27.7 mm (1.90 MOA) · MPI 9.7 R / 3.9 U mm`
       - `Precision 1 (prone): 72/100 (range 72–72) · X 1 · ES 41.9 mm (2.88 MOA)`
    3. If `session.garmin` has activities: `Activities: <name> <HH:mm> (<min> min) · …`
    4. If `session.notes`: `Notes: <notes>` (up to 2 lines)
  - Footer 13 `textSecondary` at (40, y+572): `advanced-shooting-analysis · generated <generatedAtLocal>`.

**Height vectors**: (2 sighting, 2 precision) → 2160; (1, 1) → 2160 (with stat cards); (0, 1) → 1440;
(2, 0) → 1440; (0, 0) → throws.

**Default slot selection** (`selectDefaultSlots(photos, analyses)`): per template, candidates are photos
with `status === 'reviewed'` and `sourceRetention` of either value. Sort by `captureTime.utc` descending
(null last, then `importedAt` descending). Break ties with the better result: precision higher
`identifiedTotal`; sighting smaller `extremeSpreadMm` (null worst). Take the first two, then order those
two chronologically (older = slot 1). Return a `CompositeSelection` with `confirmed: false`.

## 6. `CompositeArtifact` and the publish rule

```ts
// src/lib/composite/artifact.ts
declare const artifactBrand: unique symbol;
export interface CompositeArtifact { readonly [artifactBrand]: true; id: string; sessionId: string; pngPath: string;
  jsonPath: string; widthPx: number; heightPx: number; sha256: string; createdAt: string }
// The brand is applied ONLY inside src/lib/composite/build.ts (buildComposite). Nothing else may construct one.
export async function buildComposite(sessionId: string, now: Date): Promise<CompositeArtifact>;
```

- `buildComposite` loads the session, validates the confirmed or default selection, runs `analyzeTarget` for
  each slot, renders the SVG, rasterises the PNG, and writes `exports/<id>.png`.
- It also writes `exports/<id>.json`: `{ sessionId, createdAt, selection, perSlot: [{ photoId, template,
  position, result }], lightingSummary, garmin: session.garmin }`. No image data and no GPS.
- It appends `{ id, sha256, widthPx, heightPx, createdAt }` to `session.artifacts`.
- `GET /api/sessions/:sid/composite/:artifactId` serves only files whose id is in `session.artifacts` **and**
  whose sha256 matches. Anything else is 404.
- Unit test: construct a fake object without the brand and assert that `shareArtifact()` (M15) rejects it at
  compile time (`// @ts-expect-error`) and at runtime (sha mismatch).

## 7. Sharing (client, M15)

1. After build, the client **pre-fetches** the PNG as a `Blob` (iOS needs the share call to happen inside the
   tap, and a network wait can break that).
2. On **Share**: `const file = new File([blob], '<session-slug>-shooting-analysis.png', { type: 'image/png' })`.
   If `navigator.canShare?.({ files: [file] })`, call `await navigator.share({ files: [file], title: session.name })`.
   An `AbortError` means the owner cancelled, so record nothing.
3. Otherwise, open `/api/sessions/:sid/composite/:artifactId` in a new tab with the hint "Long-press the image →
   Save to Photos". This uses method `open-image`.
4. After a successful share or open, `POST /api/sessions/:sid/shares`.
5. Show the **Attach in Garmin Connect** card:
   1. Save the image to Photos (from the share sheet).
   2. Open the Garmin Connect app.
   3. Open the activity (usually the most recent).
   4. Tap the camera icon and choose the saved image.
