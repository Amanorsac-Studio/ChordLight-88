'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Settings live under the company data-path convention:
 *   Documents/Amanorsac Studio/Chordlight 88/settings.json
 * (Amanorsac Studio Master Standard §1 — "Data path convention")
 */
const DIR = path.join(app.getPath('documents'), 'Amanorsac Studio', 'Chordlight 88');
const FILE = path.join(DIR, 'settings.json');

const DEFAULTS = {
  accent: 'blue',
  mode: 'dark',
  keyCenter: 'C',
  spelling: 'auto',
  labelMode: 'notes',
  keySize: 188,
  midiPort: 'All inputs',
  midiChannel: 'Omni',
  bounds: { main: null, chord: null, number: null, keys: null },
  popout: { chord: false, number: false, keys: false }
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    cache = Object.assign({}, DEFAULTS);
  }
  return cache;
}

let writeTimer = null;
function save(patch) {
  cache = Object.assign(load(), patch || {});
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
      console.error('[chordlight] could not write settings:', err.message);
    }
  }, 400);
  return cache;
}

function saveBounds(name, bounds) {
  const s = load();
  s.bounds = Object.assign({}, s.bounds, { [name]: bounds });
  save(s);
}

module.exports = { load, save, saveBounds, FILE, DIR };
