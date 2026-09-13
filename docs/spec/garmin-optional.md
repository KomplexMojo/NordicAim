# Spec: optional Garmin track (own account only)

**Optional** (REV-3). Disabled unless `ASA_ENABLE_GARMIN=1`. When disabled, every `/api/garmin*` and
`/api/sessions/:sid/garmin*` route returns 404 `feature_disabled` and the UI hides every Garmin element.
The core app never depends on this track.

## 1. Constraints (read before implementing)

- **No official route.** The Garmin Connect Developer Program is business-only (and reportedly paused).
- **Unofficial route only**: `Taxuspt/garmin_mcp` pinned at commit `655efb8f5639602f661c26164282d0ddd4f5d3db`
  (`garminconnect==0.3.2`). Since Garmin's March 2026 auth change, this library logs in by impersonating the
  Connect iOS app. It **may break at any time** and is more likely to be blocked from datacenter IPs. Use it
  for the owner's own account only. Never retry logins automatically.
- **No photo upload** exists. This track provides: activity listing and tagging, suggestions from capture
  times, load metrics for the harness, and an opt-in analysis **text** block in the activity description.
- The design's "optional OS secure vault" does not apply to a hosted server. Only the **email** may be
  remembered (`config.json`). The password is typed at each login and never stored.

## 2. Provider interface (`src/lib/garmin/types.ts`)

```ts
export interface GarminActivitySummary { activityId: string; name: string; typeKey: string;
  startTimeLocal: string /* "YYYY-MM-DD HH:mm:ss" */; durationSec: number; distanceM: number | null;
  calories: number | null; avgHr: number | null; maxHr: number | null }
export interface GarminActivityDetail extends GarminActivitySummary { startTimeGmt: string | null;
  elapsedDurationSec: number | null; trainingLoad: number | null; aerobicTe: number | null;
  anaerobicTe: number | null; elevationGainM: number | null; description: string | null }
export interface GarminProvider {
  readonly kind: 'demo' | 'live';
  listActivities(startDate: string, endDate: string): Promise<GarminActivitySummary[]>; // inclusive local dates
  getActivity(activityId: string): Promise<GarminActivityDetail>;
  setDescription(activityId: string, text: string): Promise<void>;
}
export class GarminError extends Error { constructor(public code: GarminErrorCode, message: string) { super(message); } }
export type GarminErrorCode = 'feature_disabled' | 'not_connected' | 'bad_credentials' | 'mfa_required' | 'mfa_invalid'
  | 'rate_limited' | 'uv_missing' | 'mcp_failed' | 'tool_error' | 'timeout' | 'not_found';
```

`normalizeGarminLocal(s)` accepts `"YYYY-MM-DD HH:mm:ss"`, `"YYYY-MM-DDTHH:mm:ss"`, and
`"YYYY-MM-DDTHH:mm:ss.f+"` and returns `"YYYY-MM-DD HH:mm:ss"`. Vectors: `"2026-09-05T15:10:00.0"` →
`"2026-09-05 15:10:00"`; `"2026-09-05 15:10:00"` → unchanged; `"garbage"` → throws.

Type labels (`type-labels.ts`): `running` → Run, `trail_running` → Trail Run, `walking` → Walk,
`cycling` → Ride, `skate_skiing_ws` → Skate Ski (roller-ski), `cross_country_skiing_ws` → Classic Ski,
`strength_training` → Strength. Anything else → title-cased key with `_` replaced by a space. The live typeKey
for roller-skiing must be confirmed against the owner's account in M21.

## 3. Demo provider

Data: `fixtures/reference/demo-garmin-activities.json` (7 activities on 2026-08-24, 2026-09-05, and
2026-09-06). `listActivities` filters by the date part of `startTimeLocal`, inclusive, and sorts by start
ascending. `setDescription` stores in memory (per process). Demo mode is selectable when the feature is
enabled, and is always available in `NODE_ENV=test`.

## 4. Live provider

### 4.1 Processes

```text
AUTH:  uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@655efb8f5639602f661c26164282d0ddd4f5d3db garmin-mcp-auth --token-path <tmp>/tokens --force-reauth
MCP:   uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@655efb8f5639602f661c26164282d0ddd4f5d3db garmin-mcp
```

