# Changelog — Chordlight 88

Written for the person using the app, not for the commit log.

## 1.1.0 — September 2026

- **The keyboard is the floor of the window.** It sits at the bottom, edge to
  edge, at any window size — maximise the window and it stretches across the
  screen. Detach it and the window opens at exactly the size the keys had, so
  nothing shrinks; drag that window bigger and the keys grow with it.
- **Play a MIDI file.** Open one from the strip above the keys, or drop it on
  the window. Play, pause, step chord by chord, scrub, slow down to quarter
  speed, loop. Pick a MIDI output in Setup and the file plays through Kontakt
  or your DAW while Chordlight shows it.
- **Record what you play.** ● Rec makes a take; Keep saves the last five minutes
  even if you never pressed record. Standard .mid files, the timing exactly as
  played, in Documents › Amanorsac Studio › Chordlight 88 › Recordings.
- **Record a video.** ◉ Video captures the Chordlight window to a WebM file —
  on Windows with the system audio, so the clip carries what was playing.
- **Stage** (⛶ or F11): full screen, no chrome, chord left, number right, keys
  across the whole screen. Esc to leave.
- **Key light: Solid or Gradient**, and **Velocity: Sensitive or Fixed**. Solid
  with velocity is the new default.
- **Backdrop: chroma green or blue** behind everything but the keys, glows off,
  for keying the app over your own video.
- Preferences remembered: key light, velocity, pedal, backdrop, MIDI output.

## 1.0.1 — September 2026

- **The sustain pedal no longer jumbles the chords.** Play a new chord with the
  pedal down and the readout names that chord, not everything still sounding.
  What the pedal is holding stays lit — flat and dimmer, with a bar across the
  top of the key — so you can see it ring without it crowding the name. A rolled
  voicing still counts as one chord, and a note you are still holding is never
  pushed aside. The chord card counts what is ringing.
- **Setup gains a Pedal choice** — *Current chord*, or *Everything sounding* if
  you prefer the old behaviour. It is remembered between sessions.
- **The pop-out chord and number windows now fill the window you give them.**
  They were stuck at their smallest size unless the window was made very tall.
- On macOS the licence, changelog and third-party notices now travel inside the
  application bundle, where macOS expects them.

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

- The Windows installer is not yet code-signed, so SmartScreen warns on first run.
  (From 1.0.1 the macOS build is signed with a Developer ID certificate and
  notarised by Apple, so Gatekeeper opens it without a warning.)
- A controller whose manufacturer ships an exclusive-access driver may not be shared
  with a DAW. Route it through loopMIDI in that case.
