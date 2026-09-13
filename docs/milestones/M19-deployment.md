# M19: Deployment (Docker + Tailscale)

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M05, M15 | medium | M | run-demo (hosting) |

## Goal
A reproducible container deployment reachable only over the owner's tailnet with HTTPS, with persistent data,
backups, and documentation the owner can follow.

## Read first
- `docs/spec/access-deployment.md` §6–§9
- `docs/PLAN.md` D3, Q6, Q7

## In scope
Dockerfile, compose, Tailscale serve config, backup script, CI Docker build, `docs/DEPLOY.md`.

## Out of scope
Public internet exposure, reverse proxies other than Tailscale, multi-instance setups.

## Files
- `deploy/Dockerfile`, `deploy/compose.yaml`, `deploy/serve.json`, `deploy/backup.sh`, `deploy/.env.example`
- `.dockerignore` (exclude `node_modules`, `.next`, `fixtures/private`, `.git`, `test-results`, `docs/reference/generated`)
- `.github/workflows/ci.yml` (add a `docker build` job, no push)
- `docs/DEPLOY.md`

## Steps
1. Dockerfile per §7: stages `deps` → `build` → `run`. The runtime user is `node`. Create `/data` owned by
   `node`. `HEALTHCHECK` runs `node -e "fetch('http://127.0.0.1:3874/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
   Copy `assets/fonts` into the runtime image (resvg needs them at `process.cwd()/assets/fonts`).
2. `compose.yaml` per §7. Pin the `tailscale/tailscale` image to a specific version tag (write the tag you used
   in DEPLOY.md). Volumes: `ts-state`, `asa-data`. **No `ports:`**.
3. `serve.json` exactly as §7.
4. `backup.sh` per §7 with 14-file retention (`ls -1t backups/asa-*.tgz | tail -n +15 | xargs -r rm`).
5. `docs/DEPLOY.md`, written for the owner:
   1. prerequisites (Docker; a Tailscale account with MagicDNS + HTTPS certificates enabled; an auth key)
   2. `pnpm auth:hash`
   3. fill `deploy/.env`
   4. `docker compose -f deploy/compose.yaml up -d --build`
   5. open `https://asa.<tailnet>.ts.net` on the phone
   6. backups and cron
   7. updating (`git pull && docker compose up -d --build`)
   8. restoring a backup
   9. host choice notes (VPS vs home; home recommended if the Garmin track is enabled)
   10. troubleshooting (camera needs HTTPS; clock/timezone; health check).
6. CI: add a job `docker` that runs `docker build -f deploy/Dockerfile .`.

## Tests
- Local: `docker build -f deploy/Dockerfile -t asa:test .` succeeds.
- Local smoke without Tailscale: `docker run --rm -e ASA_PASSPHRASE_HASH=… -e ASA_SESSION_SECRET=… -e ASA_PUBLIC_ORIGIN=http://127.0.0.1:3874 --network host asa:test`.
  On Linux, `curl http://127.0.0.1:3874/api/health` returns ok with every lib true, including opencv. On macOS
  `--network host` differs; instead run `docker exec <container> node -e "fetch('http://127.0.0.1:3874/api/health').then(r=>r.text()).then(console.log)"`.
- Uploading a JPEG through the container persists into the `/data` volume across a restart.

## Acceptance
```bash
pnpm check
docker build -f deploy/Dockerfile -t asa:test .
```
**Human required (owner):** follow `docs/DEPLOY.md` on the chosen host, then on the iPhone log in, capture a
target, build and share a composite. Record the host type, Tailscale image tag, and result in Completion notes.

## Pitfalls
- The Next standalone server reads `HOSTNAME` and `PORT`. Setting `HOSTNAME=127.0.0.1` inside the app
  container works **only** because the app shares the Tailscale container's network namespace.
- `sharp` must install for linux-x64 or arm64 inside the image (install inside Docker, never copy
  `node_modules` from macOS).
- Set `TZ` if you want server logs in local time. Capture times come from the phone regardless.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
