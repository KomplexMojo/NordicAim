# Spec (DRAFT, post-MVP): pulling shooting context from 545 Coach

> **Status: draft, backlog B13.** Not part of the MVP and not to be implemented until the owner approves it, the 545
> Coach developer confirms what their export can actually produce, and a milestone is written. Field names and the
> storage shape below are starting points for that validation, not decisions.

## 1. Requirement

Owner (2026-10-04): NordicAim's sweet spot is target analysis, not coaching and not metal shooting. 545 Coach (a
separate app, `545coach.netlify.app`, built by a developer the owner knows and has an account with) already logs
metal-bout hit/miss, sight/zero-click adjustments, and session wind as part of its own range-session model. The ask
is to **pull** that context into NordicAim so a session or trend report can show, alongside NordicAim's own
precision scoring, what happened on metal, what the rifle's zero was doing, and what the wind was — information
NordicAim has no reason to capture itself, but that explains drift NordicAim otherwise can't account for.
Concretely: the MPI-offset tiles on the Patterns trends report (`docs/spec/patterns.md`) show numbers like "avg
1.9 mm right · 11.2 mm low" with no way to tell whether that's the shooter, a zero that moved between sessions, or
wind pushing a standing group — a 545 Coach zero-click or wind record would answer that.

Three record types were evaluated against one rule — nothing that NordicAim's own pipeline already captures or
derives from the sighting/confirm/precision-prone/precision-standing targets themselves (score, group size, MPI,
RMSE, hit/zone outcomes: all already computed by `geometry-scoring.md`) — and all three survived it:

1. **Sight/zero-click log** — a rifle adjustment between shots, never a property of the group itself.
2. **Session wind** — no EXIF or image data carries wind; it has never been part of `ExifMeta` or `Categorization`.
3. **Metal-bout hit/miss** — a different physical target NordicAim has no template or detection path for at all.

Other candidates (race results, dry-fire volume, coach notes) were considered and set aside for now — see §7.

## 2. Scope

