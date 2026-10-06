'use strict';
/* Chordlight 88 Free Trial — the trial clock and the recording limit.
 *
 * Built only into the Free Trial edition (package.json "chordlightEdition":
 * "trial", stamped by electron-builder.trial.cjs). The full product never
 * runs a line of this file.
 *
 * The rules
 *   - 7 days from the first launch on this computer, counted in real time,
 *     whether the app is open or not. Then the app locks: no window, no MIDI,
 *     just the "trial ended" screen.
 *   - Recordings stop at 1 minute (video, MIDI, WAV, .chordlight, Keep).
 *   - Every trial build stops working 180 days after it was built, so an old
 *     installer cannot be kept around for ever on a computer with a frozen
 *     clock.
 *
 * How it is kept honest — offline, with no account:
 *   - The start date is written to four places at once: two app-data
 *     folders, a third folder outside them, and (Windows) the registry.
 *     Each launch reads all four, keeps the EARLIEST start, and rewrites the
 *     lot — deleting one, two or three of them changes nothing. Uninstalling
 *     leaves them in place.
 *   - Each record is sealed with AES-256-GCM under a key derived from this
 *     computer's identity (Windows MachineGuid / macOS IOPlatformUUID): an
 *     edited record does not open, and a record copied from another
 *     computer does not open either.
 *   - Winding the clock back is caught: the record carries the latest time
 *     the app has seen, and a clock earlier than that locks the app until the
 *     date is right again. The time is also checked against the studio
 *     server's clock when the computer is online (a HEAD request; nothing
 *     about you or this computer is sent).
 *   - Once expired, the records say so: setting the clock back later does
 *     not reopen the trial.
 *   - The packaged app is sealed (Electron fuses + ASAR integrity, set in
 *     electron-builder.trial.cjs), so this file cannot be edited out.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { app, net } = require('electron');

const PKG = require('../../package.json');
const DAY = 24 * 3600 * 1000;
const TRIAL_DAYS = 7;
const BUILD_LIFETIME_DAYS = 180;
const MAX_REC_SECONDS = 60;
const SKEW = 2 * 3600 * 1000;           // clocks wobble (time sync, DST): two hours of grace
const TIME_URL = 'https://amanorsac.studio';

const isTrial = PKG.chordlightEdition === 'trial' || (!app.isPackaged && process.env.CHORDLIGHT_EDITION === 'trial');
const builtAt = Date.parse(PKG.trialBuilt || '') || 0;

/* ------------------------------------------------------------------ *
 * This computer
 * ------------------------------------------------------------------ */
function machineId() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
      if (m) return 'win:' + m[1].toLowerCase();
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 4000 });
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]+)"/);
      if (m) return 'mac:' + m[1].toUpperCase();
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try { const id = fs.readFileSync(f, 'utf8').trim(); if (id) return 'lin:' + id; } catch { /* next */ }
      }
    }
  } catch { /* fall through */ }
  const cpu = (os.cpus()[0] || {}).model || '';
  return 'host:' + [os.hostname(), cpu, os.totalmem(), os.platform(), os.arch()].join('|');
}

const PEPPER = Buffer.from('7c1e9a44d2b05f83e61a0c9f3b7d2e584a19c06fd3e8b2715f0a6c94e2d1b387', 'hex');
let KEY = null;
function key() {
  if (!KEY) KEY = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(machineId()), PEPPER, Buffer.from('chordlight88-trial-v1'), 32));
  return KEY;
}
function seal(rec) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(rec), 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), body]).toString('base64');
}
function open(text) {
  const buf = Buffer.from(String(text).trim(), 'base64');
  if (buf.length < 30 || buf[0] !== 1) throw new Error('not a record');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(1, 13));
  d.setAuthTag(buf.subarray(13, 29));
  const rec = JSON.parse(Buffer.concat([d.update(buf.subarray(29)), d.final()]).toString('utf8'));
  if (!Number.isFinite(rec.s) || !Number.isFinite(rec.l)) throw new Error('bad record');
  return rec;
}

/* ------------------------------------------------------------------ *
 * The four places
 * ------------------------------------------------------------------ */
