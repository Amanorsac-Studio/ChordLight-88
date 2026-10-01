'use strict';
/* Chordlight 88 — licensing, per the Amanorsac License Integration Standard 1.1.
 *
 * The whole security model is one check: the server's proof carries an ECDSA
 * P-256 signature over the proof body, made with a private key that exists
 * only on the server, and this file verifies it with the studio public key
 * compiled in below (R2, R3). Nothing a customer or a cracker can do on this
 * machine produces a valid proof. There is no master key, no override and no
 * localhost fallback in the shipped binary (R1, B38).
 *
 * State on disk, machine-state folder only (doc 04 §1.2):
 *   device.id          — a UUID made on first run, plain (R6)
 *   license-key.dat    — the key, encrypted with the OS key store (R7)
 *   license-proof.dat  — the latest verified proof, encrypted (R7)
 * license-proof.dat is written only after a proof verified; its presence is
 * the evidence that activation truly succeeded.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

/* ------------------------------------------------------------------ *
 * Product constants — the only lines that change per product (§8)
 * ------------------------------------------------------------------ */
const PRODUCT = 'Chordlight 88';
const APP_ID = 'chordlight88';
/* The default is the live server (R1). An environment variable may point a
   DEVELOPMENT build elsewhere; a packaged build ignores it. */
const BASE_URL = (!app.isPackaged && process.env.AMANORSAC_LICENSE_SERVER) || 'https://amanorsac.studio';

/* The studio public key — raw SEC1 uncompressed P-256 point, 65 bytes,
   byte for byte from the License Integration Standard §5 (R2). */
const PUBLIC_KEY = Uint8Array.from([
  0x04, 0xcd, 0xa5, 0x7d, 0x1c, 0xc8, 0xa6, 0xe2, 0x71, 0xd5, 0x48, 0x49,
  0xce, 0x55, 0xd5, 0x03, 0x77, 0x56, 0x66, 0x90, 0xfd, 0xb6, 0x95, 0x45,
  0xa4, 0x1a, 0x92, 0xc4, 0x77, 0xda, 0xcb, 0x00, 0x0d, 0x2c, 0x06, 0x0b,
  0xa8, 0x3f, 0xbd, 0x9b, 0x70, 0x85, 0xaf, 0xff, 0xc0, 0x42, 0xd4, 0x00,
  0x7e, 0x5b, 0x96, 0xfe, 0x68, 0xff, 0xec, 0x91, 0x11, 0xf6, 0x21, 0x00,
  0x79, 0xfc, 0x43, 0x59, 0x52
]);
const KEY_OBJECT = crypto.createPublicKey({
  format: 'jwk',
  key: {
    kty: 'EC', crv: 'P-256',
    x: Buffer.from(PUBLIC_KEY.subarray(1, 33)).toString('base64url'),
    y: Buffer.from(PUBLIC_KEY.subarray(33, 65)).toString('base64url')
  }
});

const HOUR = 3600 * 1000;
const KEY_SHAPE = /^[A-Z]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

/* ------------------------------------------------------------------ *
 * Storage (doc 04 §1.2): %LOCALAPPDATA% on Windows, Application Support
 * on macOS. Encrypted with DPAPI / Keychain through Electron's safeStorage.
 * ------------------------------------------------------------------ */
function stateDir() {
  const base = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA || app.getPath('appData'))
    : app.getPath('appData');
  return path.join(base, 'Amanorsac Studio', PRODUCT);
}
const F = {
  device: () => path.join(stateDir(), 'device.id'),
  key: () => path.join(stateDir(), 'license-key.dat'),
  proof: () => path.join(stateDir(), 'license-proof.dat')
};
function readEncrypted(file) {
  try {
    const blob = fs.readFileSync(file);
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(blob);
  } catch {
    /* will not decrypt (profile moved, password reset) or missing: forget it,
       quietly, and the activation screen comes back (R7) */
    try { fs.unlinkSync(file); } catch { /* already gone */ }
    return null;
  }
}
function writeEncrypted(file, text) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This computer cannot store the licence securely.');
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(file, safeStorage.encryptString(text));
}
function forget(file) { try { fs.unlinkSync(file); } catch { /* none */ } }

