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

The only encryption the standards call for is R7 of the License Integration
Standard — the licence key and proof under DPAPI or Keychain. Chordlight ships
unlicensed: there is no key, no proof and no device id, so there is nothing to
protect and no encryption code to get wrong. Preferences and recordings are the
user's own plain files. If the product becomes paid, R7 applies from the first
licensed build.

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