function localBase() {
  return process.platform === 'win32' ? (process.env.LOCALAPPDATA || app.getPath('appData')) : app.getPath('appData');
}
function fileStore(file) {
  return {
    where: file,
    read() {
      let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
      let birth = 0; try { const st = fs.statSync(file); birth = Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs); } catch { /* none */ }
      try { return { rec: open(text) }; } catch { return { bad: true, birth }; }
    },
    write(text) {
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); } catch { /* the others hold it */ }
    }
  };
}
const REG_KEY = 'HKCU\\Software\\Amanorsac Studio\\Shared';
const REG_VALUE = 'cl88t';
const regStore = {
  where: REG_KEY,
  read() {
    try {
      const out = execFileSync('reg', ['query', REG_KEY, '/v', REG_VALUE], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      const m = out.match(new RegExp(REG_VALUE + '\\s+REG_SZ\\s+(\\S+)'));
      if (!m) return null;
      try { return { rec: open(m[1]) }; } catch { return { bad: true, birth: 0 }; }
    } catch { return null; }
  },
  write(text) {
    try { execFileSync('reg', ['add', REG_KEY, '/v', REG_VALUE, '/t', 'REG_SZ', '/d', text, '/f'], { windowsHide: true, timeout: 4000 }); } catch { /* the others hold it */ }
  }
};
function stores() {
  const list = [
    fileStore(path.join(localBase(), 'Amanorsac Studio', 'Chordlight 88 Free Trial', 'trial.dat')),
    fileStore(path.join(app.getPath('userData'), 'Session Cache', 'state.bin')),
    process.platform === 'win32'
      ? fileStore(path.join(os.homedir(), 'AppData', 'LocalLow', 'Amanorsac Studio', 'shared.bin'))
      : fileStore(path.join(os.homedir(), 'Library', 'Preferences', 'studio.amanorsac.shared.bin'))
  ];
  if (process.platform === 'win32') list.push(regStore);
  return list;
}

/* ------------------------------------------------------------------ *
 * Time — the computer's, corrected by the server's when we can reach it
 * ------------------------------------------------------------------ */
let offset = 0;                 // server time minus local time, when known
let netChecked = false;
const now = () => Date.now() + offset;
async function checkNetworkTime() {
  try {
    const t0 = Date.now();
    const res = await Promise.race([
      net.fetch(TIME_URL, { method: 'HEAD', cache: 'no-store' }),
      new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 6000))
    ]);
    const server = Date.parse(res.headers.get('date') || '');
    if (!Number.isFinite(server)) return false;
    const local = (t0 + Date.now()) / 2;
    const diff = server - local;
    offset = Math.abs(diff) > 10 * 60 * 1000 ? diff : 0;   // ignore small drift
    netChecked = true;
    return true;
  } catch { return false; }
}

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */
let state = null;
function evaluate() {
  if (!isTrial) return (state = { trial: false, locked: false });
  const t = now();
  const found = stores().map((s) => ({ s, r: s.read() }));
  const good = found.filter((f) => f.r && f.r.rec).map((f) => f.r.rec);
  const bad = found.filter((f) => f.r && f.r.bad);

  let start, last, expired;
  if (good.length) {
    start = Math.min(...good.map((r) => r.s));
    last = Math.max(...good.map((r) => r.l));
    expired = good.some((r) => r.x);
  } else if (bad.length) {
    /* records that will not open — edited, or brought from another computer.
       They still prove a trial started here: count from the oldest file. */
    const births = bad.map((f) => f.r.birth).filter((b) => b > 0);
    start = births.length ? Math.min(...births) : t - TRIAL_DAYS * DAY;
    last = start;
    expired = !births.length;
  } else {
    start = t; last = t; expired = false;            // first launch
  }

  const endsAt = start + TRIAL_DAYS * DAY;
  let reason = '';
  if (builtAt && t > builtAt + BUILD_LIFETIME_DAYS * DAY) reason = 'build';
  else if (t + SKEW < last || t + SKEW < start) reason = 'clock';
  else if (expired || t >= endsAt) { reason = 'expired'; expired = true; }

  /* write back to every place — heals any that were deleted. A wrong clock
     does not move the high-water mark. */
  const rec = { v: 1, s: start, l: reason === 'clock' ? last : Math.max(last, t), x: expired ? 1 : 0 };
  const text = seal(rec);
  for (const { s } of found) s.write(text);

  const msLeft = Math.max(0, endsAt - t);
  state = {
    trial: true,
    locked: !!reason,
    reason,
    startedAt: start,
    endsAt,
    msLeft,
    daysLeft: reason ? 0 : Math.max(1, Math.ceil(msLeft / DAY)),
    maxRecSeconds: MAX_REC_SECONDS,
    netChecked
  };
  return state;
}

