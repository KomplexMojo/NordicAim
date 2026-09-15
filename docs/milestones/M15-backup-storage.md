# M15: Backups and storage safety

| Depends on | Tier | Size | Design todo |
|---|---|---|---|
| M14 | low | M | REV-14 backups |

## Goal
The owner can back up everything to Files or iCloud Drive, restore it, is reminded when a backup is due, can see storage
status, and can delete all data safely.

## Read first
- `docs/spec/privacy-storage-hosting.md` §2, §3, §4
- `docs/spec/data-model.md` §5, §6

## In scope
`exportBackup`, `importBackup`, `markBackupDone`, `backupReminderDue`, backup delivery (share/download/import picker), the
Settings page (storage status, persistence retry, backup, restore, delete all), the reminder banner.

## Out of scope
Cloud sync (Phase 2 option), automatic scheduled backups.

## Files
- `src/lib/backup/export.ts`, `import.ts`, `reminder.ts` (pure), `manifest.ts` (zod), `backup-browser.ts`
- `src/routes/settings/SettingsPage.tsx` (extend M10's page)
- `src/components/backup/BackupBanner.tsx`, `ImportDialog.tsx`, `DeleteAllDialog.tsx`, `StorageStatusCard.tsx`
- `tests/unit/backup/*.test.ts`, `tests/e2e/backup.spec.ts`

## Steps
1. `manifest.ts`: the zod schema for `manifest.json` and `blobs-index.json`.
2. `exportBackup` per §3.1: read all stores (and blobs, filtered by `includeSourcePhotos`) **first**, then `fflate.zipSync`
   with per-file levels. `appVersion` comes from `import.meta.env.PACKAGE_VERSION` (define it in `vite.config.ts` from `package.json`).
3. `importBackup` per §3.2: `unzipSync` → validate everything → per-session transactions → a summary.
4. `markBackupDone(ctx)` sets `lastBackupAt = now`.
5. `reminder.ts` per §3.4.
6. `backup-browser.ts`: `deliverBackup(fileName, bytes)` → `'shared' | 'downloaded' | 'cancelled'` (share if `canShare` with
   the zip file, else download). Call `markBackupDone` when not cancelled. `pickBackupFile()` uses a hidden file input.
7. **Settings page** sections:
   - **Storage** (`StorageStatusCard`: persisted yes/no/unknown, usage/quota MB, **Request persistent storage**)
   - **Backup** (toggle "Include source photos" default on, **Back up now**, last backup date)
   - **Restore** (pick file → `ImportDialog` with manifest counts and a Skip/Replace choice → summary)
   - **Danger zone** (`DeleteAllDialog` per §4)
   - **Demo** (from M10).
8. `BackupBanner` on the landing and session pages when `backupReminderDue(...)`, with 24 h dismissal in
   `localStorage` `asa.backupBanner.dismissedAt`.

## Tests
- Unit: reminder vectors (§3.4).
- Unit (fake-indexeddb, stubs): round trip with sources (deep equality including bytes); without sources → photos
  `discarded`, no `photo:*` blobs; import twice with `skip` → `{ added: 0, skipped: 1 }`; `replace` → `replaced: 1` and the
  same data; a corrupted `sessions/<id>.json` → throws and nothing is written; wrong `format` → `UnsupportedBackupError`.
- E2E (both projects):
  1. demo → build composite → Settings → **Back up now** → download event (zip)
  2. **Delete all data** (type DELETE) → sessions empty
  3. Restore with the downloaded zip → the demo session and composite are back
  4. the banner appears after a change when `lastBackupAt` is old (set via `window.__asaTest`).

## Acceptance
```bash
pnpm check
pnpm test:e2e
```
**Human required (owner):** on the iPhone, **Back up now** → Save to Files → iCloud Drive; delete the Home Screen app;
reinstall; Restore from iCloud Drive; confirm sessions are back. Record the result.

## Pitfalls
- A backup with photos can be large; show progress text and keep the UI responsive (yield between sessions with
  `await new Promise(r => setTimeout(r))` **outside** transactions).
- Validate everything before writing anything.

## Open questions
_(add here)_

## Completion notes
_(fill in when done)_
