'use strict';
/* Chordlight 88 — the built-in instruments, on the audio thread.
 *
 * Plays an Amanorsac sampled instrument (a .jmi bundle: instrument.json +
 * samples), following "HOW TO PLAY THESE SAMPLES.md":
 *   - the zone whose anchorVelocity is nearest the played velocity carries
 *     the timbre; the level follows one continuous curve through the
 *     anchors' measured levelDb — no velocity curve on top (§3.3);
 *   - below its anchor a note is darkened a little (§3.4);
 *   - optional equal-power blend of the two neighbouring layers when the
 *     bundle asks for it (velocityXfade, §3.5);
 *   - stretch tuning is in the samples; playbackRate = 2^((note-root)/12);
 *   - decaying instruments play to the end; note-off is a short release,
 *     the pedal defers note-offs, a re-struck key starts a new voice (§3.6);
 *   - a brick-wall limiter on the output: samples peak at -9 dBFS so that
 *     chords add up without clipping (§3.7).
 *
 * The window decodes the audio and hands each zone over once, as 16-bit
 * (the sources are 16-bit, so nothing is lost and memory is halved).
 *
 * Messages in:
 *   bank  {sr, playback, sustaining, zones:[{id, rootNote, lo, hi, anchor, levelDb, releaseMs, rr:[{L,R,len,loop}]}],
 *          releaseZones:[{id, rootNote, lo, hi, velLo, velHi, rtDecayDb, rr:[]}]}
 *   zone  {id, rr:[{L,R,len,loop}]}      audio for a zone (or release zone) announced without it
 *   release {ms}                         a player's own release time; 0 = the bundle's
 *   attack  {ms}                         a player's own attack; 0 = the natural strike
 *
 * Note-off ("NOTE-OFF AND KEY-OFF.md"): every sample is a full-length note,
 * so the chop is this engine's job. On note-off the voice fades to -60 dB
 * over releaseMs (time to silence, not a time constant) and is killed below
 * -80 dB; the pedal defers note-offs; a key-off sample, when the bundle has
 * them, plays once per note, attenuated by rtDecayDb per second held.
 *   on    {n, v} · off {n} · pedal {down} · all · gain {g}
 */
const MAX_VOICES = 96;
const I16 = 1 / 32768;
/* Always fade the head of a sample in over this many frames, so a voice
   can never start on a step. ~1 ms at 48 kHz; inaudible on a hammer. */
const MIN_ATTACK = 48;

class Limiter {
  constructor(sr) {
    this.look = Math.max(1, Math.round(0.002 * sr));        // 2 ms lookahead
    this.bufL = new Float32Array(this.look); this.bufR = new Float32Array(this.look);
    this.pk = new Float32Array(this.look);
    this.w = 0; this.gain = 1; this.ceil = Math.pow(10, -0.3 / 20);
    this.rel = Math.exp(-1 / (0.08 * sr));                   // 80 ms release
  }
  process(L, R, n) {
    const { look, bufL, bufR, pk, ceil, rel } = this;
    let w = this.w, g = this.gain;
    for (let i = 0; i < n; i++) {
      const inL = L[i], inR = R[i];
      const peak = Math.max(Math.abs(inL), Math.abs(inR));
      /* the gain needed `look` samples from now: the highest peak in the window */
      pk[w] = peak;
      let m = 0; for (let k = 0; k < look; k++) if (pk[k] > m) m = pk[k];
      const want = m > ceil ? ceil / m : 1;
      g = want < g ? want : g + (want - g) * (1 - rel);
      const oL = bufL[w], oR = bufR[w];
      bufL[w] = inL; bufR[w] = inR;
      L[i] = oL * g; R[i] = oR * g;
      w = (w + 1) % look;
    }
    this.w = w; this.gain = g;
  }
}