/* ------------------------------------------------------------------ *
 * Recording guard — the main process has the last word on what is saved
 * ------------------------------------------------------------------ */
const takes = [];               // when each take started (ms, local clock)
function takeStarted() { takes.push(Date.now()); while (takes.length > 6) takes.shift(); }

function smfSeconds(buf) {
  /* format-0 file as Chordlight writes it: header, one track; 480 ppq, tempo
     in the track. Sum the deltas at the file's own tempo. */
  if (buf.length < 22 || buf.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ppq = buf.readUInt16BE(12);
  let p = 14, ticks = 0, usPerQ = 500000, seconds = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('latin1', p, p + 4), len = buf.readUInt32BE(p + 4);
    p += 8;
    if (id !== 'MTrk') { p += len; continue; }
    const end = p + len; let run = 0;
    while (p < end) {
      let d = 0, b; do { b = buf[p++]; d = (d << 7) | (b & 0x7f); } while (b & 0x80 && p < end);
      ticks += d; seconds += d * usPerQ / 1e6 / ppq;
      let st = buf[p];
      if (st === 0xFF) {
        const type = buf[p + 1]; p += 2;
        let l = 0; do { b = buf[p++]; l = (l << 7) | (b & 0x7f); } while (b & 0x80);
        if (type === 0x51 && l === 3) usPerQ = (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2];
        p += l;
      } else if (st === 0xF0 || st === 0xF7) {
        p++; let l = 0; do { b = buf[p++]; l = (l << 7) | (b & 0x7f); } while (b & 0x80); p += l;
      } else {
        if (st & 0x80) { run = st; p++; } else st = run;
        const hi = st & 0xF0; p += (hi === 0xC0 || hi === 0xD0) ? 1 : 2;
      }
    }
    p = end;
  }
  return seconds;
}
function wavSeconds(buf) {
  if (buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF') throw new Error('not a WAV file');
  let p = 12, byteRate = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('latin1', p, p + 4), len = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(p + 16);
    if (id === 'data') return byteRate ? Math.min(len, buf.length - p - 8) / byteRate : Infinity;
    p += 8 + len + (len & 1);
  }
  return Infinity;
}

/* Throws when a trial recording breaks the limit; the file is not written. */
function checkSave(name, bytes) {
  if (!isTrial) return;
  const st = state || evaluate();
  if (st.locked) throw new Error('The free trial has ended');
  const ext = path.extname(String(name)).toLowerCase();
  const buf = Buffer.from(bytes);
  const LIMIT = MAX_REC_SECONDS + 2;
  if (ext === '.mid' || ext === '.midi') {
    if (smfSeconds(buf) > LIMIT) throw new Error('Free trial recordings are limited to 1 minute');
    return;
  }
  if (ext === '.wav') {
    if (wavSeconds(buf) > LIMIT) throw new Error('Free trial recordings are limited to 1 minute');
    return;
  }
  /* video and .chordlight: the take must have started no more than a minute
     (plus time to finish writing) before it is saved */
  const t = Date.now();
  const ok = takes.some((s) => t - s >= 0 && t - s <= (MAX_REC_SECONDS + 45) * 1000);
  if (!ok) throw new Error('Free trial recordings are limited to 1 minute');
}

module.exports = {
  isTrial,
  MAX_REC_SECONDS,
  evaluate,
  status: () => state || evaluate(),
  checkNetworkTime,
  takeStarted,
  checkSave,
  _test: { seal, open, smfSeconds, wavSeconds, stores }
};
