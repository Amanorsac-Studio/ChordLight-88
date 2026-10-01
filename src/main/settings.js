'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Two stores, because the standards separate them (Product Build Standard B48):
 *
 *   user content  → Documents/Amanorsac Studio/Chordlight 88/preferences.json
 *   machine state → <app support>/Amanorsac Studio/Chordlight 88/window-state.json
 *
 * Nothing is written beside the binary, under Program Files, or into another
 * product's folder (B49). Either file may be missing, truncated or corrupt —
 * we fall back to defaults and carry on (B50).
 */
const PRODUCT = 'Chordlight 88';
const PREF_DIR = path.join(app.getPath('documents'), 'Amanorsac Studio', PRODUCT);
const STATE_DIR = path.join(app.getPath('appData'), 'Amanorsac Studio', PRODUCT);
const PREF_FILE = path.join(PREF_DIR, 'preferences.json');
const STATE_FILE = path.join(STATE_DIR, 'window-state.json');
/* what the player recorded — beside the preferences, where the user's things go */
const REC_DIR = path.join(PREF_DIR, 'Recordings');
/* the player's own backdrop picture */
const BACKDROP_DIR = path.join(PREF_DIR, 'Backdrop');

/* what the player chose */
const PREF_DEFAULTS = {
  accent: 'blue',
  mode: 'dark',
  keyCenter: 'C',
  spelling: 'auto',
  labelMode: 'notes',
  keySize: 188,
  midiPort: 'All inputs',
  midiChannel: 'Omni',
  pedalMode: 'chord',
  keyLight: 'solid',
  velocity: 'on',
  midiOut: 'None',
  backdrop: 'theme',
  backdropTint: 40,
  backdropTintColor: 'black',
  videoSound: 'system',
  audioInput: '',
  vocalInput: '',
  duck: 9,
  audioOffset: 0,
  videoQuality: 'good',
  alsoMidi: false,
  alsoWav: false,
  alsoPack: false,
  clipTitle: '',
  titleFont: 'inter',
  titleSize: 34,
  titleColor: 'text',
  clipKeys: 'bottom',
  keyGain: 0,
  vocGain: 0,
  advanced: false
};

/* where the windows were */
const STATE_DEFAULTS = {
  bounds: { main: null, chord: null, number: null, keys: null },
  popout: { chord: false, number: false, keys: false }
};

const PREF_KEYS = new Set(Object.keys(PREF_DEFAULTS));

let prefs = null;
let state = null;

function readJson(file, defaults) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return Object.assign({}, defaults, parsed);
  } catch {
    return Object.assign({}, defaults);
  }
}

function load() {
  if (!prefs) prefs = readJson(PREF_FILE, PREF_DEFAULTS);
  if (!state) state = readJson(STATE_FILE, STATE_DEFAULTS);
  return Object.assign({}, prefs, state);
}

const timers = {};
function writeLater(key, dir, file, data) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[chordlight] could not write ' + file + ': ' + err.message);
    }
  }, 400);
}

function save(patch) {
  load();
  let prefsTouched = false, stateTouched = false;
  for (const [k, v] of Object.entries(patch || {})) {
    if (PREF_KEYS.has(k)) { prefs[k] = v; prefsTouched = true; }
    else { state[k] = v; stateTouched = true; }
  }
  if (prefsTouched) writeLater('prefs', PREF_DIR, PREF_FILE, prefs);
  if (stateTouched) writeLater('state', STATE_DIR, STATE_FILE, state);
  return load();
}

function saveBounds(name, bounds) {
  load();
  state.bounds = Object.assign({}, state.bounds, { [name]: bounds });
  writeLater('state', STATE_DIR, STATE_FILE, state);
}

module.exports = { load, save, saveBounds, PREF_FILE, STATE_FILE, REC_DIR, BACKDROP_DIR };
