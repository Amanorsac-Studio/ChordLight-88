# Changelog — Chordlight 88

Written for the person using the app, not for the commit log.

## 2.0.6 — October 2026

- **Setup is in tabs now.** Play, Sound, Clip and Look. The drawer had
  grown to thirty-odd fields in one long row with an *Advanced* drawer
  underneath, and changing the MIDI port meant reading past all of it.
  Nothing was taken away — everything that was in Advanced is in one of the
  four tabs — and Chordlight remembers which tab you were on.
- **Attack and release, by hand.** Setup › Sound. *Release* is how long a
  note takes to fall silent after you lift the key; left at *Instrument* the
  sound decides, which is longer in the bass than at the top. *Attack* at
  *Natural* is the hammer as it was recorded; wind it up and the note fades
  in, which is how you get a swell out of a piano. Both take effect on the
  next note, never on one that is already sounding.
- **Notes hold a little longer.** The built-in instruments were cut off
  slightly too soon when you lifted a key. The natural release is now about a
  third longer across the keyboard.
- **Keyboard input can be switched off.** Setup › Sound › Keyboard input now
  has *Off — built-in sound only*, so a clip made with Grand, SP or EP
  carries just the instrument and nothing of the room. Before, the only
  choices were a device or the default one.
- **Chordlight asks for your licence key again.** Every build since 2.0.1
  ran with the licence check switched off, because the store could not yet
  issue keys for it — anyone with the download could use it. From 2.0.6 the
  full version asks for the key on your My Apps page the first time it
  opens: one key, two computers, and it keeps working offline afterwards.
  About shows the status and frees the seat again with *Deactivate this
  computer*. The Free Trial edition is unchanged — seven days, no key, and
  it still never touches the internet.
- **Three instruments, built in.** On the title bar, beside the note
  labels: *Own · Grand · SP · EP* — *Grand 1*, *SP Natural*
  and *Soft EP 1* — Amanorsac Studio's own sampled instruments (30 notes
  across the keyboard, 4–8 velocity layers each). They play from your
  keyboard and go into every clip, WAV and Chordlight file through the mix,
  with the pedal, 96 voices and a limiter so big chords never distort. You
  hear them through the computer at about 10 ms; an instrument is playable
  about a second after you choose it and finishes loading in the
  background. On a Mac the Grand is on from the first run, so a clip always
  has sound; on Windows the sound is off until you choose it, since a DAW
  is usually making the sound there. *Sound level* sets how loud. Adds
  about 110 MB.
- **Mac: pressing Video no longer blanks the window.** To record "System —
  what is playing", the Mac build used to ask macOS to record the screen just
  for its sound. That needs a permission the app never asked for, gave back
  no sound anyway, and could take the window down. The Mac build now never
  asks for the display at all. System sound is greyed out on the Mac in this
  version with a note (Apple needs macOS 14.2 or later and a newer runtime —
  it returns in 2.1); a saved System setting falls back to Inputs with a
  message. Windows is unchanged.
- **If the window ever dies, it comes back.** Should the recorder or the
  encoder fail, the window reloads itself with a message instead of staying
  blank, and a small log is written — About › Logs opens the folder — so
  you can send it in.
- About shows whether system sound is available on this machine.

## 2.0.3 — October 2026

- **Chordlight 88 Free Trial.** A separate download, installed beside the full
  version: every feature for 7 days from the first time it opens, recordings
  up to 1 minute, and "Free Trial" on the title bar, in About and in a small
  mark on every recorded clip. A badge counts the days down. After 7 days it
  locks and shows where to get the full version — settings and recordings
  stay where they are, and the full version picks them up. Like the full
  version it makes no network requests at all.
- Chord names: in a sharp key (or C), Auto spelling now names the ♭2, ♭3, ♭6
  and ♭7 as flats — the tritone sub in C reads D♭9, not C♯9. G7♯9♭13, G7♭9♭13
  and G7alt are recognised.

## 2.0.2 — October 2026

