# Backup and restore (REV-63, issue #13)

Source of truth for the backup file, its verification, restore, and reminders. Owner decisions 2026-09-19: one JSON file,
images base64, no password; the file holds photo GPS and the app says so.

## 1. Rule

A backup the owner explicitly creates may contain photos. It is created only by a tap on **Back up now** (Settings, or the
reminder). It goes only to the share sheet or a download. Nothing is sent anywhere automatically. No runtime network calls.

## 2. File (`nordic-aim-backup`, formatVersion 1), file name `nordic-aim-backup-YYYY-MM-DD.json`

```ts
interface BackupFile {
  format: 'nordic-aim-backup'; formatVersion: 1;
  manifest: {
    appBuild: string; createdAt: string;               // ISO
    counts: { sessions; photos; analyses; settings; blobs: number };
    sessions: Array<{ id; name: string | null; sessionDate: string | null; photos: number }>;
    blobs: Array<{ key: string; sha256: string; sizeBytes: number }>;
  };
  records: { sessions: unknown[]; photos: unknown[]; analyses: unknown[]; settings: unknown[] };  // exactly as stored
  blobs: Array<{ key; contentType: string; sizeBytes: number; createdAt: string; base64: string }>;
}
```

Records are copied **as stored, unvalidated**, so a record the schema rejects is still preserved. The file is written as
Blob parts (records, then one part per image), never as one giant string.

## 3. Verify (before anything is written)

Refuse, naming the failure, when: the text is not JSON (truncated); `format`/`formatVersion` differ; a manifest count does not
equal the records/blobs present; a blob's decoded bytes do not hash to its manifest SHA-256 or size; a key is missing or extra.
A refused file writes nothing.

## 4. Restore

1. **Plan**: each record (by id / blob key) is `new`, `same` (identical content; blobs by SHA-256) or `different`.
2. The owner sees the sessions in the file (name, date, photo count) and the counts of new / same / different; for `different`
   they choose **Keep what is on this phone** (default) or **Replace with the backup**. Two different records are never
   merged under one id.
3. **Apply**: all decoding and hashing done first; then one `readwrite` transaction over sessions, photos, analyses, blobs and
   settings; any error aborts it, so the database is either untouched or fully restored.
4. Restoring a file that is already present changes nothing (everything `same`).
5. After restoring, the app re-reads (`pipeline-changed`), so lists refresh.

## 4a. Settings restore

The `settings` row is a record like any other: `same`, or `different` under the owner's choice. Restoring never clears the
`lastBackup*` fields the restore itself does not carry: they are set from the file's `createdAt` only if newer.

## 5. Reminders

`AppSettings` gains `lastBackupAt: string | null`, `lastBackupSessions: number`, `backupReminderDays: number` (default 14,
1–365). `backupDue(settings, nowMs, sessionCount)` (pure): false when there are no sessions; true when never backed up or
`now − lastBackupAt > backupReminderDays` days. A reminder banner (Home and Results) links to Settings → Backup; Settings
shows the last backup's date and session count. `lastBackupAt` is set when the file is created and handed to share/download.

## 6. Tests

Round trip (build → parse → restore into an empty DB gives equal stores and blobs); truncated and edited files are refused
and write nothing; idempotent restore; `different` skip/replace; unreadable records survive the round trip; `backupDue`.
Owner check: a backup of the real device (~43 MB) completes on the phone; note its time against `analysis-pipeline.md` §9.
