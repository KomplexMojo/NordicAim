# Shooting-issue definitions (v1 built 2026-09-20, thresholds still provisional)

> **Status: v1 implemented (REV-88) with the provisional thresholds below; the owner and a coach still need to confirm them.** Changes from the first draft, on the owner's direction: (a) the Patterns screen shows **observed patterns and issues** and no longer draws fixed regions; (b) the analysis runs **over the whole set of shots on screen as one group**, not per target; (c) each target's own characteristics and potential issues are worked out **when its analysis is saved** (stored on the analysis, shown on the target screen); (d) handedness is a Settings choice (Settings → Athlete, default right-handed).
>
> **(Original draft note:) Nothing here is implemented.** It replaces the hand-placed regions in `src/lib/issues/catalog.ts` (REV-74) with
> **rules measured from the shots**, and builds on `docs/spec/group-patterns.md` (features, flyers, two-cluster test, size scales). Numbers
> marked *P* are provisional starting points for the owner and a coach to change. Nothing becomes a REV until you sign off the table.

## 1. What changes

- **A definition is a formula, not a picture.** For each issue: a test over one target's shots built from precision, accuracy and grouping
  measures. The Patterns screen finds **every target (every instance) that passes**, lists them and highlights each one's group on the
  drawing (its own centre and 2σ ellipse), instead of drawing one fixed region.
- **Handedness is a setting** (Settings → Athlete: **Right-handed / Left-handed**; the *trigger* hand). The **sling arm is the other arm**.
  Issues are named by role (sling arm, trigger arm), never left/right.
- **One mirror does all the hand work.** Every test is written for a right-handed shooter in a frame where **x′ > 0 is the trigger side and
  x′ < 0 is the sling side**. A left-handed shooter's points are mirrored first: `x′ = h · x`, with `h = +1` (right) or `−1` (left).
  So a definition never mentions a hand; `x′ ≤ −Z` means "toward the sling side" for everyone.

## 2. Symbols (per target, or per position for a `both` target; +y up, mm, 50 m)

