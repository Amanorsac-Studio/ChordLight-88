/* Chordlight 88 for older Macs — the legacy runtime build.
 *
 *   npm run dist:legacy:mac    Chordlight88Legacy-<version>-macOS.dmg
 *
 * Same product, same app id, same licence seat, same data folder: a customer
 * on macOS 11 or 12 downloads this file instead of the ordinary one and gets
 * Chordlight 88, not a different edition. Only the runtime underneath differs.
 *
 * Why it exists. Each Electron line carries a Chromium, and Chromium sets the
 * oldest macOS it will run on:
 *
 *   Electron 37 (Chromium 138)  macOS 11 Big Sur and up   <- this build
 *   Electron 38+ (Chromium 140+) macOS 13 Ventura and up
 *
 * So the moment the ordinary build moves to Electron 44 — which 2.1 needs for
 * the Core Audio tap that gives the Mac "System" sound back — macOS 11 and 12
 * are left behind. This build is the answer to that, pinned to the last
 * Electron line that still starts on them. Until 2.1 ships, the ordinary
 * build is on Electron 33 and also runs on macOS 11+, so this one is here and
 * tested rather than needed.
 *
 * What it does NOT change: the picture, the sound and the recording are the
 * app's own code, identical in both builds. Verified on Chromium 141 (ahead
 * of this build's 138): the clip's frame generator, the AudioWorklet sampler
 * and the built-in instruments all behave as they do on 130 — A4 reads
 * 441 Hz, Grand is playable 1.7 s after it is chosen, a staccato note is
 * silent by 400 ms.
 *
 * System sound is off on the Mac in both builds (2.0.x), so this build gives
 * up nothing a macOS 11-12 customer would otherwise have.
 */

/* The last Electron 37 patch. Bump only to another 37.x — a higher line
   raises the macOS floor to 13 and defeats the point of this file. */
const ELECTRON_LEGACY = '37.10.3';

module.exports = {
  extends: './electron-builder.yml',
  electronVersion: ELECTRON_LEGACY,

  /* Stamped into the packaged package.json so About can say which runtime
     this is, and so a support e-mail names the build. */
  extraMetadata: {
    chordlightEdition: 'legacy',
    chordlightLegacyElectron: ELECTRON_LEGACY
  },

  mac: {
    /* Stated here and not inherited: when 2.1 raises the ordinary build's
       floor to 13.0, this build must stay at 11.0. */
    extendInfo: { LSMinimumSystemVersion: '11.0' },
    artifactName: 'Chordlight88Legacy-${version}-macOS.${ext}'
  },
  dmg: {
    title: 'Chordlight 88 ${version} — older Macs',
    artifactName: 'Chordlight88Legacy-${version}-macOS.${ext}'
  }
};
