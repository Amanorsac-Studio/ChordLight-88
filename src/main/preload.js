'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');

/* The clip thread and the WAV tap are started from the app's own files.
   Read here (only these, only from the app's renderer folder) so they never
   depend on how a page may fetch a file:// URL. */
const ASSETS = new Set(['clip-draw.js', 'clip-worker.js', 'wav-tap.js',
  'fonts/inter-400.woff2', 'fonts/inter-500.woff2', 'fonts/inter-600.woff2', 'fonts/inter-700.woff2',
  'fonts/jetbrains-mono-400.woff2', 'fonts/jetbrains-mono-500.woff2', 'fonts/jetbrains-mono-600.woff2',
  'fonts/barlow-condensed-600.woff2', 'fonts/barlow-condensed-700.woff2']);
/* the built-in instruments: each bundle's map and its samples, by bare name, nothing else */
const SOUND = /^sounds\/(grand|spnatural|softep)\/(instrument\.json|samples\/[A-G]#?\d_v\d+_rr\d+\.(flac|wav))$/;
function readAsset(name) {
  if (!ASSETS.has(name) && !(typeof name === 'string' && SOUND.test(name))) return null;
  try { return new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'renderer', name))); } catch { return null; }
}

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'full';

contextBridge.exposeInMainWorld('chordlight', {
  view,

  /* readout state — published by the main window, consumed by the pop-outs */
  publish: (state) => ipcRenderer.send('state:publish', state),
  onState: (cb) => ipcRenderer.on('state:update', (_e, state) => cb(state)),

  /* pop-out windows */
  togglePopout: (name, docked) => ipcRenderer.invoke('popout:toggle', name, docked),
  onPopoutChanged: (cb) => ipcRenderer.on('popout:changed', (_e, info) => cb(info)),

  /* persisted settings */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),

  /* frameless window chrome */
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onMaximized: (cb) => ipcRenderer.on('window:maximized', (_e, v) => cb(v)),
  onFullscreen: (cb) => ipcRenderer.on('window:fullscreen', (_e, v) => cb(v)),

  /* recordings land in Documents/Amanorsac Studio/Chordlight 88/Recordings */
  saveRecording: (name, bytes) => ipcRenderer.invoke('rec:save', { name, bytes }),
  openRecordings: () => ipcRenderer.send('rec:open-folder'),
  recBusy: (on) => ipcRenderer.send('rec:busy', !!on),
  listRecordings: () => ipcRenderer.invoke('rec:list'),
  readRecording: (name) => ipcRenderer.invoke('rec:read', name),

  /* the backdrop picture, kept in Documents/Amanorsac Studio/Chordlight 88/Backdrop */
  setBackdrop: (bytes, ext) => ipcRenderer.invoke('backdrop:set', { bytes, ext }),
  /* a File from a picker, copied by path — a video never crosses IPC as bytes */
  setBackdropFile: (file) => ipcRenderer.invoke('backdrop:set-path', webUtils.getPathForFile(file)),
  getBackdrop: () => ipcRenderer.invoke('backdrop:get'),

  /* video capture: which picture, and the raw source ids for the fallback path */
  captureKind: (kind) => ipcRenderer.send('capture:kind', kind),
  /* where the renderer is, for the crash log (main.js lastCrumb) */
  crumb: (s) => ipcRenderer.send('crumb', s),
  captureSources: () => ipcRenderer.invoke('capture:sources'),

  /* a .chordlight / .mid the OS asked us to open */
  onOpenFile: (cb) => ipcRenderer.on('file:open', (_e, f) => cb(f)),
  ready: () => ipcRenderer.send('renderer:ready'),

  /* licensing (License Integration Standard) */
  licenseStatus: () => ipcRenderer.invoke('license:status'),
  licenseActivate: (key) => ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),
  onLicense: (cb) => ipcRenderer.on('license:changed', (_e, st) => cb(st)),

  /* Free Trial edition: the days left, and a note when a take starts so the
     main process can hold every save to one minute */
  trialStatus: () => ipcRenderer.invoke('trial:status'),
  trialTake: () => ipcRenderer.send('trial:take'),
  onTrial: (cb) => ipcRenderer.on('trial:changed', (_e, st) => cb(st)),

  openExternal: (url) => ipcRenderer.send('open:external', url),

  appInfo: () => ipcRenderer.invoke('app:info'),
  /* the window came back after its process died: say so, once */
  onRecovered: (cb) => ipcRenderer.on('app:recovered', (_e, r) => cb(r)),
  openLogs: () => ipcRenderer.send('logs:open'),

  /* the app's own renderer files, for the clip thread (see ASSETS) */
  asset: (name) => readAsset(name)
});
