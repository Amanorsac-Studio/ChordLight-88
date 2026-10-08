# Design decisions — Chordlight 88

What was chosen, and what it was chosen over (Product Build Standard B52).

## Electron, not Tauri or JUCE

**Chosen because** Chromium's Windows MIDI backend is WinRT-based on Windows 10 and
later, which is multi-client. That is the whole point of the product: it has to keep
working while a DAW or Kontakt holds the same controller.

**Over Tauri**, which would cut the install from roughly 268 MB to about 12 MB — but
macOS WKWebView has no Web MIDI at all, so MIDI would come from Rust's `midir`, which
on Windows talks to the single-client WinMM API. That trades the size problem for the
one failure the product exists to avoid.

**Over JUCE**, which would be 15–25 MB native and share a toolchain with the studio's
plug-ins, but is a complete UI rewrite. Revisit if the install size becomes a reason
people don't download it.

The size is accepted as the cost of the MIDI behaviour.

## Web MIDI, not a native MIDI addon

Same reasoning. A native addon (`node-midi`/RtMidi) would go through WinMM and be
exclusive — worse than what Chromium already does for free. If a device's vendor
driver turns out to be exclusive anyway, the documented route is loopMIDI rather than
a code change.

## Ships unlicensed

Chordlight makes no network request of any kind, which is only true of an unlicensed
product (B46). If it later becomes a paid product, the License Integration Standard
v1.0 applies in full — activation, the signed proof verified against the studio public
key, the 30-day offline grace and Deactivate this device — and this decision is
reverted deliberately, not by accident.

## A piano built in, not captured

**Chosen because** the one sound every player can be guaranteed is one the app makes
itself. The studio's own sampled instruments (`.jmi` bundles from Sanctuary: Grand 1,
SP Natural, Soft EP 1 — 30 roots every 3 semitones, 4–8 anchored velocity layers,
FLAC) run in an AudioWorklet (`piano-engine.js`) that follows the bundle guide: the
nearest anchor carries the timbre, the level follows one curve through the anchors'
measured loudness with no velocity curve on top, a one-pole low-pass darkens notes
below their anchor, 4-point interpolation, a 2 ms-lookahead limiter on the output.
Samples are decoded once, held as 16-bit (the sources are 16-bit) and capped at 8 s
with a fade, so a 240-zone instrument sits near 250 MB rather than 500. Loading is
progressive — middle keys first — so the instrument is playable in about a second.
Note-off follows the companion "NOTE-OFF AND KEY-OFF.md": every sample is a full-length
note, so the chop is the engine's — a fade to -60 dB over the zone's releaseMs (by
register when the zone has none: 320 ms below C3, 230 ms to B4, 150 ms above), killed
at -80 dB; the pedal defers note-offs; key-off samples (`releaseZones`) play once per
note, attenuated 3 dB per second held, when a bundle ships them.
It runs on its own always-on context for ~10 ms monitoring,
and enters the clip's mix as a stream — the same door a system-sound capture uses —
so clips, WAVs and .chordlight files carry it with no OS permission on any platform.
Macs below 14.2, which cannot capture system sound at all, get music in their clips
this way. Default on for Mac, off for Windows (a DAW is usually the sound there).

**Over** shipping nothing (a silent clip on most Macs), over a synthesised piano
(small, but sounds like a toy), and over the public-domain Upright Piano KW tried first
(it did not sound good enough to carry the product).

## The Free Trial is a separate, sealed build — not a mode

**Chosen because** a trial that is the full app plus a flag can be switched off by
changing the flag. The trial is built from the same source with
`electron-builder.trial.cjs`: its own name and app id (it installs beside the full
version), `package.json` stamped `"chordlightEdition": "trial"`, and the app sealed —
Electron fuses burned (no run-as-Node, no `NODE_OPTIONS`, no `--inspect`, code only
from `app.asar`) and ASAR integrity embedded, so an edited `trial.js` or `app.js`
refuses to launch. CI proves both halves on every trial build: the sealed app starts,
and the same app with one line of `trial.js` changed does not.

**The rules** (src/main/trial.js): 7 days from the first launch, then the main process
opens only the trial-ended screen — the app window is never created, so there is no
page to unhide. Recordings stop at one minute in the window, and the main process
refuses to write anything longer (it reads the length of a .mid or .wav, and holds a
video or .chordlight to the time its take began). Every frame of a trial clip carries
"Chordlight 88 · Free Trial". A trial build stops working 180 days after it was built.

