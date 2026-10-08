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
 * How it is kept honest — offline, no account, no network at all (Master
 * Standard: a product with no licensing makes no network request):
 *   - The start date is written to three places at once, all inside the
 *     folders the File & Data Conventions allow this product: the trial's
 *     own machine-state folder, the product's machine-state folder, and the
 *     product's Documents folder. Each launch reads all three, keeps the
 *     EARLIEST start, and rewrites the lot — deleting one or two changes
 *     nothing. Uninstalling leaves them in place. Nothing in the registry.
 *   - Each record is sealed with AES-256-GCM under a key derived from the
 *     product's random device id (device.id, made on first run — B47; never
 *     a hardware serial): an edited record does not open, and a record
 *     copied from another computer does not open either.
 *   - Winding the clock back is caught: the record carries the latest time
 *     the app has seen, and a clock earlier than that locks the app until the
 *     date is right again.
 *   - Once expired, the records say so: setting the clock back later does
 *     not reopen the trial.
 *   - The packaged app is sealed (Electron fuses + ASAR integrity, set in
 *     electron-builder.trial.cjs), so this file cannot be edited out.
 *   The limit, stated plainly: someone who finds and deletes all three
 *   records (and the device id) gets a new 7 days. Closing that needs the
 *   licence server, which this edition deliberately never contacts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const PKG = require('../../package.json');
const DAY = 24 * 3600 * 1000;
const TRIAL_DAYS = 7;
const BUILD_LIFETIME_DAYS = 180;
const MAX_REC_SECONDS = 60;
const SKEW = 2 * 3600 * 1000;           // clocks wobble (time sync, DST): two hours of grace
const PRODUCT = 'Chordlight 88';

const isTrial = PKG.chordlightEdition === 'trial' || (!app.isPackaged && process.env.CHORDLIGHT_EDITION === 'trial');
const builtAt = Date.parse(PKG.trialBuilt || '') || 0;

/* ------------------------------------------------------------------ *
 * The key: the product's own random device id (B47), made on first run
 * ------------------------------------------------------------------ */
function localBase() {
  return process.platform === 'win32' ? (process.env.LOCALAPPDATA || app.getPath('appData')) : app.getPath('appData');
}
const productState = () => path.join(localBase(), 'Amanorsac Studio', PRODUCT);
const trialState = () => path.join(localBase(), 'Amanorsac Studio', PRODUCT + ' Free Trial');
const productDocs = () => path.join(app.getPath('documents'), 'Amanorsac Studio', PRODUCT);
function deviceId() {
  const file = path.join(productState(), 'device.id');       // shared with the full product
  try { const id = fs.readFileSync(file, 'utf8').trim(); if (id.length >= 16 && id.length <= 128) return id; } catch { /* first run */ }
  const id = crypto.randomUUID();
  try { fs.mkdirSync(productState(), { recursive: true }); fs.writeFileSync(file, id, 'utf8'); } catch { /* read-only: the key still works for this run */ }
  return id;
}

const PEPPER = Buffer.from('7c1e9a44d2b05f83e61a0c9f3b7d2e584a19c06fd3e8b2715f0a6c94e2d1b387', 'hex');
let KEY = null;
function key() {
  if (!KEY) KEY = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(deviceId()), PEPPER, Buffer.from('chordlight88-trial-v2'), 32));
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
 * The three places — all inside the folders this product may write
 * ------------------------------------------------------------------ */
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
function stores() {
  return [
    fileStore(path.join(trialState(), 'trial.dat')),
    fileStore(path.join(productState(), 'trial.dat')),
    fileStore(path.join(productDocs(), '.trial.dat'))
  ];
}

const now = () => Date.now();

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
    /* every record refuses to open — edited, brought from another computer,
       or the device id was removed. A trial was started here and its record
       was interfered with: it is over. */
    const births = bad.map((f) => f.r.birth).filter((b) => b > 0);
    start = births.length ? Math.min(...births) : t - TRIAL_DAYS * DAY;
    last = start;
    expired = true;
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
    maxRecSeconds: MAX_REC_SECONDS
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
  takeStarted,
  checkSave,
  _test: { seal, open, smfSeconds, wavSeconds, stores }
};
