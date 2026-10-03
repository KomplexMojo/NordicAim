# Backup and restore (REV-63, issue #13)

Source of truth for the backup file, its verification, restore, and reminders. Owner decisions 2026-09-19: one JSON file,
images base64, no password; the file holds photo GPS and the app says so (since REV-158 the stored photos hold no
location, so the dialog says the file holds none, or counts any photo that still does). REV-151 (2026-10-01): a backup can optionally be
protected with the athlete's stamp passphrase (§2d); unprotected stays the default.

## 1. Rule

A backup the owner explicitly creates may contain photos. It is created only by a tap on **Back up now** (Settings, or the
reminder). It goes only to the share sheet or a download. Nothing is sent anywhere automatically. No runtime network calls.

## 2. File (`nordic-aim-backup`, formatVersion 2; version 1 still restores), file name `nordic-aim-backup[-<athlete>][-<fingerprint>]-YYYY-MM-DD[-<n>-session(s)].json.gz` (the session count only for a backup of chosen sessions, §2c)

REV-125: the name carries the athlete's name as a lower-case ASCII slug (Nordic letters spelled out: ø→o, æ→ae, å→a; at
most 30 characters; left out when no name is set), the key fingerprint (8 hex digits, upper case; left out when no key was
ever set up), and the phone's local calendar date. Example: `nordic-aim-backup-jane-doe-3FA91C07-2026-09-27.json.gz`.
Built by `backupFileName` (`backup/format.ts`).

```ts
interface BackupFile {
  format: 'nordic-aim-backup'; formatVersion: 2;       // 1: every image is in the file (before REV-126)
  manifest: {
    appBuild: string; createdAt: string;               // ISO
    counts: { sessions; photos; analyses; settings; blobs: number };
    sessions: Array<{ id; name: string | null; sessionDate: string | null; photos: number }>;
    blobs: Array<{ key: string; sha256: string; sizeBytes: number }>;
    rebuild?: Array<{ key: string; from: string }>;      // §2b; absent in version 1
  };
  records: { sessions: unknown[]; photos: unknown[]; analyses: unknown[]; settings: unknown[] };  // exactly as stored
  blobs: Array<{ key; contentType: string; sizeBytes: number; createdAt: string; base64: string }>;
}
```

Records are copied **as stored, unvalidated**, so a record the schema rejects is still preserved. The file is written as
Blob parts (records, then one part per image), never as one giant string.

## 2a. Compression (REV-125)

The file on disk is the §2 JSON **gzip-compressed** (`CompressionStream('gzip')`, content type `application/gzip`); the JSON
inside is unchanged (compression alone did not change the format version; §2b did). The photos are already JPEG/HEIC and do not shrink, but gzip takes back
almost all of base64's 4/3 overhead, and the records and diagram SVGs compress well: a backup is about 25% smaller, close to
the images' own size. Restore reads either kind (`readBackupText`): a file starting with the gzip bytes `1F 8B` is
decompressed, anything else is read as plain JSON, so older `.json` backups and a file the Files app expanded still restore.
A compressed file that is cut short is refused as damaged, like a truncated JSON file. Settings reports the size before and
after compression.

## 2b. Images made again on restore (REV-126, formatVersion 2)

Some stored images are made from another stored image, so a backup leaves them out and lists each in `manifest.rebuild`
with the key it is made from (`backup/rebuild.ts`):

| Left out | Made from | How |
|---|---|---|
| `photo:<pid>:working` | `photo:<pid>:original` | `makeWorkingImages` (3000 px long side, JPEG 0.9), as at import |
| `photo:<pid>:thumb` | `photo:<pid>:original` | the same call (480 px, JPEG 0.8) |
| `diagram:<pid>:full-png` | `diagram:<pid>:full-svg` | `svgToPng` at 1500 × 1700 |

An image is left out only when its source is in the same file. The original photos, summary and coach images, reference
sheets and SVGs are always kept. The working copy is the largest of these, so this makes a backup markedly smaller than
§2a alone.