**Offline, no account, no network.** The start date is sealed (AES-256-GCM under a key
derived from the product's random `device.id`, per B47) into three places, all inside
the folders the File & Data Conventions allow — the trial's machine-state folder, the
product's machine-state folder, and the product's Documents folder — and the earliest
start wins. Nothing in the registry; no request to any server (Master Standard: an
unlicensed product makes none). A clock earlier than the last time the app ran locks it
until the date is right. **The limit**: someone who finds and deletes all three records
and the device id gets a new trial. Closing that needs the server — a `/trials/start`
call returning a signed start date, verified like a licence proof — which would make the
trial a licensed edition under the License Standard; a deliberate later step.

**Over** a trial mode inside the full build (one flag from unlocked), and over an
online-only trial (no internet, no trial — wrong for players at church on a laptop).

## One renderer file, four views

`index.html` serves the main window and all three pop-outs, switched by a `view`
query parameter. Only the main window touches MIDI; it publishes a state object over
IPC and the pop-outs paint it. Chosen over three separate HTML files so the keybed,
chord engine and theme cannot drift apart between windows.

## Pop-outs are real windows, not floating divs

The readouts had to sit over a DAW on a second screen and survive a full-screen app on
macOS. Only real `BrowserWindow`s with `alwaysOnTop` do that. The in-page floating
card is kept solely for the browser preview used during design.

## Fixed readout geometry

The cards reserve space for the big text, the pills and the sub-line, and nothing
wraps. Earlier they sized to their content, so the keybed moved up and down as chords
changed — unusable on camera, which is a main use of the app.

## Two settings files, not one

Preferences the player chose live in `Documents/Amanorsac Studio/Chordlight 88/`;
window positions and which pop-outs were open live in the application-support folder.
The standard separates user content from machine state (B48), and it means copying a
preferences file to another machine does not drag that machine's window layout with
it.

## The keyboard is the floor of the window

Chosen over a centred, padded card. The keys sit last in the layout, pushed to
the bottom, the full window width at any size, and a pop-out opens at the
card's measured screen rectangle. Reference: how ChordieApp behaves when
maximised. The readouts above keep their fixed geometry for video.

## Playback and recording stay dependency-free

The MIDI file parser and writer are written in the renderer rather than taken
from npm. The format is small, the app then ships no runtime dependency (B39,
B41 stay trivial), and the same on()/off() path a keyboard uses drives
playback, so chord naming and the ringing tier cannot diverge between live and
file input. Format-0 SMF at 480 ppq / 120 bpm makes one second exactly 960
ticks, so a recorded take keeps the timing that was played.

## Sending MIDI is opt-in and file-only

A MIDI output is used only to play a dropped file through a synth, and only
when the user picks one in Setup. Live input is never echoed. Chordlight's
whole pitch is that it never interferes with the controller a DAW holds.

## The app captures only itself

Video recording uses the display-media request handler in main to answer with
this window and nothing else — no picker, no other windows, no screens. System
audio rides along on Windows (loopback) because the point of a clip is what
Kontakt was playing; macOS has no loopback without extra software, so it gets
picture only. Output is WebM, not MP4: no encoder to license, every editor
opens it, and the chroma backdrop covers the OBS route for anyone who needs
MP4 straight out.

## Recordings under Documents, named in main

Takes and clips go to Documents/Amanorsac Studio/Chordlight 88/Recordings
(B48). The renderer hands main bytes and a display name; main flattens the
name to a filename and owns the folder, so no renderer path ever reaches disk.

## Nothing is encrypted, because nothing needs to be

(Superseded at 2.0.0 — see "Licensed, from 2.0.0" below.) Through 1.6 Chordlight
shipped unlicensed: no key, no proof, no device id, nothing to encrypt.
Preferences and recordings are, and remain, the user's own plain files.

## The installer follows the Installer & Packaging Standard, as far as NSIS goes

One file per platform, named `Chordlight88-<version>-Windows.exe` and
`Chordlight88-<version>-macOS.dmg` (P1, P28; the dmg is the standalone-only
exception in §1). Per-machine into Program Files\Amanorsac Studio\Chordlight 88
(§3.1), with the one permission prompt explained on the welcome page (P22).
Five pages: branded welcome, licence, path, progress, and a done page that
lists exactly what went where (P15). README.txt, one page, beside the
installer and installed with it (P26). What NSIS cannot give without custom
plugins is the full near-black chrome of P18 — the wizard sidebar and header
carry the brand, the page bodies stay Windows-grey. A fully skinned installer
means moving to Inno Setup, which the standard names; that is a separate
build task, not a config change.

## Permissions are named, not inferred (1.2.0)

The 1.1.1 gate said "only an audio input, deny the rest" and took Web MIDI
with it — a port list that is silently empty, with no error anywhere. The
gate now holds an explicit set: `midi`, `midiSysex`, `display-capture`,
`fullscreen`, and `media` for audio only. Anything new the renderer needs
gets added there deliberately, and the check handler answers the same way
as the request handler so a permission never passes one and fails the other.

## Advanced is the drawer continued, not a second design

Setup keeps its one row of controls exactly as it was. Advanced is a button
at its end that opens two labelled rows beneath it — Video and Look — built
from the same selects, sliders and swatches. Nothing needed to play lives
there.

## The duck is a gain, not a compressor

Web Audio has no side-chain. The vocal input feeds an analyser polled every
20 ms; when its level clears −42 dBFS the keyboard-and-system gain moves to
−N dB with a 20 ms attack and comes back over 250 ms. N is the slider, live.
The vocal itself is never ducked. The whole mix passes one DelayNode for the
audio offset.

## The backdrop picture is a file, not a preference

The picture goes to Documents/Amanorsac Studio/Chordlight 88/Backdrop as
backdrop.<ext> — the preferences file stays small and readable — and comes to
the renderer as a data URL, so the CSP never has to admit a file: URL.
Pop-outs fetch it once rather than receiving it with every note.

## .chordlight is a zip with a manifest, not a new binary format

Three files anyone can pull apart — manifest.json, take.mid, and the mix —
so a take is never locked to this app: a DAW gets the MIDI, a player gets
the audio. Stored, not deflated (the audio is already compressed); read
either way. The MIDI is written from the moment Rec started rather than the
first note, and the manifest carries the audio's offset from that zero and
its length, because a recorder's WebM reports no duration of its own.

The extension is `.chordlight`, not `.cdl`: `.cdl` is the ASC Color Decision
List that DaVinci Resolve and Premiere own. Only `.chordlight` is claimed in
the OS; `.mid` stays with the user's DAW and comes in through Open… or a
drop.

The look — key centre, spelling, labels, accent — rides along and is applied
for that playback without being saved to preferences: the sender's view,
not a change to the receiver's setup. The backdrop picture does not ride
along: megabytes in every take for a decoration.

## The clip is a drawing, not a capture (1.4.0)

Window capture answered the wrong question. It asked the OS for a picture
of one window, and got nothing on some drivers (frameless windows trip
Windows Graphics Capture), or the wrong thing when the keys lived in a
window of their own. The app already owns every pixel it shows, so the
clip is painted from the published state onto an offscreen canvas in the
Stage layout — the same state the windows and the pop-outs paint from —
and recorded from there. One drawing, always complete, at a fixed 1080p or
4K regardless of window size, never showing anything that is not Chordlight.
The cost is a second renderer for the keys and the readouts, kept in one
function beside the DOM one and fed by the same numbers.

## Licensed, from 2.0.0 — and why there is no master key

Chordlight is paid from 2.0.0, so the License Integration Standard applies in
full. src/main/license.js is a port of the reference client to Electron: the
two server calls through Node's fetch, the proof verified with Node's crypto
(ECDSA P-256, SHA-256, raw r‖s, over the body bytes exactly as received), the
key and proof stored through Electron's safeStorage (DPAPI on Windows, the
Keychain on macOS) in the machine-state folder, hourly heartbeat, 30-day
grace, deactivate. The interface follows one flag over IPC.

