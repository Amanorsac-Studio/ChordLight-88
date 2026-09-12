# Third-party notices — Chordlight 88

Every dependency that ships inside the application, and its licence
(Product Build Standard B39). None of these licences restricts commercial use or
requires disclosure of Chordlight's own source (B40).

## Shipped in the application

| Component | Version | Licence |
|---|---|---|
| Electron | 33.4.11 | MIT |
| Chromium (within Electron) | 130.x | BSD 3-Clause, plus the licences listed in Chromium's own notices |
| Node.js (within Electron) | 20.x | MIT |
| Inter | 5.1.0 (@fontsource) | SIL Open Font License 1.1 |
| JetBrains Mono | 5.1.1 (@fontsource) | SIL Open Font License 1.1 |
| Barlow Condensed | 5.0.20 (@fontsource) | SIL Open Font License 1.1 |

The font files are copied into the application at install time by
`scripts/copy-fonts.mjs`; the `@fontsource` packages themselves are build-time
wrappers (MIT) and are not shipped.

## Build-time only, not shipped

| Component | Version | Licence |
|---|---|---|
| electron-builder | 25.1.8 | MIT |

## Full text

Electron ships the complete licence text of Chromium and its own dependencies in
`LICENSES.chromium.html` beside the application binary. The SIL Open Font License 1.1
is published at https://openfontlicense.org.
