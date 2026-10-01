'use strict';
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, screen, session, desktopCapturer } = require('electron');
const settings = require('./settings');
const license = require('./license');

/* Chordlight is a licensed product (Master Standard §3): one key, two
   computers, verified against the studio's server. */
const LICENSED_PRODUCT = true;

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
    if (mainWin && !mainWin.isDestroyed() && !mainWin.isMaximized() && !mainWin.isFullScreen()) {
      settings.saveBounds('main', mainWin.getBounds());
    }
  };
  mainWin.on('resize', remember);
  mainWin.on('move', remember);

  mainWin.on('maximize', () => sendToMain('window:maximized', true));
  mainWin.on('unmaximize', () => sendToMain('window:maximized', false));
  mainWin.on('enter-full-screen', () => sendToMain('window:fullscreen', true));
  mainWin.on('leave-full-screen', () => sendToMain('window:fullscreen', false));

  mainWin.on('closed', () => {
    mainWin = null;
    for (const name of Object.keys(popouts)) closePopout(name);
  });

  // External links open in the real browser, never in-app.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dropping a MIDI file on the window is a gesture for the renderer to read,
  // never a navigation: without this, Chromium would happily replace the app
  // with the dropped file.
  mainWin.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWin.webContents.getURL()) e.preventDefault();
  });
}

/* `docked` is where the card sat in the main window, in screen pixels. A
   pop-out opens at exactly that size and place, so detaching changes nothing
   the eye can see — the keys are the width they were, not a remembered
   smaller window from last time. */
