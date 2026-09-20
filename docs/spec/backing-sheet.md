# Spec: coloured backing sheet (optional)

Implements REV-38, placed by REV-48. Code: `src/lib/domain/backing.ts`, `src/lib/cv/backing-colour.ts` (pure), the **Backing
sheet** section of the Settings screen (`src/components/settings/*`), the card capture mode, and the colour path in Stage A step A5.

## 1. What it is

Some shooters put a brightly coloured (fluorescent) sheet **behind** the target. Every hole then shows that colour, and nothing
printed on the target does. The owner's first photo with a pink backing (`fixtures/private/backing/IMG_5189.jpeg`, 9 shots, one
overlapping pair) measured:

| | standard detector (M16 at `637fa11`) | colour only (probe) |
|---|---|---|
| real holes found | 8 of 8 | 8 of 8 |
| extra fragments of the same hole | 6 | 0 |
| false marks on paper | 3 | 0 |
| reported | 17 | 8 |

The overlapping pair's coloured area was **2.27×** the median single hole. One photo is evidence, not proof (see §7).

**Second test, with a card (2026-09-17):** the same sheet on an **orange** backing, card `IMG_5190.jpeg` and target `IMG_5191.jpeg`,
taken seconds apart in the same light and camera, run through §4 and §5 exactly as written here:

| | standard detector | colour from the card |
|---|---|---|
| card colour | — | hue 15.9° ± 2.4°, 100% of the card region accepted, value 0.85–0.97 across a visible light gradient |
| real holes found | 5 of 8 (missed the overlapping pair) | **8 of 8** |
| duplicates / false marks | 1 / 1 | **0 / 0** |
| overlapping pair | not found | flagged `possibleOverlap` at **1.91×** the median area |

The colour mask's only noise was thin **colour fringes along printed ring edges** (camera/JPEG chroma fringing): 1,509 specks, the
largest 21 px against a smallest real hole of 72 px. A 3×3 morphological opening removed every one and left exactly the 8 holes,
which is why §5 step 1 opens the mask before counting components.

**Third test, same card, a different sheet (`IMG_5193.jpeg`, 10 holes including one off the rings and two touching holes):**
the first settings found 8 shots — they merged a touching pair and missed a hole whose backing was **in shadow**. There the orange
measured brightness 0.19 and hue **0°** (dark orange reads as red); even the lit holes read 8–12°, redder than the card's 15.9°,
because backing seen through a hole is shaded compared with a card photographed in the open. The pair's centres were 4.8 mm apart,
inside the 5.6 mm merge distance. Tuned on both orange photos together:

| settings | IMG_5191 (8 holes, 1 overlap) | IMG_5193 (10 holes) |
|---|---|---|
| hue margin 12°, merge within 1.0 × hole diameter, **no opening** | 8 shots ✅ | 8 shots ❌ (1 missed, 1 pair merged) |
| hue margin 25°, merge within 0.6 × diameter, **no opening** | 11 shots ❌ (3 fringe false marks) | 10 shots ✅ |
| **hue margin 25°, merge within 0.6 × diameter, 3×3 opening** | **8 shots ✅, overlap flagged** | **10 shots ✅, no false marks** |

Two photos of one sheet type on one backing is still thin evidence; §7's photo set is what sets the constants.

**It is optional and out of the way.** The three-step flow does not change. A shooter who never uses a backing never meets it: it
lives on the Settings screen (REV-47, REV-48), not in the capture → metadata → analysis flow.

## 2. Where the option lives