| Symbol | Meaning | Kind |
|---|---|---|
| `n` | located shots (units). A target is tested only if `n ≥ 5` (*P*) | |
| `MOA(d)` | `atan(d / 50 000) · 180/π · 60`, so 1 MOA ≈ 14.54 mm | |
| `ES` | extreme spread: greatest distance between any two shots | **grouping** |
| `r̄` | mean radius: mean of `dᵢ = |pᵢ − c̄|`, distance from the group's own centre | **precision** |
| `c̄ = (x̄′, ȳ)` | centroid (MPI) in the sling/trigger frame | |
| `M = |c̄|` | distance of the centroid from the bullseye (the group's offset) | **accuracy** |
| `A` | accuracy: `√mean(x² + y²)` distance from the bullseye (REV-60) | **accuracy** |
| `κ = M / r̄` | how many group-widths the group sits off centre | **accuracy vs precision** |
| `σ₁ ≥ σ₂` | standard deviations along the principal axes of the shots' covariance | **grouping** |
| `a = σ₂ / σ₁` | aspect: 0 a line, 1 round | **grouping** |
| `θ` | angle of the principal axis, CCW from +x′, in `[0°, 180°)` | **grouping** |
| `med` | median of the `dᵢ` | **precision** |
| flyer | a shot with `dᵢ ≥ F · med`, `F = 2.5` (*P*); the rest are the **core**; `ES_core` is the core's spread | **grouping** |
| `q` | share of shots farther than the black disc's radius from the bullseye (56.2 mm precision, 57.5 mm sighting) | **accuracy** |
| two clusters | 2-means split, each cluster ≥ 2 shots, centroid separation `Δ ≥ 2 · w` and `Δ ≥ 1 MOA`, `w` the larger within-cluster mean radius | **grouping** |
| `Z` | a "significant" offset: `M ≥ Z`, `Z = 1.0 MOA` (≈ 14.5 mm) (*P*) | |

Named shapes: **horizontal string** `a ≤ 0.5 ∧ θ ≤ 25° ∨ θ ≥ 155°`; **vertical string** `a ≤ 0.5 ∧ |θ − 90°| ≤ 20°`;
**diagonal up-trigger** `a ≤ 0.6 ∧ 30° ≤ θ ≤ 60°` (low sling side to high trigger side); **diagonal down-trigger**
`a ≤ 0.6 ∧ 120° ≤ θ ≤ 150°` (high sling side to low trigger side). *(Shape tests are hand-free: the mirror is already applied.)*

## 3. Definition table

`T_tight = 1.5 MOA` (yours), `T_loose = 3.0 MOA` (*P*, twice tight). All ES/offset tests are in MOA, so a size means the same at any range.

| # | Issue (role-named) | Measures | Test (after mirroring) | Positions |
|---|---|---|---|---|
| 1 | **Tight group** | grouping | `MOA(ES) ≤ 1.5` | all |
| 2 | **Scattered group** | grouping | `MOA(ES) ≥ 3.0` | all |
| 3 | **Zero off** (incorrect zero) | accuracy vs precision | `MOA(ES) ≤ T_loose ∧ M ≥ Z ∧ κ ≥ 2` | all |
| 4 | **Fundamentals / equipment** (a) | accuracy | `q ≥ 0.5` (half or more of the shots outside the black disc) | all |
| 5 | **Sight alignment** (b) | grouping | `≥ 2 flyers ∧ MOA(ES_core) ≤ 1.5 ∧ 0.2 ≤ q < 0.5` | all |
| 6 | **Position change** (d) | grouping | two clusters | prone |
| 7 | **Wind or light drift** (e) | grouping | horizontal string `∧ MOA(ES) ≥ 2 ∧ |x̄′| < Z` | all |
| 8 | **Sling-arm elbow too far in** (i) | grouping + accuracy | horizontal string `∧ MOA(ES) ≥ 2 ∧ x̄′ ≤ −Z` | prone |
| 9 | **Trigger-arm elbow sliding out** (k) | grouping | diagonal down-trigger `∧ MOA(ES) ≥ 2` | prone |
| 10 | **Sling too tight** (j) | grouping | diagonal up-trigger `∧ MOA(ES) ≥ 2.5` | prone |
| 11 | **Trigger finger placement** (n) | grouping | diagonal up-trigger `∧ 1.0 ≤ MOA(ES) < 2.5` | all |
| 12 | **Sling too loose or slipping** (g, h) | grouping | vertical string `∧ MOA(ES) ≥ 2 ∧ |x̄′| < Z` | prone |
| 13 | **Breath / timing** (p) | grouping | vertical string `∧ MOA(ES) ≥ 4 ∧` a flyer above **and** below `ȳ` | all |
| 14 | **Butt too low** (l) | accuracy | `ȳ ≥ Z ∧ |x̄′| ≤ 0.5 · ȳ ∧ MOA(ES) ≤ T_loose` (a group high on the target) | prone |
| 15 | **Light or zero drift down** (f) | accuracy | `MOA(ES) ≤ 2 ∧ ȳ ≤ −Z ∧ |x̄′| ≤ 0.5 · |ȳ|` (a small group low) | all |
| 16 | **Natural alignment** (m) | accuracy | `x̄′ ≤ −Z ∧ |ȳ| ≤ 0.5 · |x̄′| ∧ a > 0.5 ∧ r̄ ≥ 1 MOA` (a round group off to the sling side) | prone |
| 17 | **Trigger control / flinch** (o) | grouping | exactly 1 flyer `∧ MOA(ES_core) ≤ 1.5 ∧` the flyer is to the trigger side and above the core centre (`x′ ≥ x̄′core ∧ y ≥ ȳcore`) | all |

Notes: a target can pass several rows (a tight group off centre passes 1, 3, and maybe 14 or 15); each instance is shown for each row it
passes, in that row's colour. Rows 8–10, 12, 14 and 16 are prone-only (sling and elbows), so they run on prone shooting only. The letters
are the coaching chart's, kept for cross-reference.

## 4. Where the hand matters

| Rows | Right-handed | Left-handed |
|---|---|---|
| 8 sling-arm elbow, 16 natural alignment | group to the **left** (sling arm is the left arm) | group to the **right** |
| 9, 10, 11, 17 (diagonals, flyer side) | as named: "trigger side" is right | mirrored: trigger side is left |
| 1–7, 12–15 | no hand | no hand |

## 5. Open decisions (please mark up)

1. **Unit of an instance.** Per **target** (recommended: a session's confirm of 5 shots and a precision of 10 are judged alone), not pooled.
   The Patterns range/view filters then simply choose which targets are tested.
2. **Tight and scattered thresholds.** Yours is `ES ≤ 1.5 MOA` for tight. ES grows with the number of shots (a 10-shot group is wider than a
   5-shot one from the same rifle); do you want one MOA number for all, or 1.5 for 5-shot confirms and a larger number for 10-shot precision?
3. **Standing.** `group-patterns.md` used bigger zones for standing (tight ES ≤ 45 mm vs 20 mm prone). Keep one MOA scale, or scale standing by ×2.5?
4. **Overlap.** Show every row a target passes (recommended), or only the best per target (max two, as `group-patterns.md` §3)?
5. **Shot order.** Rows 12 (loose vs slipping) and the "walking" patterns need the order shots were fired, which the app does not capture.
   Until it does, 12 merges "too loose" and "slipping". Worth adding an order field to the editor later?
6. **Names.** Row 7 merges wind and light (both drift sideways in the chart); keep merged, or split with a rule?
7. **Where the parameters live.** Only handedness in Settings, thresholds fixed in code (recommended), or an "Advanced" list of the
   numbers above so a coach can tune them?
8. **Coach validation** of every threshold and the direction of rows 8–11, 16, 17 (`group-patterns.md` Q1) before anything ships.

## 6. What building it involves (after sign-off)

`AppSettings.handedness` (default right, Settings → Athlete, no re-score); `src/lib/patterns/issues.ts` (pure: `evaluateIssues(units, handedness)` returns the
rows passed, with the values behind each); Patterns lists per row `N targets` (with dates) and draws each passing target's centre and 2σ ellipse
instead of the fixed regions; the catalog regions and `render/issue-overlay.ts` region shapes are retired; unit tests with a synthetic group
for every row, for both hands, and for near-misses; spec + REV. Related: #29, #33 (Patterns is one of the surfaces the shared zoom control serves).