/* The device id (R6): random, made once, never anything personal. A wiped
   machine gets a new one and uses a seat again — the correct outcome. */
function deviceId() {
  try {
    const id = fs.readFileSync(F.device(), 'utf8').trim();
    if (id.length >= 16 && id.length <= 128) return id;
  } catch { /* first run */ }
  const id = crypto.randomUUID();
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(F.device(), id, 'utf8');
  return id;
}

/* ------------------------------------------------------------------ *
 * The proof — verified exactly as §5 says
 * ------------------------------------------------------------------ */
function b64url(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(t + '='.repeat((4 - t.length % 4) % 4), 'base64');
}
/* Returns the parsed body, or throws. The signature is checked over the
   decoded body bytes exactly as received — never re-serialised. */
function verifyProof(proof, wantDevice, wantKey) {
  if (typeof proof !== 'string') throw new Error('no proof');
  const dot = proof.indexOf('.');
  if (dot < 0) throw new Error('malformed proof');
  const body = b64url(proof.slice(0, dot)), sig = b64url(proof.slice(dot + 1));
  if (sig.length !== 64) throw new Error('bad signature length');
  const ok = crypto.verify('sha256', body, { key: KEY_OBJECT, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) throw new Error('signature failed');
  const p = JSON.parse(body.toString('utf8'));
  if (p.deviceKey !== wantDevice || p.licenseKey !== wantKey) throw new Error('proof is for another device or key');   // R5
  for (const k of ['issuedAt', 'expiresAt', 'graceUntil']) if (!Number.isFinite(p[k])) throw new Error('proof missing ' + k);
  return p;
}
/* Licensed means all of: signature verified (done above), now <= graceUntil,
   and the clock not turned back more than 48 hours before issuedAt. */
const inForce = (p) => { const now = Date.now(); return now <= p.graceUntil && now >= p.issuedAt - 48 * HOUR; };

/* ------------------------------------------------------------------ *
 * The server (§4)
 * ------------------------------------------------------------------ */
async function post(route, body) {
  const res = await fetch(BASE_URL + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
/* The words a person sees, never a status code (B57, B58). */
function explain(status, json) {
  const code = json && json.error;
  if (status === 404 || code === 'no_such_license') return 'That key is not one of ours. Check it under My Apps at amanorsac.studio.';
  if (status === 409 || code === 'device_limit_reached') {
    const names = (json && json.devices || []).map((d) => d.device_name).filter(Boolean);
    return 'Both of this key\'s computers are in use' + (names.length ? ` (${names.join(', ')})` : '') +
      '. Remove one under My Apps at amanorsac.studio, or deactivate it on that computer, then try again.';
  }
  if (status === 400) return 'The request was not accepted. Check the key and try again.';
  if (status === 502 || status === 503 || code === 'upstream_error' || code === 'licensing_unavailable') {
    return (json && json.message) || 'Could not reach the licence server. Check your connection and try again.';
  }
  return 'Could not reach the licence server. Check your connection and try again.';
}

/* ------------------------------------------------------------------ *
 * State machine (§7)
 * ------------------------------------------------------------------ */
const S = { licensed: false, key: null, proof: null, body: null, message: '', busy: false, timer: 0, listeners: new Set() };
const emit = () => { const st = status(); S.listeners.forEach((fn) => { try { fn(st); } catch { /* listener gone */ } }); };
function status() {
  return {
    licensed: S.licensed,
    hasKey: !!S.key,
    keyMasked: S.key ? S.key.slice(0, 4) + '-••••-••••-' + S.key.slice(-4) : '',
    expiresAt: S.body ? S.body.expiresAt : 0,
    graceUntil: S.body ? S.body.graceUntil : 0,
    offlineSoon: !!(S.body && Date.now() > S.body.expiresAt && Date.now() <= S.body.graceUntil),
    message: S.message,
    busy: S.busy,
    deviceId: deviceId()
  };
}

function loadStored() {
  S.key = readEncrypted(F.key());
  const proof = readEncrypted(F.proof());
  if (S.key && proof) {
    try {
      const body = verifyProof(proof, deviceId(), S.key);
      if (inForce(body)) { S.proof = proof; S.body = body; S.licensed = true; return; }
      forget(F.proof());                       // stale: past graceUntil — behaves as "key but no proof"
    } catch { forget(F.proof()); }
  }
  S.proof = null; S.body = null; S.licensed = false;
}

/* Activate, or heartbeat — the same call (§4.1). A failed heartbeat never
   deletes a valid stored proof (R9). */
async function activate(rawKey, isHeartbeat) {
  const key = String(rawKey || S.key || '').trim().toUpperCase();
  if (!KEY_SHAPE.test(key)) { S.message = 'A key looks like XXXX-XXXX-XXXX-XXXX.'; emit(); return status(); }
  if (S.busy) return status();
  S.busy = true; if (!isHeartbeat) S.message = 'Checking the key…'; emit();
  try {
    const { status: code, json } = await post('/licenses/activate', { licenseKey: key, deviceKey: deviceId(), deviceLabel: os.hostname().slice(0, 120) });
    if (code >= 200 && code < 300 && json && json.proof) {
      let body;
      try { body = verifyProof(json.proof, deviceId(), key); }
      catch (err) {
        /* the server answered, the signature did not hold: say so, never "activated" (R4) */
        S.message = 'The licence could not be verified. Try again, and if it keeps happening write to hello@amanorsac.studio.';
        S.busy = false; emit(); return status();
      }
      if (!inForce(body)) { S.message = 'This computer\'s clock looks wrong. Set the date and time, then try again.'; S.busy = false; emit(); return status(); }
      writeEncrypted(F.key(), key);
      writeEncrypted(F.proof(), json.proof);
      S.key = key; S.proof = json.proof; S.body = body; S.licensed = true; S.message = '';
    } else if (!isHeartbeat) {
      S.message = explain(code, json);
    }
  } catch (err) {
    if (!isHeartbeat) S.message = /securely/.test(String(err && err.message)) ? err.message : 'Could not reach the licence server. Check your connection and try again.';
  }
  S.busy = false; emit();
  return status();
}

async function deactivate() {
  if (!S.key) return status();
  S.busy = true; S.message = 'Freeing this computer…'; emit();
  try {
    const { status: code } = await post('/licenses/deactivate', { licenseKey: S.key, deviceKey: deviceId() });
    if ((code >= 200 && code < 300) || code === 404) {
      forget(F.key()); forget(F.proof());
      S.key = null; S.proof = null; S.body = null; S.licensed = false; S.message = '';
    } else {
      S.message = 'Deactivation did not go through. Try again later.';
    }
  } catch {
    S.message = 'Could not reach the licence server. Check your connection and try again.';
  }
  S.busy = false; emit();
  return status();
}

/* Startup (§7): stored proof → unlock, then heartbeat; key but no proof →
   activate; neither → activation screen. Then hourly. */
function start() {
  loadStored();
  if (S.key) activate(S.key, S.licensed);     // a silent heartbeat when already licensed
  clearInterval(S.timer);
  S.timer = setInterval(() => {
    if (S.body && Date.now() > S.body.graceUntil) { forget(F.proof()); S.proof = null; S.body = null; S.licensed = false; emit(); }
    if (S.key) activate(S.key, S.licensed);
  }, HOUR);
  emit();
}

module.exports = { PRODUCT, APP_ID, BASE_URL, start, status, activate, deactivate, onChange: (fn) => S.listeners.add(fn), stateDir };
