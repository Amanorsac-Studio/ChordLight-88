# Changelog — Chordlight 88

Written for the person using the app, not for the commit log.

## 1.0.0 — September 2026

First release.

- **88 keys** light up as you play, brighter the harder you hit them.
- **Note names above the keys**, staggered so close voicings stay readable, with the
  bass note marked.
- **Chord readout** — root, quality, slash bass, and the notes sounding.
- **Number readout** — the Nashville number in the key you set. Fmaj9 in C reads
  `4maj9`.
- **Sol-fa mode** — key labels and the number readout both switch to
  Do Di Re Mo Mi Fa Fi So Si La Ta Ti. In sol-fa, that same chord reads **Fa maj9**
  and a plain triad on 1 reads **Do major**.
- **Three pop-out windows** — chord, number and keys, each into its own always-on-top
  window, each docking back on its own. On macOS they float over full-screen apps.
- **Six accent colours, light and dark.** The whole interface retints, including the
  velocity glow.
- **Shared MIDI.** Ports are never opened exclusively, so a DAW or Kontakt can hold
  the same controller at the same time. Virtual cables (loopMIDI, LoopBe, IAC) appear
  like any hardware port, and a keyboard plugged in mid-session shows up without a
  restart.
- Your choices are remembered between sessions.

Known limits in this release:

- The installers are not yet code-signed, so Windows SmartScreen and macOS Gatekeeper
  warn on first run.
- A controller whose manufacturer ships an exclusive-access driver may not be shared
  with a DAW. Route it through loopMIDI in that case.