function createPopout(name, docked) {
  const spec = POPOUT_SPEC[name] || POPOUT_SPEC.chord;
  const from = docked && docked.width > 0
    ? { width: Math.round(docked.width), height: Math.round(docked.height), x: Math.round(docked.x), y: Math.round(docked.y) }
    : settings.load().bounds[name];
  const saved = clampToDisplay(from);

  const win = new BrowserWindow({
    width: Math.max(spec.minWidth, saved?.width ?? spec.width),
    height: Math.max(spec.minHeight, saved?.height ?? spec.height),
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

ipcMain.handle('popout:toggle', (_e, name, docked) => {
  if (!Object.prototype.hasOwnProperty.call(popouts, name)) return false;
  if (popouts[name]) {
    closePopout(name);
    return false;
  }
  createPopout(name, docked);
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
  else if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen());
});

/* ------------------------------------------------------------------ *
 * Recordings — MIDI takes and screen captures
 *
 * The renderer hands over bytes and a name; the folder is always
 * Documents/Amanorsac Studio/Chordlight 88/Recordings (B48), and the name is
 * flattened to a plain filename here so nothing can escape it.
 * ------------------------------------------------------------------ */
/* Every take gets a folder of its own, named like the take, and everything
   made from that take — .mid, .mp4, .wav, .chordlight — lands in it:
     Recordings/Chordlight take 2026-09-30 19.02.11/
       Chordlight take 2026-09-30 19.02.11.mid
       Chordlight take 2026-09-30 19.02.11.chordlight
   Takes from before 1.3.1 sit loose in Recordings and still list. */
const safeName = (name) => String(name || 'recording').replace(/[^\w .,()-]+/g, '_').slice(0, 120);
ipcMain.handle('rec:save', async (_e, { name, bytes }) => {
  const safe = safeName(name);
  const take = safe.replace(/\.[^.]+$/, '');
  const dir = path.join(settings.REC_DIR, take);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, safe);
  await fs.promises.writeFile(file, Buffer.from(bytes));
  return file;
});
ipcMain.handle('rec:list', async () => {
  const PLAYABLE = /\.(midi?|chordlight)$/i;
  const out = [];
  try {
    const top = await fs.promises.readdir(settings.REC_DIR, { withFileTypes: true });
    for (const d of top) {
      if (d.isDirectory()) {
        let inner = [];
        try { inner = await fs.promises.readdir(path.join(settings.REC_DIR, d.name)); } catch { inner = []; }
        for (const name of inner) {
          if (!PLAYABLE.test(name)) continue;
          const st = await fs.promises.stat(path.join(settings.REC_DIR, d.name, name));
          out.push({ name: d.name + '/' + name, take: d.name, mtime: st.mtimeMs, size: st.size });
        }
      } else if (PLAYABLE.test(d.name)) {
        const st = await fs.promises.stat(path.join(settings.REC_DIR, d.name));
        out.push({ name: d.name, take: d.name.replace(/\.[^.]+$/, ''), mtime: st.mtimeMs, size: st.size });
      }
    }
  } catch { /* no folder yet */ }
  return out.sort((a, b) => b.mtime - a.mtime);
});
ipcMain.handle('rec:read', async (_e, name) => {
  /* "take/file" or "file" — each part a bare name, never a path */
  const parts = String(name).split(/[\\/]/).filter(Boolean).slice(-2).map((p) => path.basename(p));
  const file = path.join(settings.REC_DIR, ...parts);
  const buf = await fs.promises.readFile(file);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
ipcMain.on('rec:open-folder', () => {
  fs.mkdirSync(settings.REC_DIR, { recursive: true });
  shell.openPath(settings.REC_DIR);
});

/* ------------------------------------------------------------------ *
 * Backdrop — the player's own picture or video behind the app
 *
 * Kept beside the preferences as Backdrop/backdrop.<ext>, one at a time. A
 * picture goes back to the renderer as a data URL; a video is too big for
 * that and goes back as a file URL (the CSP admits file: for media only).
 * A video is copied from its path rather than streamed through IPC.
 * ------------------------------------------------------------------ */
const PIC_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const VID_MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
const dataUrl = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  const buf = fs.readFileSync(file);
  return `data:${PIC_MIME[ext] || 'image/png'};base64,${buf.toString('base64')}`;
};
const describeBackdrop = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (PIC_MIME[ext]) return { kind: 'picture', url: dataUrl(file) };
  return { kind: 'video', url: require('url').pathToFileURL(file).href, mime: VID_MIME[ext] || 'video/mp4' };
};
async function clearBackdrops() {
  await fs.promises.mkdir(settings.BACKDROP_DIR, { recursive: true });
  for (const old of [...Object.keys(PIC_MIME), ...Object.keys(VID_MIME)]) {
    try { await fs.promises.unlink(path.join(settings.BACKDROP_DIR, 'backdrop.' + old)); } catch { /* none */ }
  }
}
ipcMain.handle('backdrop:set', async (_e, { bytes, ext }) => {
  const e = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!PIC_MIME[e]) throw new Error('Use a PNG, JPG, WebP or GIF');
  if (bytes.byteLength > 24 * 1024 * 1024) throw new Error('That picture is over 24 MB');
  await clearBackdrops();
  const file = path.join(settings.BACKDROP_DIR, 'backdrop.' + e);
  await fs.promises.writeFile(file, Buffer.from(bytes));
  return describeBackdrop(file);
});
ipcMain.handle('backdrop:set-path', async (_e, src) => {
  const from = String(src || '');
  const e = path.extname(from).slice(1).toLowerCase();
  if (!PIC_MIME[e] && !VID_MIME[e]) throw new Error('Use a PNG, JPG, WebP, GIF, MP4, WebM or MOV');
  const st = await fs.promises.stat(from);
  if (VID_MIME[e] && st.size > 1024 * 1024 * 1024) throw new Error('That video is over 1 GB');
  await clearBackdrops();
  const file = path.join(settings.BACKDROP_DIR, 'backdrop.' + e);
  await fs.promises.copyFile(from, file);
  return describeBackdrop(file);
});
ipcMain.handle('backdrop:get', async () => {
  for (const ext of [...Object.keys(PIC_MIME), ...Object.keys(VID_MIME)]) {
    const file = path.join(settings.BACKDROP_DIR, 'backdrop.' + ext);
    if (fs.existsSync(file)) { try { return describeBackdrop(file); } catch { return null; } }
  }
  return null;
});

/* When the renderer asks for a display stream it gets this window and
   nothing else — no picker, no other windows or screens. On Windows the
   system audio comes along, so a clip carries what Kontakt was playing. */
