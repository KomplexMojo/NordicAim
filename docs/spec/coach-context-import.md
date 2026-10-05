# Spec (DRAFT, post-MVP): pulling shooting context from 545 Coach

> **Status: draft, backlog B15.** Not part of the MVP and not to be implemented until a milestone is written. §4 is
> checked against a real 545 Coach export (`coach-context-2026-09-28.json`, owner, 2026-10-05) rather than guessed:
> granularity, the click-sign convention, disc order, and the wind model are confirmed. Storage and surfacing
> (owner, 2026-10-05) are decided: a per-session attach flow (§5) into a new IndexedDB store, surfaced on the
> shooting-analysis composite image (§6). What's still open is listed in §7.

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

Other candidates (race results, dry-fire volume, coach notes) were considered and set aside for now — see §8.

## 2. Scope

- **One direction only: 545 Coach → NordicAim, read-only.** NordicAim does not export anything to 545 Coach under
  this spec, does not modify or delete anything in 545 Coach, and does not implement metal-bout capture or a zero
  workflow of its own. (An earlier NordicAim → 545 Coach export direction was discussed and explicitly set aside;
  if that's wanted later it is a separate spec.)
- **File-based import, not a live API call.** `AGENTS.md`'s hard invariant — no runtime network calls except the
  app's own same-origin static assets — is unchanged by this spec. Pulling context means the owner exports a JSON
  file from 545 Coach (545 Coach's privacy policy already describes "Export everything you've logged as a JSON
  file, from Settings") and attaches it to a specific NordicAim session by hand (§5) — not a general Settings-wide
  import, though the file-picker mechanics are the same shape as `backup.md`'s restore.
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
  conventions: {                     // confirmed present in the 2026-09-28 export — 545 Coach's own format notes
    discOrder: string;               // "alpha, beta, charlie, delta, echo — left to right downrange"
    zeroClicks: string;              // "+ up / + right, − down / − left" — matches NordicAim's transform.md directly
    windDirection: string;           // clock position wind blows FROM, facing the target: 12 headwind, 6 tailwind, 3/9 crosswind
    windStrength: string;            // "band only (none, light, moderate, strong) — no speed is recorded"
  };
}

interface MetalContext {
  sessionDate: string;           // LocalDate — matched against NordicAim's own BiathlonSession.sessionDate
  position: 'prone' | 'standing';
  discHits: boolean[];           // length 5, order per conventions.discOrder (alpha..echo, left to right downrange)
  comboGroup: string | null;     // 545 Coach's grouping for repeated ski-and-shoot rounds — one date can hold several
                                  // comboGroups, each with several bouts (the 2026-09-28 sample had 8 bouts in 2 groups)
  hitRate: number;               // 0-1
  targetZone: number | null;     // confirmed field; populated for standing in the sample seen, always null for prone
  race: 'sprint' | 'individual' | 'mass-start' | 'pursuit' | null;  // confirmed (545 Coach developer, 2026-10-05):
                                  // null for a normal range/training session; one of these four lower-case
                                  // internal names for a race (not display labels — "mass-start", never
                                  // "Mass start"). Always null in the only export seen.
}

interface ZeroAdjustment {
  at: string;                    // UtcIso — when the click was logged. No sessionDate field: matching needs this
                                  // converted to a LocalDate first (see §7 on which timezone to use)
  verticalClicks: number;        // net movement, +up / -down — confirmed to match NordicAim's +y-up convention
                                  // directly (conventions.zeroClicks), no translation needed
  horizontalClicks: number;      // net movement, +right / -left — confirmed to match NordicAim's +x-right convention directly
  note: string | null;
}

interface WindContext {
  sessionDate: string;            // LocalDate — same join key as MetalContext
  speedKph: number | null;        // confirmed to realistically always be null — 545 Coach records a strength band
                                   // (conventions.windStrength), never a measured speed
  direction: string | null;       // null in the only (calm) export seen; when populated, a clock-face value per
                                   // conventions.windDirection — exact serialization (number vs. string) unconfirmed
  note: string | null;            // confirmed to sometimes hold the strength band value itself (e.g. "none"), not
                                   // necessarily free text — see §7
}
```

Matching is by `sessionDate`, not id — the two apps have no shared identifier, and date is the only thing both
already agree on. Precision scoring, shots, calibration, and photos are never part of this file.

## 5. Import flow (attach-to-session; owner decision, 2026-10-05)

Not a general Settings-wide import — the owner attaches a 545 Coach export to one specific NordicAim session, so
there's no ambiguity about which session the file's records belong to.

1. Each session on the main Sessions screen gets an **Attach 545 Coach data** action beside it, alongside that
   session's existing actions.
2. Tapping it opens a file picker for the 545 Coach export, same mechanics as `backup.md`'s restore.
3. The chosen file is verified before anything is written: refuse (naming the failure) when it is not JSON, when
   `format`/`formatVersion` differ, or when a record fails the §4 shape. A refused file writes nothing.
4. Records are filtered to this session by date: `MetalContext`/`WindContext` by `sessionDate` matching the
   session's own date; `ZeroAdjustment` by converting `at` to a local date and matching the same way (open: which
   timezone, §7). **All** matching records go forward, as a list — one session already covers sight-in, confirm,
   precision prone, and precision standing, so running several metal combo bouts per position within it is normal,
   not something the owner picks among (the 2026-09-28 sample's 8 bouts across 2 `comboGroup`s are all one
   session's worth). Disambiguation is only needed in the rarer case where the owner shot more than one NordicAim
   session on the same calendar date, so one 545 Coach day-file has to be split across two attach actions — see §7.
5. **Preview screen (owner decision, 2026-10-05).** Before anything is written, the matched records render
   graphically — the same representations as §6: one icon row per metal bout, the zero-click list, the wind badge
   — with **Add** and **Cancel** actions. Cancel discards the picked file; nothing is written.
6. **On Add:** each matched record is checked against every other session's already-attached coach context for a
   duplicate. Since 545 Coach assigns no cross-app id, detection is by a derived fingerprint — a hash of the
   record's own fields, stored alongside the attached copy (exact hash/fields are an implementation detail for the
   milestone). If any record in the batch collides with a record already attached to a **different** session, the
   whole Add is refused with an error naming that session; nothing is written. **Re-attaching to the session that
   already holds this coach context is allowed (owner, 2026-10-05): it's a full delete of that session's existing
   `coachContext` entry followed by a full write of the new Add, never a merge of old and new records.** Otherwise
   the matched records are written to a new IndexedDB store (e.g. `coachContext`) keyed by the NordicAim
   `sessionId`. They are additive context, never merged into `BiathlonSession` or `TargetAnalysis`, and never
   overwrite a prior `source: 'manual'` edit (`AGENTS.md` hard invariants).
7. **Remove (owner decision, 2026-10-05).** A session with attached coach context gets a separate **Remove 545
   Coach data** action that deletes its `coachContext` entry outright, freeing those records (by fingerprint) to be
   attached elsewhere without tripping the duplicate check in step 6.

## 6. Surfacing (owner decision, 2026-10-05)

Destination is the shooting-analysis composite image (`docs/spec/rendering-composite.md`), not a separate Patterns
panel. Both additions below are new requirements for `rendering-composite.md`, which this spec does not itself
own — the exact pixel layout, glyph design, and REV number are implementation decisions for whoever writes that
spec's update and the milestone, not decided here.

- **Metal-target icons.** For a session with attached `MetalContext` records, render each bout as its own row of
  five iconic hit/miss discs — order per `conventions.discOrder` (alpha..echo, left to right downrange), filled/hit
  vs. open/miss per `discHits[0..4]` — grouped by `comboGroup` then position (prone/standing), alongside the
  existing session-analysis band (`render/composite-band.ts`). A session with three standing combo bouts shows
  three rows, not one merged tally. A session with no attached coach context renders exactly as today; this is
  additive, never required.
- **Windage.** A new badge next to the season icon and lighting icon in the composite header
  (`rendering-composite.md` §Header: 44 px round badges at x 1010/1064, y 38, `render/condition-icons.ts`), showing
  the attached `WindContext` for the session — the strength band (none/light/moderate/strong) as the glyph, and the
  clock-face direction as its orientation when known (§7: unconfirmed whether `direction` is ever actually
  populated). No attached wind record: no badge, same as today.

## 7. Open questions

**Resolved by the 2026-09-28 export** (see `conventions` in §4):

- Granularity: the export carries per-click zero-adjustment history, per-session wind, and per-disc metal results,
  not just aggregate hit-rate summaries.
- Click sign convention: 545 Coach's net-movement clicks match NordicAim's +up/+right directly. No translation
  table needed.
- Disc order: `discHits[0..4]` is alpha/beta/charlie/delta/echo, left to right downrange.
- Wind is recorded as a strength band (none/light/moderate/strong), not a measured speed — `WindContext.speedKph`
  will realistically always be null.
- Wind direction, when recorded, is a clock position facing the target (12 = headwind, 6 = tailwind, 3/9 = full
  crosswind) — not a compass point or degrees.
- `race`'s shape (545 Coach developer, 2026-10-05): `null` for a normal range/training session, or one of
  `'sprint' | 'individual' | 'mass-start' | 'pursuit'` (lower-case internal names, not display labels) for a race.

**Still open:**

- The only export seen so far is a calm day: `direction` and `speedKph` are both null and `note` holds `"none"` —
  which reads like the strength band landed in free text rather than a dedicated field. Need an export from a windy
  session to confirm whether `direction`/a real strength field ever get populated, or whether `note` is the only
  place strength ever shows up.
- `targetZone` is a real field the provisional §4 type didn't originally anticipate; its meaning beyond "populated
  for standing" is unconfirmed.
- `zeroAdjustments` carry no `sessionDate` at all, only a UTC `at` timestamp; the timezone for the `at` →
  local-date conversion needs deciding (device-local at attach time is the only candidate so far).
- Splitting one 545 Coach day-file across two NordicAim sessions, when the owner shot more than once on the same
  calendar date: §5 step 6's duplicate check (owner, 2026-10-05) now blocks attaching the same record to a second
  session outright — so a deliberate split needs the preview screen (§5 step 5) to let the owner deselect records
  before Add, which isn't specified yet. Without that, splitting requires removing from the first session (§5 step
  7), attaching the remainder to the second, then re-attaching the first — awkward; worth a cleaner answer before
  the milestone.
- Whether the per-session `coachContext` store is included in NordicAim's own backup file (`backup.md` §2) so it
  survives a restore — leans yes now that it's durable, session-scoped data, but not decided.
- `rendering-composite.md`'s actual layout changes for the windage badge and the metal-target icon glyphs (§6) —
  design and REV-numbering work for whoever picks up the milestone.
- Default behaviour when a session's date has no 545 Coach records to attach at all.

## 8. Considered and deferred

Evaluated against the same rule as §1 (not derivable from NordicAim's own targets) and judged lower-value or
weaker-signal for now. Not ruled out — just not in this pull:

| Candidate | Why it was set aside |
|---|---|
| Race results (format, stage-by-stage hits, season-over-season) | NordicAim has no notion of a race structure at all (sprint/individual/pursuit/mass-start stages); adding it is a bigger step than importing a context record, closer to a new feature than a pull. |
| Dry-fire volume (minutes/session, frequency) | Legitimate training-load context, but a weak signal on its own with no target data to correlate it against directly. |
| Coach notes (free-text, attached to a workout) | Useful as human-readable annotation, but subjective text the app can't act on — candidate for a later, purely-additive "show this next to the chart" feature, not this pull. |
| Heart rate | 545 Coach lists it as an optional field but doesn't document what, if anything, it drives in their own analysis. Worth asking the developer before assuming it's load-bearing. |
