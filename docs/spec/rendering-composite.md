# Spec: diagrams, composite, sharing

Visual reference: the owner's examples, [`../reference/example-diagram-sighting.png`](../reference/example-diagram-sighting.png)
and [`../reference/example-diagram-precision.png`](../reference/example-diagram-precision.png) (1500×1700).

Implementation:
- `src/lib/render/*`: pure functions returning SVG strings
- `src/lib/render/rasterize-browser.ts`: on the phone
- `scripts/render-samples.ts`: Node, dev only, uses `@resvg/resvg-js`
- `src/lib/composite/*`, `src/lib/share/share-browser.ts`

Target drawing uses `X = cx + xMm*s` and `Y = cy - yMm*s` (flip y).

## 1. Palette (`palette.ts`)

| Token | Hex | Use |
|---|---|---|
| `page` | `#F7FAFD` | canvas background |
| `panel` | `#EAF2F8` | legend band, footer, result panels |
| `panelBorder` | `#A9CFE3` | panel borders, halo outline |
| `haloFill` | `#DCEBF5` | sighting halo fill |
| `accent` | `#4B94C3` | left rail, guide dashes |
| `accentText` | `#2F6E99` | multiplicity labels |
| `textPrimary` | `#1F2630` | titles, body |
| `textSecondary` | `#5B6775` | subtitles, captions |
| `discSighting` | `#36404D` | sighting dark disc |
| `discPrecision` | `#1C1F24` | precision black aiming mark |
| `ringOnDark` | `#FFFFFF` | ring lines on dark |
| `ringOnLight` | `#2A2F36` | ring lines on white |
| `guideOnDark` | `#CFE6F3` | sighting 110 mm dashed guide |
| `shotProne` | `#E8604C` | shot fill, prone |
| `shotStanding` | `#8A5CF6` | shot fill, standing |
| `mpi` | `#C8452F` | MPI crosshair |
| `ellipse` | `#2F7FB0` | group ellipse |
| `header` | `#1F2630` | composite header band |

The UI theme (M18) reuses these tokens as CSS variables.

## 2. Fonts and rasterisation

- All SVG text uses the **system font stack**:
  `font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"`. On iPhone this
  renders in SF Pro. No web fonts are embedded.
- Browser rasterisation:

  ```ts
  export async function svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Blob>;
  // Blob([svg], 'image/svg+xml') → object URL → Image → await decode() → canvas(width,height) →
  // drawImage(img, 0, 0, width, height) → toBlob('image/png') (null → throw) → revoke URL
  ```

  The SVG must carry `xmlns="http://www.w3.org/2000/svg"`, `width`, `height`, and `viewBox`. If `getImageData`
  throws `SecurityError` (tainted canvas), fall back to a `data:image/svg+xml;charset=utf-8,<encodeURIComponent(svg)>`
  image source. M01 diagnostics tests both.
- Node (`scripts/render-samples.ts`, dev only): `new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'original' } }).render().asPng()`.
- Renderers are pure: `generatedAtLocal` and similar values are inputs. Tests snapshot **SVG strings**; PNG tests
  check only dimensions.

## 3. Per-target diagram, `full` variant (1500 × 1700)

```ts
export interface DiagramInput {
  template: 'sighting' | 'precision';
  result: AnalysisResult;
  shots: Shot[];
  positionLabel: string;                  // "Prone" | "Standing" | "Prone + standing"
  captureLocal: string | null;            // "2026-09-05T16:56:03"
  lighting: Lighting;
  clickValueMm: number | null;
  holeDiameterMm: number;
}
export function renderDiagramSvg(input: DiagramInput, variant: 'full' | 'cell', slotLabel?: string): string;
```

Layout (px):
1. Background rect `page`. Left rail `x0 y0 w8 h1700` fill `accent`.
2. Title at (48, 70), 34 bold `textPrimary`: sighting **"Sighting / Zeroing — Biathlon 50m"**; precision
   **"Precision — Olympic 50m Rifle"**.
3. Subtitle at (48, 104), 19 `textSecondary`: parts joined by `" · "`, omitting empty ones: `positionLabel`,
   `"<declared> rounds"`, `captureLocal` as `YYYY-MM-DD HH:mm`, lighting capitalised.
