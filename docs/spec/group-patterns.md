# Spec (DRAFT, post-MVP): group pattern recognition and coaching recommendations

> **Status: draft, backlog B12.** Not part of the MVP and not to be implemented until the owner approves it, a coach
> validates the thresholds and cause mappings, and a milestone is written. Numbers marked *provisional* are starting
> points for that validation, not decisions.

## 1. Requirement

Owner (2026-09-15): *"In the generated analysis from this program, if there is an obvious pattern to the shots it should
provide a recommendation of what could be affecting the shooter's performance."*

## 2. Source

The pattern catalogue below is based on **Biathlon Canada, *Technical Coaching Manual* (2010), Chapter 4 – Shooting,
figure 4.43 "Common shooting groups"**, supplied by the owner (not stored in this repo). The figure is copyrighted, so the
patterns are described here in our own words. Do not copy the figure or its text into the app or the repo. Cite the source
in the UI's "About these suggestions" text.

## 3. Principles

1. **Only when obvious.** Show a finding only when its confidence ≥ **0.7** (*provisional*) and the subset has **≥ 5
   identified shots**. Otherwise show nothing. A wrong suggestion is worse than none (optimise for precision over recall).
2. **Possible causes, not verdicts.** Wording: "This pattern often comes from … Things to check: …". Always include the
   disclaimer "Suggestions are based on group shape only; confirm with your coach."
3. **At most 2 findings per target subset**, highest confidence first.
4. **Tight and centred earns a positive note**, not a recommendation.
5. **Position-aware.** Prone-only causes (sling, elbows, prone position) are never suggested for standing subsets, and vice versa.
6. **Handedness-aware.** Mappings assume a right-handed shooter. For a left-handed shooter, mirror left↔right in the
   pattern signatures (new setting, see §9).
7. **Per subset.** For `both` targets, evaluate prone and standing subsets separately (geometry-scoring §7).
8. **Deterministic and pure.** Same inputs → same findings; implemented in `src/lib/patterns/*` over `AnalysisResult`.

## 4. Features (all derivable from the existing `SubsetResult`, no new CV)

| Feature | Definition (target mm, +y up) |
|---|---|
| `n` | identified units in the subset |
| `offsetMm`, `offsetDir` | MPI distance from centre; direction as 8-point compass (N, NE, … ) with a dead zone when `offsetMm` is small |
| `es`, `meanRadius` | from geometry-scoring §6 |
| `elongation` | `groupEllipse.rxMm / max(groupEllipse.ryMm, 0.5)` |
| `axisAngle` | `groupEllipse.angleDeg` (0° = horizontal, 90° = vertical, CCW) |
| `flyers` | units whose distance from the median centre of the other units is > **2.5 ×** those units' median radius (*provisional*) |
| `twoClusters` | 2-means split where the centroid separation is > **2 ×** the larger within-cluster mean radius and each cluster has ≥ 2 units (*provisional*) |
| `order` (optional) | shot sequence numbers, **not captured today**; enables "walking" patterns (§9) |

