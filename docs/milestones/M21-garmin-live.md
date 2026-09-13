# M21: Garmin live own-account connection (optional)

| Depends on | Tier | Size | Track | Design todo |
|---|---|---|---|---|
| M19, M20 | **high** | L | **optional** | garmin-auth-provider (live) |

> Only do this milestone if the owner asks. **Tier high**: low-tier agents may do only the steps marked
> *safe for any tier*. Needs the owner at the keyboard for real-account verification.

## Goal
With `ASA_ENABLE_GARMIN=1`, the owner logs in with email and password (+ MFA) each time. The server drives
`garmin_mcp` in a per-login temp token dir. The live provider replaces demo for activities, load, and the
opt-in analysis text block. Everything is wiped on logout or idle.

## Read first
- `docs/spec/garmin-optional.md` (all)
- `docs/spec/access-deployment.md` §9 (no logging), §7 (`WITH_GARMIN` build arg)
- `docs/PLAN.md` F12, F13, R6

## In scope
Live session state machine, process management, MCP client, error mapping, cleanup, login UI, description
preview and write, fakes for tests, Docker `uv` install.

## Out of scope
Photo upload (not possible), storing passwords, official Garmin API.

## Files
- `src/lib/garmin/live/session.ts`, `live/processes.ts`, `live/mcp-client.ts`, `live/live-provider.ts`, `live/errors.ts`
- `src/lib/garmin/description.ts`
- Routes: `/api/garmin/connect`, `/api/garmin/mfa`, `/api/garmin/logout`,
  `/api/sessions/[sessionId]/garmin/description/preview`, `/garmin/description`
- `src/components/garmin/ConnectGarminDialog.tsx`, `MfaPrompt.tsx`, `DescriptionPreview.tsx`
- `tests/fixtures/fake-garmin-auth.mjs`, `tests/fixtures/fake-garmin-mcp.mjs`
- `tests/unit/garmin/description.test.ts`, `tests/unit/garmin/live-session.test.ts`, `tests/e2e/garmin-live-fake.spec.ts`
- `deploy/Dockerfile` (WITH_GARMIN branch), `package.json` script `garmin:warm`

## Steps
1. *(safe for any tier)* `description.ts` (`buildDescriptionBlock`, `mergeDescription`) with the §8 vectors.
2. *(safe for any tier)* Fakes:
   - `fake-garmin-auth.mjs` reads `GARMIN_EMAIL`: `ok@example.com` → prints `✓ Authentication successful!`,
     writes `$GARMINTOKENS/oauth.json`, exits 0. `mfa@example.com` → writes `Enter MFA code: ` with no newline
     and reads stdin; `123456` → success, else prints `MFA code may be incorrect` to stderr and exits 1.
     `bad@example.com` → stderr `✗ Authentication failed`, exits 1. `slow@example.com` → never exits.
   - `fake-garmin-mcp.mjs`: `@modelcontextprotocol/sdk` `McpServer` over stdio with the 4 tools. Return JSON
     strings shaped like the real curated output (garmin-optional §4.3), built from the demo fixture. For
     activity id `demo-error`, return `Error retrieving activity: boom`.
3. Add dependency `@modelcontextprotocol/sdk` (exact pin).
4. `processes.ts`: build argv and env per §4.1 (honour `ASA_GARMIN_AUTH_CMD` and `ASA_GARMIN_MCP_CMD`).
   Credentials go in env only. Create the temp dir with mode 0700.
5. `session.ts`: the §4.2 state machine with chunk-buffer prompt detection, timeouts, error mapping, idle
   timer (reset on every provider call), and cleanup. The registry on `globalThis.__asaGarmin`. Register
   `process.once('SIGTERM')` and `('exit')` cleanup once.
6. `mcp-client.ts`: `Client` + `StdioClientTransport({ command, args, env })`, `connect`, verify `listTools`,
   `callTool` with timeout, parse per §4.3.
7. `live-provider.ts` implements `GarminProvider`: pagination for `listActivities`, `setDescription`.
8. Routes per §5. `connect` persists `rememberedEmail` in `config.json` only when asked. Never echo the password.
9. UI:
   - `ConnectGarminDialog` (email prefilled from config, password, "Remember email", Connect)
   - `MfaPrompt` (numeric one-time-code input, `autocomplete="one-time-code"`)
   - status chip in the Activities tab (connected as email · Log out)
   - clear error messages per code; for `rate_limited`: "Garmin is limiting logins — wait a few minutes. The
     app won't retry automatically."
10. Description: `DescriptionPreview` in the Composite tab (only when a primary activity is tagged and mode is
    live or demo): fetch the preview → show the merged text → checkbox "Write this text to <activity name>" →
    POST with `confirm: true` → mark the latest share `garminDescriptionWritten`.
11. Dockerfile `WITH_GARMIN=1`: install `uv` from the official static binary for the target architecture, pinned
    version. `pnpm garmin:warm` runs at container start only if `ASA_ENABLE_GARMIN=1` (entrypoint script).
12. *(Human required)* Owner verification with a real account: see Acceptance.

## Tests
- Unit (fakes): ok → connected; mfa → needs_mfa → wrong code → `mfa_invalid` and the temp dir removed;
  mfa + `123456` → connected; bad → `bad_credentials`; slow → `timeout` after an injected short timeout;
  logout removes the temp dir and kills processes (assert the pid is gone); idle timer fires cleanup (fake
  timers); a tool error string → `tool_error`.
- Unit: env passed to AUTH contains `GARMINTOKENS_BASE64` inside the temp dir and **no** password in argv.
- E2E with fakes: connect `mfa@example.com` → the MFA prompt appears → `123456` → activities list from the
  fake MCP → tag → description preview shows the merged block for `demo-1002` (`Felt good\n\n[ASA:BEGIN]…`) →
  write → the fake receives the description.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner, real account, on the chosen host):**
1. Connect with MFA.
2. Activities for a real range day list with correct local times and type labels (record the roller-ski
   `typeKey`).
3. Suggestions pick the right activities.
4. The load card matches Garmin Connect within rounding.
5. Write the description block to a test activity and check it in Garmin Connect (confirm length is fine;
   adjust the 1000-char cap if needed).
6. Log out → the temp dir is gone (`ls /tmp/asa-garmin-*` inside the container).
7. Note whether login worked from the host's IP.

## Pitfalls
- The MFA prompt has no trailing newline; line-based readers hang.
- A missing `GARMINTOKENS_BASE64` silently writes long-lived tokens into the (temp) home, and without the HOME
  override into the real one. Set both.
- `garmin_mcp` removes null keys from results, so parse with optional fields.
- Don't auto-retry failed logins; Garmin rate-limits aggressively.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