4. Legend band: rect (48, 120, 1404, 52) rx 10 `panel`; text baseline y 152, 17 px.
   - Sighting: "45 mm prone zone" at x 110 (icon at x 83), "115 mm standing zone" at x 416 (icon at x 380),
     "Dotted: 40 mm / 110 mm guides" at x 760.
   - Precision: "Scoring key:   Inner Circle = 10   ·   1st Ring = 10   ·   2nd Ring = 9" at x 72.
   - Position `both`: at x 1200, a prone dot + "prone" and a standing dot + "standing".
5. **Target**:
   - **Sighting**: centre (750, 720), s = 8 px/mm. Halo r 62.5 mm fill `haloFill` stroke `panelBorder` 1.5. Disc r 57.5
     fill `discSighting` stroke `#232A33` 3. Dashed guide r 55 stroke `guideOnDark` 2 dasharray `18 14`. Prone zone
     disc r 22.5 fill `#FFFFFF` stroke `#232A33` 2. Dashed guide r 20 stroke `accent` 2 dasharray `14 10`. Centre dot
     r 0.6 mm stroke `accent` fill white.
   - **Precision**: centre (790, 690), s = 6.35 px/mm. Halo r 82.7 mm fill `#FFFFFF` stroke `panelBorder` 1.5. Ring lines
     n = 1…3 at r_n stroke `ringOnLight` 2.5. Black disc r 56.2 fill `discPrecision`. Ring lines n = 4…10 stroke
     `ringOnDark` 2. Inner ten r 2.5 stroke `ringOnDark` 1.5 dasharray `4 3`. **Ring labels** (class `ring-label`) for
     n = 1…9 at x = cx + ((r_n + r_{n+1})/2)·s, y = cy + 6, 17 bold; fill `ringOnDark` if the midpoint radius < 56.2,
     else `textPrimary`. Label "10" at (cx + 1.5·s, cy − 3·s), 13 px.
6. **Group ellipse** (if non-null): `<ellipse>` at the MPI, rx = rxMm·s, ry = ryMm·s, stroke `ellipse` 2, fill none,
   `transform="rotate(${-angleDeg} X Y)"`. The minus is required: the spec angle is CCW in target space, while SVG
   rotates clockwise on screen.
7. **Shots**: one circle per `Shot` (class `shot`). r = max(7, (holeDiameterMm/2)·s), × 1.25 if multiplicity > 1.
   Fill `shotProne` or `shotStanding` by the position of unit 0; stroke white 2. If multiplicity > 1, label `x<k>`
   15 bold `accentText` at (X + 10, Y − 14).
8. **MPI** (the `all` subset, if non-null): lines ±14 px stroke `mpi` 2.5, circle r 6 stroke `mpi` 2, label "MPI" 15 bold
   at (X + 18, Y − 8).
9. **Precision RESULTS panel**: rect (48, 210, 272, 510) rx 10 fill `panel` stroke `panelBorder`.
   - "RESULTS" 18 at (68, 244); `"<declared> shots"` 13 `textSecondary` at (68, 268).
   - Rows (class `results-row`) for n = 10…0 at y = 304 + 28·i: number right-aligned at x 96, then `x<count>` or `-` at x 108.
   - Divider at y 650.
   - Total 22 bold at (68, 686): `Total  <identifiedTotal> / <maxPossible>`; when missing > 0,
     `Total  <pessimistic>–<optimistic> / <maxPossible>`.
