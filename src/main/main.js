'use strict';
const path = require('path');
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const settings = require('./settings');

const isMac = process.platform === 'darwin';
const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');

/** @type {BrowserWindow|null} */ let mainWin = null;
/** @type {Record<string, BrowserWindow|null>} */
const popouts = { chord: null, number: null, keys: null };

/* default size and minimum size per pop-out */
const POPOUT_SPEC = {
  chord:  { width: 430, height: 210, minWidth: 240, minHeight: 140 },
  number: { width: 400, height: 210, minWidth: 240, minHeight: 140 },
  keys:   { width: 1320, height: 268, minWidth: 860, minHeight: 200 }
};

/* Last published readout, so a pop-out opened mid-song paints immediately. */
let lastState = null;

/* ------------------------------------------------------------------ *
 * Windows
 * ------------------------------------------------------------------ */

function clampToDisplay(bounds) {
  if (!bounds) return null;
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width,
    height,
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))
  };
}

function createMainWindow() {
  const saved = clampToDisplay(settings.load().bounds.main);

  mainWin = new BrowserWindow({
    width: saved?.width ?? 1320,
    height: saved?.height ?? 700,
    x: saved?.x,
    y: saved?.y,
    minWidth: 720,
    minHeight: 420,
    show: false,
    backgroundColor: '#070D1B',
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 14, y: 18 } : undefined,
    title: 'Chordlight 88',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWin.loadFile(RENDERER, { query: { view: 'full' } });
  mainWin.once('ready-to-show', () => mainWin.show());

  const remember = () => {
    if (mainWin && !mainWin.isDestroyed() && !mainWin.isMaximized()) {
      settings.saveBounds('main', mainWin.getBounds());
    }
  };
  mainWin.on('resize', remember);
  mainWin.on('move', remember);

  mainWin.on('maximize', () => sendToMain('window:maximized', true));
  mainWin.on('unmaximize', () => sendToMain('window:maximized', false));

  mainWin.on('closed', () => {
    mainWin = null;
    for (const name of Object.keys(popouts)) closePopout(name);
  });

  // External links open in the real browser, never in-app.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createPopout(name) {
  const saved = clampToDisplay(settings.load().bounds[name]);
  const spec = POPOUT_SPEC[name] || POPOUT_SPEC.chord;

  const win = new BrowserWindow({
    width: saved?.width ?? spec.width,
    height: saved?.height ?? spec.height,
    x: saved?.x,
    y: saved?.y,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#070D1B',
    title: 'Chordlight — ' + name.charAt(0).toUpperCase() + name.slice(1),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Float over full-screen apps (a DAW in full screen on macOS included).
  win.setAlwaysOnTop(true, 'floating');
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(RENDERER, { query: { view: name } });
  win.once('ready-to-show', () => {
    win.show();
    if (lastState) win.webContents.send('state:update', lastState);
  });

  const remember = () => {
    if (!win.isDestroyed()) settings.saveBounds(name, win.getBounds());
  };
  win.on('resize', remember);
  win.on('move', remember);

  win.on('closed', () => {
    popouts[name] = null;
    const p = settings.load().popout;
    settings.save({ popout: Object.assign({}, p, { [name]: false }) });
    sendToMain('popout:changed', { name, open: false });
  });

  popouts[name] = win;
  const p = settings.load().popout;
  settings.save({ popout: Object.assign({}, p, { [name]: true }) });
  sendToMain('popout:changed', { name, open: true });
}

function closePopout(name) {
  const win = popouts[name];
  if (win && !win.isDestroyed()) win.close();
  popouts[name] = null;
}

function sendToMain(channel, payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

ipcMain.on('state:publish', (_e, state) => {
  lastState = state;
  for (const name of Object.keys(popouts)) {
    const win = popouts[name];
    if (win && !win.isDestroyed()) win.webContents.send('state:update', state);
  }
});

ipcMain.handle('popout:toggle', (_e, name) => {
  if (!Object.prototype.hasOwnProperty.call(popouts, name)) return false;
  if (popouts[name]) {
    closePopout(name);
    return false;
  }
  createPopout(name);
  return true;
});

ipcMain.handle('settings:get', () => settings.load());
ipcMain.on('settings:set', (_e, patch) => settings.save(patch));

ipcMain.on('window:control', (e, action) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (action === 'close') win.close();
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  preferencesFile: settings.PREF_FILE,
  windowStateFile: settings.STATE_FILE
}));

/* The About screen's links. Only the studio's own pages and its support
   address are ever opened, and only in the user's real browser. */
const ALLOWED_LINKS = new Set([
  'https://amanorsac.studio',
  'https://amanorsac.studio/legal',
  'https://amanorsac.studio/privacy',
  'mailto:hello@amanorsac.studio'
]);
ipcMain.on('open:external', (_e, url) => {
  if (ALLOWED_LINKS.has(url)) shell.openExternal(url);
});

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.whenReady().then(() => {
    createMainWindow();

    // Re-open the pop-outs that were open when the app last closed.
    const open = settings.load().popout || {};
    for (const name of Object.keys(popouts)) {
      if (open[name]) createPopout(name);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
