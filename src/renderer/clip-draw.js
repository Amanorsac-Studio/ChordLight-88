'use strict';
/* Chordlight 88 — the clip frame, drawn.
 *
 * The one drawing of the clip: background, readouts, title, trail, keys and
 * name tags, into a 1080p (or 4K) canvas. It is fed a snapshot — plain data
 * the window prepares from its state — so the same code runs in two places:
 *
 *   clip-worker.js  a background thread, the normal case. Drawing a frame
 *                   never sits in front of a note you just played.
 *   app.js          the window itself, the fallback when a worker cannot be
 *                   started on this machine.
 *
 * Nothing here touches the page: no DOM, no CSS variables, no <video>. The
 * snapshot carries the resolved colours, the chord text already split into
 * its runs, the velocity ramp, and the picture or video frame as a bitmap.
 */
(function (scope) {
  const LOW = 21, HIGH = 108;
  const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
  const whites = [];
  for (let n = LOW; n <= HIGH; n++) if (!isBlack(n)) whites.push(n);
  /* where each key's centre sits, in percent of the width — the same sums
     the window's keybed uses, so a name tag lands on its key */
  const centerPct = new Map();
  { const WW = 100 / whites.length; let wi = 0;
    for (let n = LOW; n <= HIGH; n++) {
      if (isBlack(n)) { const left = wi * WW - WW * 0.285, w = WW * 0.57; centerPct.set(n, left + w / 2); }
      else { centerPct.set(n, wi * WW + WW / 2); wi++; } } }

  const mixRgb = (a, pa, b) => a.map((v, i) => Math.round(v * pa + b[i] * (1 - pa)));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function make() {
    /* the snapshot being drawn, and the few names the drawing reads from it */
    let SN = null, CLIP = {}, backdrop = 'theme', tint = 0, VEL = null, lastKey = '';
    const velColor = (v) => VEL[Math.max(0, Math.min(127, Math.round(v)))];
    const htmlRuns = (html) => (SN.runs && SN.runs[html]) || [{ t: String(html), k: 'main' }];

    /* layers, cached until what they show changes */
    let LAYER = {};
    function layerCanvas(name, W, H) {
      let L = LAYER[name];
      if (!L || L.canvas.width !== W || L.canvas.height !== H) {
        const c = new OffscreenCanvas(W, H);
        L = LAYER[name] = { canvas: c, ctx: c.getContext('2d'), key: '' };
      }
      return L;
    }

    /* geometry for a frame size and keys position */
    function frameGeometry(W, H) {
      const S = H / 1080;
      const padX = W * 0.03, keysH = Math.round(H * 0.26), nameH = Math.round(56 * S), feltH = Math.round(6 * S);
      const blockH = nameH + 6 * S + feltH + 4 * S + keysH;
      const pos = CLIP.keys === 'top' ? 'top' : CLIP.keys === 'middle' ? 'middle' : 'bottom';
      const blockTop = pos === 'bottom' ? H - blockH : pos === 'top' ? Math.round(24 * S) : Math.round((H - blockH) / 2);
      const nameTop = blockTop, feltTop = nameTop + nameH + 6 * S, keysTop = feltTop + feltH + 4 * S, keysBottom = keysTop + keysH;
      const bigSize = Math.round(132 * S), eyeSize = Math.round(12 * S), subSize = Math.round(15 * S), titlePx = Math.round(CLIP.size * S);
      const baseline = pos === 'top' ? keysBottom + 60 * S + bigSize * 0.92 + eyeSize * 1.6 : nameTop - 22 * S;
      const titleY = pos === 'top' ? H - 48 * S : pos === 'middle' ? keysBottom + 40 * S + titlePx : 44 * S + titlePx;
      const ww = W / whites.length, bw = ww * 0.57, bh = keysH * 0.62;
      return { S, padX, keysH, nameH, feltH, pos, nameTop, feltTop, keysTop, keysBottom, bigSize, eyeSize, subSize, titlePx, baseline, titleY, ww, bw, bh };
    }


    function draw(snap, F) {
      SN = snap; CLIP = SN.CLIP; backdrop = SN.backdrop; tint = SN.tint; VEL = SN.vel;
      const { ctx, W, H } = F;
      const st = SN.st || {};
      const T = SN.T;
      const themeKey = SN.themeKey;
      const G = frameGeometry(W, H);
      const { S, padX, keysH, nameTop, feltTop, keysTop, keysBottom, bigSize, eyeSize, subSize, titlePx, baseline, titleY, ww, bw, bh } = G;
      const flat = !!SN.chroma;          // chroma: no glow anywhere, it would fringe when keyed
      const live = backdrop === 'video' && !!SN.video && SN.videoW > 0;
      const stateKey = [st.chordClass, st.chordHTML, st.numClass, st.numHTML, st.romanText, st.numEyebrow, JSON.stringify(st.trail || []), CLIP.plate, CLIP.plateAlpha, CLIP.trail].join('\u0001');
      const keysKey = JSON.stringify([st.keys || [], st.ring || [], st.rootPc, st.velocity, st.keyLight, st.tags || []]);
      const frameKey = [themeKey, backdrop, tint, SN.tintFill, SN.picKey, SN.pic ? 1 : 0, W, CLIP.keys, CLIP.title, CLIP.font, CLIP.size, CLIP.color, stateKey, keysKey, JSON.stringify(st.cTags || {}), SN.trialMark || ''].join('\u0002');
      if (!live && frameKey === lastKey) return false;   // nothing changed: nothing to draw
      lastKey = frameKey;

      /* ---- background ---- */
      const cover = (c, im, iw, ih) => { const r = Math.max(W / iw, H / ih), w = iw * r, h = ih * r; c.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); };
      const tintOver = (c) => { c.fillStyle = SN.tintFill; c.globalAlpha = tint / 100; c.fillRect(0, 0, W, H); c.globalAlpha = 1; };
      if (live) {
        cover(ctx, SN.video, SN.videoW, SN.videoH); tintOver(ctx);
      } else {
        const B = layerCanvas('bg', W, H);
        const bgKey = [themeKey, backdrop, tint, SN.tintFill, SN.picKey, SN.pic ? SN.picKey : ''].join('|');
        if (B.key !== bgKey) {
          B.key = bgKey;
          const c = B.ctx;
          if (flat) { c.fillStyle = SN.chroma; c.fillRect(0, 0, W, H); }
          else if (backdrop === 'picture' && SN.pic) { cover(c, SN.pic, SN.pic.width, SN.pic.height); tintOver(c); }
          else {
            const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.bg2); g.addColorStop(0.42, T.bg1); g.addColorStop(1, T.void);
            c.fillStyle = g; c.fillRect(0, 0, W, H);
            const rg = c.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, W * 0.55);
            rg.addColorStop(0, rgba(T.a2rgb, 0.16)); rg.addColorStop(1, rgba(T.a2rgb, 0));
            c.fillStyle = rg; c.fillRect(0, 0, W, H);
          }
        }
        ctx.drawImage(B.canvas, 0, 0);
      }

      /* ---- text: eyebrows, readouts, title ---- */
      const X = layerCanvas('text', W, H);
      const textKey = [themeKey, flat, CLIP.keys, CLIP.title, CLIP.font, CLIP.size, CLIP.color, stateKey].join('|');
      if (X.key !== textKey) {
        X.key = textKey;
        const c = X.ctx;
        c.clearRect(0, 0, W, H);
        const eyebrow = (text, x, y, right) => {
          c.font = `500 ${eyeSize}px "JetBrains Mono", monospace`; c.letterSpacing = `${0.2 * eyeSize}px`;
          c.textAlign = right ? 'right' : 'left'; c.textBaseline = 'alphabetic';
          const tw = c.measureText(text.toUpperCase()).width;
          const dotX = right ? x - tw - 14 * S : x;
          c.fillStyle = T.a3; c.shadowColor = T.a3; c.shadowBlur = flat ? 0 : 9 * S;
          c.beginPath(); c.arc(dotX + 3 * S, y - eyeSize * 0.35, 2.6 * S, 0, Math.PI * 2); c.fill();
          c.shadowBlur = 0;
          c.fillStyle = CLIP.plate === 'light' ? '#4D5B75' : T.faint; c.fillText(text.toUpperCase(), right ? x : x + 14 * S, y);
          c.letterSpacing = '0px';
        };
        const bigText = (html, x, y, right, col, size) => {
          const px = size || bigSize;
          const runs = htmlRuns(html);
          const fontOf = (k) => k === 'main' ? `700 ${px}px "Barlow Condensed", Inter, sans-serif`
            : k === 'slash' ? `600 ${px}px "Barlow Condensed", Inter, sans-serif`
            : `700 ${Math.round(px * 0.48)}px "Barlow Condensed", Inter, sans-serif`;
          let total = 0;
          runs.forEach((r) => { c.font = fontOf(r.k); r.w = c.measureText(r.t).width + (r.k === 'supword' ? px * 0.16 : 0); total += r.w; });
          let cx = right ? x - total : x;
          c.textAlign = 'left'; c.textBaseline = 'alphabetic';
          const pick = col || ((k) => T[k]);
          for (const r of runs) {
            c.font = fontOf(r.k);
            const raised = r.k.startsWith('sup');
            c.fillStyle = r.k === 'slash' ? pick('dim') : raised ? pick('acc') : pick('chord');
            c.shadowColor = rgba(T.a3rgb, 0.38); c.shadowBlur = flat || raised || CLIP.plate === 'light' || size ? 0 : 46 * S;
            c.fillText(r.t, cx + (r.k === 'supword' ? px * 0.16 : 0), y - (raised ? px * 0.46 : 0));
            c.shadowBlur = 0;
            cx += r.w;
          }
        };
        const chordEmpty = /empty/.test(st.chordClass || 'big empty'), numEmpty = /empty/.test(st.numClass || 'big empty');
        const trail = (st.trail || []).slice(0, CLIP.trail);
        const up = G.pos !== 'top';                              // the trail climbs away from the keys
        /* trail geometry: each older chord smaller and fainter, stepping away */
        const trailSteps = trail.map((_, i) => { const f = [0.46, 0.36, 0.29, 0.24][i]; return { f, size: Math.round(bigSize * f) }; });
        let trailSpan = 0; trailSteps.forEach((t) => { trailSpan += t.size * 1.25; });
        const trailTop = up ? baseline - bigSize * 1.08 - trailSpan : baseline + subSize * 2.6;
        /* the plates: one behind each readout column, sized to what is in it */
        if (CLIP.plate !== 'off') {
          const dark = CLIP.plate === 'dark';
          const a = Math.max(0, Math.min(100, CLIP.plateAlpha)) / 100;
          c.fillStyle = dark ? `rgba(4,9,18,${a})` : `rgba(255,255,255,${a})`;
          const padP = 24 * S;
          const top = Math.min(baseline - bigSize * 0.92 - eyeSize * 1.4, up ? trailTop : baseline - bigSize * 0.92 - eyeSize * 1.4) - padP;
          const bottom = Math.max(baseline + subSize * 2.1, up ? baseline + subSize * 2.1 : trailTop + trailSpan) + padP;
          const colW = W * 0.34;
          c.beginPath(); c.roundRect(padX - padP, top, colW, bottom - top, 14 * S); c.fill();
          c.beginPath(); c.roundRect(W - padX + padP - colW, top, colW, bottom - top, 14 * S); c.fill();
          if (CLIP.title) {
            c.font = `${SN.titleFont.weight} ${titlePx}px ${SN.titleFont.css}`;
            const tw = c.measureText(CLIP.title).width + padP * 2;
            c.beginPath(); c.roundRect(W / 2 - tw / 2, titleY - titlePx * 0.95 - padP * 0.5, tw, titlePx * 1.25 + padP, 12 * S); c.fill();
          }
        }
        const plateLight = CLIP.plate === 'light';
        const ink = plateLight ? { chord: '#0B1322', acc: T.accRgb, dim: '#3A4A66', faint: '#4D5B75', alt: '#3E2F8A' } : null;
        const col = (k) => (ink && ink[k]) ? (Array.isArray(ink[k]) ? rgba(ink[k], 1) : ink[k]) : T[k];
        eyebrow('Chord', padX, baseline - bigSize * 0.92, false);
        if (!chordEmpty && st.chordHTML) bigText(st.chordHTML, padX, baseline, false, col);
        eyebrow(st.numEyebrow || 'Number', W - padX, baseline - bigSize * 0.92, true);
        if (!numEmpty && st.numHTML) bigText(st.numHTML, W - padX, baseline, true, col);
        if (st.romanText) {
          c.font = `500 ${subSize}px "JetBrains Mono", monospace`; c.letterSpacing = `${0.1 * subSize}px`;
          c.fillStyle = col('alt'); c.textAlign = 'right'; c.fillText(st.romanText, W - padX, baseline + subSize * 1.5); c.letterSpacing = '0px';
        }
        /* the trail itself */
        if (trail.length) {
          let y = up ? baseline - bigSize * 1.08 : trailTop + trailSteps[0].size;
          trail.forEach((t, i) => {
            const { size } = trailSteps[i];
            const alpha = [0.72, 0.52, 0.38, 0.28][i];
            if (up) y -= i === 0 ? 0 : trailSteps[i - 1].size * 0.25 + size;
            c.globalAlpha = alpha;
            bigText(t.c, padX, y, false, col, size);
            if (t.n) bigText(t.n, W - padX, y, true, col, size);
            c.globalAlpha = 1;
            if (!up) y += size * 1.25;
          });
        }
        if (CLIP.title) {
          const TF = SN.titleFont;
          c.font = `${TF.weight} ${titlePx}px ${TF.css}`; c.letterSpacing = `${(CLIP.font === 'barlow' ? 0.01 : 0.02) * titlePx}px`;
          c.textAlign = 'center'; c.textBaseline = 'alphabetic';
          c.fillStyle = SN.titleFill; c.shadowColor = rgba(T.a2rgb, 0.35); c.shadowBlur = flat ? 0 : 18 * S;
          c.fillText(CLIP.title, W / 2, titleY); c.shadowBlur = 0; c.letterSpacing = '0px';
        }
      }
      ctx.drawImage(X.canvas, 0, 0);

      /* ---- felt ---- */
      const fg = ctx.createLinearGradient(0, 0, W, 0); fg.addColorStop(0, T.a1); fg.addColorStop(0.5, T.a2); fg.addColorStop(1, T.a1);
      ctx.fillStyle = fg; ctx.globalAlpha = 0.9; ctx.shadowColor = rgba(T.a2rgb, 0.4); ctx.shadowBlur = flat ? 0 : 16 * S;
      ctx.fillRect(0, feltTop, W, G.feltH); ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      /* ---- keys: the unlit sets from cache, the lit ones fresh ---- */
      const vel = new Map(st.keys || []), ring = new Map(st.ring || []), cTags = st.cTags || {};
      const multi = (st.keys || []).length > 1, solid = st.keyLight === 'solid';
      const shade = (v) => { const mid = velColor(v), hi = velColor(Math.min(127, v + 26)), lo = velColor(Math.max(14, v - 52)); return { mid, hi, lo }; };
      const keyColor = (n, on, black) => {
        const v = st.velocity === false ? 43 : (on ? vel.get(n) : ring.get(n));
        const c = shade(v);
        if (on) return solid ? [c.mid, c.mid, c.mid] : [c.lo, c.mid, c.hi];
        const base = black ? [T.b1, T.b2, T.b3] : [T.w1, T.w2, T.w3];
        const p = black ? [0.62, 0.58, 0.52] : [0.5, 0.46, 0.42];
        return solid ? [mixRgb(c.mid, p[1], base[1]), mixRgb(c.mid, p[1], base[1]), mixRgb(c.mid, p[1], base[1])]
          : [mixRgb(c.lo, p[0], base[0]), mixRgb(c.mid, p[1], base[1]), mixRgb(c.hi, p[2], base[2])];
      };
      const whiteX = new Map(), blackX = new Map();
      { let wi = 0; for (let n = LOW; n <= HIGH; n++) { if (isBlack(n)) blackX.set(n, wi * ww - ww * 0.285); else { whiteX.set(n, wi * ww); wi++; } } }

      const drawWhite = (c, n, x, on, rg) => {
        let stops;
        if (on || rg) stops = keyColor(n, on, false).map((q) => rgba(q, 1));
        else stops = [rgba(T.w1, 1), rgba(T.w2, 1), rgba(T.w3, 1)];
        const g = c.createLinearGradient(0, keysTop, 0, keysBottom); g.addColorStop(0, stops[0]); g.addColorStop(on ? 0.53 : 0.84, stops[1]); g.addColorStop(1, stops[2]);
        c.fillStyle = g;
        if (on) { const k = shade(st.velocity === false ? 43 : vel.get(n)); c.shadowColor = rgba(k.mid, 0.6); c.shadowBlur = flat ? 0 : 26 * S; }
        c.fillRect(x, keysTop, ww, keysH); c.shadowBlur = 0;
        c.strokeStyle = T.kline; c.lineWidth = Math.max(1, S); c.strokeRect(x + 0.5, keysTop + 0.5, ww - 1, keysH - 1);
        if (rg) { const k = shade(ring.get(n)); c.fillStyle = rgba(k.mid, 0.9); c.fillRect(x, keysTop, ww, 5 * S); }
        if (on && multi && n % 12 === st.rootPc) {
          c.fillStyle = '#04121F'; c.beginPath(); c.arc(x + ww / 2, keysTop + 12 * S, 4 * S, 0, Math.PI * 2); c.fill();
          c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2 * S; c.stroke();
        }
        if (!on && !rg && cTags[n]) {
          c.font = `500 ${Math.round(13 * S)}px "JetBrains Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
          c.fillStyle = T.klbl; c.globalAlpha = 0.5; c.fillText(cTags[n], x + ww / 2, keysBottom - 10 * S); c.globalAlpha = 1;
        }
      };
      const drawBlack = (c, n, x, on, rg) => {
        let stops;
        if (on || rg) stops = keyColor(n, on, true).map((q) => rgba(q, 1));
        else stops = [rgba(T.b1, 1), rgba(T.b2, 1), rgba(T.b3, 1)];
        const g = c.createLinearGradient(0, keysTop, 0, keysTop + bh); g.addColorStop(0, stops[0]); g.addColorStop(on ? 0.53 : 0.6, stops[1]); g.addColorStop(1, stops[2]);
        c.fillStyle = g;
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = flat ? 0 : 6 * S; c.shadowOffsetY = 3 * S;
        if (on) { const k = shade(st.velocity === false ? 43 : vel.get(n)); c.shadowColor = rgba(k.mid, 0.6); c.shadowBlur = flat ? 0 : 26 * S; c.shadowOffsetY = 0; }
        c.fillRect(x, keysTop, bw, bh); c.shadowBlur = 0; c.shadowOffsetY = 0;
        c.strokeStyle = rgba(T.b3, 1); c.lineWidth = Math.max(1, S); c.strokeRect(x + 0.5, keysTop + 0.5, bw - 1, bh - 1);
        if (rg) { const k = shade(ring.get(n)); c.fillStyle = rgba(k.mid, 0.9); c.fillRect(x, keysTop, bw, 5 * S); }
        if (on && multi && n % 12 === st.rootPc) {
          c.fillStyle = '#04121F'; c.beginPath(); c.arc(x + bw / 2, keysTop + 12 * S, 4 * S, 0, Math.PI * 2); c.fill();
          c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2 * S; c.stroke();
        }
      };
      const baseKey = [themeKey, flat, CLIP.keys, JSON.stringify(cTags)].join('|');
      const WL = layerCanvas('whites', W, H), BL = layerCanvas('blacks', W, H);
      if (WL.key !== baseKey) {
        WL.key = baseKey; WL.ctx.clearRect(0, 0, W, H);
        whiteX.forEach((x, n) => drawWhite(WL.ctx, n, x, false, false));
      }
      if (BL.key !== baseKey) {
        BL.key = baseKey; BL.ctx.clearRect(0, 0, W, H);
        blackX.forEach((x, n) => drawBlack(BL.ctx, n, x, false, false));
      }
      ctx.drawImage(WL.canvas, 0, 0);
      whiteX.forEach((x, n) => { const on = vel.has(n), rg = !on && ring.has(n); if (on || rg) drawWhite(ctx, n, x, on, rg); });
      ctx.drawImage(BL.canvas, 0, 0);
      blackX.forEach((x, n) => { const on = vel.has(n), rg = !on && ring.has(n); if (on || rg) drawBlack(ctx, n, x, on, rg); });

      /* ---- name tags ---- */
      ctx.font = `600 ${Math.round(15 * S)}px "JetBrains Mono", monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      (st.tags || []).forEach((tag, i) => {
        const row = i % 2, cx = centerPct.get(tag.n) / 100 * W;
        const tw = ctx.measureText(tag.t).width + 16 * S, th = 24 * S, ty = nameTop + (row ? 26 * S : 0);
        const g = ctx.createLinearGradient(0, ty, 0, ty + th);
        if (tag.b) { g.addColorStop(0, '#fff'); g.addColorStop(1, T.a2); } else { g.addColorStop(0, T.a4); g.addColorStop(1, T.a3); }
        ctx.shadowColor = rgba(T.a3rgb, 0.5); ctx.shadowBlur = flat ? 0 : 16 * S;
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(cx - tw / 2, ty, tw, th, 6 * S); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#04121D'; ctx.fillText(tag.t, cx, ty + th / 2 + 1);
        const sg = ctx.createLinearGradient(0, ty + th, 0, feltTop); sg.addColorStop(0, T.a3); sg.addColorStop(1, rgba(T.a3rgb, 0));
        ctx.strokeStyle = sg; ctx.lineWidth = Math.max(1, S); ctx.beginPath(); ctx.moveTo(cx, ty + th); ctx.lineTo(cx, feltTop); ctx.stroke();
      });
      ctx.textBaseline = 'alphabetic';

      /* ---- Free Trial mark: every frame of a trial clip carries the name ---- */
      if (SN.trialMark) {
        const px = Math.round(17 * S), h = px + 16 * S, padH = 14 * S;
        ctx.font = `600 ${px}px Inter, "Segoe UI", sans-serif`;
        const tw = ctx.measureText(SN.trialMark).width;
        const x = W - 28 * S - tw - 2 * padH, y = G.pos === 'top' ? H - 28 * S - h : 24 * S;
        ctx.fillStyle = 'rgba(4,10,24,0.58)';
        ctx.beginPath(); ctx.roundRect(x, y, tw + 2 * padH, h, h / 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(SN.trialMark, x + padH, y + h / 2 + 1);
        ctx.textBaseline = 'alphabetic';
      }
      return true;
    }

    return {
      draw,
      /* the next frame is drawn in full, whatever it shows */
      reset() { lastKey = ''; Object.values(LAYER).forEach((L) => { L.key = ''; }); },
      /* give the layer memory back while nothing is being drawn */
      free() { LAYER = {}; lastKey = ''; }
    };
  }

  scope.ChordlightClipDraw = make;
})(typeof self !== 'undefined' ? self : this);