- **Verify** refuses a file whose `rebuild` names a key that is not one of the kinds above, pairs it with the wrong source,
  names a key that is also in `blobs`, or whose source is not in the file.
- **Plan**: a left-out image follows its source: `new` with a new source, `different` with a different one, otherwise `new`
  only when the phone has lost its own copy (else `same`). So restoring onto a phone that already has everything makes
  nothing.
- **Apply**: every wanted image is made **before** the transaction, each original decoded once. A working copy must come
  out at the `working.widthPx × heightPx` its photo record holds, because alignment and hole positions are stored against
  it. If a photo cannot be decoded (a HEIC in a browser without HEIC support) or the size differs, the restore stops,
  says to restore in Safari on the iPhone, and writes nothing.
- The rebuilt working copy is a fresh JPEG encoding of the same original, so its pixels can differ very slightly from the
  one detection first ran on. Stored shots and alignment are not changed; only a later re-detection sees the new copy.
- The restore report counts the images made again.

## 2c. A backup of chosen sessions (REV-143)

**Make a backup** offers **All sessions** (the default) or **Choose sessions**: a list of every session, newest first (name, date,
start time, targets), with **Select all** / **Select none**; the button reads **Back up N sessions** and is disabled with none
chosen. `createBackup(db, { …, sessionIds })` (`scopeToSessions`, `src/lib/backup/scope.ts`) keeps the chosen sessions, their
photos, those photos' analyses, and the blobs that belong to them (`photo:<pid>:*`, `diagram:<pid>:*`, and `artifact:<aid>:*` for
the session's summary images); every other blob (reference sheets, coach images, anything not tied to one session) and the settings
row always come along, so a restore never meets a record pointing at something missing. The manifest gains
`scope: { kind: 'sessions', sessionIds }` (absent for a full backup, and in every earlier file; the format version is unchanged). The
file name ends `-<n>-session(s)` (§2). Such a backup **does not count as the backup**: `lastBackupAt` and the reminder are left as
they were, and the message says so. Restoring one works like any restore (§4); the preview says it is a backup of chosen sessions.

## 2d. A protected backup (REV-151, issue #44)

**Make a backup** has a **Protect with my stamp passphrase** switch, **off by default**. It needs the athlete-stamp
passphrase set up (`provenance.md` §1); without one the switch is disabled and says so. Turned on, the owner types the stamp
passphrase, which is checked against this phone's salt and fingerprint (`isStampPassphrase`) before anything is built, and the
finished file (the gzip of §2a) is encrypted (`src/lib/backup/encrypt.ts`):

- **Key:** PBKDF2-SHA-256 over the passphrase (NFKC) with a **fresh 16-byte salt for this file** and 310,000 rounds, giving a
  256-bit AES key. That key is separate from the stamp key, which never leaves the phone.
- **Cipher:** AES-GCM with a fresh 12-byte IV. The header is bound as additional data, so editing it breaks decryption.
- **File:** `NAEB` · version byte `1` · header length (4 bytes, big-endian) · header JSON
  `{ kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, cipher: { name: 'AES-GCM', iv }, keyFingerprint }` · ciphertext.
  The name gains `.enc` (`…-YYYY-MM-DD.json.gz.enc`); the content type is `application/octet-stream`.
- **Restore:** a file starting with `NAEB` asks for the stamp passphrase (naming the key fingerprint from the header) before
  anything is checked. A wrong passphrase or an altered file is refused with "That passphrase does not open this backup."
  and nothing is read. Decrypted, the file goes through §3 and §4 unchanged. A header asking for more than 10,000,000 rounds
  is refused as damaged.
- Everything else is as for any backup: protecting doesn't change what is in the file, whether it counts as the backup (§2c,
  §5), or the location line. If the passphrase is forgotten, a protected backup can't be restored; the dialog says so.

## 3. Verify (before anything is written)

