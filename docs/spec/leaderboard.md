# Leaderboard (Board tab, issue #42, REV-155)

A **Board** where shooters compare their **precision prone** and **precision standing** results without a server. Each phone keeps
its own board, built from **signed submissions** that shooters exchange by hand as files. Every submission counts as fact; anyone
can **challenge** an entry; the focus is on the source being accurate: a hand correction carries an **edited** mark, and one that
moves the score by more than 10 points is **flagged**. Sighting targets are never on the board. The design decisions and the
owner's words are in issue #42.

## 1. Where it lives

- Route **`#/board`**, the fifth and last bottom tab, **Board** (a trophy). Five tabs is the iPhone maximum.
- The same **Prone / Standing** buttons as Goals (`ViewSwitch`, `testIdPrefix="board"`, `?view=`). **No date range and no season**:
  a submission is each shooter's best 5 of all time.
- The screen, top to bottom: **your submission** (§4), **share and import** (§6), the **board** (§7).

## 2. Which targets count, and how they score

- A target can enter when it is a **precision** target with a position and its rounds, **analysed**, its alignment **found by the
  app or confirmed by the owner** (`cv` or `manual`, the same rule as Patterns), and scored (not rejected). Code:
  `leaderboard/target.ts` `boardTarget`, `services/leaderboard.ts` `loadMyBoardTargets`.
- **One board rule** for everyone: official gauge touch with the 5.6 mm hole (`BIATHLON_50M`), whatever a phone's Settings say.
  A target's board score is its ring total as a percentage of the maximum (points out of 100 for 10 rounds); missed rounds score
  0 (`leaderboard/score.ts` `boardScore`).
- A received target is **never taken on trust**: the receiving phone scores its shots itself.

## 3. Hand corrections: the automatic baseline, edited and flagged

- **Edited** means a shot or the ring alignment was corrected by hand (any `manual` shot, or a `manual` calibration;
  `leaderboard/baseline.ts` `isEdited`). Re-aligning the rings counts.
- **Automatic baseline** (`TargetAnalysis.autoBaseline`, `{ shots, recordedAt }`): the first time an automatically scored target is
  corrected (`services/adjust.ts` `commitAdjustment` → `keepBaseline`), the analysis keeps its automatic shots. Later corrections
  never replace them. While nothing was corrected, the current shots are the baseline, so a fresh re-detection is always the
  baseline. A target corrected before this existed, or one the app never scored, has none: "no automatic baseline".
- **Flagged**: the final score differs from the automatic one by **more than 10 points out of 100, either way**
  (`CORRECTION_FLAG_POINTS`). 70 → 82 is flagged; 70 → 79 is not. A flagged target still counts.
- The target screen of a corrected precision target shows **"Edited by hand: automatic 70% → yours 82% (+12)"**, and the flag
  line when flagged (`CorrectionNote`).

## 4. Your submission (chosen automatically)

- Per position, the shooter's **best 5 targets of all time** (`leaderboard/select.ts` `previewSubmission`), best first: higher
  score, then more Xs, then the smaller group (extreme spread), then the earlier date (ISSF-style). The shooter does not pick them.
- **No submission below 5** in a position; **each position stands alone** (5 prone and 3 standing submits prone only).
- Edited and flagged targets are not skipped; they carry their marks. A row is marked edited (or flagged) if any of its 5 is.
- The Board screen previews it: the 5 targets (date, score, X count, marks; each opens its target screen, whose back link returns
  to the Board), their **average**, or "3 of 5 precision standing targets: 2 more to submit."

## 5. Identity and the signed submission

- **Identity**: an **Ed25519** key pair derived from the athlete-stamp key (`provenance.md` §1): seed = HMAC-SHA-256(stamp key,
  `nordicaim-board-identity-v1`), imported through PKCS #8 (`leaderboard/identity.ts`). The same passphrase and salt always give
  the same identity, so after a restore **Unlock** makes the owner the same shooter again. A new passphrase is a new identity.
  WebCrypto only (Safari 17+), no new dependency. Sharing needs a name (Settings → Athlete) and the stamp key set or unlocked.
- **Submission** (`leaderboard/submission.ts`, format `nordic-aim-board-submission`, version 1): `publicKey`, `name`, `club`,
  `signedAt`, and `prone` and/or `standing`, each exactly 5 targets of `{ date, declared, edited, auto, final }`, where `auto`
  and `final` are shot lists `{ x, y, m }` (mm to 0.01, multiplicity) and `auto` is null without a baseline. **No photo and no
  GPS.** The signature (base64url) is over `canonicalText`: every field in a fixed order.