class PianoEngine extends AudioWorkletProcessor {
  constructor() {
    super();
    this.zones = new Map();      // id -> zone
    this.byKey = [];             // note -> [zones], built once per bank
    this.bankSr = 48000;
    this.playback = { velocityXfade: 0, velocityBrightness: 60 };
    this.voices = [];
    this.relZones = [];
    this.sustaining = false;
    this.releaseOverrideMs = 0;     // a player's own release time; 0 = the instrument's
    this.attackMs = 0;              // a player's own attack; 0 = the natural strike
    this.pedal = false;
    this.gain = 0.8;
    this.lim = new Limiter(sampleRate);
    this.port.onmessage = (e) => this.onMessage(e.data || {});
  }

  onMessage(m) {
    switch (m.t) {
      case 'bank':
        this.bankSr = m.sr || 48000;
        this.playback = Object.assign({ velocityXfade: 0, velocityBrightness: 60 }, m.playback || {});
        this.zones = new Map(); this.voices = []; this.sustaining = !!m.sustaining;
        for (const z of m.zones || []) this.zones.set(z.id, Object.assign({ rrIndex: 0 }, z));
        this.relZones = (m.releaseZones || []).map((z) => Object.assign({ rrIndex: 0 }, z));
        for (const z of this.relZones) this.zones.set(z.id, z);
        this.byKey = [];
        for (let n = 0; n < 128; n++) this.byKey[n] = [...this.zones.values()].filter((z) => n >= z.lo && n <= z.hi).sort((a, b) => a.anchor - b.anchor);
        break;
      case 'zone': { const z = this.zones.get(m.id); if (z) z.rr = m.rr; break; }
      case 'on': this.noteOn(m.n | 0, Math.max(1, Math.min(127, m.v | 0))); break;
      case 'off': this.noteOff(m.n | 0); break;
      case 'pedal': this.setPedal(!!m.down); break;
      case 'all': this.voices = []; this.pedal = false; break;
      case 'release': this.releaseOverrideMs = Math.max(0, +m.ms || 0); break;
      case 'attack': this.attackMs = Math.max(0, Math.min(2000, +m.ms || 0)); break;
      case 'gain': this.gain = Math.max(0, Math.min(2, +m.g || 0)); break;
      default: break;
    }
  }

  /* §3.3 — one continuous level curve through the anchors */
  targetDb(a, v) {
    const first = a[0], last = a[a.length - 1];
    const lerp = (p, q) => p.levelDb + (q.levelDb - p.levelDb) * (v - p.anchor) / Math.max(1, q.anchor - p.anchor);
    if (a.length === 1) return Math.max(first.levelDb - 24, Math.min(first.levelDb + 3, first.levelDb + 0.25 * (v - first.anchor)));
    if (v <= first.anchor) return Math.max(first.levelDb - 24, lerp(first, a[1]));
    if (v >= last.anchor) return Math.min(last.levelDb + 3, lerp(a[a.length - 2], last));
    for (let k = 0; k + 1 < a.length; k++) if (v >= a[k].anchor && v <= a[k + 1].anchor) return lerp(a[k], a[k + 1]);
    return last.levelDb;
  }

  startVoice(n, z, v, target, weight) {
    if (!z.rr || !z.rr.length) return;
    const s = z.rr[z.rrIndex % z.rr.length]; z.rrIndex++;
    if (!s || !s.L) return;
    const gainDb = Math.max(-12, Math.min(12, target - z.levelDb));
    /* §3.4 — darker below the anchor, never brighter above it */
    const bright = this.playback.velocityBrightness || 0;
    const under = Math.min(0, v - z.anchor);
    const oct = bright > 0 ? (under / 32) * (bright / 100) * 1.5 : 0;
    let hz = oct < 0 ? Math.max(1200, Math.min(20000, 20000 * Math.pow(2, oct))) : 20000;
    const lp = hz < 19600 ? 1 - Math.exp(-2 * Math.PI * hz / sampleRate) : 0;   // one-pole coefficient, 0 = bypass
    if (this.voices.length >= MAX_VOICES) {
      let idx = -1, low = 1e9;
      this.voices.forEach((vc, i) => { const sc = (vc.releasing ? 0 : 1000) + vc.env; if (sc < low) { low = sc; idx = i; } });
      if (idx >= 0) this.voices.splice(idx, 1);
    }
    this.voices.push({
      n, z, s, pos: 0,
      ratio: Math.pow(2, (n - z.rootNote) / 12) * (this.bankSr / sampleRate),
      amp: Math.pow(10, gainDb / 20) * weight,
      env: 1, releasing: false, relStep: 0, held: true, keyoff: false,
      v, t0: currentTime,
      lp, l1: 0, r1: 0, attack: 0, attLen: this.attackSamples()
    });
  }

