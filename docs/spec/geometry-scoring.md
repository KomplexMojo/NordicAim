# Spec: geometry and scoring

Source of truth for template geometry, coordinate conventions, scoring rules, group metrics, the `both`
split, and missing-round modes. Everything here is **pure math**. Implementation lives in
`src/lib/defaults/`, `src/lib/geometry/`, and `src/lib/scoring/`.

Numeric tolerance in tests: `1e-6` unless a vector states otherwise. Boundary comparisons are
**inclusive** with `EPS = 1e-9` (`d <= limit + EPS`).

---

## 1. Constants

### 1.1 Biathlon profile (`src/lib/defaults/biathlon.ts`)

```ts
export const BIATHLON_50M = {
  id: 'biathlon-50m',
  label: 'Biathlon 50 m',
  distanceM: 50,
  holeDiameterMm: 5.6,          // .22 LR; used by the touch rule
  caliberHint: '.22 LR',
  clickValueMm: null as number | null, // mm at 50 m per sight click; null = hide correction hint (Q3)
  defaults: {
    precisionRounds: 10,
    sightingRounds: 10,
    competitionBoutRoundsPerPosition: 5,
    bothRoundsProne: 5,
    bothRoundsStanding: 5,
  },
} as const;
```

### 1.2 Sighting template (`src/lib/defaults/templates.ts`)

```ts
export const SIGHTING_TEMPLATE = {
  id: 'sighting',
  label: 'Sighting / Zeroing',
  sheetTitle: 'Caledonia Nordic Ski Club – Biathlon (sighting-in sheet)',
  anchor: { kind: 'dark-disc', diameterMm: 115 },
  zones: {
    prone:    { solidDiameterMm: 45,  guideDiameterMm: 40 },
    standing: { solidDiameterMm: 115, guideDiameterMm: 110 },
  },
  unscoredCircles: [{ diameterMm: 15, note: 'unlabelled inner aiming circle; approximate, measure in M09' }],
  haloDiameterMm: 125,          // decorative light-blue halo used by the renderer
  referenceImage: 'docs/reference/IMG_5057-sighting.jpg',
} as const;
```

### 1.3 Precision template (ISSF 50 m rifle)

```ts
export const PRECISION_TEMPLATE = {
  id: 'precision',
  label: 'Precision — Olympic 50m Rifle',
  sheetTitle: 'Olympic 50 Meter Rifle Target – Single shot Test (10 shots)',
  anchor: { kind: 'dark-disc', diameterMm: 112.4 },   // black aiming mark
  innerTenDiameterMm: 5.0,                            // "Inner Circle" – scores 10, counted as X
  ringDiameterMm: { 10: 10.4, 9: 26.4, 8: 42.4, 7: 58.4, 6: 74.4, 5: 90.4, 4: 106.4, 3: 122.4, 2: 138.4, 1: 154.4 },
  blackDiameterMm: 112.4,
  haloDiameterMm: 165.4,
  scoringKey: ['Inner Circle = 10', '1st Ring = 10', '2nd Ring = 9'],
  referenceImage: 'docs/reference/IMG_5132-precision.jpg',
} as const;
```

Formula check: `ringDiameterMm[n] = 10.4 + 16 * (10 - n)` for n = 10…1. Test it.

## 2. Coordinates

- **Target space (mm)**: origin at the template centre, **+x right, +y up**. Every `Shot` stores `xMm`, `yMm`.
- **Image space (px)**: origin at the top-left of `working.jpg`, +x right, **+y down**.
- **Calibration** (see `spec/data-model.md` §3) maps between them using the anchor disc, which appears as an
  ellipse in the photo: centre `(cx, cy)` px, semi-major radius `radiusPx` (the anchor's radius along its
  major axis), `axisRatio` = minor/major ∈ (0, 1], and `angleDeg` = major-axis direction measured
  **clockwise from image +x** (image convention).
- `scale = radiusPx / (anchor.diameterMm / 2)` px per mm along the major axis.

### 2.1 Transform (`src/lib/geometry/transform.ts`)

```ts
export function mmToPx(p: { xMm: number; yMm: number }, cal: Calibration): { x: number; y: number };
export function pxToMm(p: { x: number; y: number }, cal: Calibration): { xMm: number; yMm: number };
```

Algorithm for `mmToPx`, with θ = `angleDeg` in radians and `s` = scale:
1. `u = xMm * s`, `v = -yMm * s` (flip y into image orientation).
2. Compress the minor axis. Rotate into the ellipse frame: `u' = u cosθ + v sinθ`, `v' = -u sinθ + v cosθ`;
   then `v' *= axisRatio`.
