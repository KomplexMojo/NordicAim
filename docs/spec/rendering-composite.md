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
   - **Precision**: centre (790, 690), s = 6.35 px/mm; halo r 82.7 white stroke `panelBorder` 1.5; ring lines n = 1…3 stroke
     `ringOnLight` 2.5; black disc r 56.2 `discPrecision`; ring lines n = 4…10 `ringOnDark` 2; inner ten r 2.5 `ringOnDark` 1.5 dash
     `4 3`; labels (class `ring-label`) n = 1…9 at x = cx + ((r_n + r_{n+1})/2)·s, y = cy + 6, 17 bold, `ringOnDark` if midpoint < 56.2
     else `textPrimary`; "10" at (cx + 1.5·s, cy − 3·s) 13 px.
6. **Group ellipse** (non-null): at the MPI, rx = rxMm·s, ry = ryMm·s, stroke `ellipse` 2, `transform="rotate(${-angleDeg} X Y)"`
   (negative: CCW target angle → clockwise SVG rotation).
7. **Shots** (class `shot`): one circle per `Shot`, r = max(7, (holeDiameterMm/2)·s), × 1.25 if multiplicity > 1; fill by the position
   of unit 0; white stroke 2. `x<k>` label 15 bold `accentText` at (X + 10, Y − 14) when k > 1.
8. **MPI** (`all` subset): ±14 px lines stroke `mpi` 2.5, circle r 6, "MPI" 15 bold at (X + 18, Y − 8).
9. **Precision RESULTS panel** (48, 210, 272, 510) rx 10:
   - "RESULTS" 18 at (68, 244); `<declared> shots` 13 at (68, 268)
   - rows (class `results-row`) n = 10…0 at y = 304 + 28·i: number right-aligned x 96; `x<count>` or `-` at x 108
   - divider y 650
   - total 22 bold at (68, 686): `Total  <identifiedTotal> / <maxPossible>`, or `Total  <pessimistic>–<optimistic> / <maxPossible>` when missing > 0.
10. **Footer panel** (48, 1240, 1404, 420) rx 16; lines at x 72 from y 1290, step 34, 17 px (first line 18 px). Formats: mm 1 dp,
    MOA/MRAD 2 dp, averages 1 dp; unavailable `—`.
    - **Sighting**:
      1. `Group metrics`
      2. `Shots: <identified> identified of <declared>` (+ ` · largest cluster x<k>`)
      3. `Group size (extreme spread): <es> mm`
      4. `Angular size @ 50 m: <moa> MOA · <mrad> MRAD`
      5. `vs 45 mm prone: <h> hit / <m> miss   ·   vs 115 mm standing: <h> hit / <m> miss`
      6. `Scored (<positionLabel>): <hits> hit / <misses> miss` (+ ` · range <pess>–<opt> hits (avg <avg>)` when missing > 0)
      7. `MPI offset: <|x|> mm <R|L> · <|y|> mm <U|D> (<|xMoa|> / <|yMoa|> MOA)`
    - **Precision**:
      1. `Scoring summary`
      2. `Shots: <identified> identified of <declared>` (+ cluster note)
      3. `Total: <identifiedTotal> / <maxPossible> · X count <xCount>`
      4. `Range: pessimistic <p> · averaged <a> · optimistic <o>`
      5. `Group size: <es> mm · <moa> MOA · <mrad> MRAD @ 50 m`
      6. `MPI offset: …`
      7. (both) `Prone: <total>/<max> · Standing: <total>/<max>`

Expose line builders as pure functions: `sightingFooterLines`, `precisionFooterLines`, `cellCaption`, `targetHeadline` (used by
result cards: precision `72 / 100 · X 1`, or `66–76 / 100` when missing; sighting `9/10 hits @ 45 mm`; both: `Prone … · Standing …`).

**Golden check** (from `fixtures/reference/sample-shots-*.json`): precision SVG contains `Total  72 / 100`, `x2`, `41.9 mm`, `2.88 MOA`,
`0.84 MRAD`. Sighting SVG contains `9 hit / 1 miss`, `10 hit / 0 miss`, `27.7 mm`, `1.90 MOA`, `0.55 MRAD`, `x4`.