  /* The click guard is 48 samples (~1 ms at 48 kHz) and is always there; a
     player who asks for an attack gets that instead, as a straight fade in
     over the head of the sample. Captured per voice at note-on, so turning
     the knob never jumps a note that is already sounding. */
  attackSamples() {
    const asked = Math.round(this.attackMs * sampleRate / 1000);
    return asked > MIN_ATTACK ? asked : MIN_ATTACK;
  }

  /* §2 — releaseMs is the time to silence: the zone's, else by register */
  releaseMsFor(z) {
    if (this.releaseOverrideMs > 0) return this.releaseOverrideMs;
    if (z.releaseMs > 0) return z.releaseMs;
    if (this.sustaining) return 600;
    return z.rootNote < 48 ? 420 : z.rootNote < 72 ? 300 : 200;
  }

  /* §3 — the sound of the damper: one key-off sample per note, as its own
     voice, no attack, no release, no velocity curve, quieter the longer the
     note was held */
  keyOff(n, v, heldSec) {
    if (!this.relZones.length) return;
    let best = null, bestD = 1e9;
    for (const z of this.relZones) {
      if (n < z.lo || n > z.hi) continue;
      if (v < z.velLo || v > z.velHi) continue;
      const d = Math.abs(z.rootNote - n);
      if (d < bestD) { bestD = d; best = z; }
    }
    if (!best) for (const z of this.relZones) { if (n < z.lo || n > z.hi) continue; const d = Math.abs(z.rootNote - n); if (d < bestD) { bestD = d; best = z; } }
    if (!best || !best.rr || !best.rr.length) return;
    const gainDb = -(best.rtDecayDb || 3) * heldSec;
    if (gainDb < -60) return;
    const s = best.rr[best.rrIndex % best.rr.length]; best.rrIndex++;
    if (!s || !s.L) return;
    if (this.voices.length >= MAX_VOICES) return;      // a damper never steals a note
    this.voices.push({
      n: -1, z: best, s, pos: 0,
      ratio: Math.pow(2, (n - best.rootNote) / 12) * (this.bankSr / sampleRate),
      amp: Math.pow(10, gainDb / 20),
      env: 1, releasing: false, relStep: 0, held: false, keyoff: true,
      v, t0: currentTime, lp: 0, l1: 0, r1: 0, attack: 0, attLen: MIN_ATTACK
    });
  }

  noteOn(n, v) {
    const a = this.byKey[n]; if (!a || !a.length) return;
    const target = this.targetDb(a, v);
    /* nearest anchor carries the timbre */
    let zone = a[0]; for (const z of a) if (Math.abs(z.anchor - v) < Math.abs(zone.anchor - v)) zone = z;
    const xf = this.playback.velocityXfade || 0;
    if (xf > 0 && a.length > 1) {
      /* §3.5 — within ±xf of the midpoint between two anchors, blend them */
      const i = a.indexOf(zone);
      const nb = (v < zone.anchor) ? a[i - 1] : a[i + 1];
      if (nb) {
        const mid = (zone.anchor + nb.anchor) / 2;
        const d = Math.abs(v - mid);
        if (d < xf) {
          const x = 0.5 + 0.5 * ((v - mid) / xf) * (nb.anchor > zone.anchor ? 1 : -1);   // 0 = all zone, 1 = all nb
          this.startVoice(n, zone, v, target, Math.cos(x * Math.PI / 2));
          this.startVoice(n, nb, v, target, Math.sin(x * Math.PI / 2));
          return;
        }
      }
    }
    this.startVoice(n, zone, v, target, 1);
  }