10. **Footer panel**: rect (48, 1240, 1404, 420) rx 16 fill `panel`. Lines at x 72 from y 1290, step 34, 17 px (first
    line 18 px). Formats: mm 1 dp, MOA 2 dp, MRAD 2 dp, averaged values 1 dp; an unavailable value is `—`.
    - **Sighting**:
      1. `Group metrics`
      2. `Shots: <identified> identified of <declared>` + (` · largest cluster x<k>` if any k > 1)
      3. `Group size (extreme spread): <es> mm`
      4. `Angular size @ 50 m: <moa> MOA · <mrad> MRAD`
      5. `vs 45 mm prone: <h> hit / <m> miss   ·   vs 115 mm standing: <h> hit / <m> miss` (all identified units)
      6. `Scored (<positionLabel>): <hits> hit / <misses> miss` + (` · range <pess>–<opt> hits (avg <avg>)` if missing > 0)
      7. `MPI offset: <|x|> mm <R|L> · <|y|> mm <U|D> (<|xMoa|> / <|yMoa|> MOA)`
      8. (if clickValueMm) `Correction: <sightCorrection text>`
    - **Precision**:
      1. `Scoring summary`
      2. `Shots: <identified> identified of <declared>` + cluster note
      3. `Total: <identifiedTotal> / <maxPossible> · X count <xCount>`
      4. `Range: pessimistic <p> · averaged <a> · optimistic <o>`
      5. `Group size: <es> mm · <moa> MOA · <mrad> MRAD @ 50 m`
      6. `MPI offset: …`
      7. (both only) `Prone: <total>/<max> · Standing: <total>/<max>`

Expose line builders as pure functions: `sightingFooterLines`, `precisionFooterLines`, `cellCaption`.

**Golden check** (rendered from `fixtures/reference/sample-shots-*.json`): the precision SVG contains
`Total  72 / 100`, `x2`, `41.9 mm`, `2.88 MOA`, `0.84 MRAD`. The sighting SVG contains `9 hit / 1 miss`, `10 hit / 0 miss`,
`27.7 mm`, `1.90 MOA`, `0.55 MRAD`, `x4`.

## 4. `cell` variant (720 × 720)

- Background `page`. Target centre (360, 350); s = 300 / haloRadiusMm (sighting 4.8; precision ≈ 3.6276).
- Same target drawing, ellipse, shots (min radius 5 px), and MPI. Precision ring labels are omitted when s < 4.
- Chip: rect (20, 20, 16 + 9·chars, 36) rx 18 fill `panel`; text 15 bold uppercase `<TEMPLATE> <slot> · <POSITION>`.
- Caption band: rect (0, 668, 720, 52) fill `panel`; centred text 17 px at y 700:
  - sighting: `<hits>/<declared> hit @ <45|115> mm · ES <es> mm · <moa> MOA` (`both`: `P <h>/<d> · S <h>/<d>`)
  - precision: `<total>/<max> · X <x> · ES <es> mm · <moa> MOA`
  - append ` · range <p>–<o>` when missing > 0.

## 5. Composite (`src/lib/render/composite.ts`)

```ts
export interface SlotData { photo: TargetPhoto; analysis: TargetAnalysis; result: AnalysisResult }
export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: [SlotData | null, SlotData | null]; precision: [SlotData | null, SlotData | null] };
  generatedAtLocal: string;               // "2026-09-05 17:20"
  profile: { clickValueMm: number | null; holeDiameterMm: number };
}
export function compositeHeight(sightingRow: 0 | 1, precisionRow: 0 | 1): number;
export function renderCompositeSvg(input: CompositeInput): string;
```

- Width **1440**. Height = `120 + 720 × rows + 600`, where rows = (any sighting slot ? 1 : 0) + (any precision slot ? 1 : 0).
  Zero rows throws `EmptyCompositeError`.
- **Header** (0, 0, 1440, 120) fill `header`: `Shooting analysis — <session.name>` 36 bold white at (40, 58); subtitle 18
  `#CFE6F3` at (40, 94): `<sessionDate> · <lightingSummary>`. `lightingSummary` = the shared label if all slot photos
  agree, else `mixed lighting`.
- **Rows**: sighting row first, then precision, each 720 tall at y = 120 + 720·rowIndex. Slot 1 at x 0, slot 2 at x 720,
  as nested `<svg x y width="720" height="720" viewBox="0 0 720 720">` using the `cell` renderer. If a row has one
  filled slot, it goes at x 0 and a **stat card** fills x 720: rect (744, y+24, 672, 672) rx 16 `panel`, holding that
  target's full-variant footer lines at 20 px from (776, y+84), step 40.