- **Fast playing while recording a video no longer makes the keys drop out.**
  Before, every note you played repainted the whole window and the video
  frame was drawn on the same thread, so a dense passage queued the notes
  up behind the drawing and the lights fell behind your hands. Now:
  - the video frame is drawn on its own thread and handed to the recorder at
    a steady 30 or 60 frames a second, whatever the window is doing;
  - the window repaints at most once per display frame, only the keys that
    changed are touched, and chord names are remembered once worked out.
  Measured with fast eight-note chords under the pedal while recording, a
  note now reaches the screen in about 3 ms (it was about 30, and up to
  140); the window no longer freezes at all with the Preview open.
- The clip looks exactly as before — frame for frame, pixel for pixel.
- Recording keeps full speed when another app covers Chordlight, and the
  computer is kept from napping the app while a video records.
- The WAV is packed on the audio thread where the system allows it, so a
  busy window can never cost the file a block.
- The Preview header says "own thread" when the clip is drawn on its own
  thread. If a machine cannot start that thread, the window draws the clip
  as before and the header just says the size.

## 2.0.1 — October 2026

- Fix: choosing a new backdrop video left the old one playing (same file
  name, so the app took it for the same video), and a new picture could
  linger in the clip's cached background. Every choice is now a fresh load,
  in the window, the pop-outs, the preview and the clip.
- About: the privacy note now says what the build actually does — the two
  licence calls to amanorsac.studio in the licensed build, none in the
  unlicensed one.
- This release ships unlicensed (LICENSED_PRODUCT = false): no activation
  screen and no network requests, until the product is in the store catalogue.

## 2.0.0 — October 2026

- **Chordlight is now a licensed product.** It asks for your licence key the
  first time it opens — the key is under My Apps at amanorsac.studio — and
  one key covers two computers. Once activated it keeps working for 30 days
  without the internet, refreshing quietly whenever it is online. About
  shows the licence and has **Deactivate this device** for moving to a new
  computer.
- Licensing follows the Amanorsac License Integration Standard to the
  letter: the server's proof is verified with the studio's public key before
  anything is unlocked; the key and proof are stored encrypted with the
  operating system's key store, in the machine-state folder. The two
  licence calls are the only network requests the app makes. There is no
  master key and no override in the app.
- Window positions on Windows moved from the roaming profile to
  %LOCALAPPDATA%, per the File & Data Conventions; the move is automatic.

## 1.6.0 — October 2026

- **Readout plate** — Advanced › Look › Readout plate: Off, Dark or Light,
  with a strength slider. A panel behind the chord, the number and the
  title, so they read over any picture or video. Light turns the text to
  dark ink.
- **Chord trail** — Advanced › Video › Chord trail: Off, Last 2 or Last 4.
  The chord you are on stays big; the ones before it climb away from the
  keys, each smaller and fainter, and the number side mirrors it — a 2-5-1
  in one glance. A chord enters the trail only once it has held for a third
  of a second, so a rolled chord's first note never leaves a mark.

## 1.5.5 — October 2026

- The detachable preview window is withdrawn: a second window painting the
  frame lagged on real hardware. The Preview panel stays — drag it, three
  sizes, red while recording.

## 1.5.4 — October 2026

- **The preview keeps up.** The frame was being repainted from scratch
  thirty times a second — 88 gradient keys, blurred glows, theme look-ups —
  in the main window and again in the preview window. It is now five cached
  layers (background, text, white keys, black keys, and the lit keys and
  name tags on top), and nothing is redrawn until a key or a word changes.
  A held chord costs nothing; the recorder is still fed a frame four times
  a second so a still picture stays a picture. A video backdrop is the one
  thing that still moves every frame, and it is a single draw.

## 1.5.3 — October 2026

- Fix: ⇱ on the Preview panel opened the window and closed it again in the
  same click (two handlers on one button), so the preview never left the
  main window. One handler now; the panel hides as the window opens.

## 1.5.2 — October 2026

