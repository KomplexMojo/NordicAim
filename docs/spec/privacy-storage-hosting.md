# Spec: privacy, storage safety, backups, hosting

Phase 1 runs entirely on the phone (REV-10). There is no server and no login: the data never leaves the device
except through the owner's own share or backup actions.

## 1. Privacy invariants

1. **No runtime network requests** except loading the app's own same-origin assets (HTML, JS, CSS, wasm, icons,
   `demo/`, `dev-fixtures/`, `diagnostics/`). No APIs, analytics, CDNs, external fonts, or error reporting.
2. **Photos never leave the phone** except inside a backup zip the owner explicitly exports (§3).
3. **The only image shared** is a stored `CompositeArtifact` (rendering-composite §6–§7).
4. **Repo privacy**: the public repo never contains `fixtures/private/` or images with GPS. `pnpm check:privacy`
   (M01) enforces this in CI.
5. Nothing logs EXIF GPS values (console included).

## 2. Storage persistence (`src/lib/store/persistence-browser.ts`)

Facts (WebKit storage policy): Home Screen web apps have their own usage counter and aren't subject to Safari's
7-day eviction of script-writable storage. Since iOS 17, quotas scale with disk size. `navigator.storage.persist()`
marks storage persistent. **Deleting the Home Screen app deletes its data**, and clearing website data in Safari
settings does too.

```ts
export async function requestPersistence(ctx: ServiceContext): Promise<boolean | null>;
// if !navigator.storage?.persist → store persisted=null, return null
// else r = await navigator.storage.persist(); store { persistRequested: true, persisted: r }; return r
export async function storageStatus(): Promise<{ persisted: boolean | null; usageBytes: number | null; quotaBytes: number | null }>;
// navigator.storage.persisted?.() and estimate?.()
```

- Call `requestPersistence` once after the **first successful ingest** (when `persistRequested` is false).
- The Settings page shows persisted status, usage/quota (MB, 1 dp), and a button to retry the request.

## 3. Backups (`src/lib/backup/*`)

### 3.1 Format

A zip created with `fflate`, named `asa-backup-<YYYY-MM-DD>-<HHmm>.zip` (local time):

```text
manifest.json            { "format": "asa-backup", "formatVersion": 1, "appVersion": "<package.json version>",
                           "createdAt": UtcIso, "includesSourcePhotos": boolean,
                           "counts": { "sessions": n, "photos": n, "analyses": n, "blobs": n } }
settings.json            AppSettings
sessions/<id>.json       BiathlonSession
photos/<id>.json         TargetPhoto
analyses/<photoId>.json  TargetAnalysis
blobs-index.json         [{ "key": "<blob key>", "path": "blobs/<n>", "contentType": "...", "sizeBytes": n, "createdAt": UtcIso }]
blobs/<n>                raw bytes (n = 0,1,2… in index order)
```

- Compression: level 0 for `blobs/*` (already compressed), level 6 for JSON.
- `includeSourcePhotos: false` omits `photo:*:original|working|thumb` blobs. Diagrams and artifacts are always included.

```ts
export async function exportBackup(ctx: ServiceContext, opts: { includeSourcePhotos: boolean; appVersion: string }):
  Promise<{ fileName: string; bytes: Uint8Array; manifest: BackupManifest }>;
// reads everything first, then zips; after the caller confirms delivery → markBackupDone(ctx) sets lastBackupAt = now
export async function importBackup(ctx: ServiceContext, bytes: Uint8Array, opts: { onConflict: 'skip' | 'replace' }):
  Promise<{ added: number; skipped: number; replaced: number; errors: string[] }>;
```

### 3.2 Import rules

1. Unzip; `manifest.format === 'asa-backup'` and `formatVersion === 1`, else throw `UnsupportedBackupError`.
2. Validate every JSON with zod **before writing anything**. Any failure → throw, and nothing is written.
3. Per session, in one transaction:
   - not present locally → add session, its photos, analyses, and their blobs → `added++`
   - present and `skip` → `skipped++`
   - present and `replace` → delete the local session tree, then add → `replaced++`
4. A photo whose source blobs are missing from the backup is set to `sourceRetention: 'discarded'`.
5. `settings.json` from the backup is **not** applied, except `profileOverrides` when the local values are still defaults.
6. After import, set `lastChangeAt = now`.