Refuse, naming the failure, when: the text is not JSON (truncated); `format`/`formatVersion` differ; a manifest count does not
equal the records/blobs present; a blob's decoded bytes do not hash to its manifest SHA-256 or size; a key is missing or extra.
Also (REV-142, issue #45; `src/lib/backup/safety.ts`): a blob whose content type is not one the app stores (`image/jpeg`,
`image/png`, `image/heic`, `image/heif`, `image/webp`, `image/svg+xml`, `application/json`); a diagram SVG with content the app's
renderer never writes (a script, an event handler, a `javascript:` URL, `foreignObject`, an iframe or an entity); a settings row
that does not read as `AppSettings` (after `upgradeSettings`). A refused file writes nothing.

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

**Superseded by REV-115 (see "Complete restore" below):** the `settings` row is not subject to the Keep / Replace choice; a restore always writes the backup's settings.

## 5. Reminders

`AppSettings` gains `lastBackupAt: string | null`, `lastBackupSessions: number`, `backupReminderDays: number` (default 14,
1–365). `backupDue(settings, nowMs, sessionCount)` (pure): false when there are no sessions; true when never backed up or
`now − lastBackupAt > backupReminderDays` days. A reminder banner (Home and Results) links to Settings → Backup; Settings
shows the last backup's date and session count. `lastBackupAt` is set when the file is created and handed to share/download.
**Dismiss (issue #92).** The banner has a dismiss button. A dismissal (`{ atMs, sessions }`, device-local
`localStorage` `asa.backupReminder.dismissed`, never in a backup) hides it on every screen until a new session is
recorded or `backupReminderDays` pass since the dismissal (`backupReminderShown`, pure). A backup clears the need itself.
Before the first backup the banner still shows until the owner dismisses it.

## 6. Tests

Round trip (build → parse → restore into an empty DB gives equal stores and blobs, the left-out images made again);
a version 1 file still restores; a rebuild that fails or comes out at another size writes nothing; truncated and edited files are refused
and write nothing; idempotent restore; `different` skip/replace; unreadable records survive the round trip; `backupDue`.
Owner check: a backup of the real device (~43 MB) completes on the phone; note its time against `analysis-pipeline.md` §9.

## Complete restore (REV-115)

A restore returns the application to its previous state, not just its sessions:

- **Settings are always restored.** The settings row is the phone's one configuration (athlete name, club and picture, handedness, scoring rule and visible-hole size, hole size, backing sheet, backup reminder, the key's salt and fingerprint), not a collection to merge, so a restore writes the backup's row whichever policy (Keep / Replace) is chosen for sessions and photos. Before this, "Keep" left the phone's own (often default) settings in place and a restore appeared to lose them.
- **Preferences travel too.** The file has an optional top-level `"preferences": [{ "key", "value" }]`: the app's `localStorage` entries under `asa.` (the open or closed state of each Settings panel, the capture screen's remembered choices). Only well-formed `asa.` entries are read back; a backup from before this has none and still restores. Written by `collectPreferences` and put back by `applyPreferences` (`backup/preferences-browser.ts`).
- **The key is not.** The derived provenance key stays out of every backup (`provenance.md` §1). After a restore the report says so, and Settings → Athlete shows **Unlock**: the same passphrase re-derives it with the restored salt.
- The Settings screen re-reads the restored settings and preferences at once; no reload is needed.
- **The received board travels in a full backup** (REV-155, `leaderboard.md` §8). The file has an optional top-level `"board":
  { "submissions": [...], "challenges": [...] }`, as stored; a backup of chosen sessions (§2c) and every earlier file have none.
  On restore every submission and challenge is checked again (shape and signature) and merged like an import, newest per shooter
  winning, with no Keep / Replace question; the report says how many shooters came back. The board's signing key is never in a
  backup: it is derived from the stamp passphrase, so **Unlock** brings the same identity back. Each target's automatic baseline
  travels inside its analysis record.

The format version stays 1: the new field is optional.