- **The preview detaches.** ⇱ on the Preview panel opens it in a window of
  its own — drag it to a second screen, double-click (or ⛶, or F11) for full
  screen, Esc or ✕ to come back. It paints the same frame from the same
  state, so it is the clip, live, wherever you put it. It is remembered and
  reopens with the app like the other pop-outs.
- "Play something" is gone: an empty chord shows a dash in the app and
  nothing at all in the clip.
- The Stage button is gone from the title bar — the drawn clip and the
  detached preview made it redundant.
- The video backdrop loops regardless of the file, and restarts if the
  system pauses it.

## 1.5.1 — September 2026

- **◫ Preview** — a floating, draggable panel showing exactly what the clip
  will look like, live, before and while you record. Three sizes; a red
  frame while a clip is recording. It shows the drawn frame, so the title,
  keys position, backdrop and tint are all seen as the video will have them.

## 1.5.0 — September 2026

- **Your video as the backdrop.** Backdrop › Your video, then Advanced ›
  Choose… — an MP4, WebM or MOV loops behind the app and in the clip, with
  the same tint over it. It is copied beside your preferences, so the
  original can move. Up to 1 GB.
- **Chroma green and blue are back**, for keying in OBS, Premiere or
  Resolve — in the app and, more usefully, in the clip: a flat colour behind
  everything, and no glow anywhere that would fringe when keyed out.

## 1.4.2 — September 2026

- **Title font, size and colour** — Advanced › Title font (Inter, Barlow
  Condensed, JetBrains Mono, Serif), Title size (18–140), Title colour (text,
  accent, alt, white, gold — the first three follow the theme).

## 1.4.1 — September 2026

- **The clip's keys are a quarter of the frame**, not nearly half.
- **Advanced › Keys in the clip — Bottom, Middle or Top.** The readouts take
  the larger space left, the title the other.
- **Advanced › Clip title** — a line of text in the video (a lesson name,
  a song), also used as the title of a .chordlight take.
- Your picture backdrop, with its tint, is in the clip.

## 1.4.0 — September 2026

- **Video is drawn, not screen-grabbed.** Every frame, Chordlight paints its
  own Stage layout — readouts on top, keys edge to edge, the theme or your
  picture behind — into a 1080p frame (4K on a 4K screen at Best) and
  records that. So the clip is always the whole Chordlight and nothing else:
  detached keys, a floating chord card, another app on top, none of it
  matters. The OS window capturer that refused the window on some machines
  (and fell back to the whole desktop) is no longer asked for the picture.
- System sound still comes from the desktop capturer, sound only; if a
  machine refuses even that, the app says so and records the inputs.

## 1.3.1 — September 2026

- **Every take gets its own folder.** `Recordings/Chordlight take …/` holds
  that take's .mid, .mp4, .wav and .chordlight together. Older takes stay
  where they were and still show in the list.

## 1.3.0 — September 2026

- **.chordlight files.** A take, its sound and its look in one file. Turn on
  Advanced › Also save › + .chordlight and every Rec take and every video
  also saves a `.chordlight` beside it. Send it to anyone with Chordlight:
  double-click and it opens cued in the transport — play and the keys light,
  the chords read out and the sound plays underneath; step, scrub, loop, and
  slow it to ½× with the pitch held, sound and all.
- Inside: `take.mid`, the mix as AAC (or Opus where the machine has no AAC
  encoder; the 24-bit WAV instead when + WAV is on), and a small manifest
  with the key centre, spelling, Notes/Sol-fa and accent colour, which are
  applied for that playback without touching your own preferences. It is a
  plain zip — anyone can open it with a zip tool.
- The Recordings list shows `.chordlight` takes with a ♪; Open… and
  drag-and-drop take them too.
- **Rec and Keep now hear the mouse and the computer keyboard** as well as
  MIDI, so a take made without a keyboard plugged in is still a take.

## 1.2.2 — September 2026

- **Clips are MP4** (H.264 + AAC) on any machine whose recorder can write
  them — which is Windows 10/11 and macOS as a rule — and WebM only where it
  cannot. Advanced › Video shows which one this machine gives you.