- `<tmp>` = `fs.mkdtemp(join(os.tmpdir(), 'asa-garmin-'))`, chmod `0700`, created per login.
- Env for both: `GARMINTOKENS=<tmp>/tokens`, `GARMINTOKENS_BASE64=<tmp>/tokens_base64` (**required**, or a
  long-lived copy lands in the home dir), `HOME=<tmp>/home`,
  `UV_CACHE_DIR=<ASA_WORKSPACE_DIR>/.cache/uv`. AUTH also gets `GARMIN_EMAIL`, `GARMIN_PASSWORD` (env
  only, never argv). MCP also gets `GARMIN_ENABLED_TOOLS=get_activities_by_date,get_activity,get_activities,set_activity_description`.
- Test overrides: `ASA_GARMIN_AUTH_CMD` and `ASA_GARMIN_MCP_CMD` (JSON argv arrays) replace the `uvx …` commands.
- `pnpm garmin:warm` runs the AUTH command with `--help` to fill the uv cache.

### 4.2 Login state machine (`src/lib/garmin/live/session.ts`)

`disconnected → authenticating → (needs_mfa →) connecting → connected`. Any state can go to `error`, then
`disconnected`.

1. `connect(email, password)`: spawn AUTH. Append stdout **chunks** to a buffer (the prompt has no newline;
   do not split by lines). If the buffer contains `Enter MFA code`, the state becomes `needs_mfa`.
2. `submitMfa(code)`: validate `^\d{4,8}$`, write `code + '\n'` to stdin.
3. AUTH exit 0 → `connecting`: spawn MCP via `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`,
   `await client.connect()`, then `listTools()` must include the four tools → `connected`.
4. AUTH exit ≠ 0 → map the combined output, first match wins: contains `MFA code may be incorrect` →
   `mfa_invalid`; contains `rate-limit` or `429` → `rate_limited`; contains `Authentication failed` →
   `bad_credentials`; otherwise `mcp_failed`. Spawn `ENOENT` → `uv_missing`.
5. Timeouts: AUTH total 180 s; waiting for MFA 300 s; MCP connect 120 s; each tool call 30 s → `timeout`.
6. **Cleanup** on logout, error, 30 min idle (no Garmin API use), or process `SIGTERM`/`exit`: close the
   client, kill the processes, `rm -rf <tmp>`. The registry lives on `globalThis.__asaGarmin` (survives dev HMR).
7. Never log email, password, MFA code, stdout, or stderr contents. Log only state transitions and error codes.

### 4.3 Tool calls and parsing

`callTool(name, args)` → `result.content[0].text`. If the text starts with `Error`, throw `tool_error` with
the first 200 chars. Otherwise `JSON.parse` and validate with zod.

| Method | Tool + args | Mapping |
|---|---|---|
| `listActivities(s, e)` | `get_activities_by_date { start_date: s, end_date: e, page, page_size: 100 }`, looping pages while `has_more` | `activities[]`: `id`→activityId (String), `name`, `type`→typeKey, `start_time`→startTimeLocal (normalised), `duration_seconds`, `distance_meters`, `calories`, `avg_hr_bpm`, `max_hr_bpm`. **Keys may be absent** (null values are removed upstream): default to null, and durationSec to 0. |
| `getActivity(id)` | `get_activity { activity_id: id }` | adds `start_time_gmt`, `elapsed_duration_seconds`, `training_load`, `training_effect`→aerobicTe, `anaerobic_training_effect`, `elevation_gain_meters`, `description`; start uses `start_time_local` |
| `setDescription(id, t)` | `set_activity_description { activity_id: id, description: t }` | **replaces** the whole description |

## 5. Routes

| Method & path | Result |
|---|---|
| GET `/api/garmin/status` | `{ enabled, mode: 'off'\|'demo'\|'live', state, email?, error? }` |
| POST `/api/garmin/demo` | switch to demo provider |
| POST `/api/garmin/connect` `{ email, password, rememberEmail }` | `{ state }` |
| POST `/api/garmin/mfa` `{ code }` | `{ state }` |
| POST `/api/garmin/logout` | `{ state: 'disconnected' }` |
| GET `/api/garmin/activities?start=YYYY-MM-DD&end=YYYY-MM-DD` | `GarminActivitySummary[]` (max range 31 days) |
| GET `/api/sessions/:sid/garmin/suggestions` | §6 output |
| PUT `/api/sessions/:sid/garmin` `GarminLink` | session |
| GET `/api/sessions/:sid/garmin/load` | §7 output |
| POST `/api/sessions/:sid/garmin/description/preview` | `{ block, merged }` |
| POST `/api/sessions/:sid/garmin/description` `{ confirm: true }` | writes to the primary activity; sets `ShareRecord.garminDescriptionWritten` on the latest share |

