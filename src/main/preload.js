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
  togglePopout: (name) => ipcRenderer.invoke('popout:toggle', name),
  onPopoutChanged: (cb) => ipcRenderer.on('popout:changed', (_e, info) => cb(info)),

  /* persisted settings */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),

  /* frameless window chrome */
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onMaximized: (cb) => ipcRenderer.on('window:maximized', (_e, v) => cb(v)),

  appInfo: () => ipcRenderer.invoke('app:info')
});
