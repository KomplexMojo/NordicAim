# Device testing (iPhone)

Checks that only a real iPhone can answer: camera permission, the rear camera, wake lock, rotation, and how well the overlay
lines up with a printed target. The specs behind this page are `docs/spec/capture-overlay.md` §7 and
`docs/spec/privacy-storage-hosting.md` §5.

## 1. Get the build on the phone

1. Push to `main` and wait for the **Deploy to GitHub Pages** workflow (GitHub → Actions) to finish.
2. On the iPhone, open **https://komplexmojo.github.io/NordicAim/** in Safari.
   - If an old version shows, close the tab and reopen it (the service worker updates on the next load).
3. **Add to Home Screen:** tap the Share button → **Add to Home Screen** → **Add**. Open the app from the new icon.

Run the checklist twice: once in a **Safari tab** and once from the **Home Screen app**. They are separate installs with
separate storage and separate camera permissions.

*Optional faster loop (no push):* `pnpm dev` on the Mac plus `tailscale serve --bg 3874`, then open the tailnet HTTPS URL on the
phone. The camera needs HTTPS; plain `http://<lan-ip>:3874` shows the `insecure_context` message instead.

## 2. Open the capture screen

1. On the home screen tap **New session** (a temporary button until M09's quick start). The capture screen opens at
   `#/sessions/<id>/capture`.
2. To see the debug chip, add `?debug=1` to the end of the address in Safari, e.g.
   `…/#/sessions/<id>/capture?debug=1`. (In the Home Screen app there is no address bar; the debug check can be done in
   Safari only.)

## 3. Checklist (capture-overlay §7)

Mark each item `pass`, `fail`, or `n/a` and add a short note for anything that is not a pass.

| # | Check | How |
|---|---|---|
| 1 | **Permission, rear camera, screen stays awake** | The camera permission prompt appears on first open. The live picture is from the rear camera. Leave the phone untouched on the capture screen for longer than the Auto-Lock time (Settings → Display & Brightness → Auto-Lock): the screen must not dim or lock. |
| 2 | **Overlay stays centred, including after rotation** | Pick **Precision** + **Prone**. The circles sit in the middle of the viewfinder. Rotate to landscape and back to portrait: the overlay is re-centred and sized to the short side each time. Switch apps and come back: the camera restarts. |
| 3 | **Resolution ≥ 1920 on the long side** | With `?debug=1` the chip shows `<videoWidth>×<videoHeight> · k … · ox … · oy …`. The larger of the two numbers is at least 1920. |
| 4 | **Review image matches the overlay (precision and sighting)** | Print or display a **precision** target. Pick Precision, line up the black aiming mark with the thick circle, tap the shutter. On the review screen the thick circle sits on the edge of the black disc, within about 3 mm by eye. Tap **Use photo**; the badge goes up by one. Repeat with the **sighting** sheet and **Sighting** (dark disc edge on the thick circle). |
| 5 | **Native camera and Photos import** | Tap **Native camera**: the iOS camera opens; take a photo and **Use Photo**; the badge goes up by one. Tap **Import from Photos**, pick two photos (include a HEIC one): "Importing 1 of 2…" shows, then the badge goes up by two. |

Finally tap **Done**: the metadata placeholder shows the number of photos you captured in this session.

## 4. Report

Copy this block into `docs/milestones/M07-capture-screen.md` → *Completion notes* (one block per mode):

```text
Device: iPhone <model>, iOS <version>
Mode: Safari tab | Home Screen app
Date: YYYY-MM-DD
1 permission / rear camera / awake: pass|fail — <note>
2 overlay centred + rotation:        pass|fail — <note>
3 debug resolution:                  pass|fail — <videoWidth>×<videoHeight>
4a precision review alignment:       pass|fail — <estimated offset mm>
4b sighting review alignment:        pass|fail — <estimated offset mm>
5a native camera:                    pass|fail — <note>
5b Photos import (incl. HEIC):       pass|fail — <note>
Done → metadata count:               pass|fail — <count>
```

Any `fail`: add a bullet under the milestone's *Open questions* and tell Claude.