A "master key" baked into the app was asked for and declined. Anything in
the binary is in the hands of anyone with a hex editor, and the standard's
whole model is that nothing on the customer's machine can produce a licence
(R2–R4, B38). The studio's own master key is a normal key issued from the
catalog with a large seat count; the app verifies it like any other.

The public key is in the source as a byte array. A11 ("search the binary for
cd a5 7d 1c c8 a6 e2 71") is satisfied in an Electron build by searching
app.asar for the text form of those bytes, since the source ships as text.

LICENSED_PRODUCT in main.js is the one switch: false gives the free build
back, with no licence code reachable and no network requests at all.

## The clip on its own thread, from 2.0.2

Reported: recording a video while playing fast, dense chords, the keys stop
following. Measured on the bench (16ths of eight-note chords with the pedal,
about 130 MIDI messages a second): with a recording running, a note waited
28–31 ms on median and up to 140 ms to be handled, against 4 ms without;
with the Preview open the window spent 5 s of every 15 frozen. Every note
arrived — none were lost — they queued behind the work.

Two costs shared the one thread that also reads the MIDI. Per note: a full
repaint (all 88 keys restyled, the readouts' HTML rebuilt, chord naming that
re-parsed every template). Per frame: rasterising the clip's glows and
gradients when the recorder took its copy.

So: the window repaints at most every 12 ms (the first note after a pause at
once), touches only keys whose look changed, writes text only when it
changed, and remembers chord names by shape. The clip is drawn by
clip-draw.js, one implementation fed a plain-data snapshot, hosted by
clip-worker.js on its own thread with an OffscreenCanvas, feeding the
recorder through a MediaStreamTrackGenerator at a fixed rate (a frame is
skipped, never queued, if the encoder falls behind). The window's old loop
remains as the fallback host, using the same drawing code.

Starting the thread: the worker file beside the page, else the same file read
by the preload (a whitelist of the app's own renderer files) and run from a
blob URL — hence worker-src 'self' blob: in the CSP. Fonts reach the worker
as bytes from the preload, so no file:// fetch is involved. If neither way
starts or its fonts fail, the window draws. Verified: frames from the worker,
the fallback and 2.0.1 are pixel-identical across four looks; the window's
DOM and the keys pop-out match 2.0.1 exactly through 600 random events.

After: 2.8 ms median, 12 ms p95, no long tasks, Preview or not. The WAV tap
moved to an AudioWorklet (wav-tap.js; ScriptProcessor kept as the fallback).
The main window runs with backgroundThrottling off, and a power-save blocker
holds while a video records.

