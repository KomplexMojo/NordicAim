# M05: Single-user access

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M04 | low | M | (REV-1/REV-2 hosting) |

## Goal
Only the owner can use the app: passphrase login, signed session cookie, an auth gate on all pages and APIs,
a login rate limit, and a hash CLI.

## Read first
- `docs/spec/access-deployment.md` §2, §3, §4, §6

## In scope
`src/lib/auth/passphrase.ts`, `session-token.ts`, `rate-limit.ts`; the middleware (or proxy) file; login and
logout routes; `/login` page; `pnpm auth:hash`.

## Out of scope
Multi-user, password reset, Tailscale (M19).

## Files
- `src/lib/auth/passphrase.ts`, `session-token.ts`, `rate-limit.ts`, `env.ts` (reads and validates auth env)
- `src/middleware.ts` **or** `src/proxy.ts` (see access-deployment §3 version note)
- `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`
- `src/app/login/page.tsx`
- `scripts/hash-passphrase.ts` + script `"auth:hash": "tsx scripts/hash-passphrase.ts"`
- `tests/unit/auth/*.test.ts`, `tests/e2e/auth.spec.ts`

## Steps
1. `passphrase.ts` with Node `crypto.scryptSync` per spec §2.
2. `session-token.ts` with `crypto.subtle` (HMAC-SHA256) and base64url helpers, per spec §2.
3. `rate-limit.ts`: an in-memory `Map<ip, number[]>` of failure timestamps (ms); `isLimited(ip, now)`,
   `recordFailure(ip, now)`, `reset(ip)`; window 15 min, max 5. Store it on `globalThis`.
4. `env.ts`: `authConfig()` → `{ disabled: boolean, hash?: string, secret?: string }`. Disabled only when
   `NODE_ENV === 'development'` and the hash is unset (warn once). In production, throw if the hash or secret
   is missing, or the secret is shorter than 32 characters.
5. Middleware or proxy per spec §3. Use `matcher` to exclude static paths.
6. Login route: `assertSameOrigin`, rate-limit check, verify, set cookie → `{ ok: true }`. On failure record
   it and return 401.
7. `/login` page: a single passphrase field (`autocomplete="current-password"`) and a submit button. On
   success, `router.replace(next ?? '/')`. Show "Too many attempts, try again later" on 429.
8. `scripts/hash-passphrase.ts`: prompt twice via `readline` with muted output, and print the hash only.
9. Playwright: in `playwright.config.ts`, compute a hash for passphrase `e2e-passphrase` with
   `hashPassphrase` and pass `ASA_PASSPHRASE_HASH` and `ASA_SESSION_SECRET` (a 48-char constant) to
   `webServer.env`. Add `tests/e2e/helpers/login.ts` and use it in every existing and future e2e test.

## Tests
- Unit: spec §2 vectors (hash round-trip, wrong, malformed; token expiry at 1059/1061; tampered).
- Unit: rate limit, where 5 failures → limited and after 15 min + 1 ms → not limited.
- E2E: `/` unauthenticated → redirected to `/login`; `GET /api/sessions` unauthenticated → 401; wrong
  passphrase → error shown; correct → lands on `/`; `/api/health` works without login; logout → `/` redirects again.

## Acceptance
```bash
pnpm check
pnpm test:e2e
```

## Pitfalls
- Middleware and proxy files cannot import Node `crypto` or anything from `src/lib/workspace`.
- Compare signatures in constant time (compare byte arrays manually in Web Crypto code).
- Don't log the passphrase or the cookie.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
