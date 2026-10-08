/* Chordlight 88 Free Trial — the build of the trial edition.
 *
 *   npm run dist:trial:win     Chordlight88FreeTrial-<version>-Windows.exe
 *   npm run dist:trial:mac     Chordlight88FreeTrial-<version>-macOS.dmg
 *
 * Everything not set here comes from electron-builder.yml, so the trial is
 * the same app, signed and notarised the same way. What differs:
 *
 *   - its own name and app id: it installs beside the full version, never
 *     over it, and says "Free Trial" in the installer, the Start menu, the
 *     Dock, the title bar and every recorded clip;
 *   - package.json is stamped "chordlightEdition": "trial" and the build
 *     date — that is what switches on src/main/trial.js (7 days, then the
 *     app locks; recordings stop at 1 minute);
 *   - the app is sealed. Electron's fuses are burned so it cannot be run as
 *     plain Node, cannot take NODE_OPTIONS or --inspect, and loads its code
 *     only from app.asar — and the asar's hash is embedded and checked at
 *     launch, so an edited trial.js or app.js refuses to start. Developer
 *     tools are off in a packaged trial (main.js).
 */
const built = new Date().toISOString();

module.exports = {
  extends: './electron-builder.yml',
  appId: 'studio.amanorsac.chordlight88.trial',
  productName: 'Chordlight 88 Free Trial',
  extraMetadata: {
    productName: 'Chordlight 88 Free Trial',
    chordlightEdition: 'trial',
    trialBuilt: built
  },
  asar: true,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
  },
  /* .chordlight files open in the full version, not the trial */
  fileAssociations: [],
  /* Packaging Standard P28: <Product>-<version>-<platform>, spaces removed */
  win: {
    artifactName: 'Chordlight88FreeTrial-${version}-Windows.${ext}'
  },
  nsis: {
    shortcutName: 'Chordlight 88 Free Trial',
    artifactName: 'Chordlight88FreeTrial-${version}-Windows.${ext}',
    include: 'build/installer-trial.nsh'
  },
  mac: {
    artifactName: 'Chordlight88FreeTrial-${version}-macOS.${ext}'
  },
  dmg: {
    title: 'Chordlight 88 Free Trial ${version}',
    artifactName: 'Chordlight88FreeTrial-${version}-macOS.${ext}'
  }
};
