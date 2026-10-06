'use strict';
/* Chordlight 88 — the WAV tap, on the audio thread.
 *
 * Packs the mix to 24-bit stereo as it arrives and hands the window a block
 * every 1024 frames (21 ms). Running here, not in the window, a busy window
 * can never make the WAV miss a block. Silence is written as silence, so
 * the file always runs as long as the take.
 */
class ChordlightWavTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 1024;
    this.buf = new Uint8Array(this.frames * 6);
    this.n = 0;
    this.on = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.on = false; };
  }

  process(inputs) {
    if (!this.on) return false;
    const input = inputs[0] || [];
    const L = input[0], R = input[1] || input[0];
    const len = L ? L.length : 128;
    for (let i = 0; i < len; i++) {
      const o = this.n * 6;
      for (let c = 0; c < 2; c++) {
        const v = L ? (c ? R[i] : L[i]) : 0;
        const x = v < -1 ? -1 : v > 1 ? 1 : v;
        const s = Math.round(x < 0 ? x * 8388608 : x * 8388607);
        const k = o + c * 3;
        this.buf[k] = s & 0xff; this.buf[k + 1] = (s >> 8) & 0xff; this.buf[k + 2] = (s >> 16) & 0xff;
      }
      if (++this.n === this.frames) {
        this.port.postMessage(this.buf, [this.buf.buffer]);
        this.buf = new Uint8Array(this.frames * 6);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('chordlight-wav-tap', ChordlightWavTap);
