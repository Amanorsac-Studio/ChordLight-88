'use strict';
const { contextBridge, ipcRenderer } = require('electron');

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

  openExternal: (url) => ipcRenderer.send('open:external', url),

  appInfo: () => ipcRenderer.invoke('app:info')
});