3. Rotate back: `x = cx + u' cosθ - v' sinθ`, `y = cy + u' sinθ + v' cosθ`.

`pxToMm` is the exact inverse (undo step 3, divide `v'` by `axisRatio`, undo step 2, divide by `s`, flip y).

**Vectors** (cal = `{cx: 1000, cy: 800, radiusPx: 460, axisRatio: 1, angleDeg: 0}`, sighting anchor 115 mm → s = 8):
- `mmToPx({0,0})` → `{1000, 800}`
- `mmToPx({10, 5})` → `{1080, 760}`
- `pxToMm({1080, 760})` → `{10, 5}`
- With `axisRatio: 0.5, angleDeg: 90`: `mmToPx({10, 5})` → `{1040, 760}`. At 90° the major axis is
  image-vertical, so vertical offsets are unchanged (−40 px) and horizontal offsets are halved (+80 → +40 px).
  Round-trip `pxToMm({1040, 760})` → `{10, 5}`.
- Property test: for 100 random points and random calibrations, `pxToMm(mmToPx(p)) ≈ p` within 1e-9.

## 3. Shot units

A `Shot` has `multiplicity k ≥ 1`. **Expansion** turns it into k *units* at identical coordinates,
`unitIndex = 0..k-1`. Every count, score, MPI, and split works on **units**. Extreme spread uses unit
coordinates, so duplicates add nothing.

`radialMm = hypot(xMm, yMm)` (distance from the **target centre**, not from the MPI).

Hole radius `h = holeDiameterMm / 2 = 2.8`.

## 4. Precision scoring (touch rule)

A unit scores ring **n** (the highest n ∈ 10…1) for which `radialMm - h <= ringDiameterMm[n] / 2`, i.e. the
hole touches or is inside ring n's outer edge. If there is no such n, the score is **0**.
**X** (inner ten): `radialMm - h <= innerTenDiameterMm / 2`. X always also scores 10.

Equivalent thresholds on `radialMm` (h = 2.8):

| Score | radialMm ≤ |
|---|---|
| X (10) | 5.3 |
| 10 | 8.0 |
| 9 | 16.0 |
| 8 | 24.0 |
| 7 | 32.0 |
| 6 | 40.0 |
| 5 | 48.0 |
| 4 | 56.0 |
| 3 | 64.0 |
| 2 | 72.0 |
| 1 | 80.0 |
| 0 | otherwise |

**Vectors** (`scoreRing(radialMm) → {ring, isX}`): 0 → {10, X}; 5.3 → {10, X}; 5.31 → {10, not X};
8.0 → 10; 8.01 → 9; 16.0 → 9; 24.0 → 8; 24.0001 → 7; 40 → 6; 79.99 → 1; 80.0 → 1; 80.01 → 0.

Tally: `tally[0..10]` = count of units per ring. `identifiedTotal = Σ ring`. `xCount` = count of X units.

## 5. Sighting zones

For a unit with position `p ∈ {prone, standing}`, using `zones[p]`:
- `R = solidDiameterMm / 2`, `G = guideDiameterMm / 2`.
- **clean** if `radialMm <= G` (hole centre inside the dotted guide).
- else **hit** if `radialMm - h <= R` (hole touches the solid circle).
- else **miss**.
- `hits` counts clean + hit. `clean` counts clean only.

Thresholds (h = 2.8): prone clean ≤ 20.0, prone hit ≤ 25.3; standing clean ≤ 55.0, standing hit ≤ 60.3.

**Vectors** (prone): 0 → clean; 20.0 → clean; 20.01 → hit; 25.3 → hit; 25.31 → miss.
(standing): 55.0 → clean; 60.3 → hit; 60.31 → miss.

## 6. Group metrics (per subset of units)

Let the units be `(x_i, y_i)` for i = 1..N, each with weight 1.

| Metric | Definition | Undefined when |
|---|---|---|
| `mpi` | `(mean x, mean y)` | N = 0 |
| `extremeSpreadMm` | max Euclidean distance over all unit pairs | < 2 **distinct** coordinates (return `null`) |
| `meanRadiusMm` | mean distance of units from `mpi` | N = 0 |
| `groupEllipse` | 2σ covariance ellipse, see below | N < 3 or < 3 distinct coordinates or degenerate (λ2 = 0 and λ1 = 0) |
| `angular(sizeMm)` | `rad = 2*atan(sizeMm / (2*distanceMm))`; `moa = rad * (180/π) * 60`; `mrad = rad * 1000` | size null |
| `mpiOffset` | per axis: `rad = atan(mpi.x / distanceMm)` → `xMoa`, `xMrad`; same for y. Also `xMm`, `yMm` | mpi null |

