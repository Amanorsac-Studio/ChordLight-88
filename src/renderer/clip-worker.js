'use strict';
/* Chordlight 88 — the clip, on its own thread.
 *
 * The window sends a snapshot whenever what you play changes; this thread
 * draws it and, while a video is recording, hands the recorder a frame at a
 * steady rate — 30 or 60 a second, whether or not anything moved. Nothing
 * here waits on the window: a burst of fast chords, a busy layout, a window
 * covered by another app — the clip keeps its pace.
 *
 * Messages in:
 *   fonts   {list:[{family, weight, data|url}]}  load the app's faces; replies ready
 *   size    {W, H}                           the clip's size
 *   snap    {S}                              what to draw
 *   pic     {key, bitmap}                    the backdrop picture (or null)
 *   video   {bitmap}                         the latest backdrop video frame
 *   preview {canvas?, w, h, on}              the Preview panel's canvas
 *   rec     {writable, fps}                  start feeding a recorder
 *   stop                                     stop feeding it
 *   free                                     nothing needs a frame for now
 *   grab                                     a PNG of the current frame (bench)
 */
if (typeof self.ChordlightClipDraw === 'undefined') importScripts('clip-draw.js');

const draw = self.ChordlightClipDraw();
let S = null;
let main = null;                                     // { canvas, ctx, W, H }
let pic = null, picKey = '';
let video = null;
const prev = { canvas: null, ctx: null, on: false, last: 0, timer: 0 };
const rec = { writer: null, fps: 30, t0: 0, n: 0, timer: 0, pending: 0 };

function drawNow() {
  if (!main || !S) return false;
  S.pic = (pic && S.picKey === picKey) ? pic : null;
  S.video = video; S.videoW = video ? video.width : 0; S.videoH = video ? video.height : 0;
  let drew = false;
  try { drew = draw.draw(S, main); } catch (err) { /* one bad frame, never a stopped clip */ }
  if (drew && prev.on && prev.ctx) {
    prev.ctx.drawImage(main.canvas, 0, 0, prev.canvas.width, prev.canvas.height);
    prev.last = performance.now();
  }
  return drew;
}

/* Preview only (nothing recording): draw when something changed, at most
   30 times a second. While recording, the recorder's clock draws instead. */
function soon() {
  if (rec.writer || prev.timer || !prev.on) return;
  const wait = Math.max(0, 33 - (performance.now() - prev.last));
  prev.timer = setTimeout(() => { prev.timer = 0; drawNow(); }, wait);
}

/* The recorder's clock. Each tick: bring the frame up to date, then hand
   the recorder a copy, stamped with its time. If the encoder ever falls
   behind, a frame is skipped rather than queued — the clip never lags. */
function tick() {
  if (!rec.writer) return;
  const now = performance.now();
  drawNow();
  if (main && rec.pending < 3) {
    let frame = null;
    try { frame = new VideoFrame(main.canvas, { timestamp: Math.round((now - rec.t0) * 1000), duration: Math.round(1e6 / rec.fps) }); }
    catch { frame = null; }
    if (frame) {
      rec.pending++;
      const done = () => { rec.pending--; try { frame.close(); } catch { /* already closed */ } };
      rec.writer.write(frame).then(done, done);
    }
  }
  rec.n++;
  let next = rec.t0 + rec.n * 1000 / rec.fps;
  if (next < performance.now() - 250) { rec.n = Math.ceil((performance.now() - rec.t0) * rec.fps / 1000); next = rec.t0 + rec.n * 1000 / rec.fps; }
  rec.timer = setTimeout(tick, Math.max(0, next - performance.now()));
}

function stopRec() {
  clearTimeout(rec.timer); rec.timer = 0;
  const w = rec.writer; rec.writer = null;
  if (w) { try { w.close().catch(() => {}); } catch { /* the track was stopped first */ } }
}

async function loadFonts(list) {
  let ok = true;
  for (const f of list || []) {
    try {
      const face = new FontFace(f.family, f.data || `url("${f.url}")`, { weight: String(f.weight), style: 'normal' });
      await face.load();
      self.fonts.add(face);
    } catch { ok = false; }
  }
  return ok;
}

self.onmessage = async (e) => {
  const m = e.data || {};
  switch (m.t) {
    case 'fonts': {
      const ok = await loadFonts(m.list);
      self.postMessage({ t: 'ready', ok, gen: typeof VideoFrame === 'function' && typeof OffscreenCanvas === 'function' });
      break;
    }
    case 'size':
      if (!main || main.W !== m.W || main.H !== m.H) {
        const canvas = new OffscreenCanvas(m.W, m.H);
        main = { canvas, ctx: canvas.getContext('2d', { alpha: false }), W: m.W, H: m.H };
        draw.reset();
      }
      break;
    case 'snap':
      S = m.S;
      if (rec.writer) break;          // the recorder's clock will draw it
      soon();
      break;
    case 'pic':
      if (pic && pic !== m.bitmap && pic.close) pic.close();
      pic = m.bitmap || null; picKey = m.key || '';
      draw.reset(); soon();
      break;
    case 'video':
      if (video && video.close) video.close();
      video = m.bitmap || null;
      soon();
      break;
    case 'preview':
      if (m.canvas) { prev.canvas = m.canvas; prev.ctx = m.canvas.getContext('2d', { alpha: false }); }
      if (prev.canvas && m.w && m.h && (prev.canvas.width !== m.w || prev.canvas.height !== m.h)) { prev.canvas.width = m.w; prev.canvas.height = m.h; }
      prev.on = !!m.on;
      if (prev.on) { draw.reset(); drawNow(); }
      break;
    case 'rec':
      stopRec();
      rec.writer = m.writable.getWriter();
      rec.fps = m.fps || 30; rec.t0 = performance.now(); rec.n = 0; rec.pending = 0;
      draw.reset();
      tick();
      break;
    case 'stop':
      stopRec();
      break;
    case 'free':
      stopRec();
      prev.on = false;
      main = null; draw.free();
      if (video && video.close) video.close(); video = null;
      break;
    case 'grab': {
      drawNow();
      const blob = main ? await main.canvas.convertToBlob({ type: 'image/png' }) : null;
      self.postMessage({ t: 'grab', id: m.id, blob });
      break;
    }
    default: break;
  }
};