> REV-38 first placed this per session, in a collapsed **Session options** row on the metadata screen. **Superseded by REV-48**
> (issue #2): the backing is a **Settings** choice that applies to every session, and Session options is removed.

- **Settings screen (`#/settings`), section Backing sheet:** a select **`Auto` (default)** / `None` / `Coloured backing`
  (owner, 2026-09-17). `Auto` decides per photo whether a coloured backing is present (§4a); `None` never uses colour;
  `Coloured backing` always does.
- **Photograph backing card** opens the capture screen in card mode (`#/settings/backing-card`, full screen, no tab bar) and,
  on *Use photo*, measures the card's colour (§4). A card with a clear colour stores that colour and returns to Settings, which
  shows it as a swatch; a card without one stores nothing and shows the §4.3 message. **Choose card photo** does the same from
  an imported photo. **The card photo itself is not kept** (issue #2 default): the colour signature is all detection uses, and
  the swatch is drawn from it. **Clear** removes the measured colour.
- The mode and colour apply to every session. **Changing them re-runs nothing** (issue #2 default): the setting applies to new
  photos and to any photo the user re-analyzes in Adjust, so a finished session's numbers never change behind the user's back.
  Each analysis records which backing it used (`pipeline.detection`, §3).
- No other screen shows it. The results screen and target detail do **not** show which detection path found the holes (REV-68): it
  is a core part of the program, not something to announce on every card. The choice is still recorded on the analysis (§3).

## 3. Data model

```ts
// src/lib/domain/backing.ts
export const ColourSignature = z.object({
  hueDeg: z.number().gte(0).lt(360),        // circular median hue of the backing
  hueSpreadDeg: z.number().gte(0).lte(90),  // half-width covering the p10..p90 hue range
  satP10: z.number().min(0).max(1),         // HSV saturation, 10th percentile of accepted pixels
  valP10: z.number().min(0).max(1),         // HSV value, 10th percentile
  samples: z.number().int().positive(),
});
export const BackingSheet = z.object({
  kind: z.literal('coloured'),
  source: z.enum(['card', 'estimated']),
  cardPhotoId: Id.nullable(),               // always null since REV-48 (the card photo is not kept); kept so old records parse
  colour: ColourSignature.nullable(),       // null until a card is measured or an estimate succeeds
});
```

- **`AppSettings.backingMode: 'auto' | 'none' | 'coloured'`** (default `'auto'`) and **`AppSettings.backing: BackingSheet | null`**
  are the setting itself (data-model §5). They replace REV-38's `lastBackingMode` / `lastBacking`.
- **`BiathlonSession` has no backing fields** (schema version **3**, REV-48). REV-38's `backingMode` / `backing` on the session
  (schema version 2) are removed by the migration in §3a.
- Each analysis records `pipeline.detection = { method: 'colour' | 'standard', backing: 'detected' | 'not-detected' | 'forced' | 'off',
  fallbackReason: string | null }`, so the owner can see why a photo was or wasn't treated as backed, and which setting it ran under.
- `PhotoOrigin` keeps `'backing-card'` so a record stored before REV-48 still parses during the migration; **nothing new is
  written with it**. Such a photo is **not a target**: it is excluded from Stage A and B, from photo counts, "Analyze N targets",
  results cards, the summary image and every share.
- Zod-validate on read, as for every store record.

## 3a. Migration (REV-48)

Runs once, when the app opens its database, in one transaction, before any screen or the pipeline reads a record:
1. **Settings:** `lastBackingMode` / `lastBacking` are copied to `backingMode` / `backing` (also done on every read, data-model §5).
2. **Lift:** if settings then holds **no backing** (`backing === null`), the most recently updated (`updatedAt`) schema-2
   session whose `backing` has a measured colour gives settings its `backingMode` and `backing` (with `cardPhotoId: null`).
   A backing already in settings is **never** replaced by a session's.
3. **Sessions:** every schema-2 session is rewritten as schema 3 without `backingMode` / `backing` (a schema-1 session is
   upgraded straight to 3).
4. **Card photos:** every photo with `origin: 'backing-card'` is deleted, with its analysis and its `photo:<pid>:*` /
   `diagram:<pid>:*` blobs — after step 2 has lifted its colour. Card photos were never in `session.photoIds`.

Nothing is re-analyzed by the migration.

## 4. Measuring the colour

**From a card photo** — `backingColourFromCard(img: RgbaImage): ColourSignature | null` (pure):
1. Take the central 60% × 60% of the image.
2. Convert to HSV. Keep pixels with `sat ≥ 0.30` and `val ≥ 0.25` (drops shadow, white and black).
3. If fewer than 30% of the region's pixels are kept, return `null` — the UI says *"Couldn't find a clear colour on this card. Retake it
   in even light, filling the frame."*
4. `hueDeg` = circular median of kept hues; `hueSpreadDeg` = half the circular p10..p90 range, clamped to ≤ 90;
   `satP10`, `valP10` = 10th percentiles; `samples` = kept count.

**Without a card — anything coloured is backing (owner, 2026-09-17).** The target is printed in black ink on white paper, so every
legitimate part of it is neutral (white, grey or black). With a backing sheet in use and no card, a pixel is backing when it is
**clearly coloured**:
1. **Neutralise the paper's colour cast** from the photo itself: take the median RGB of bright (`max ≥ 150`), low-chroma
   (`max − min < 40`) pixels in the search area as "white", and scale each channel so it becomes neutral. This removes warm or cool
   lighting, which would otherwise tint the whole sheet.
2. **Chroma** = `max(r,g,b) − min(r,g,b)` on the balanced pixel (0–255). Chroma, not HSV saturation, because saturation is unstable
   on dark pixels and backing seen through a shaded hole is dark.
3. A pixel is backing when chroma ≥ `NEUTRAL_CHROMA_MIN` (start **40**); then §5 from step 1's opening onward, unchanged.

Measured, no card and no hue, on every backing photo so far — the truth is the owner's count:

| photo | real holes | chroma ≥ 40 | ≥ 60 | ≥ 80 |
|---|---|---|---|---|
| IMG_5189 (pink) | 8 | **8** | 7 | 6 |
| IMG_5191 (orange) | 8 | **8** | 8 | 8 |
| IMG_5193 (orange) | 10 | **10** (incl. the hole off the rings) | 8 | 7 |

This matched the card-hue method exactly and needs no knowledge of the backing's colour. **The card remains useful** for one thing
chroma cannot do: telling the backing from **other colours on the sheet** — scores written in blue pen, a sticker, a coloured
staple. No pen mark happened to fall inside the search area on these three photos, so that risk is untested; when a card exists, a
coloured blob whose hue is far from the card's is ignored.

**This rule only helps when a backing is used.** On the owner's 46 photos without one, holes carry no colour at all: across 337
labelled holes the core chroma had median **9** (p10–p90 4–18) against plain paper or black at median 7 (2–28), an AUC of **0.56**, and
**none of the 337 reached 40**. Behind an unbacked hole is a dark gap or a neutral board. So the colour path must never run on a
photo without a backing — a stray coloured mark would become a false hole with nothing to gain.

**Constants** (`src/lib/cv/constants.ts`): every threshold above is provisional and must be measured on the backing photo set (§7).

## 4a. `Auto`: is a coloured backing present in this photo?

Pure `detectBackingPresence(img, calibration) → { present: boolean; spots: number; largestRatio: number }`, using the
neutral-chroma mask above (paper neutralised, chroma ≥ 40, 3×3 opening, merge within 0.6 × hole diameter):
- `spots` = merged coloured blobs of at least `0.08 ×` hole area inside the search area;
- `largestRatio` = the largest coloured blob's area ÷ one hole's area.

**Present** when `spots ≥ AUTO_MIN_SPOTS` (start **3**) **and** `largestRatio ≤ AUTO_MAX_BLOB_RATIO` (start **2.5**). A coloured area
far bigger than a hole is scenery, backing board or a sticker in frame, not a hole, and such a photo falls back to standard detection
(`backing: 'not-detected'`, `fallbackReason: 'large coloured area'`) rather than risk counting it.

Measured, every photo available on 2026-09-17:

| set | photos | coloured spots | largest coloured blob ÷ hole | Auto says |
|---|---|---|---|---|
| backed (pink, orange, red; precision and sighting) | 6 | 6–10 | **0.21–0.76** | **present, all 6** |
| unbacked, no colour at all | 31 | 0 | 0 | absent |
| unbacked, one small coloured mark (IMG_5084) | 1 | 1 | 0.34 | absent (fewer than 3) |
| unbacked, large coloured areas in frame (IMG_4743, 4770, 4771, 5057 2) | 4 | 6–11 | **4.6–585** | absent (area rule) |

Without the area rule those four unbacked photos would have been read as backed with 6–11 false holes each. The rule separates the
sets on this data, with a wide gap (0.76 vs 4.6); the sheet-area search of REV-36 should shrink the problem further by excluding
the board around the sheet. **Pen marks inside the target have not been tested** and are the known way to fool `Auto`.

**Two more rules (M19, owner's ruling on M19 Open question 1, issue #7).** Both are measured by the neutral-chroma probe only
(no card), and both must also hold for **present**:
- **Colour floor:** the most coloured accepted pixel's chroma (after the white balance, 0–255) must be at least
  `AUTO_MIN_CHROMA` (**124**). A backing sheet is fluorescent. Measured: backed photos 138–223 (IMG_5189, pink: 138;
  IMG_5198: 167), unbacked 42–110 (IMG_5182: 110); 124 is midway between 110 and 138 — a margin of only 14 either side.
  Fallback reason **`colour too dull for a backing`**.
- **Radial rule:** the coloured pixels' **10th-percentile distance** from the target centre (`AUTO_RADIUS_QUANTILE` 0.1) must
  be **at most the template's outer ring radius** (57.5 mm sighting / 77.2 mm precision) — holes are inside the rings, the board
  and scenery are not. Measured: 4–15 mm on backed photos against 101–133 mm on unbacked ones. Fallback reason
  **`colour outside the rings`**.

The rules are checked in order — large area, fewer than `AUTO_MIN_SPOTS` spots (`no coloured spots`), colour floor, radial rule —
and the first that fails is the recorded `fallbackReason`. The floor catches a bright board, the radial rule a dull one, so both
apply. All four Auto constants are provisional until the labelled backing set of §7 exists.

With `Auto`, the card colour in Settings is still used when there is one; otherwise the neutral-chroma rule applies.

**Backed sighting sheets (IMG_5194, 5196, 5198; red backing, no card), 2026-09-17:**

| photo | visible holes | colour, no card | standard detector | notes |
|---|---|---|---|---|
| IMG_5194 | 10 | **10**, no false marks | 7 | exact |
| IMG_5198 | 9 (one long tear, likely two shots) | **9**, no false marks; the tear at 3.4× the median area | 3 | with 10 rounds declared, REV-39 infers the double → 10 |
| IMG_5196 (tight group) | 8 | **6**, no false marks; 2 missed | 7 | the missed holes were almost covered by torn white fibres: 49–66 coloured pixels (max chroma ~72) against 135–159 (max 102–206) for found holes, so the opening removed them as speckle |

So far the colour path has produced **no false marks on any backed photo** (6 photos). Its failure mode is a hole whose backing barely
shows. On a declared-rounds target that becomes an assumed miss (REV-39) rather than a wrong hole — which is why the reconciliation
must still look for double punches first, and why the owner's re-rating is needed before trusting the misses.

**Known issue found on the way:** all three sighting sheets above were classified as **precision** by `hintTemplate` (M10 open
question 3, the median-4 tie). In the app the template normally comes from the capture choice or the metadata screen, so this only
bites imports without a template, but it also picks the wrong anchor diameter (112.4 vs 115 mm, 2.3% scale). M16 or M18 should fix
the hint rather than rely on the user.

## 5. Detection with a backing (Stage A, step A5)

When the Settings `backingMode` is `coloured`, or it is `auto` and §4a says present — using the card's colour when Settings has
one (hue test), otherwise the neutral-chroma test of §4. A5 and Adjust's **Re-analyze** both read the backing from Settings at the
moment they run (REV-48):
1. **Colour mask:** a pixel is backing-coloured when its circular hue distance to `hueDeg` is ≤ `hueSpreadDeg + BACKING_HUE_MARGIN_DEG`
   (start **25°** — backing seen through a hole is shaded, and shaded orange reads redder than the card; 12° missed a shaded hole
   on IMG_5193). **No minimum brightness** is applied: a shaded hole's backing measured value 0.19 at saturation 0.86 and `sat ≥ max(0.25, 0.7 × satP10)`, within the searched sheet area (REV-36). Then apply a **3×3 morphological
   opening** to the mask: printed-edge colour fringes are 1–2 px thin and vanish, while the coloured core of a hole survives
   (measured on IMG_5191: 1,517 components → exactly 8).
2. **Components** (8-neighbour), dropped below `BACKING_MIN_AREA_FRACTION × hole area` (start 0.08; the smallest real hole was
   0.11 of a hole's area on IMG_5189 and 0.11 on IMG_5191). After the opening this is a guard, not the main filter.
3. **Merge** components whose centroids are within `BACKING_MERGE_FRACTION × hole diameter` (start **0.6**, i.e. 3.4 mm for .22 LR);
   area-weighted centroid. The distance comes from the calibre (`holeDiameterMm`): fragments of one torn hole lie within a couple of
   millimetres, while two separate touching holes are about a diameter apart — merging within a full diameter joined a real pair
   4.8 mm apart on IMG_5193.
4. Each merged blob is one shot, `multiplicity: 1` (REV-28 still holds). Record its coloured area, and (M20) its
   `overlapRatio` = coloured area / the photo's median blob area, stored on the shot as reconciliation's overlap evidence.
5. **Overlap hint, not a count:** a blob whose area ≥ `BACKING_OVERLAP_RATIO × median blob area` (start 1.8) is flagged
   `possibleOverlap: true`. It does not change multiplicity; Adjust (M17) shows it so the owner can add the second shot in one tap.
   **Elongated tears also enlarge the coloured area** (both flags on IMG_5193 sit on long tears), so the hint is
   **consumed by REV-39's reconciliation (M20 step 5), which only infers a double when rounds are short** — if every round is
   already accounted for, an overlap is impossible and the flag is suppressed.
6. **Fallback:** if the colour path yields **zero** blobs, run the standard detector (M16) instead and add warning
   `backing-colour-not-found`. The analysis records `pipeline.detection = { method: 'colour' | 'standard', fallbackReason: string | null }`.
7. Reconciliation to the declared rounds (REV-39, geometry-scoring §8.3 — every colour-path hole is confident, so extra holes
   reject the target rather than being capped) and manual-shot protection (analysis-pipeline §8) apply.

**Changing the backing** (mode, card or colour) in Settings **re-runs nothing** (REV-48, issue #2 default). It applies to photos
analyzed from then on and to any photo the user re-analyzes. REV-38's rule — changing a session's backing set its photos' Stage A
back to pending — is superseded with the per-session backing.

## 6. Reasons

| Reason | Message |
|---|---|
| `backing-colour-not-found` | No backing colour showed through the holes, so standard detection was used. Check the backing card or lighting. |

Appended like other pipeline warnings (analysis-pipeline §4); it does not change status by itself.

## 7. Evidence still needed

One photo cannot set thresholds. Before the colour path ships as the default for backing sessions, the owner provides at least
**10 target photos with the backing**, across sun, shade and indoor light, **each with a card photo in the same light**, labelled with
`pnpm review:detection` (which must show the colour path's result and the card swatch). Gate, provisional: recall ≥ 0.95 and
precision ≥ 0.95 on those photos, and the colour path must beat the standard detector on every one it is used on.