**Size scales** (*provisional*, relative to the position's zone so prone and standing are comparable):

| Term | Prone (45 mm zone) | Standing (115 mm zone) |
|---|---|---|
| tight | ES ≤ 20 mm | ES ≤ 45 mm |
| scattered | ES ≥ 40 mm | ES ≥ 95 mm |
| offset is significant | `offsetMm ≥ max(6 mm, 0.4 × ES)` | `offsetMm ≥ max(12 mm, 0.4 × ES)` |
| stringing | `elongation ≥ 2.2` and `ES ≥ 12 mm` | `elongation ≥ 2.2` and `ES ≥ 25 mm` |

## 5. Pattern catalogue (right-handed shooter)

| ID | Signature | Needs shot order | Positions | Possible causes (paraphrased from the source) | Things to check |
|---|---|---|---|---|---|
| G1 | tight, offset not significant | no | any | None, a good group | Positive note only |
| G2 | tight, offset significant | no | any | Incorrect zero. For prone groups high on the target, the butt sitting too low in the shoulder. | Sight adjustment (links to backlog B8 correction hint); butt placement |
| G3 | scattered, elongation < 1.6, no flyers | no | any | Unsound fundamentals; sight-picture alignment; ammunition, barrel wear or loose bedding screws | Dry-fire fundamentals; sight alignment; equipment check |
| G4 | vertical stringing (`axisAngle` 70–110°) | no | prone | Inconsistent breathing routine; sling too loose | Breath control; sling tension |
| G4s | vertical stringing | no | standing | Poor timing as the rifle comes onto the target | Shot timing / hold routine |
| G5 | vertical stringing whose order moves steadily in one direction | **yes** | prone | Sling slipping during the series | Sling position and cuff |
| G6 | horizontal stringing (`axisAngle` ≤ 20° or ≥ 160°) | no | any | Changing wind during the series | Wind flags, hold-off; with order: drift direction matches wind change |
| G6p | horizontal stringing **and** MPI offset W | no | prone | Left elbow placed too far under the rifle | Left elbow position |
| G7 | diagonal stringing low-left → high-right (`axisAngle` 25–65°), MPI SW | no | prone | Sling too tight | Sling tension |
| G8 | diagonal stringing high-left → low-right (`axisAngle` 115–155°), MPI NW | no | prone | Right elbow sliding outward | Right elbow placement / mat grip |
| G9 | two clusters | no (stronger with order) | prone | Position changed between shots; change in light | Re-check position between shots; light conditions (links to photo lighting) |
| G10 | compact group plus 1–2 flyers | no | any | Trigger control problems; flinching or distraction | Trigger follow-through; focus routine |
| G11 | compact, small significant offset SW/W | no | any | Trigger finger placement | Finger position on the trigger |
| G12 | compact, significant offset NW/N with slight spread | no | prone | Natural point of aim not set | Natural alignment check before firing |

Notes:
- Several signatures overlap (for example G2 vs G11 vs G12 are all offset groups). The classifier scores every candidate and
  keeps the top 2 above the confidence threshold. Ties favour the more general cause (G2 zero before G11/G12).
- Direction mappings for G6p–G8, G11, G12 are an interpretation of small diagram sketches and **must be confirmed by a coach**
  before implementation (Q1).

## 6. Output model

```ts
export interface PatternFinding {
  id: 'G1' | 'G2' | 'G3' | 'G4' | 'G4s' | 'G5' | 'G6' | 'G6p' | 'G7' | 'G8' | 'G9' | 'G10' | 'G11' | 'G12';
  subset: 'prone' | 'standing' | 'all';
  confidence: number;          // 0..1
  evidence: string[];          // e.g. "Vertical spread 3.1× horizontal", "Group centre 9 mm high"
  causes: string[];            // plain-language possible causes
  checks: string[];            // things to check
}
export function detectPatterns(result: AnalysisResult, ctx: { handedness: 'right' | 'left'; order?: Record<string, number> }): PatternFinding[];
```

Stored alongside `analysis.computed` (for example `computed.patterns`) when implemented. Engine version bump required.

## 7. Where it appears

- **Results target card:** a "Coaching suggestions" section (0–2 findings) with evidence, causes, checks and the disclaimer.
- **Target detail:** the same, plus the group ellipse highlighted on the diagram.
- **Session summary image:** one line per slot, for example `Precision 1 (prone): vertical stringing — check breathing routine, sling tension`.
- **Harness (backlog B3):** recurring patterns across sessions ("vertical stringing in 4 of the last 6 prone series").

## 8. Validation plan (before any milestone)

1. **Synthetic generator**: produce shot sets for each signature with noise. Unit vectors assert the expected top finding
   and that G1 shows no recommendation.
2. **Owner-labelled real targets**: photograph series where the cause is known (for example deliberately loose sling in
   training). Target a precision (correct suggestions ÷ suggestions shown) of ≥ 0.9 before shipping.
3. **Coach review**: of wording, mappings and thresholds.

## 9. New inputs this will need

- **Handedness** setting (right/left), default right.
- **Optional shot order** in the Adjust screen (tap shots in firing order) to unlock G5 and to strengthen G6/G9.
- **Sight click value** (backlog B8) so G2 can say how many clicks to adjust.
- **Session context**: lighting already exists per photo; wind is backlog B6. Both can raise confidence for G6/G9.

## 10. Open questions

1. Coach confirmation of the direction mappings (G6p, G7, G8, G11, G12) and all *provisional* thresholds.
2. Handedness: is the owner right-handed?
3. Capture shot order at all? It adds a step to the workflow.
4. Standing-specific patterns beyond the source figure (which is mostly prone)?
5. Should suggestions appear on the shared summary image, or only inside the app?