- **Analysis band** at y = 120 + 720·rows, height 600: rect `panel`, left rail 8 px `accent`.
  - Heading `Session analysis` 24 bold at (40, y+56).
  - Lines 18 px from y+100, step 34, each truncated to 110 chars with `…`:
    1. `Targets: <nS> sighting · <nP> precision · <lightingSummary>`
    2. One line per filled slot, ≤ 4:
       - `Sighting 1 (prone): 9/10 hit @45 mm · ES 27.7 mm (1.90 MOA) · MPI 9.7 R / 3.9 U mm`
       - `Precision 1 (prone): 72/100 (range 72–72) · X 1 · ES 41.9 mm (2.88 MOA)`
    3. If `session.notes`: `Notes: <notes>` (up to 2 lines)
  - Footer 13 `textSecondary` at (40, y+572): `advanced-shooting-analysis · generated <generatedAtLocal>`.

**Height vectors**: (2, 2) → 2160; (1, 1) → 2160 (with stat cards); (0, 1) → 1440; (2, 0) → 1440; (0, 0) → throws.

**Default slot selection** (`selectDefaultSlots(photos, analyses)`, pure): candidates per template = photos with
`status === 'reviewed'`. Sort by `captureTime.utc` descending (null last, then `importedAt` descending); break ties
with the better result (precision: higher `identifiedTotal`; sighting: smaller `extremeSpreadMm`, null worst). Take the
first two, then order them chronologically (older = slot 1). Return `confirmed: false`.

## 6. `CompositeArtifact` and the share rule

```ts
// src/lib/composite/artifact.ts
declare const artifactBrand: unique symbol;
export interface CompositeArtifact { readonly [artifactBrand]: true; id: string; sessionId: string;
  widthPx: number; heightPx: number; sha256: string; createdAt: string }
// The brand is applied ONLY inside src/lib/composite/build.ts.
export async function buildComposite(ctx: ServiceContext, sessionId: string, rasterize: RenderTools): Promise<CompositeArtifact>;
export async function loadArtifact(ctx: ServiceContext, sessionId: string, artifactId: string): Promise<{ artifact: CompositeArtifact; png: Blob }>;
```

- `buildComposite` loads the session, validates the confirmed or default selection (every id reviewed, templates
  match rows, no duplicates, ≥ 1 filled), runs `analyzeTarget` per slot, renders the SVG, rasterises to PNG, and
  computes sha256 with `crypto.subtle.digest('SHA-256', bytes)` (lowercase hex).
- In one transaction it stores `artifact:<id>:png`, `artifact:<id>:json`, appends `ArtifactMeta` to `session.artifacts`,
  and updates `lastChangeAt`.
- The JSON sidecar is `{ sessionId, createdAt, selection, perSlot: [{ photoId, template, position, result }], lightingSummary }`.
  It contains no image data and no GPS.
- `loadArtifact` re-verifies the sha256 of the stored PNG against `session.artifacts`. A mismatch or unknown id throws
  `ArtifactNotFoundError`.
- Share and download code accept **only** the result of `loadArtifact`.

## 7. Sharing (`src/lib/share/share-browser.ts`)

1. After build (or when the Composite tab opens with an existing artifact), **pre-load** the PNG Blob from IndexedDB so the
   share call happens directly inside the tap handler (iOS requires this).
2. **Share**: `const file = new File([png], '<session-slug>-shooting-analysis.png', { type: 'image/png' })`. If
   `navigator.canShare?.({ files: [file] })` → `await navigator.share({ files: [file], title: session.name })`.
   `AbortError` → return `cancelled` and record nothing.
3. Otherwise, **download**: create an object URL and click a temporary `<a download="<same name>">`, then revoke the URL
   after 60 s. Method `download`.
4. After success, `recordShare(ctx, sessionId, artifactId, method)`.
5. **Attach in Garmin Connect** card: (1) In the share sheet choose **Save Image**. (2) Open the Garmin Connect app.
   (3) Open the activity (usually the most recent). (4) Tap the camera icon and choose the saved image.

```ts
export async function shareArtifact(png: Blob, fileName: string, title: string): Promise<'web-share' | 'download' | 'cancelled'>;
```