`distanceMm = distanceM * 1000 = 50000`.

**Group ellipse (population covariance):** `a = mean((x-x̄)²)`, `c = mean((y-ȳ)²)`, `b = mean((x-x̄)(y-ȳ))`.
`λ1,2 = (a+c)/2 ± sqrt(((a-c)/2)² + b²)`. `rxMm = 2*sqrt(λ1)` (semi-major), `ryMm = 2*sqrt(max(λ2,0))`.
`angleDeg = 0.5 * atan2(2b, a - c)` converted to degrees, **counter-clockwise from +x in target space**,
normalised to `[0, 180)`. Centre = `mpi`.

**Vectors**
- ES of `(0,0),(3,4)` = 5. ES of a single unit = `null`. ES of `(1,1)×3` = `null`.
- `angular(25)` → moa 1.718873 (±1e-5), mrad 0.500000 (±1e-6). `angular(27.7)` → moa 1.904507, mrad 0.554.
  `angular(41.9)` → moa 2.880834, mrad 0.838.
- 1 MOA at 50 m ≈ 14.5444 mm: `angular(14.5444).moa` ≈ 1.0000 (±1e-4).
- Ellipse of `(-1,0),(1,0),(0,2),(0,-2)` → centre (0,0), rx 2.828427, ry 1.414214, angle 90.
- Ellipse of `(1,1),(2,2),(3,3)` → angle 45, ry 0 → still returned (ry = 0 is allowed; only the all-zero case is null).

**Sight-correction hint (post-MVP, backlog B8; do not implement in the MVP)** (only if `clickValueMm` is set): `moveRightMm = -mpi.x`, `moveUpMm = -mpi.y`;
clicks = `round(|move| / clickValueMm)`; words: `R`/`L` and `U`/`D`. Example: mpi (9.7, 3.85), click 6 →
"move group 9.7 mm left, 3.9 mm down (≈2 L, 1 D)". Pure function `sightCorrection(mpi, clickValueMm)`.

## 7. Declared rounds and the `both` split

`declaredRounds(categorization)`:
- `prone` → `roundsProne`
- `standing` → `roundsStanding`
- `both` → `roundsProne + roundsStanding`

**Position assignment** (`assignPositions(units, categorization, overrides)`):
1. `prone` or `standing`: every unit gets that position.
2. `both`, with S = `roundsStanding`:
   - Sort units by `radialMm` **descending**. Break ties by `shotId` ascending (string compare), then `unitIndex` ascending.
   - The first `min(S, N)` units are `standing`; the rest are `prone`.
   - Then apply per-unit overrides (`Shot.positionOverrides[unitIndex]` when not null), which win.
3. Subsets: `prone` units and `standing` units. The `all` subset is every unit.

Per-subset declared rounds: prone subset → `roundsProne`, standing subset → `roundsStanding`. For single-position
targets there is exactly one subset, plus `all`, which equals it.

**Vector** (both, S = 2, roundsProne = 3): shots A(r=3), B(r=30), C(r=10), D(r=45, k=2).
Units sorted: D#0, D#1, B, C, A → standing = {D#0, D#1}; prone = {B, C, A}.

## 8. Missing and over-count (per subset)

`identified = number of units in the subset`, `missing = max(0, declared - identified)`,
`overcount = max(0, identified - declared)`.
If `overcount > 0`, raise warning `overcount` and set all three modes equal to the identified-only result.

### 8.1 Precision modes

With identified ring values `v_i`:
- **optimistic** = `identifiedTotal + missing * max(v)`
- **pessimistic** = `identifiedTotal + missing * min(v)`
- **averaged** = `identifiedTotal + missing * mean(v)` (may be fractional; display with 1 decimal)
- If `identified = 0`, all three = 0.
- `maxPossible = declared * 10`.
- For the `all` subset of a `both` target, each mode is the **sum** of the prone and standing subset values.

**Vector:** declared 10, identified rings [10, 9, 8, 8, 7] → identifiedTotal 42, missing 5 → optimistic 92,
pessimistic 77, averaged 84.0.

### 8.2 Sighting modes

For the subset's zone, with identified units U and `hitsId` = hits among U:
- **optimistic**: the `missing` units are placed at the coordinates of the unit with the **smallest** `radialMm`
  (ties: first by sort order of §7). They are counted as that unit's outcome. hits = hitsId + missing × (best is hit ? 1 : 0).
