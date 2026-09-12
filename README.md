# Chordlight 88

An 88-key MIDI display for keyboard players. It lights the keys you play, names the
chord, and shows the Nashville number in whatever key you set — with either readout
able to pop out into its own always-on-top window.

Amanorsac Studio · Windows and macOS · Electron.

---

## What it does

- **88 keys**, A0–C8, lit with a velocity gradient — harder playing reads brighter.
- **Note names above the keys**, staggered so tight voicings stay readable, with the
  bass note marked.
- **Chord readout** — root, quality, slash bass, and the notes sounding.
- **Number readout** — the Nashville number in the current key (Fmaj9 in C reads
  `4maj9`), with the Roman numeral and sol-fa syllable underneath.
- **Two pop-out windows** — chord and number, independently, always on top, and on
  macOS they float over full-screen apps.
- **Notes / Sol-fa / Off** labelling. The sol-fa ladder is
  Do Di Re Mo Mi Fa Fi So Si La Ta Ti.
- **Six accent colours and light/dark**, with the whole UI retinted from the accent.
- **Shared MIDI** — ports are never opened exclusively, so a DAW or Kontakt can hold
  the same controller at the same time. Virtual cables (loopMIDI, LoopBe, IAC) appear
  like any hardware port, and hot-plugged devices show up without a restart.

Settings live at `Documents/Amanorsac Studio/Chordlight 88/settings.json`, per the
Amanorsac Studio data-path convention.

---

## Build

Requires Node 20+.

```bash
npm install          # also bundles the fonts locally (scripts/copy-fonts.mjs)
npm start            # run it
```

Installers:

```bash
npm run dist:win     # NSIS installer + portable .exe  → dist/
npm run dist:mac     # universal .dmg and .zip          → dist/
```

Each platform's installer must be built **on that platform** — Windows builds on
Windows, macOS builds on macOS. That is what the GitHub Actions workflow is for:
push to `main` (or run it manually) and `.github/workflows/build.yml` builds both on
their own runners and uploads the results as artifacts. Push a `v*` tag and they are
attached to a GitHub release instead.

### Signing

Unsigned builds work but warn on first launch — SmartScreen on Windows, Gatekeeper on
macOS. The workflow reads the certificates from repository secrets when they exist:

| Secret | Used for |
|---|---|
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows Authenticode (.pfx, base64) |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Apple Developer ID certificate |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarisation |

---

## Layout

```
src/main/main.js        Electron main process — windows, pop-outs, IPC
src/main/preload.js     the renderer's only bridge (contextIsolation on)
src/main/settings.js    settings.json under Documents/Amanorsac Studio/
src/renderer/           the UI — index.html, styles.css, app.js
scripts/copy-fonts.mjs  bundles Inter / JetBrains Mono / Barlow Condensed
build/                  app icon and macOS entitlements
```

The renderer runs under a strict CSP with `contextIsolation` on and `nodeIntegration`
off; it reaches the main process only through the small API in `preload.js`.

---

## A note on Windows MIDI

Chromium drives Windows MIDI inputs through the WinRT backend on Windows 10 and
later, which supports multiple clients on one port — that is what lets Chordlight sit
beside a DAW on the same controller. A device whose vendor ships its own exclusive
driver is the exception; route it through loopMIDI in that case.

---

© 2026 Amanorsac Studio. All rights reserved.
