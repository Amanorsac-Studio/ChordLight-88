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