- **Quality, re-tuned for the best look at the smallest size:** Best is
  60 fps at 16 Mb/s, Good (the default) 30 fps at 8 Mb/s, Small 30 fps at
  4 Mb/s. Audio is 48 kHz at 256 kb/s in all but Small, with echo-cancel,
  noise suppression and auto-gain off — what your interface sends is what
  lands in the file.
- **Advanced › Also save — + MIDI, + WAV.** With + MIDI on, a video also
  saves a .mid of what you played. With + WAV on, a video *and* a Rec take
  also save the sound as a 24-bit 48 kHz WAV — the exact mix the clip hears,
  uncompressed. All three files share one name so they sit together in
  Recordings.

## 1.2.1 — September 2026

- **Keys light instantly.** The solid key colour was fading in over 80 ms
  from nothing, which read as a black flash before the colour. No fade now.
- **Nothing in the app can be selected or copied** with the mouse any more —
  it is an instrument, not a page. (Text fields and the About paths still can.)
- **Advanced › Mix** — a Keyboard strip and a Vocal strip, each with a live
  meter and a level fader, and a Duck light that comes on while your voice is
  pushing the keys down. Meters run whenever Advanced is open, so you can
  set levels before you press Video.
- **Video tries harder.** If this machine's window capturer refuses the
  window ("Error starting video capture"), the app retries the old way, then
  records the screen the window is on and tells you so — instead of giving up.
- **macOS:** the app now carries the microphone entitlement and usage text
  it has needed since audio inputs arrived in 1.1.1 — without them a signed
  build ends the moment an input is opened.
- **Off means off.** Notes / Sol-fa / Off now also govern the Number card:
  Off blanks it (and the number pop-out), and takes the names off the keys.
  The chord itself always shows.

## 1.2.0 — September 2026

- **Your MIDI devices are back.** 1.1.1 added a permission gate for video
  capture that forgot Web MIDI is itself a permission, so the input list came
  up empty and MIDI out had nothing to offer. The gate now names MIDI, the
  window capture and audio inputs; everything else stays denied.
- **Video records again** — the same gate was refusing the window capture.
- **Advanced** — a button at the end of Setup opens a second row of settings.
  Nothing in Setup moved; nothing there is needed to play.
- **Two audio inputs.** Setup › Keyboard input and Advanced › Vocal input. Pick
  a mic for the vocal and the keys **duck** while you talk — Advanced › Duck
  keys when you talk sets how far, in dB, or off.
- **Audio offset** — delay the sound a few ms if it runs ahead of the picture.
- **Video quality** — Best (60 fps, 20 Mb/s), Good, or Small.
- **Your picture as the backdrop.** Setup › Backdrop › Your picture, then
  Advanced › Choose picture. A tint of chosen colour and strength sits over
  it and the panels go to glass so it shows through. Chroma green and blue
  are gone; a saved chroma setting falls back to the theme.
- Video sound's "Input device" is now "Inputs" — both of them.

## 1.1.1 — September 2026

- **Pedal › Ignore the pedal** — the sustain pedal does nothing; notes end when
  your fingers lift.
- **Velocity › Fixed now lights keys in the deep accent colour**, not the pale
  top of the ramp.
- **Your recordings are in the transport.** A Recordings list reads the folder,
  and a take you just finished is cued, ready to play.
- **Video records only the Chordlight window** — never the screen or another
  window.
- **Video sound** — Setup › Video sound: System (what is playing), an Input
  device (a keyboard through your interface, a mic, or BlackHole on a Mac), or
  both mixed. Setup › Audio input picks the device.
- **The installer follows the Installer & Packaging Standard:** one file per
  platform, named `Chordlight88-1.1.1-Windows.exe` and
  `Chordlight88-1.1.1-macOS.dmg`; installs to Program Files\Amanorsac Studio;
  branded welcome, licence, path, progress and done pages; a one-page
  README.txt beside it. The portable exe and the macOS zip are gone.

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