## 4. `cell` variant (720 × 720)

- Target centre (360, 350); s = 300 / haloRadiusMm (sighting 4.8, precision ≈ 3.6276). Same target, ellipse, shots (min r 5), MPI.
  Precision ring labels omitted when s < 4.
- Chip (20, 20, 16 + 9·chars, 36) rx 18 `panel`; 15 bold uppercase `<TEMPLATE> <slot> · <POSITION>`.
- Caption band (0, 668, 720, 52) `panel`; centred 17 px at y 700:
  - sighting `<hits>/<declared> hit @ <45|115> mm · ES <es> mm · <moa> MOA` (both: `P <h>/<d> · S <h>/<d>`)
  - precision `<total>/<max> · X <x> · ES <es> mm · <moa> MOA`
  - append ` · range <p>–<o>` when missing > 0.

## 5. Session summary image (`src/lib/render/composite.ts`)

```ts
export interface SlotData { photo: TargetPhoto; analysis: TargetAnalysis; result: AnalysisResult }
export interface CompositeInput {
  session: BiathlonSession;
  slots: { sighting: [SlotData | null, SlotData | null]; precision: [SlotData | null, SlotData | null] };
  generatedAtLocal: string;     // "2026-09-05 17:20"
  holeDiameterMm: number;
}
export function compositeHeight(sightingRow: 0 | 1, precisionRow: 0 | 1): number;
export function renderCompositeSvg(input: CompositeInput): string;
export interface SlotIds { sighting: [string | null, string | null]; precision: [string | null, string | null] }
export function selectDefaultSlots(photos: TargetPhoto[], analyses: Map<string, TargetAnalysis>): SlotIds;
```

- Width **1440**; height `120 + 720 × rows + 600`, where rows = (any sighting ? 1 : 0) + (any precision ? 1 : 0); zero rows →
  `EmptyCompositeError`.
- **Header** (0, 0, 1440, 120) `header`: `Shooting analysis — <session.name>` 36 bold white at (40, 58); subtitle 18 `#CFE6F3` at
  (40, 94): `<sessionDate> · <lightingSummary>` (shared label if all slots agree, else `mixed lighting`).
- **Rows**: sighting row first, then precision, 720 tall each. Slot 1 at x 0, slot 2 at x 720, as nested
  `<svg x y width="720" height="720" viewBox="0 0 720 720">` using the cell renderer. A row with one filled slot puts it at x 0 and a
  **stat card** at x 720: rect (744, y+24, 672, 672) rx 16 `panel`, the target's full-variant footer lines at 20 px from (776, y+84),
  step 40.
- **Analysis band** at y = 120 + 720·rows, height 600: `panel`, 8 px `accent` rail.
  - `Session analysis` 24 bold at (40, y+56).
  - Lines 18 px from y+100, step 34, each ≤ 110 chars (`…`):
    1. `Targets: <nS> sighting · <nP> precision · <lightingSummary>`
    2. One per filled slot (≤ 4): e.g. `Sighting 1 (prone): 9/10 hit @45 mm · ES 27.7 mm (1.90 MOA) · MPI 9.7 R / 3.9 U mm`,
       `Precision 1 (prone): 72/100 (range 72–72) · X 1 · ES 41.9 mm (2.88 MOA)`
    3. If there are more analyzed targets than slots: `+<n> more target(s) in the app`
    4. If `session.notes`: `Notes: <notes>` (≤ 2 lines).
  - Footer 13 `textSecondary` at (40, y+572): `advanced-shooting-analysis · generated <generatedAtLocal>`.

**Height vectors**: (2, 2) → 2160; (1, 1) → 2160; (0, 1) → 1440; (2, 0) → 1440; (0, 0) → throws.

**Slot selection (automatic, pure)**: candidates per template = photos with `status === 'analyzed'`, sorted by `captureTime.utc`
descending (null last, then `importedAt` descending). Break ties with the better result (precision: higher `identifiedTotal`;
sighting: smaller `extremeSpreadMm`, null worst). Take the first two, then order chronologically (older = slot 1). Returns photo ids.

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