## 6. Activity suggestions (`src/lib/garmin/alignment.ts`, pure)

```ts
export function suggestActivities(captureLocals: string[] /* "YYYY-MM-DDTHH:mm:ss" */, activities: GarminActivitySummary[]):
  { scored: Array<{ activityId: string; score: number; reasons: string[] }>; suggestedIds: string[]; primaryId: string | null };
```

All times are local wall clock. Convert to minutes with naive UTC arithmetic (both sides are in the range's local zone).
`start` = parsed `startTimeLocal`; `end = start + durationSec`. `wStart` = min capture, `wEnd` = max capture.
`captureDays` = set of capture dates.

Per activity:
1. `sameDay` = `captureDays` has the start date or the end date. If not → score 0, reason `different-day`.
2. If `end ≤ wStart`: gap = (wStart − end) minutes; score = max(0, 1 − gap/240); reason `ended-before-capture`.
3. Else if `start ≥ wEnd`: gap = (start − wEnd) minutes; score = 0.5 × max(0, 1 − gap/60); reason `started-after-capture`.
4. Else score 1, reason `overlaps-capture`.

Selection: the initial set = activities with score ≥ 0.5. **Chain**: repeatedly add any `sameDay` activity whose
interval gap to any member is ≤ 90 min (gap = max(0, a.start − b.end, b.start − a.end)), with reason `chained`.
`suggestedIds` is sorted by start. **Primary** = the suggested activity with the latest start ≤ `wEnd`; if
none, the highest score. With no captures: everything scores 0, nothing is suggested, primary is null.

**Vectors** (demo fixture):
- Captures `["2026-09-05T16:56:03"]`: demo-1001 → 0 (not suggested); demo-1002 → 0.72479; demo-1003 → 0.96646;
  demo-1004 → 0.38375 (chained); demo-1005 → 0 `different-day`. suggestedIds `[demo-1002, demo-1003, demo-1004]`,
  primary `demo-1003`. Scores ±1e-4.
- Captures `["2026-08-24T19:30:09"]`: demo-0901 → 0.81188; demo-0902 → 0.97854; suggested `[demo-0901, demo-0902]`,
  primary `demo-0902`.

## 7. Load aggregation (`src/lib/harness/load.ts`, pure)

```ts
export function aggregateLoad(details: GarminActivityDetail[]): { count: number; durationSec: number; distanceM: number;
  calories: number; trainingLoad: number; avgHr: number | null; maxHr: number | null; aerobicTe: number | null; anaerobicTe: number | null };
```

Sums skip nulls. `avgHr` = Σ(avgHr × durationSec) / Σ durationSec over activities that have avgHr. `maxHr`,
`aerobicTe`, and `anaerobicTe` are maxima.
**Vector** (demo-1002, 1003, 1004): count 3, durationSec 6300, distanceM 26000, calories 1360, trainingLoad 167,
avgHr 150.476 ±1e-3, maxHr 182, aerobicTe 3.8, anaerobicTe 1.6.

## 8. Description block (`src/lib/garmin/description.ts`, pure)

```ts
export function buildDescriptionBlock(input: { sessionName: string; sessionDate: string; slotLines: string[]; lightingSummary: string }): string;
export function mergeDescription(existing: string | null, block: string): string;
```

Block format (`\n` line breaks, total ≤ 1000 chars; drop trailing slot lines first, then hard-truncate the
last line with `…`):

```text
[ASA:BEGIN]
Shooting analysis — <sessionName> (<sessionDate>)
<slot line 1>
…
Lighting: <lightingSummary>
[ASA:END]
```

Slot lines use the same text as composite analysis-band line 2 (spec/rendering-composite.md §5).

`mergeDescription` rules:
- If existing contains `[ASA:BEGIN]` followed later by `[ASA:END]`, replace from the start of `[ASA:BEGIN]`
  through the end of `[ASA:END]` with the block.
- Else if existing is null or whitespace-only → block.
- Else `existing.trimEnd() + "\n\n" + block`.

Vectors (B = block): `null` → `B`; `"Felt good"` → `"Felt good\n\nB"`;
`"Felt good\n\n[ASA:BEGIN]\nold\n[ASA:END]\nAfter"` → `"Felt good\n\nB\nAfter"`.

UI rule: the owner sees the merged preview and must tick "Write this text to <activity name>" before POST.
Off by default.
