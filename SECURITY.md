# Security — Chordlight 88

## Reporting

Email **hello@amanorsac.studio** with "Chordlight security" in the subject. Please
include the version from the About screen, your OS, and what you observed. We will
acknowledge and tell you what we intend to do about it.

Please do not open a public issue for a vulnerability.

## What this app does and does not do

- It makes **no network requests of any kind**. It ships unlicensed, so there is no
  activation call, and per the Product Build Standard it contains no updater, no
  version check, no analytics and no telemetry.
- It never reads sessions, projects or presets, and never sends audio or MIDI
  anywhere off the machine.
- It opens MIDI **inputs** only, non-exclusively. It never sends MIDI.
- The only files it writes are its own two settings files, listed in the About screen.

## How the app is built

The renderer runs with `contextIsolation` on and `nodeIntegration` off, under a
Content-Security-Policy that permits only same-origin scripts, styles, fonts and
images. It reaches the main process solely through the small, explicit API in
`src/main/preload.js`. External links are restricted to an allowlist of four studio
URLs and open in the user's own browser, never in the app.

No secret of any kind is present in the source, the build scripts or the binary
(B38).