**Vector (round trip)**: seed the demo session (M10) and build a composite → `exportBackup({ includeSourcePhotos: true })`
→ open a fresh database → `importBackup` → every store deep-equals the original (blob bytes compared with a
byte-by-byte check). With `includeSourcePhotos: false` → both photos are imported with `sourceRetention: 'discarded'`
and `photo:*` blobs are absent. Importing twice with `skip` → `{ added: 0, skipped: 1 }`.

### 3.3 Delivery (`backup-browser.ts`)

- **Export**: `File([bytes], fileName, { type: 'application/zip' })`. If `navigator.canShare?.({ files: [file] })` →
  `navigator.share({ files: [file] })`; the owner picks **Save to Files** → iCloud Drive. Otherwise download via
  `<a download>`. On success → `markBackupDone(ctx)`.
- **Import**: `<input type="file" accept=".zip,application/zip">` → `file.arrayBuffer()` → a confirm dialog with
  manifest counts and a conflict choice → `importBackup`.

### 3.4 Reminder (pure, `reminder.ts`)

```ts
export function backupReminderDue(i: { lastBackupAt: string | null; lastChangeAt: string | null; reminderDays: number;
  now: string; hasReviewedTargets: boolean }): boolean;
```

Rules, in order:
1. `!hasReviewedTargets` → false
2. `lastBackupAt === null` → true
3. `lastChangeAt === null` or `lastChangeAt <= lastBackupAt` → false
4. `now − lastBackupAt ≥ reminderDays × 86400000 ms` → true, else false

Vectors (reminderDays 7, reviewed true unless stated):
- never backed up → true
- backup `2026-09-01T00:00:00.000Z`, change `2026-09-05T…`, now `2026-09-08T00:00:00.000Z` → true (exactly 7 days)
- the same with now `2026-09-07T23:59:00.000Z` → false
- change `2026-08-30T…` (before backup), now `2026-09-20…` → false
- reviewed false → false

UI: a dismissible banner on the landing and session pages ("Back up your sessions — last backup N days ago"), hidden
for 24 h after dismissal (`localStorage`).

## 4. Delete all data

Settings → **Delete all data** → a dialog requiring the typed word `DELETE` → close the DB → `indexedDB.deleteDatabase('asa')`
→ clear `localStorage` keys starting with `asa.` → reload to the landing page.

## 5. Content Security Policy (`index.html` `<meta http-equiv="Content-Security-Policy">`)

```text
default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'
```

If OpenCV.js fails to initialise under this CSP on iOS Safari (checked on the M01 diagnostics page), add `'unsafe-eval'`
to `script-src` and record why in the milestone's Completion notes. Development may relax `script-src` for Vite HMR
(inject the meta tag only in production builds via a Vite `transformIndexHtml` hook).

## 6. Hosting on GitHub Pages

- Workflow `.github/workflows/pages.yml`: on push to `main` and `workflow_dispatch`.
  - `build` job: checkout → pnpm → Node 22 → `pnpm install --frozen-lockfile` → `pnpm check` →
    `VITE_BASE=/advanced-shooting-analysis/ pnpm build` → `actions/upload-pages-artifact` (path `dist`).
  - `deploy` job (`needs: build`, `permissions: { pages: write, id-token: write }`, environment `github-pages`):
    `actions/deploy-pages`.
  - Use the current major versions of these official actions and pin them in the workflow.
- `vite.config.ts`: `base: process.env.VITE_BASE ?? '/'`. **Hash routing** (`createHashRouter`) avoids 404s on deep links.
  The PWA manifest `start_url` and `scope` use the base (`./`).
- URL: `https://komplexmojo.github.io/advanced-shooting-analysis/`.
- **Owner step (human)**: repo Settings → Pages → Build and deployment → Source: **GitHub Actions**.
- The Pages build must never set `VITE_FAKE_CAMERA`.

## 7. Testing on the iPhone

- Normal path: push to `main`, wait for the Pages deploy, then open the URL (Safari and Home Screen app).
- Faster local iteration (optional): `pnpm dev` plus `tailscale serve --bg 3874` gives an HTTPS URL on your tailnet,
  which the camera needs. The phone must be on the tailnet.
