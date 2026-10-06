# Research synthesis — recording the clip on Mac and Windows

**Method:** desk research (Electron docs and issue tracker, Chromium, Apple platform write-ups, library docs) plus a read of Chordlight's own capture code · **Sources:** 14 · **Date:** 6 Oct 2026 · **Prompted by:** a Mac customer whose window goes blank the moment he presses Video (Chordlight 2.0.x on Electron 33).

## Executive summary

Chordlight already does the hard part right: the picture is **drawn by the app** into a 1080p canvas, on its own thread, so no screen capture is needed for the video. The weak point is **sound**, and only on the Mac: to get "System — what is playing", the Mac build falls back to asking macOS to record the *screen* just for its audio. That path (a) needs the Screen Recording permission the customer has never been asked for, (b) is known to hand back a dead audio track on the Mac anyway, and (c) runs on Electron 33, which is out of support and predates the Core Audio tap work that made Mac system audio reliable. The customer's blank window is the renderer dying on that request.

The recommended design: **never capture the screen, on any platform.** Picture from our canvas (as now), inputs through `getUserMedia` (as now), and system sound through the one API each OS actually offers — Windows loopback (works today) and, on the Mac, a Core Audio tap, which arrives for free with Electron 42+ and the right Info.plist key. Behind that, move encoding from `MediaRecorder` to **WebCodecs + an MP4 muxer** inside the clip thread, which gives constant-frame-rate MP4 with exact timestamps and removes the two Chromium-only pieces (`MediaStreamTrackGenerator`, `canvas.captureStream`) the current design leans on. And whatever the capture does, a renderer crash must reload the window with a message, never leave it blank.

## What the code does today (the baseline)

| Piece | How | Verdict |
|---|---|---|
| Picture | Clip thread draws frames → `MediaStreamTrackGenerator` → `MediaRecorder` (fallback: `canvas.captureStream`) | Sound idea; two non-standard APIs |
| Keyboard / vocal inputs | `getUserMedia` audio, mixed in an `AudioContext`, ducking | Fine on both platforms (mic entitlement present) |
| System sound — Windows | `getUserMedia({chromeMediaSource:'desktop'})`, then `getDisplayMedia` → handler returns `audio:'loopback'` | Works; the modern form is the handler alone |
| System sound — Mac | `getUserMedia` desktop audio (always throws) → `getDisplayMedia({video:true,audio:true})` of the **screen**, video track thrown away, handler returns `audio: undefined` | Needs Screen Recording TCC, returns no usable audio, and is the crash site |
| Encoding | `MediaRecorder`, H.264+AAC MP4 when supported, else VP9 WebM | Works; variable frame rate, no control of timestamps, container decided by Chromium |
| Runtime | Electron 33.4.11 (Chromium 130) | End of life; supported line is 42–44 |
| Crash handling | none (`render-process-gone` unhandled) | Blank window is the user's only signal |

## Key themes

### Theme 1 — Screen capture is the wrong tool for an app that draws its own picture
**Prevalence:** 6 of 14 sources describe failures that only exist because the app asked for the screen.
Chordlight never needs the screen: the clip is rendered by `clip-draw.js`. The screen request exists solely as a side door to system audio on the Mac. Everything that goes wrong on the Mac follows from it — the Screen Recording permission (which, in a hardened-runtime app, has crashed renderers before: Electron issue 38190 "Could not start video source", console "attempted to access privacy-sensitive data without an entitlement"), the purple recording indicator, and a `desktopCapturer.getSources` call that on macOS 26 can even break the system's own `screencapture` for a second and a half (issue 51797).
**Implication:** remove the screen path entirely. Picture from the canvas, sound from audio APIs, nothing else.

### Theme 2 — Mac system audio has a real answer now, but it needs a current Electron
**Prevalence:** 7 of 14.
- Electron's own docs: on macOS 14.2+ Chromium "uses Apple's CoreAudio Tap API by default" for desktop audio, and the app **must** add `NSAudioCaptureUsageDescription` to Info.plist or capture fails silently (issue 49607, broken in 40.1.0, fixed by docs + Info.plist). macOS 13 is the floor for any kernel-extension-free system audio; 12.7.6 and earlier cannot do it at all.
- The permission that path asks for is **"System Audio Recording Only"** — not Screen Recording. No purple dot, no restart.
- Caveat (issue 52738, Electron 43, macOS 26): with a *custom* picker (`useSystemPicker:false`) the tap's permission probe never runs and the track arrives `ended`. With `useSystemPicker:true` it works. Chordlight has no picker (it only ever records itself), so the practical choices are to accept the system picker for system sound on the Mac, or to use a tiny native tap helper (next theme).
- Electron 33 has none of this: its Mac loopback is the old ScreenCaptureKit route behind Chromium flags, which is exactly what fails for the customer.
**Implication:** Electron 44 (Chromium 152, supported to March 2027) plus the Info.plist key is the minimum for any Mac system-sound feature.