function allowSelfCapture() {
  /* What the renderer may ask for, and nothing else:
       midi / midiSysex   — the keyboard. Web MIDI is a permission in Chromium;
                            a gate that forgets it leaves the port list empty
                            (that was 1.1.1's bug).
       display-capture    — the window, for a video clip.
       media (audio)      — a keyboard or a mic, for the sound in that clip.
     Camera, location, notifications and the rest stay denied. */
  const ALLOW = new Set(['midi', 'midiSysex', 'display-capture', 'fullscreen']);
  const decide = (permission, details) => {
    if (ALLOW.has(permission)) return true;
    if (permission === 'media') {
      const types = details && details.mediaTypes;
      return !types || types.every((t) => t === 'audio');
    }
    return false;
  };
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(decide(permission, details));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => decide(permission, details));
  /* Which picture a display request gets. 'window' is this window and
     nothing else. If Chromium cannot start a capture of the window on this
     machine (frameless windows and some graphics drivers trip its window
     capturer with "Error starting video capture"), the renderer asks for
     'screen' — the display this window is on — and says so in a toast. */
  let captureKind = 'window';
  ipcMain.on('capture:kind', (_e, kind) => { captureKind = kind === 'screen' ? 'screen' : 'window'; });
  ipcMain.handle('capture:sources', async () => {
    const id = mainWin && !mainWin.isDestroyed() ? mainWin.getMediaSourceId() : null;
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } });
    const mine = sources.find((src) => src.id === id);
    const disp = mainWin && !mainWin.isDestroyed() ? screen.getDisplayMatching(mainWin.getBounds()) : screen.getPrimaryDisplay();
    const scr = sources.find((src) => src.display_id === String(disp.id)) || sources.find((src) => src.id.startsWith('screen:'));
    return { window: mine ? mine.id : null, screen: scr ? scr.id : null };
  });
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const audio = process.platform === 'win32' ? 'loopback' : undefined;
        if (captureKind === 'screen') {
          const disp = mainWin && !mainWin.isDestroyed() ? screen.getDisplayMatching(mainWin.getBounds()) : screen.getPrimaryDisplay();
          const scr = sources.find((src) => src.display_id === String(disp.id)) || sources.find((src) => src.id.startsWith('screen:'));
          if (!scr) { callback({}); return; }
          callback({ video: scr, audio });
          return;
        }
        const id = mainWin && !mainWin.isDestroyed() ? mainWin.getMediaSourceId() : null;
        const mine = sources.find((src) => src.id === id);
        if (!mine) { callback({}); return; }      // never another window
        callback({ video: mine, audio });
      })
      .catch(() => callback({}));
  });
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  preferencesFile: settings.PREF_FILE,
  windowStateFile: settings.STATE_FILE,
  licensed: LICENSED_PRODUCT,
  licenseFolder: license.stateDir()
}));

/* ------------------------------------------------------------------ *
 * Licensing — the renderer asks, the main process answers; the only
 * network requests this product makes are the two in license.js.
 * ------------------------------------------------------------------ */
ipcMain.handle('license:status', () => (LICENSED_PRODUCT ? license.status() : { licensed: true, free: true }));
ipcMain.handle('license:activate', (_e, key) => (LICENSED_PRODUCT ? license.activate(key, false) : { licensed: true, free: true }));
ipcMain.handle('license:deactivate', () => (LICENSED_PRODUCT ? license.deactivate() : { licensed: true, free: true }));
license.onChange((st) => sendToMain('license:changed', st));

/* The About screen's links. Only the studio's own pages and its support
   address are ever opened, and only in the user's real browser. */
const ALLOWED_LINKS = new Set([
  'https://amanorsac.studio',
  'https://amanorsac.studio/legal',
  'https://amanorsac.studio/privacy',
  'https://amanorsac.studio/my-apps',
  'mailto:hello@amanorsac.studio'
]);
ipcMain.on('open:external', (_e, url) => {
  if (ALLOWED_LINKS.has(url)) shell.openExternal(url);
});

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Files the OS asks us to open — a double-clicked .chordlight or .mid.
 *
 * Windows/Linux hand the path on argv (first launch) or through
 * 'second-instance' (already running); macOS sends 'open-file', possibly
 * before the window exists. Either way the path waits here until the
 * renderer says it is ready, then goes over as bytes — the renderer never
 * touches a path.
 * ------------------------------------------------------------------ */
const OPENABLE = /\.(chordlight|midi?)$/i;
let pendingOpen = null;
let rendererReady = false;
function fileFromArgv(argv) {
  return argv.slice(1).find((a) => OPENABLE.test(a) && !a.startsWith('-')) || null;
}
function openFile(file) {
  if (!file) return;
  pendingOpen = file;
  if (!rendererReady) return;
  fs.promises.readFile(file).then((buf) => {
    pendingOpen = null;
    sendToMain('file:open', { name: path.basename(file), bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  }).catch(() => { pendingOpen = null; });
}
ipcMain.on('renderer:ready', () => { rendererReady = true; if (pendingOpen) openFile(pendingOpen); });
app.on('open-file', (e, file) => { e.preventDefault(); openFile(file); });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
    openFile(fileFromArgv(argv));
  });

  app.whenReady().then(() => {
    allowSelfCapture();
    if (LICENSED_PRODUCT) license.start();
    if (!isMac) openFile(fileFromArgv(process.argv));
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