- **One direction only: 545 Coach → NordicAim, read-only.** NordicAim does not export anything to 545 Coach under
  this spec, does not modify or delete anything in 545 Coach, and does not implement metal-bout capture or a zero
  workflow of its own. (An earlier NordicAim → 545 Coach export direction was discussed and explicitly set aside;
  if that's wanted later it is a separate spec.)
- **File-based import, not a live API call.** `AGENTS.md`'s hard invariant — no runtime network calls except the
  app's own same-origin static assets — is unchanged by this spec. Pulling context means the owner exports a JSON
  file from 545 Coach (545 Coach's privacy policy already describes "Export everything you've logged as a JSON
  file, from Settings") and imports it into NordicAim by hand, the same shape of flow as `backup.md`'s restore.
- **Three record types only:** metal-bout results, sight/zero-click adjustments, and session wind. Nothing about
  precision scoring, target photos, club/coach/roster data, or account identity crosses in either direction —
  NordicAim's own pipeline remains the only source of precision scores.

## 3. Out of scope

- Any network call NordicAim makes at runtime to 545 Coach's backend (would need its own owner sign-off as a new
  exception to the no-network-calls invariant; not requested here).
- NordicAim computing or displaying metal hit-rate trends as a first-class feature — it only surfaces what 545
  Coach already computed, next to NordicAim's own reports.
- Importing 545 Coach's precision bout, target photo, or club/coach data (`docs/spec/privacy-storage-hosting.md`
  governs what crosses NordicAim's own boundary; nothing here changes that for data NordicAim already owns).
- Account linking, auth, or any identifier shared between the two apps (see `athleteHint` below — free text, not a key).

## 4. Import file shape (provisional)

```ts
interface CoachContextFile {
  format: 'coach-context';
  formatVersion: 1;
  source: { app: '545-coach'; appVersion: string; exportedAt: string };  // UtcIso
  athleteHint: string | null;        // free text, for the owner matching this to themself on import — not a key
  range: { from: string; to: string };  // LocalDate, bounds of the pull
  metalSessions: MetalContext[];
  zeroAdjustments: ZeroAdjustment[];
  windConditions: WindContext[];
}

interface MetalContext {
  sessionDate: string;           // LocalDate — matched against NordicAim's own BiathlonSession.sessionDate
  position: 'prone' | 'standing';
  discHits: boolean[];           // length 5, disc order 1..5
  comboGroup: string | null;     // 545 Coach's grouping for repeated ski-and-shoot rounds
  hitRate: number;               // 0-1
}

interface ZeroAdjustment {
  at: string;                    // UtcIso — when the click was logged
  verticalClicks: number;        // net movement, +up / -down (matches NordicAim's +y up convention, transform.md)
  horizontalClicks: number;      // net movement, +right / -left (matches NordicAim's +x right convention)
  note: string | null;
}

interface WindContext {
  sessionDate: string;            // LocalDate — same join key as MetalContext
  speedKph: number | null;        // null if 545 Coach only records a free-text note for this session
  direction: string | null;       // open: 545 Coach's actual format is unconfirmed (compass point? clock-face? degrees?) — §6
  note: string | null;
}
```

Matching is by `sessionDate`, not id — the two apps have no shared identifier, and date is the only thing both
already agree on. Precision scoring, shots, calibration, and photos are never part of this file.

## 5. Import flow (provisional, modeled on `backup.md`)

1. Settings gains an **Import coach context** action, separate from backup restore.
2. The chosen file is verified before anything is written: refuse (naming the failure) when it is not JSON, when
   `format`/`formatVersion` differ, or when a record fails the shape above. A refused file writes nothing.
3. The owner sees which `sessionDate`s in the file line up with an existing NordicAim session, and which don't
   (shown but with nowhere to attach to, same spirit as the backup plan screen's new/same/different).
4. Imported records (metal, zero-click, wind) are additive context, never merged into `BiathlonSession` or
   `TargetAnalysis` — they render alongside those records, keyed by date, and importing the same file twice is
   idempotent.
5. Open in §6: whether this needs its own IndexedDB store (e.g. `coachContext`) or stays out of persistent storage
   entirely and is re-imported per report. If it's a store, whether it's included in NordicAim's own backup file
   (`backup.md` §2) so it survives a restore.

## 6. Open questions

- Does 545 Coach's existing JSON export actually include per-click zero-adjustment history, per-session wind, and
  per-disc metal results, or only aggregate hit-rate summaries? The feature as scoped needs the former. Needs the
  developer.
- Does 545 Coach's "net movement" click sign convention map directly to NordicAim's +up/+right, or does it need a
  translation table (confirm with the developer rather than assuming)?
- What format does 545 Coach actually store wind direction in (compass point, clock-face relative to the firing
  line, degrees, or only a free-text note)? `WindContext.direction` above is a placeholder until this is known.
- Storage: new IndexedDB store vs. render-time-only (§5 item 5).
- Where this surfaces: a new panel on the Patterns trends report (`docs/spec/patterns.md`), an annotation on the
  existing MPI-offset tile, or both — needs a design pass once the data is actually available to look at.
- Multiple NordicAim sessions on one date, or a 545 Coach record on a date with no NordicAim session: matching
  behaviour needs deciding (likely: show unmatched records in a dated list rather than silently dropping them).

## 7. Considered and deferred

Evaluated against the same rule as §1 (not derivable from NordicAim's own targets) and judged lower-value or
weaker-signal for now. Not ruled out — just not in this pull:

| Candidate | Why it was set aside |
|---|---|
| Race results (format, stage-by-stage hits, season-over-season) | NordicAim has no notion of a race structure at all (sprint/individual/pursuit/mass-start stages); adding it is a bigger step than importing a context record, closer to a new feature than a pull. |
| Dry-fire volume (minutes/session, frequency) | Legitimate training-load context, but a weak signal on its own with no target data to correlate it against directly. |
| Coach notes (free-text, attached to a workout) | Useful as human-readable annotation, but subjective text the app can't act on — candidate for a later, purely-additive "show this next to the chart" feature, not this pull. |
| Heart rate | 545 Coach lists it as an optional field but doesn't document what, if anything, it drives in their own analysis. Worth asking the developer before assuming it's load-bearing. |