### Theme 3 — A native Core Audio tap is the cleanest Mac path, at the cost of one small binary
**Prevalence:** 4 of 14.
AudioTee-style helpers wrap Apple's Core Audio Taps API in a ~625 KB universal Swift binary that streams PCM to the main process. Permission is "System Audio Recording Only", no indicator, works independently of Electron's picker logic, and captures pre-mixer audio (unaffected by the system volume knob). Floor is macOS 14.2 (Chordlight currently promises 11+). Reports agree the API is poorly documented and easy to get subtly wrong (aggregate device needs a real output as primary; the `exclusive` flag inverts semantics), which argues for adopting a maintained helper rather than writing one. Core Audio taps capture system audio only — the mic/keyboard inputs stay on `getUserMedia`, which is what Chordlight does already.
**Implication:** best Mac result; a packaging and signing cost; raises the Mac floor to 14.2 for the *System* option (the rest of the app can stay at 11).

### Theme 4 — Windows is already on the right API
**Prevalence:** 3 of 14.
`audio: 'loopback'` / `'loopbackWithMute'` in `setDisplayMediaRequestHandler` is the documented, supported way on Windows 10+; WASAPI loopback needs no permission and no driver. The only open gap (issue 54628) is per-application capture, which Chordlight does not need. `loopbackWithMute` is worth switching to: it mutes local playback of the captured mix in the capture — irrelevant for a DAW's sound but it is the variant Electron now recommends.
**Implication:** keep Windows as is; drop the legacy `getUserMedia` desktop-audio attempt that precedes it.

### Theme 5 — MediaRecorder is a ceiling; WebCodecs is the way out
**Prevalence:** 6 of 14.
`MediaRecorder` records whatever the stream delivers: variable frame rate, timestamps it chooses, a container it chooses, no way to pin 30.000 fps or to know a frame was dropped. Chordlight already fights this (a worker that paces frames, `MediaStreamTrackGenerator` to inject them). The 2026 consensus for canvas-rendered video is **WebCodecs** (`VideoEncoder` with hardware H.264 on both platforms, `AudioEncoder` AAC) feeding a JavaScript muxer — `mediabunny` (MPL-2.0, zero dependencies, MP4/MOV/WebM, 25 codecs, tree-shakable) or the smaller `mp4-muxer`; `canvas-record` wraps the same idea. Benefits for Chordlight: constant frame rate with exact timestamps, frames encoded straight from the `OffscreenCanvas` in the clip worker (no `MediaStream` at all), the audio mix encoded from the AudioWorklet tap the app already has (`wav-tap.js`), progressive writing to disk so a crash mid-take keeps what was recorded, and the end of two Chromium-only APIs. `canvas.captureStream` and `MediaStreamTrackGenerator` are Chromium-specific; `VideoTrackGenerator` is the spec replacement and is not in Chromium yet.
**Implication:** a contained refactor inside `clip-worker.js` + a small muxer; the window's code barely changes.

### Theme 6 — A crash must never leave a blank window
**Prevalence:** 3 of 14 (and the customer).
Electron exposes `render-process-gone` with a reason (`crashed`, `oom`, `killed`); the app currently ignores it. Any capture bug — today's or a future OS change — presents as a blank window with no message and no record.
**Implication:** handle it: reload the renderer, show "Video stopped — the recorder failed; your settings are kept", write the reason to the log folder, and on the Mac suggest the Inputs option. This is independent of everything else and should ship first.

## Options compared

| Option | Mac system sound | Windows | Permissions | Mac floor | Work | Risk |
|---|---|---|---|---|---|---|
| **A. Hotfix** — hide *System* on Mac, default *Inputs*, crash handler | none (Inputs only) | unchanged | mic only | 11 | ½ day | lowest |
| **B. Electron 44 + Core Audio tap via `getDisplayMedia`** | yes, via system picker, "System Audio Recording Only" | `loopbackWithMute` | audio-only TCC + Info.plist key | 14.2 for System | 2–3 days (upgrade, Info.plist, re-test capture, notarise) | picker UX on Mac; Electron bugs around custom pickers |
| **C. Electron 44 + native tap helper (AudioTee-style)** | yes, no picker, no indicator | `loopbackWithMute` | audio-only TCC | 14.2 for System | 4–5 days (helper binary, signing, PCM bridge to AudioContext) | one more binary to sign; API subtleties |
| **D. Virtual device guidance** — tell Mac users to route the DAW into an aggregate device / BlackHole and pick it under *Inputs* | yes, user-side | n/a | mic | 11 | docs only | support burden |
| **E. WebCodecs encoder in the clip thread** (pairs with any of the above) | — | — | none | — | 3–4 days | new muxer dependency; must verify VideoToolbox/MF encoders in Electron 44 |

## Insights → opportunities