- **On receipt** each target is re-scored here (`boardRow`); edited is the sender's mark, or a missing baseline, or automatic shots
  that differ from the final ones, so a hidden mark is still caught. The flag is always worked out here.
- About 6.4 KB per full submission as plain JSON.

## 6. Exchanging boards by file

- **Share my submission** (signed now) and **Share the whole board** (this phone's own submission and every submission and
  challenge it holds, from every club) go to the share sheet or a download (`share-browser.ts` `shareBoardFile`). The Share screen
  says: "This shares every shooter on your board: their names, clubs and scores. Shot positions only; never a photo or a location."
- **Board file** (`leaderboard/file.ts`, format `nordic-aim-board`, version 1): `{ exportedAt, submissions, challenges }`. A single
  submission file is the submission itself. File names: `nordic-aim-submission[-<athlete>]-YYYY-MM-DD.json`,
  `nordic-aim-board-YYYY-MM-DD.json`, `nordic-aim-challenge-YYYY-MM-DD.json`.
- **Import…** reads either file. Every submission and challenge is checked **on its own** (shape and signature); a bad one is
  rejected without the rest. A summary comes first ("1 submission: 1 new shooter, 0 updated, 0 already on your board, 1 challenge")
  with **Add to my board** or **Cancel**. Importing the same file twice changes nothing.
- **Merging** (`leaderboard/merge.ts`): one submission per shooter (public key), the **newest by `signedAt`** wins; each board keeps
  its best **100** rows (`BOARD_CAP`), and a submission is kept while it is on either board. This phone's own submissions are
  never held: its row is always worked out live from its targets.
- **QR codes** at the range are a later milestone (issue #42 decisions 41–43: compact format, cycling codes, a QR library that needs
  the owner's approval).

## 7. The board

- Every shooter's **average of their 5** (`boardRows`, `compareRows`): higher average, then more Xs in total, then the smaller mean
  group, then the earliest target date. The owner's own row is shown among them, highlighted, whenever it has 5.
- A row shows rank, name, club, average and its marks (edited, flagged, challenged); it opens to its 5 targets (date, score, X,
  the automatic score beside a corrected one, marks) and any challenges.
- **Hide flagged** and **Hide challenged** filter the rows on this phone; the owner's row always shows.

## 8. Storage, backup and restore

- Store **`board`** (database version 4), one row `{ key: 'app', submissions, challenges }` kept as received and read item by
  item (`leaderboard/store-schema.ts`, `store/board-repo.ts`).
- A **full backup** carries the row as `board` (`backup.md`); a backup of chosen sessions leaves it out. On restore every submission
  and challenge is checked again and merged like an import (no Keep / Replace question). The automatic baseline travels inside each
  analysis. The signing key never travels: it is derived again from the stamp passphrase.
- **Clear board** (owner, 2026-10-02; `clearBoard` in `services/board.ts`, `ClearBoard.tsx`): under the board, shown while anything
  was received. A second tap confirms ("Remove all N shooters and every challenge you received, prone and standing?"); it writes
  the empty row, so every received submission and challenge goes, for both positions. The owner's own row is worked out live from
  their targets, so it stays. Nothing is sent; importing the files again brings the shooters back.

## 9. Challenges

- A **challenge** (`leaderboard/challenge.ts`, format `nordic-aim-board-challenge`) names the shooter, the submission
  (`submissionSignedAt`), the position and the target (0–4), with a **reason** of up to 200 characters, signed by the challenger.
  It needs a name and the stamp key, and nobody can challenge their own entry.
- It is kept on the challenger's board at once and shared on a separate tap (a board file holding just the challenge). The entry
  stays and is marked **challenged**, with "Challenged by <name>: “<reason>”" under the target.
- The shooter answers by **sharing a newer submission**: a challenge only applies to the submission it names, so it drops off.
  Challenges of this phone's own shooter are always kept, so the owner sees them. One per challenger and target (the newest); at
  most 20 per submission.

## 10. Tests

Unit: `tests/unit/leaderboard/*` (score, baseline, flag, top 5, identity, signing, tamper, merge and cap, files, challenges) and
`tests/unit/services/board.test.ts` (sign, import preview and apply, own submission ignored, backup round trip). E2E:
`tests/e2e/board.spec.ts` (tab; preview and the correction note; two phones exchanging a submission; a tampered file; a challenge
travelling to the challenged shooter).