- **pessimistic**: the `missing` units are placed at the coordinates of the unit with the **largest** `radialMm`
  and are **always counted as misses**. hits = hitsId.
- **averaged**: the `missing` units are placed at the identified `mpi`. hits = hitsId + missing × (hitsId / |U|),
  fractional.
- For each mode, report `{ hits, misses: declared - hits, mpi }`, where the mpi is computed over identified +
  placed units. ES and the ellipse are **identified-only** (placed duplicates never change ES).
- If `|U| = 0`: every mode has hits 0 and mpi null.
- `all` subset for a `both` target: hits are summed over subsets; mpi is computed over the union of each subset's placed units.

**Vector** (prone, declared 5): identified (0,5), (10,0), (30,0) → radial 5, 10, 30 → hit, hit, miss (hitsId = 2), missing 2.
- optimistic: place 2 at (0,5) → hits 4; mpi (8, 3).
- pessimistic: place 2 at (30,0) → hits 2; mpi (20, 1).
- averaged: identified mpi (13.333333, 1.666667); place 2 there → mpi unchanged; hits 2 + 2×(2/3) = 3.333333.

## 9. Golden example parity (from the owner's example diagrams)

These fixtures were traced from `docs/reference/example-diagram-*.png` and reproduce the example numbers.
Files: `fixtures/reference/sample-shots-precision.json` and `fixtures/reference/sample-shots-sighting.json`.

### 9.1 Precision (position `prone`, roundsProne 10)

| id | xMm | yMm | k | radialMm | ring |
|---|---|---|---|---|---|
| P1 | 1.4 | -0.8 | 1 | 1.612 | 10 (X) |
| P2 | -7.6 | -9.4 | 1 | 12.088 | 9 |
| P3 | -11.0 | -13.4 | 1 | 17.337 | 8 |
| P4 | -5.4 | -15.4 | 1 | 16.319 | 8 |
| P5 | -15.6 | -18.9 | 1 | 24.507 | 7 |
| P6 | -10.4 | -22.3 | 1 | 24.606 | 7 |
| P7 | -25.0 | -23.9 | 1 | 34.586 | 6 |
| P8 | -20.6 | -26.5 | 2 | 33.565 | 6 ×2 |
| P9 | -30.1 | -28.4 | 1 | 41.383 | 5 |

Expected: tally {10:1, 9:1, 8:2, 7:2, 6:3, 5:1}; identifiedTotal **72**; xCount 1; identified 10; missing 0;
all modes 72; ES **41.881** (±0.001, pair P1–P9); ES moa **2.8795** (±0.0005); mrad **0.8376** (±0.0005);
mpi **(-14.49, -18.55)** (±1e-6).

### 9.2 Sighting (position `prone`, roundsProne 10)

| id | xMm | yMm | k | radialMm | prone zone | standing zone |
|---|---|---|---|---|---|---|
| S1 | 5.0 | 12.5 | 1 | 13.463 | clean | clean |
| S2 | 7.5 | 9.0 | 4 | 11.715 | clean | clean |
| S3 | 11.0 | 6.5 | 1 | 12.777 | clean | clean |
| S4 | 14.0 | 4.0 | 1 | 14.560 | clean | clean |
| S5 | 27.5 | -2.5 | 1 | 27.613 | **miss** | clean |
| S6 | 8.0 | -6.0 | 1 | 10.000 | clean | clean |
| S7 | 1.5 | -12.0 | 1 | 12.093 | clean | clean |

Expected (prone): hits **9**, misses **1**, clean 9; identified 10; ES **27.681** (±0.001, pair S5–S7);
moa **1.9032** (±0.0005); mrad **0.5536** (±0.0005); mpi **(9.7, 3.85)**; meanRadius **8.624** (±0.001).
If the same shots are re-categorized `standing` (roundsStanding 10): hits **10**, misses 0.

## 10. `analyzeTarget` contract (`src/lib/scoring/analyze.ts`)

```ts
export const ENGINE_VERSION = '1';
export function analyzeTarget(input: {
  template: 'sighting' | 'precision';
  categorization: Categorization;   // must be complete (template, position, rounds)
  shots: Shot[];
  profile?: typeof BIATHLON_50M;    // default BIATHLON_50M
}): AnalysisResult;                 // shape in spec/data-model.md §4
```

It throws `IncompleteCategorizationError` if the position or a required rounds field is missing. It has no
other side effects.