  release(vc) {
    if (vc.releasing) return;
    vc.releasing = true;
    const ms = this.releaseMsFor(vc.z);
    vc.relStep = Math.exp(-6.9078 / (sampleRate * ms / 1000));   // -60 dB over releaseMs
  }
  /* release every voice of a note and fire its one key-off sample (the
     loudest strike's velocity, the longest hold) */
  damp(n) {
    let v = 0, t0 = Infinity, any = false;
    for (const vc of this.voices) {
      if (vc.n !== n || vc.keyoff || vc.releasing) continue;
      any = true; if (vc.v > v) v = vc.v; if (vc.t0 < t0) t0 = vc.t0;
      this.release(vc);
    }
    if (any) this.keyOff(n, v, Math.max(0, currentTime - t0));
  }
  noteOff(n) {
    let lifted = false;
    for (const vc of this.voices) if (vc.n === n && vc.held) { vc.held = false; lifted = true; }
    if (lifted && !this.pedal) this.damp(n);
  }
  setPedal(down) {
    this.pedal = down;
    if (down) return;
    const notes = new Set();
    for (const vc of this.voices) if (!vc.held && !vc.releasing && !vc.keyoff) notes.add(vc.n);
    for (const n of notes) this.damp(n);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out[1] || out[0], N = L.length;
    L.fill(0); if (R !== L) R.fill(0);
    if (this.voices.length) {
      const g = this.gain;
      for (let k = this.voices.length - 1; k >= 0; k--) {
        const vc = this.voices[k];
        const sl = vc.s.L, sr = vc.s.R || vc.s.L, len = vc.s.len;
        const loop = vc.s.loop, lS = loop ? loop.startSample : 0, lE = loop ? Math.min(loop.endSample, len - 2) : 0;
        let pos = vc.pos, env = vc.env, l1 = vc.l1, r1 = vc.r1;
        const lp = vc.lp;
        let dead = false;
        for (let i = 0; i < N; i++) {
          if (pos >= len - 2) {
            if (loop && lE > lS) pos = lS + ((pos - lS) % (lE - lS));
            else { dead = true; break; }
          }
          const i0 = pos | 0, f = pos - i0;
          /* 4-point cubic (Catmull-Rom) interpolation */
          const im = i0 > 0 ? i0 - 1 : 0, i2 = i0 + 2 < len ? i0 + 2 : len - 1;
          const cub = (a, b, c, d) => b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
          let xl = cub(sl[im], sl[i0], sl[i0 + 1], sl[i2]) * I16;
          let xr = cub(sr[im], sr[i0], sr[i0 + 1], sr[i2]) * I16;
          if (lp) { l1 += lp * (xl - l1); r1 += lp * (xr - r1); xl = l1; xr = r1; }
          let a = vc.amp * env * g;
          if (vc.attack < vc.attLen) { a *= vc.attack / vc.attLen; vc.attack++; }
          L[i] += xl * a; R[i] += xr * a;
          pos += vc.ratio;
          if (vc.releasing) { env *= vc.relStep; if (env < 1e-4) { dead = true; break; } }   // gone below -80 dB
        }
        vc.pos = pos; vc.env = env; vc.l1 = l1; vc.r1 = r1;
        if (dead) this.voices.splice(k, 1);
      }
    }
    this.lim.process(L, R, N);
    return true;
  }
}

registerProcessor('chordlight-piano', PianoEngine);