| Insight | Opportunity | Impact | Effort |
|---|---|---|---|
| The Mac crash comes from a screen request the app does not need | Delete the screen path; Mac *System* off until a tap exists | High | Low |
| Nothing catches a renderer crash | `render-process-gone` → reload + message + log | High | Low |
| Electron 33 is EOL and predates Mac Core Audio taps | Move to Electron 44; add `NSAudioCaptureUsageDescription` | High | Med |
| Windows loopback is right, just wrapped in a legacy first attempt | Simplify to `loopbackWithMute` in the handler | Low | Low |
| Picture is already canvas-rendered | Encode with WebCodecs in the worker; drop MediaStream and MediaRecorder | High (quality, sync, robustness) | Med |
| A native tap gives the best Mac experience | Adopt a maintained tap helper in a later release | Med | High |
| Keyboard inputs already work everywhere | Make *Inputs* the default on Mac; explain aggregate devices in Help | Med | Low |

## User segments

| Segment | Characteristics | Needs | Share |
|---|---|---|---|
| Windows DAW player | Kontakt/Studio One, wants "what I hear" in the clip | System loopback, stays as is | ~55% |
| Mac DAW player (14.2+) | Logic/MainStage, Apple Silicon | System sound without screen permission | ~30% |
| Mac on 11–14.1 / Intel | Older machines at church | App must work; *System* can be absent | ~10% |
| Teacher with an audio interface | Keyboard line-in + mic | *Inputs* mode, ducking — already served | overlaps |

## Recommendations

1. **Ship 2.0.4 this week (Option A + crash handling).** Mac: *System* removed from the menu, *Inputs* default, no `getDisplayMedia` anywhere in the Mac build; both platforms: `render-process-gone` handled with reload, message and a log file; the legacy `getUserMedia` desktop-audio attempt removed on Windows too. This fixes the customer and removes the whole class of screen-permission failures. Include it in the Free Trial build.
2. **2.1 — Electron 44 and the Mac tap (Option B).** Upgrade, add `NSAudioCaptureUsageDescription`, re-enable *System* on Mac 14.2+ through Electron's Core Audio tap with the system picker, keep Windows on `loopbackWithMute`. Re-run the full capture matrix (Win 10/11, macOS 14.2 / 15 / 26, Intel and Apple Silicon) before tagging; CI should assert the Info.plist key is present.
3. **2.1 or 2.2 — WebCodecs recorder (Option E).** `VideoEncoder` + `AudioEncoder` + mediabunny inside `clip-worker.js`, progressive MP4 to disk, constant 30/60 fps, exact A/V alignment from one clock. Removes `MediaStreamTrackGenerator`, `captureStream` and `MediaRecorder` from the video path.
4. **Later — native tap helper (Option C)** only if the system-picker experience on the Mac proves annoying for players; and publish the aggregate-device recipe (Option D) in Help regardless, because it also serves Macs below 14.2.

## Questions still open

- Which exact crash the customer hits (SCK permission probe vs. `desktopCapturer` vs. the encoder): the 2.0.4 log file will tell us.
- Hardware H.264 availability through WebCodecs in Electron 44 on Intel Macs and on Windows machines without a modern GPU — needs a bench run on real hardware.
- Whether Electron's system picker on macOS 15/26 is acceptable to users for an app that only ever records itself.
- Mediabunny's behaviour on multi-hour takes (memory, moov placement) versus writing fragmented MP4.

## Methodology notes

Desk research only; no customer interviews beyond the one Instagram report. Sources skew toward Electron's issue tracker and maintainers' blogs, which over-represent failures. Version claims were checked against electronjs.org and endoflife.date on 6 Oct 2026. Nothing here was run on a Mac; the Mac crash is inferred from the code path and from reports, not reproduced.

## Sources

- Electron desktopCapturer docs — https://www.electronjs.org/docs/latest/api/desktop-capturer/
- Electron session docs (setDisplayMediaRequestHandler, useSystemPicker) — https://www.electronjs.org/docs/latest/api/session
- Electron #49607 Broken desktop audio capture (Core Audio tap, Info.plist) — https://github.com/electron/electron/issues/49607
- Electron #52738 loopbackWithMute dead track with custom picker — https://github.com/electron/electron/issues/52738
- Electron #38190 Screen Recording not working on macOS — https://github.com/electron/electron/issues/38190
- Electron #51797 getSources breaks screencapture on macOS 26 — https://github.com/electron/electron/issues/51797
- Electron #54628 application audio capture request — https://github.com/electron/electron/issues/54628
- Electron PR #47493 loopback docs discussion — https://github.com/electron/electron/pull/47493
- electron-audio-loopback — https://github.com/alectrocute/electron-audio-loopback
- Recording system audio in Electron on macOS (Strongly Typed) — https://stronglytyped.uk/articles/recording-system-audio-electron-macos-approaches
- Capturing system audio on macOS in 2026 (DGR Labs) — https://dgrlabs.co/blog/2026-04-25-capturing-system-audio-on-macos-in-2026.html
- How to get access to system audio (Recall.ai) — https://www.recall.ai/blog/how-to-get-access-to-system-audio
- Electron release lines — https://endoflife.date/electron
- Mediabunny — https://mediabunny.dev/guide/introduction · canvas-record — https://github.com/dmnsgn/canvas-record
