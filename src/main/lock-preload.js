'use strict';
/* The trial-ended screen gets three things and nothing else: the trial's
   dates, a link to the studio, and Quit. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trialLock', {
  status: () => ipcRenderer.invoke('trial:status'),
  buy: () => ipcRenderer.send('open:external', 'https://amanorsac.studio'),
  quit: () => ipcRenderer.send('trial:quit')
});
