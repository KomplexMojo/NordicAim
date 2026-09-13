# Spec: access control, security headers, deployment

Single user (REV-2), hosted (REV-1). Layers: **Tailscale** (private network plus HTTPS), then **passphrase
session**, then **same-origin guard**.

## 1. Threat model (short)

The assets are target photos (private), optional Garmin tokens (sensitive), and the passphrase. The server
has no public port; it is reachable only by devices on the owner's tailnet. The app still authenticates, so a
compromised tailnet device or a misconfigured serve rule doesn't expose data.

## 2. Passphrase and session (`src/lib/auth/*`)

```ts
// passphrase.ts (Node runtime)
export function hashPassphrase(passphrase: string, salt?: Buffer): string;
// format: scrypt$16384$8$1$<saltBase64>$<hashBase64> ; keylen 64 ; salt default randomBytes(16)
export function verifyPassphrase(passphrase: string, encoded: string): boolean; // timingSafeEqual; false on malformed

// session-token.ts (Web Crypto only; works in middleware AND route handlers)
export async function createSessionToken(secret: string, nowSec: number, ttlSec = 2592000): Promise<string>;
// "v1.<expSec>.<nonceB64url>.<sigB64url>" ; sig = HMAC-SHA256(secret, "v1.<expSec>.<nonceB64url>")
export async function verifySessionToken(secret: string, token: string, nowSec: number): Promise<boolean>;
```

- Cookie `asa_session`: `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, plus `Secure` when the request is
  HTTPS (`x-forwarded-proto: https` or the URL protocol).
- `POST /api/auth/login { passphrase }`: verify against `ASA_PASSPHRASE_HASH`; on success set the cookie →
  `{ ok: true }`. On failure, 401 `invalid_passphrase`.
- **Rate limit** (in-memory, per client IP from `x-forwarded-for` first value, else `unknown`): 5 failures in
  15 minutes → 429 `rate_limited` until the window passes.
- `POST /api/auth/logout` clears the cookie.
- CLI: `pnpm auth:hash` prompts (no echo) and prints the encoded hash for `.env`.
- **Dev convenience**: if `NODE_ENV === 'development'` **and** `ASA_PASSPHRASE_HASH` is unset, auth is
  disabled and the server logs a warning once. In production an unset hash or secret is a startup error.

**Vectors**: `verifyPassphrase('correct horse', hashPassphrase('correct horse'))` → true; wrong passphrase →
false; `'scrypt$bad'` → false. A token created at t = 1000 with ttl 60 verifies at 1059 and fails at 1061.
A token with one tampered character fails.

## 3. Middleware (`src/middleware.ts`, or `src/proxy.ts` on Next.js ≥ 16)

- **Version note**: Next.js 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`). Check the
  installed major version in `package.json` and use the matching name. The logic below is identical either way.
- Runs on everything except `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, `icons/*`.
- **Public** (no session needed): `/login`, `/api/auth/login`, `/api/health`.
- Everything else: missing or invalid cookie → pages redirect `302 /login?next=<path>`; `/api/*` → 401
  `unauthenticated`.
- Use only Web Crypto (`crypto.subtle`). No Node `crypto` import in middleware.

## 4. Same-origin guard (`src/lib/auth/same-origin.ts`)

```ts
export function allowedOrigins(env: NodeJS.ProcessEnv): string[];
// [ASA_PUBLIC_ORIGIN] + ASA_EXTRA_ORIGINS split on ',' + (dev: 'http://127.0.0.1:3874','http://localhost:3874')
export function assertSameOrigin(req: Request): void; // throws HttpError(403,'cross_origin') if Origin header present and not allowed;
// if Origin is absent, require Sec-Fetch-Site to be 'same-origin' or 'none' or absent
```

Call it first in every POST, PUT, PATCH, and DELETE handler.

## 5. Response headers (`next.config.ts` `headers()`)

For all routes:
- `Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  (`'unsafe-eval'` added only in development, which Next dev needs)
- `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`

Image routes add `Cache-Control: private, no-store`.

## 6. Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ASA_WORKSPACE_DIR` | no | `~/.advanced-shooting-analysis` (Docker: `/data`) | workspace root |
| `ASA_PASSPHRASE_HASH` | prod | — | output of `pnpm auth:hash` |
| `ASA_SESSION_SECRET` | prod | — | ≥ 32 random chars (`openssl rand -base64 48`) |
| `ASA_PUBLIC_ORIGIN` | prod | — | e.g. `https://asa.<tailnet>.ts.net` |
| `ASA_EXTRA_ORIGINS` | no | — | comma list (dev over tailscale serve) |
| `ASA_ENABLE_GARMIN` | no | `0` | optional track (M20–M21) |
| `HOSTNAME` / `PORT` | yes | `127.0.0.1` / `3874` | Next standalone server bind |

Commit `.env.example` with every var and empty values. `.env*` is gitignored.

## 7. Deployment topology (`deploy/`, M19)

```text
host (small Linux VPS or home machine with Docker)
└─ docker compose
   ├─ tailscale  (tailscale/tailscale:<pinned>)  hostname "asa", HTTPS serve :443 → http://127.0.0.1:3874
   └─ app        (built from deploy/Dockerfile) network_mode: "service:tailscale", binds 127.0.0.1:3874, volume asa-data:/data
```

- `deploy/Dockerfile`: multi-stage `node:22-bookworm-slim`; `corepack enable`; `pnpm install --frozen-lockfile`;
  `pnpm build` with `output: 'standalone'`; runtime copies `.next/standalone`, `.next/static`, `public`, and
  `assets/fonts`; runs as a non-root user; `ENV HOSTNAME=127.0.0.1 PORT=3874 ASA_WORKSPACE_DIR=/data`;
  `CMD ["node", "server.js"]`. Build arg `WITH_GARMIN=0|1` installs `uv` only when 1.
- `deploy/compose.yaml`: the tailscale service with `TS_AUTHKEY`, `TS_HOSTNAME=asa`,
  `TS_STATE_DIR=/var/lib/tailscale`, `TS_SERVE_CONFIG=/config/serve.json`, and volumes for state and config.
  The app service uses `network_mode: service:tailscale`, `env_file: .env`, `volumes: [asa-data:/data]`,
  `restart: unless-stopped`. **No `ports:` section.**
- `deploy/serve.json`:

```json
{
  "TCP": { "443": { "HTTPS": true } },
  "Web": { "${TS_CERT_DOMAIN}:443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:3874" } } } }
}
```

- Human prerequisites (owner): a Tailscale account; **MagicDNS and HTTPS certificates enabled** in the admin
  console; a tagged auth key; the phone on the tailnet.
- `deploy/backup.sh`: `docker run --rm -v asa-data:/data -v "$PWD/backups:/b" busybox tar czf /b/asa-$(date +%F).tgz -C /data .`
  Keep 14 files. A cron example goes in `docs/DEPLOY.md`.

## 8. Testing on the phone during development

Run `pnpm dev` (binds 127.0.0.1:3874) on the Mac, then `tailscale serve --bg 3874` (check
`tailscale serve --help`; the syntax varies by version). Open `https://<mac-name>.<tailnet>.ts.net` on the phone.
Add that origin to `ASA_EXTRA_ORIGINS`.

## 9. Privacy invariants (enforced)

- `pnpm check:privacy` (M01) fails if any git-tracked image has GPS EXIF or any path under `fixtures/private/` is tracked.
- Logs never include request bodies for `/api/auth/*` or `/api/garmin/*`.
- No outbound network calls from the server except the optional Garmin track (M21).
