# Provenance: the athlete's stamp (issue #41, REV-100)

Nothing can stop someone reposting another athlete's image. What this builds is **evidence**: the summary image names its athlete
and club and carries a stamp only that athlete's key can produce for that exact content. A plain hash of a passphrase is not a
stamp (it is the same on every image, and a published hash lets weak passphrases be guessed offline), so the stamp is a **keyed**
value over the image's own data. Phase 1 only: no backend, no network, no new dependency. Phase 2 (public-key signature and a QR
code, so anyone can check without a secret) is deferred until a real need appears.

## 1. Identity and key (`lib/provenance/key.ts`)

- **Settings → Athlete**: `athleteName` (≤ 40), `athleteClub` (≤ 60) (REV-99), and a passphrase.
- **Passphrase**: at least **12 characters** (`MIN_PASSPHRASE_LENGTH`). It is never stored or backed up.
- **Key**: `PBKDF2-HMAC-SHA256(passphrase, salt, 310 000 iterations)` → 32 bytes. The **salt** is 16 random bytes, per athlete.
- **Fingerprint**: the first 8 hex characters (upper case) of `HMAC-SHA-256(key, "asa-key-fingerprint")`. It names the key without
  revealing it and is shown in Settings and on every image.
- **Storage**: the derived key (not the passphrase) is kept in the `secrets` store of the IndexedDB database (database version 2), so
  stamps are made automatically. The store is **not** in a backup. `athleteSalt` and `keyFingerprint` are in settings, so they **are**.
- **Change**: a new passphrase gets a new salt and re-keys **future** images only; an old image's stamp needs the old passphrase.
  A forgotten passphrase means old stamps can no longer be checked.
- **Restore**: after restoring a backup on a new phone the key is absent. Entering the same passphrase re-derives it with the
  restored salt; it is accepted only when its fingerprint equals the stored `keyFingerprint`.

## 2. The payload (`lib/provenance/payload.ts`)

A deterministic JSON string (keys sorted, numbers fixed to 2 decimals for positions and 1 for the alignment radius), covering:

- `v: 1`, athlete `name` and `club`, `sessionDate`, `scoringRule`, `visibleHoleDiameterMm`, `release`, `createdAt`;
- per target (sorted by kind order, then photo id): `kind`, the score under all three rules (precision total or sighting hits),
  `photoSha256` (SHA-256 of the **original photo bytes**), `captureUtc`, the device `make` and `model`, the **paper signature**
  (alignment `cx`, `cy`, `radiusPx` and the shot positions in mm, sorted by x then y, with each shot's multiplicity).

Changing any one of them changes the stamp. GPS, lighting and the backing colour are deliberately left out.

## 3. The stamp (`lib/provenance/stamp.ts`)

`stamp = <fingerprint>-<first 12 hex chars, upper case, of HMAC-SHA-256(key, payload)>`, for example `9F2C41AB-3D7E90B1C2A4`.
It prints in the footer of the summary image as visible text (the share sheet and Strava strip metadata but not pixels):

`Athlete: <name> · <club> · Stamp: <stamp>`

With no key set, a name and club alone print, without a stamp. The payload and stamp are stored in the artifact's JSON sidecar
(`provenance: { payload, stamp }`), which is backed up with the rest.

## 4. Verify (`#/verify`, `lib/provenance/verify.ts`)

Pick a session, type the stamp shown on an image and the passphrase. The app derives the key from the passphrase and the salt in settings (so it needs the athlete's settings, on this phone or restored from a backup), checks the stamp's fingerprint, and recomputes the HMAC over each stored
image's payload. Answers: **made with this key** (and shows the athlete, club, date, scoring rule and per-target scores from the
stored payload, to compare with the image), or **does not match**. A wrong
passphrase fails. Only someone with the passphrase can verify or mint a stamp.

## 5. Limits (shown to the user in Settings)

- The stamp proves who generated the image, not who is presenting it. It can be cropped out.
- A verifier who holds the passphrase could also mint stamps (third-party checking needs phase 2).
- The fingerprint makes one athlete's images linkable to each other.
- One athlete per phone.
- The payload is the same data a future Hall of Precision submission (#42) would need; no submission or network code exists.
