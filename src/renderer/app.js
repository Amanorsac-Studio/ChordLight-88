'use strict';
/* Chordlight 88 — renderer
 * One file serves four views: the full window, and three pop-outs
 * (chord, number, keys). Only the full view touches MIDI; the pop-outs
 * render the state published to them.
 */
(function () {
  const BRIDGE = window.chordlight || null;
  const VIEW = BRIDGE ? BRIDGE.view
    : (new URLSearchParams(location.search).get('view') || 'full');
  const TEXT_VIEW = VIEW === 'chord' || VIEW === 'number';
  document.body.dataset.view = VIEW;
  /* Free Trial edition: the main process says whether this is the trial (it
     decides, and it re-checks every save). The browser test build can play
     the trial with ?trial in its URL. */
  const TRIAL = { on: false, max: 60, st: null, mark: 'Chordlight 88 · Free Trial' };
  if (!BRIDGE && new URLSearchParams(location.search).has('trial')) TRIAL.on = true;

  const SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SOLFA = ['Do', 'Di', 'Re', 'Mo', 'Mi', 'Fa', 'Fi', 'So', 'Si', 'La', 'Ta', 'Ti'];
  const NUM = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
  const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);
  const LOW = 21, HIGH = 108;

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const bed = $('bed'), nameRow = $('namerow'), chordEl = $('chord'), metaEl = $('meta'),
        numEl = $('num'), romanEl = $('roman'), numEyebrow = $('numeyebrow'),
        keysel = $('keysel'), spellsel = $('spell'), chsel = $('ch'), vbar = $('vbar'),
        sustBadge = $('sustbadge'), portSel = $('port'), portBadge = $('portbadge'),
        tbPort = $('tbport'), ksize = $('ksize'), pedalSel = $('pedal'), lightSel = $('keylight'), outSel = $('out'), velSel = $('velmode');

  const held = new Map(), sustained = new Set(), ringing = new Set(),
        keyEls = new Map(), centerPct = new Map();
  let sustain = false, labelMode = 'notes', pedalMode = 'chord', keyLight = 'solid', velocity = true;

  /* Two notes struck further apart than this are a chord change, not one
     rolled chord. Under the pedal, everything from before the change stops
     counting towards the name and is drawn as ringing instead. */
  const GATHER = 200;
  let lastOnset = -1e9;

  /* Notes land in the state the moment they arrive; the screen catches up
     at most once every 12 ms. A fast passage is a hundred changes to what
     is held but only as many repaints as the display can show — and the
     first note after a pause still paints at once. */
  const PAINT_GAP = 12;
  let paintAt = -1e9, paintTimer = 0;
  function paintSoon() {
    if (paintTimer) return;
    const wait = PAINT_GAP - (performance.now() - paintAt);
    if (wait <= 0 || document.hidden) paint();
    else paintTimer = setTimeout(() => { paintTimer = 0; paint(); }, wait);
  }

  /* ================= theme ================= */
  const ACCENTS = {
    blue:   { label: 'Blue',   h: 218, stops: ['#12306B', '#2E7EFF', '#4ECDE6', '#D8F2FF'] },
    violet: { label: 'Violet', h: 264, stops: ['#2B1C7A', '#7B5CF6', '#B98CFF', '#EFE2FF'] },
    teal:   { label: 'Teal',   h: 182, stops: ['#0A4247', '#12A5A5', '#4EE6CE', '#D6FFF5'] },
    amber:  { label: 'Amber',  h: 33,  stops: ['#5E2A08', '#E07B1A', '#FFB53D', '#FFEAC0'] },
    rose:   { label: 'Rose',   h: 342, stops: ['#5E1033', '#E0407E', '#FF8CAC', '#FFE1EA'] },
    green:  { label: 'Green',  h: 148, stops: ['#11431F', '#2FA84F', '#79DE88', '#DCFFE1'] }
  };
  const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
  let accent = 'blue', mode = 'dark';

  function paintTheme() {
    const A = ACCENTS[accent] || ACCENTS.blue, h = A.h, alt = (h + 52) % 360;
    const S = root.style, dark = mode === 'dark';
    S.setProperty('--a1', A.stops[0]); S.setProperty('--a2', A.stops[1]);
    S.setProperty('--a3', A.stops[2]); S.setProperty('--a4', A.stops[3]);
    root.style.colorScheme = dark ? 'dark' : 'light';
    if (dark) {
      S.setProperty('--void', hsl(h, 44, 4));    S.setProperty('--bg-1', hsl(h, 42, 6));
      S.setProperty('--bg-2', hsl(h, 40, 9));    S.setProperty('--panel', hsl(h, 36, 12));
      S.setProperty('--panel-hi', hsl(h, 34, 17)); S.setProperty('--well', hsl(h, 44, 5));
      S.setProperty('--edge', hsl(h, 30, 22));   S.setProperty('--edge-hi', hsl(h, 28, 31));
      S.setProperty('--ctl-1', hsl(h, 34, 20));  S.setProperty('--ctl-2', hsl(h, 36, 12));
      S.setProperty('--text', hsl(h, 32, 90));   S.setProperty('--text-dim', hsl(h, 18, 62));
      S.setProperty('--text-faint', hsl(h, 16, 44));
      S.setProperty('--alt', hsl(alt, 62, 72));  S.setProperty('--acc-txt', A.stops[2]);
      S.setProperty('--chord', hsl(h, 70, 95));
      S.setProperty('--sheen', `hsl(${h} 60% 80% / .10)`);
      S.setProperty('--shadow', `hsl(${h} 60% 3% / .60)`);
      S.setProperty('--inset', `hsl(${h} 70% 2% / .80)`);
      S.setProperty('--key-w1', '#F6F9FD'); S.setProperty('--key-w2', '#E9F0F9'); S.setProperty('--key-w3', '#CAD7E9');
      S.setProperty('--key-b1', hsl(h, 22, 22)); S.setProperty('--key-b2', hsl(h, 30, 10)); S.setProperty('--key-b3', hsl(h, 40, 5));
      S.setProperty('--key-lbl', hsl(h, 14, 55)); S.setProperty('--key-blbl', hsl(h, 16, 48));
      S.setProperty('--key-line', hsl(h, 50, 4));
    } else {
      S.setProperty('--void', hsl(h, 28, 90));   S.setProperty('--bg-1', hsl(h, 32, 95));
      S.setProperty('--bg-2', hsl(h, 38, 98));   S.setProperty('--panel', hsl(h, 30, 97));
      S.setProperty('--panel-hi', hsl(h, 40, 100)); S.setProperty('--well', hsl(h, 24, 88));
      S.setProperty('--edge', hsl(h, 24, 80));   S.setProperty('--edge-hi', hsl(h, 22, 68));
      S.setProperty('--ctl-1', hsl(h, 40, 100)); S.setProperty('--ctl-2', hsl(h, 30, 94));
      S.setProperty('--text', hsl(h, 38, 15));   S.setProperty('--text-dim', hsl(h, 20, 38));
      S.setProperty('--text-faint', hsl(h, 16, 52));
      S.setProperty('--alt', hsl(alt, 58, 38));  S.setProperty('--acc-txt', A.stops[0]);
      S.setProperty('--chord', hsl(h, 66, 26));
      S.setProperty('--sheen', 'hsl(0 0% 100% / .85)');
      S.setProperty('--shadow', `hsl(${h} 34% 40% / .16)`);
      S.setProperty('--inset', `hsl(${h} 30% 45% / .20)`);
      S.setProperty('--key-w1', '#FFFFFF'); S.setProperty('--key-w2', '#F7FAFD'); S.setProperty('--key-w3', '#DDE5EF');
      S.setProperty('--key-b1', hsl(h, 16, 28)); S.setProperty('--key-b2', hsl(h, 22, 14)); S.setProperty('--key-b3', hsl(h, 28, 8));
      S.setProperty('--key-lbl', hsl(h, 14, 52)); S.setProperty('--key-blbl', hsl(h, 14, 62));
      S.setProperty('--key-line', hsl(h, 20, 62));
    }
  }

  const dockButtons = () => {
    document.querySelectorAll('[data-pop]').forEach((b) => {
      b.textContent = '⇲';
      b.title = 'Dock it back';
      b.addEventListener('click', () => BRIDGE.windowControl('close'));
    });
  };

  /* ================= backdrop (all views) ================= */
  const TINTS = {
    black:  { label: 'Black',  c: '#000000' },
    navy:   { label: 'Navy',   c: '#0A1A3A' },
    plum:   { label: 'Plum',   c: '#2A0F3A' },
    forest: { label: 'Forest', c: '#0E2A1C' },
    white:  { label: 'White',  c: '#FFFFFF' }
  };
  /* `picture` is what is on file: { kind: 'picture', url: data URL } or
     { kind: 'video', url: file/blob URL }. `backdrop` is what is chosen. */
  let backdrop = 'theme', tint = 40, tintColor = 'black', picture = null;
  const bgVideo = $('bgvideo');
  bgVideo.loop = true; bgVideo.muted = true;
  bgVideo.addEventListener('ended', () => { bgVideo.currentTime = 0; bgVideo.play().catch(() => {}); });
  bgVideo.addEventListener('pause', () => { if (document.body.dataset.backdrop === 'video') bgVideo.play().catch(() => {}); });
  const CHROMA = { green: '#00B140', blue: '#0047BB' };
  function paintBackdrop() {
    const S = root.style;
    S.setProperty('--tint', (TINTS[tintColor] || TINTS.black).c);
    S.setProperty('--tint-a', String(tint / 100));
    const havePic = picture && picture.kind === 'picture', haveVid = picture && picture.kind === 'video';
    if (backdrop === 'picture' && havePic) S.setProperty('--pic', `url("${picture.url}")`);
    else S.removeProperty('--pic');
    const mode = (backdrop === 'picture' && havePic) ? 'picture'
      : (backdrop === 'video' && haveVid) ? 'video'
      : CHROMA[backdrop] ? backdrop : 'theme';
    document.body.dataset.backdrop = mode;
    if (mode === 'video') {
      if (bgVideo.dataset.src !== picture.url) { bgVideo.dataset.src = picture.url; bgVideo.src = picture.url; bgVideo.load(); }
      bgVideo.play().catch(() => {});
    } else if (bgVideo.dataset.src) {
      /* let the old video go completely — a paused decoder would still hold
         its last frame, and show it again if the video came back */
      bgVideo.pause(); bgVideo.removeAttribute('src'); bgVideo.load(); delete bgVideo.dataset.src;
    }
  }
  /* pop-outs: the picture itself is fetched once, not published with every note */
  let pictureAsked = false;
  function applyBackdropState(s) {
    backdrop = s.backdrop || 'theme';
    if (typeof s.tint === 'number') tint = s.tint;
    if (s.tintColor) tintColor = s.tintColor;
    if ((backdrop === 'picture' || backdrop === 'video') && !picture && BRIDGE && (!pictureAsked || s.pictureChanged)) {
      pictureAsked = true;
      BRIDGE.getBackdrop().then((url) => { picture = url; paintBackdrop(); }).catch(() => {});
    }
    if (s.pictureChanged && BRIDGE) {
      BRIDGE.getBackdrop().then((url) => { picture = url; paintBackdrop(); }).catch(() => {});
    }
    paintBackdrop();
  }

  /* ================= text pop-outs (chord / number) ================= */
  if (TEXT_VIEW) {
    paintTheme();
    if (BRIDGE) {
      BRIDGE.onState((s) => {
        if (s.accent && ACCENTS[s.accent]) accent = s.accent;
        if (s.mode) mode = s.mode;
        applyBackdropState(s);
        paintTheme();
        if (VIEW === 'chord') {
          chordEl.className = s.chordClass;
          chordEl.innerHTML = s.chordHTML;
          metaEl.innerHTML = s.metaHTML;
        } else {
          numEl.className = s.numClass;
          numEl.innerHTML = s.numHTML;
          romanEl.textContent = s.romanText;
          numEyebrow.textContent = s.numEyebrow;
        }
      });
      dockButtons();
    }
    return;
  }

  /* ================= the 88 (full window and keys pop-out) ================= */
  const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
  const whites = [];
  for (let n = LOW; n <= HIGH; n++) if (!isBlack(n)) whites.push(n);
  const WW = 100 / whites.length;
  let wi = 0;
  for (let n = LOW; n <= HIGH; n++) {
    const el = document.createElement('div');
    el.dataset.n = n;
    el.innerHTML = '<i class="dot"></i><span class="lbl"></span>';
    if (isBlack(n)) {
      const left = wi * WW - WW * 0.285, w = WW * 0.57;
      el.className = 'bk'; el.style.left = left + '%'; el.style.width = w + '%';
      centerPct.set(n, left + w / 2);
    } else {
      el.className = 'wk'; el.style.left = (wi * WW) + '%'; el.style.width = WW + '%';
      centerPct.set(n, wi * WW + WW / 2); wi++;
    }
    bed.appendChild(el); keyEls.set(n, el);
  }

  /* velocity colour — worked out once per accent and velocity */
  const hex2rgb = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  const velCache = new Map();
  let velCacheAccent = '';
  function velColor(v) {
    if (velCacheAccent !== accent) { velCache.clear(); velCacheAccent = accent; }
    let out = velCache.get(v);
    if (out) return out;
    const S = (ACCENTS[accent] || ACCENTS.blue).stops.map(hex2rgb);
    const t = Math.min(1, Math.max(0, v / 127));
    const seg = Math.min(2, Math.floor(t * 3)), f = t * 3 - seg;
    out = S[seg].map((c, i) => Math.round(c + (S[seg + 1][i] - c) * f));
    velCache.set(v, out);
    return out;
  }
  /* write to the page only when the value is new */
  const setHTML = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
  const setClass = (el, cls) => { if (el.className !== cls) el.className = cls; };
  const keySig = new Map();
  let tagSig = null;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  /* Paints the keybed from a published state, so the keys pop-out mirrors
     the main window exactly. */
  function paintKeys(state) {
    bed.classList.toggle('solid', state.keyLight === 'solid');
    const vel = new Map(state.keys || []);
    const ring = new Map(state.ring || []);
    const rootPc = state.rootPc;
    const multi = (state.keys || []).length > 1;
    const cTags = state.cTags || {};

    keyEls.forEach((el, n) => {
      const on = vel.has(n);
      const rg = !on && ring.has(n);
      /* a key is only touched when how it looks has changed */
      const sig = (on ? 'o' : rg ? 'r' : '-') + (on && n % 12 === rootPc && multi ? 'R' : '')
        + ((on || rg) ? '|' + (state.velocity === false ? 43 : (on ? vel.get(n) : ring.get(n))) + '|' + accent : '|' + (cTags[n] || ''));
      if (keySig.get(n) === sig) return;
      keySig.set(n, sig);
      el.classList.toggle('on', on);
      el.classList.toggle('ring', rg);
      el.classList.toggle('root', on && n % 12 === rootPc && multi);
      const lbl = el.lastChild;
      if (on || rg) {
        /* Fixed: every lit key takes the same shade, whatever the touch — the
           deep, saturated accent (the ramp's second stop), not the pale top. */
        const v = state.velocity === false ? 43 : (on ? vel.get(n) : ring.get(n));
        const hi = velColor(Math.min(127, v + 26)), mid = velColor(v), lo = velColor(Math.max(14, v - 52));
        el.style.setProperty('--vhi', rgb(hi));
        el.style.setProperty('--vmid', rgb(mid));
        el.style.setProperty('--vlo', rgb(lo));
        el.style.setProperty('--vglow', `rgba(${mid[0]},${mid[1]},${mid[2]},.6)`);
        el.style.setProperty('--vglow2', `rgba(${hi[0]},${hi[1]},${hi[2]},.26)`);
        lbl.textContent = '';
      } else {
        lbl.textContent = cTags[n] || '';
      }
    });

    const tSig = (state.tags || []).map((t) => t.n + ':' + t.t + ':' + (t.b ? 1 : 0)).join(',');
    if (tSig === tagSig) return;
    tagSig = tSig;
    nameRow.textContent = '';
    (state.tags || []).forEach((tag, i) => {
      const t = document.createElement('span'), row = i % 2;
      t.className = 'nametag row' + row + (tag.b ? ' bass' : '');
      t.style.left = centerPct.get(tag.n) + '%';
      t.style.setProperty('--stem', (row ? 12 : 35) + 'px');
      t.textContent = tag.t;
      nameRow.appendChild(t);
    });
  }

  /* ================= the clip's look (all views) =================
     What the drawn frame needs beyond the readout state. The main window
     owns it and publishes it; the preview window mirrors it. */
  const CLIP = { keys: 'bottom', title: '', font: 'inter', size: 34, color: 'text', quality: 'good',
                 plate: 'off', plateAlpha: 55, trail: 0 };
  const TITLE_FONTS = {
    inter:  { css: 'Inter, "Segoe UI", sans-serif', weight: 600 },
    barlow: { css: '"Barlow Condensed", Inter, sans-serif', weight: 700 },
    mono:   { css: '"JetBrains Mono", ui-monospace, monospace', weight: 600 },
    serif:  { css: 'Georgia, "Times New Roman", serif', weight: 600 }
  };
  /* colours resolved at draw time from the theme, so a title follows the accent */
  const TITLE_COLORS = {
    text:   { label: 'Text',   pick: (T) => T.chord },
    accent: { label: 'Accent', pick: (T) => T.acc },
    alt:    { label: 'Alt',    pick: (T) => T.alt },
    white:  { label: 'White',  pick: () => '#FFFFFF' },
    gold:   { label: 'Gold',   pick: () => '#FFB53D' }
  };

  let lastPublished = null;
  const TRAIL = { current: '', currentNum: '', pending: '', pendingNum: '', timer: 0, list: [] };

  /* ---------- the picture ----------
     The clip is drawn, not screen-grabbed. Every frame, the app paints its
     own Stage layout — readouts on top, keys edge to edge below, the theme
     or your picture behind — into an offscreen canvas from the same state
     the windows paint from. So the clip is always the whole Chordlight, at
     1080p (4K on a 4K screen at Best), whatever the windows are doing:
     detached keys, a floating chord card, another app on top — none of it
     matters, and the OS window capturer that refuses frameless windows on
     some drivers is never asked. */
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  /* any CSS colour (the theme writes hsl()) to [r,g,b], via a scratch canvas */
  const scratch = document.createElement('canvas').getContext('2d');
  const rgbCache = new Map();
  const hexRgb = (css) => {
    css = String(css).trim();
    if (rgbCache.has(css)) return rgbCache.get(css);
    scratch.fillStyle = '#000'; scratch.fillStyle = css;
    const v = scratch.fillStyle;                                   // normalised: #rrggbb or rgba(...)
    const out = v.startsWith('#') ? hex2rgb(v) : (v.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    rgbCache.set(css, out);
    return out;
  };
  const mixRgb = (a, pa, b) => a.map((v, i) => Math.round(v * pa + b[i] * (1 - pa)));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /* the chord / number HTML is walked, not re-derived: plain text at the
     big size, .sup raised and small in the accent, .slash dim */
  const htmlRuns = (html) => {
    const box = document.createElement('div'); box.innerHTML = html;
    const runs = [];
    box.childNodes.forEach((n) => {
      if (n.nodeType === 3) runs.push({ t: n.textContent, k: 'main' });
      else runs.push({ t: n.textContent, k: n.classList.contains('sup') ? (n.classList.contains('word') ? 'supword' : 'sup') : n.classList.contains('slash') ? 'slash' : 'main' });
    });
    return runs;
  };

  const FRAME = { canvas: null, ctx: null, W: 0, H: 0, pic: null, raf: 0, last: 0, fps: 30, rec: false, key: '', track: null, active: false };
  var PIC = { url: '', serial: 0 };
  function frameSize() {
    const dpr = window.devicePixelRatio || 1;
    const big = (screen.width * dpr) >= 3000 && CLIP.quality === 'best';
    return big ? [3840, 2160] : [1920, 1080];
  }
  /* The frame is five layers, each cached until what it shows changes —
     see clip-draw.js, which draws it. */
  let themeKey = '', themeTokens = null;
  function tokens() {
    const k = accent + '|' + mode + '|' + document.body.dataset.backdrop;
    if (k === themeKey && themeTokens) return themeTokens;
    rgbCache.clear();
    themeKey = k;
    themeTokens = {
      void: cssVar('--void'), bg1: cssVar('--bg-1'), bg2: cssVar('--bg-2'), a2: cssVar('--a2'), a3: cssVar('--a3'), a4: cssVar('--a4'), alt: cssVar('--alt'),
      chord: cssVar('--chord'), faint: cssVar('--text-faint'), dim: cssVar('--text-dim'), acc: cssVar('--acc-txt'),
      w1: hexRgb(cssVar('--key-w1')), w2: hexRgb(cssVar('--key-w2')), w3: hexRgb(cssVar('--key-w3')),
      b1: hexRgb(cssVar('--key-b1')), b2: hexRgb(cssVar('--key-b2')), b3: hexRgb(cssVar('--key-b3')),
      klbl: cssVar('--key-lbl'), kblbl: cssVar('--key-blbl'), kline: cssVar('--key-line'), a1: cssVar('--a1'),
      a2rgb: hexRgb(cssVar('--a2')), a3rgb: hexRgb(cssVar('--a3')), accRgb: hexRgb(cssVar('--acc-txt'))
    };
    return themeTokens;
  }
  /* The clip is drawn by clip-draw.js — on its own thread when it can be
     (clip-worker.js), here in the window when not. What it needs from the
     window is a snapshot: the resolved colours, the chord text already split
     into its runs, the velocity ramp. Building one is cheap. */
  const CLIPDRAW = (typeof ChordlightClipDraw === 'function') ? ChordlightClipDraw() : null;
  const runsCache = new Map();
  const runsOf = (html) => {
    let r = runsCache.get(html);
    if (!r) { if (runsCache.size > 400) runsCache.clear(); r = htmlRuns(html); runsCache.set(html, r); }
    return r;
  };
  let velTable = null, velTableAccent = '';
  function velTab() {
    if (!velTable || velTableAccent !== accent) { velTableAccent = accent; velTable = []; for (let v = 0; v < 128; v++) velTable.push(velColor(v)); }
    return velTable;
  }
  /* a short name for the picture on file, so a snapshot never carries the
     picture itself */
  function picKeyNow() {
    if (!picture) return '';
    if (picture.url !== PIC.url) { PIC.url = picture.url; PIC.serial++; }
    return picture.kind + ':' + PIC.serial;
  }
  function clipSnap() {
    const st = lastPublished || {};
    const T = tokens();
    const runs = {};
    const add = (h) => { if (h && !runs[h]) runs[h] = runsOf(h); };
    add(st.chordHTML); add(st.numHTML); (st.trail || []).forEach((t) => { add(t.c); add(t.n); });
    const TF = TITLE_FONTS[CLIP.font] || TITLE_FONTS.inter, TC = TITLE_COLORS[CLIP.color] || TITLE_COLORS.text;
    return {
      themeKey, T, vel: velTab(), runs,
      chroma: CHROMA[backdrop] || null, backdrop, tint, tintFill: (TINTS[tintColor] || TINTS.black).c,
      picKey: picKeyNow(),
      CLIP: Object.assign({}, CLIP), titleFont: { weight: TF.weight, css: TF.css }, titleFill: TC.pick(T),
      trialMark: TRIAL.on ? TRIAL.mark : '',
      st: {
        chordClass: st.chordClass, chordHTML: st.chordHTML, numClass: st.numClass, numHTML: st.numHTML,
        romanText: st.romanText, numEyebrow: st.numEyebrow, trail: st.trail, keys: st.keys, ring: st.ring,
        rootPc: st.rootPc, velocity: st.velocity, keyLight: st.keyLight, tags: st.tags, cTags: st.cTags
      }
    };
  }
  /* the window drawing the clip itself — only when no worker could start */
  function drawFrame() {
    if (!CLIPDRAW || !FRAME.ctx) return false;
    const S = clipSnap();
    S.pic = (backdrop === 'picture' && FRAME.pic) ? FRAME.pic : null;
    const live = backdrop === 'video' && bgVideo.readyState >= 2 && bgVideo.videoWidth;
    S.video = live ? bgVideo : null; S.videoW = live ? bgVideo.videoWidth : 0; S.videoH = live ? bgVideo.videoHeight : 0;
    return CLIPDRAW.draw(S, FRAME);
  }
  /* ================= keys pop-out ================= */
  if (VIEW === 'keys') {
    paintTheme();
    if (BRIDGE) {
      BRIDGE.onState((s) => {
        if (s.accent && ACCENTS[s.accent]) accent = s.accent;
        if (s.mode) mode = s.mode;
        if (s.keySize) bed.style.setProperty('--kh', s.keySize + 'px');
        applyBackdropState(s);
        paintTheme();
        paintKeys(s);
      });
      dockButtons();
    }
    return;
  }

  /* ================= naming ================= */
  function useFlats() {
    const m = spellsel.value;
    if (m === 'sharp') return false;
    if (m === 'flat') return true;
    return FLAT_KEYS.has(keysel.value);
  }
  /* Auto spells by the key, and in a sharp key (or C) a chromatic note is
     named the way a player reads it: the ♭2, ♭3, ♭6 and ♭7 are flats — D♭9
     is the tritone sub in C, not C♯9 — while the ♯4 stays sharp. */
  const pcName = (pc) => {
    pc = ((pc % 12) + 12) % 12;
    if (useFlats()) return FL[pc];
    if (spellsel.value === 'auto' && [1, 3, 8, 10].includes(degree(pc))) return FL[pc];
    return SH[pc];
  };
  const noteName = (n) => pcName(n % 12) + (Math.floor(n / 12) - 1);
  function keyPc() {
    const k = keysel.value;
    let i = SH.indexOf(k); if (i < 0) i = FL.indexOf(k);
    return i < 0 ? 0 : i;
  }
  const degree = (pc) => ((pc - keyPc()) % 12 + 12) % 12;
  const solfa = (n) => SOLFA[degree(n)];
  const tagText = (n) => (labelMode === 'solfa' ? solfa(n) : noteName(n));

  /* ================= chord templates ================= */
  const T = [
    [[0, 4, 7], ''], [[0, 3, 7], 'm'], [[0, 3, 6], 'dim'], [[0, 4, 8], 'aug'],
    [[0, 5, 7], 'sus4'], [[0, 2, 7], 'sus2'], [[0, 7], '5'],
    [[0, 4, 7, 9], '6'], [[0, 3, 7, 9], 'm6'],
    [[0, 4, 7, 11], 'maj7'], [[0, 4, 11], 'maj7'],
    [[0, 4, 7, 10], '7'], [[0, 4, 10], '7'],
    [[0, 3, 7, 10], 'm7'], [[0, 3, 10], 'm7'],
    [[0, 3, 7, 11], 'mMaj7'], [[0, 3, 6, 10], 'm7♭5'], [[0, 3, 6, 9], 'dim7'],
    [[0, 5, 7, 10], '7sus4'], [[0, 2, 7, 10], '7sus2'],
    [[0, 2, 4, 7], 'add9'], [[0, 2, 3, 7], 'm(add9)'],
    [[0, 2, 4, 7, 10], '9'], [[0, 2, 4, 10], '9'],
    [[0, 2, 4, 7, 11], 'maj9'], [[0, 2, 4, 11], 'maj9'],
    [[0, 2, 3, 7, 10], 'm9'], [[0, 2, 3, 10], 'm9'],
    [[0, 2, 4, 7, 9], '6/9'], [[0, 2, 3, 7, 9], 'm6/9'],
    [[0, 2, 5, 7, 10], '11'], [[0, 2, 3, 5, 7, 10], 'm11'], [[0, 3, 5, 7, 10], 'm11'],
    [[0, 2, 4, 7, 9, 10], '13'], [[0, 4, 7, 9, 10], '13'], [[0, 2, 4, 9, 10], '13'],
    [[0, 2, 4, 7, 9, 11], 'maj13'],
    [[0, 1, 4, 7, 10], '7♭9'], [[0, 1, 4, 10], '7♭9'],
    [[0, 3, 4, 7, 10], '7♯9'], [[0, 3, 4, 10], '7♯9'],
    [[0, 4, 6, 7, 10], '7♯11'], [[0, 4, 6, 10], '7♭5'],
    [[0, 4, 8, 10], '7♯5'], [[0, 2, 4, 8, 10], '9♯5'],
    [[0, 3, 4, 8, 10], '7♯9♭13'], [[0, 1, 4, 8, 10], '7♭9♭13'], [[0, 1, 3, 4, 8, 10], '7alt'],
    [[0, 5, 7, 11], 'maj7sus4'], [[0, 2, 5, 7], 'sus4(add9)']
  ];
  const TMAP = new Map();
  T.forEach(([iv, name], i) => {
    const k = iv.slice().sort((a, b) => a - b).join(',');
    if (!TMAP.has(k)) TMAP.set(k, { name, rank: i });
  });

  /* the templates as numbers, parsed once */
  const TLIST = [...TMAP].map(([k, v]) => [k.split(',').map(Number), v]);
  /* the same shape always gets the same name: remember it */
  const detectMemo = new Map();
  function detect(notes) {
    if (!notes.length) return null;
    const sorted = notes.slice().sort((a, b) => a - b);
    const bassPc = sorted[0] % 12;
    const pcs = [...new Set(sorted.map((n) => n % 12))];
    const memoKey = bassPc + '|' + pcs.join(',');
    if (detectMemo.has(memoKey)) return detectMemo.get(memoKey);
    const named = detectShape(bassPc, pcs);
    if (detectMemo.size > 4000) detectMemo.clear();
    detectMemo.set(memoKey, named);
    return named;
  }
  function detectShape(bassPc, pcs) {
    if (pcs.length === 1) return { root: bassPc, q: '', bass: bassPc, single: true };
    let best = null;
    for (const r of pcs) {
      const iv = pcs.map((p) => ((p - r) % 12 + 12) % 12).sort((a, b) => a - b);
      const hit = TMAP.get(iv.join(','));
      if (!hit) continue;
      const score = hit.rank + (r === bassPc ? 0 : 14) + (pcs.length >= 4 ? 0 : 1);
      if (!best || score < best.score) best = { root: r, q: hit.name, score, bass: bassPc };
    }
    if (best) return best;
    for (const r of pcs) {
      const set = new Set(pcs.map((p) => ((p - r) % 12 + 12) % 12));
      for (const [iv, v] of TLIST) {
        if (iv.length - set.size !== 1) continue;
        const miss = iv.filter((x) => !set.has(x));
        if (miss.length === 1 && (miss[0] === 7 || miss[0] === 2)) {
          const score = v.rank + 22 + (r === bassPc ? 0 : 14);
          if (!best || score < best.score) {
            best = { root: r, q: v.name + (miss[0] === 7 ? ' (no 5)' : ''), score, bass: bassPc };
          }
        }
      }
    }
    return best || { root: bassPc, q: '', bass: bassPc };
  }

  const solfaOf = (pc) => SOLFA[degree(pc)];
  function qualityWord(q) {
    if (q === '') return 'major';
    if (q === 'm') return 'minor';
    return q;
  }

  function romanOf(rt, q) {
    let base = ROMAN[degree(rt)];
    let suffix = q;
    const minor = /^m(?!aj)/.test(q);
    if (minor) suffix = q.slice(1);
    if (q === 'm7♭5') { suffix = 'ø7'; }
    else if (q.startsWith('dim7')) { suffix = '°7'; }
    else if (q.startsWith('dim')) { suffix = '°' + q.slice(3); }
    else if (q.startsWith('aug')) { suffix = '+' + q.slice(3); }
    if (minor || q.startsWith('dim')) base = base.toLowerCase();
    return base + suffix;
  }

  /* ================= render ================= */
  /* The chord: what the hands are on, plus whatever the pedal is holding
     from the same chord. Notes demoted by a later chord change are excluded
     unless the player asked for everything sounding. */
  function sounding() {
    const s = new Set(held.keys());
    if (sustain) {
      sustained.forEach((n) => {
        if (pedalMode === 'all' || !ringing.has(n)) s.add(n);
      });
    }
    return [...s].sort((a, b) => a - b);
  }

  /* Still audible, no longer part of the chord. */
  function ringingNotes() {
    if (!sustain || pedalMode === 'all') return [];
    return [...ringing].filter((n) => !held.has(n)).sort((a, b) => a - b);
  }

  function paint() {
    paintAt = performance.now();
    if (paintTimer) { clearTimeout(paintTimer); paintTimer = 0; }
    const notes = sounding();
    const ch = detect(notes), rootPc = ch ? ch.root : -1;
    const solfaMode = (labelMode === 'solfa');
    const labelsOff = labelMode === 'off';
    const eyebrow = labelsOff ? 'Number · off' : (solfaMode ? 'Sol-fa · key of ' : 'Number · key of ') + keysel.value;
    if (!$('numcard').classList.contains('popped')) numEyebrow.textContent = eyebrow;

    /* everything the keybed needs, so the keys window mirrors it exactly */
    const rung = ringingNotes();
    const keys = notes.map((n) => [n, held.has(n) ? held.get(n) : 70]);
    const ring = rung.map((n) => [n, 70]);
    const cTags = {};
    if (labelMode !== 'off') {
      for (let n = LOW; n <= HIGH; n++) if (n % 12 === 0) cTags[n] = tagText(n);
    }
    const tags = labelMode === 'off' ? [] : notes.map((n, i) => ({
      n, t: tagText(n), b: i === 0 && notes.length > 1
    }));

    const vs = [...held.values()];
    const vw = vs.length ? Math.round(Math.max(...vs) / 127 * 100) + '%' : '0%';
    if (vbar._w !== vw) { vbar._w = vw; vbar.style.width = vw; }

    let text;
    if (!ch) {
      text = {
        chordClass: 'big empty', chordHTML: '—',
        numClass: 'big empty', numHTML: '—',
        romanText: '', metaHTML: '', numEyebrow: eyebrow
      };
    } else {
      let chordHTML, numHTML, romanText;
      if (ch.single) {
        chordHTML = noteName(notes[0]);
        numHTML = solfaMode ? solfaOf(ch.root) : NUM[degree(ch.root)];
        romanText = solfaMode
          ? NUM[degree(ch.root)] + ' · ' + ROMAN[degree(ch.root)]
          : ROMAN[degree(ch.root)] + ' · ' + solfaOf(ch.root);
      } else {
        const slashName = (ch.bass !== ch.root) ? `<span class="slash">/${pcName(ch.bass)}</span>` : '';
        const slashNum = (ch.bass !== ch.root)
          ? `<span class="slash">/${solfaMode ? solfaOf(ch.bass) : NUM[degree(ch.bass)]}</span>` : '';
        chordHTML = `${pcName(ch.root)}<span class="sup">${ch.q}</span>${slashName}`;
        numHTML = solfaMode
          ? `${solfaOf(ch.root)}<span class="sup word">${qualityWord(ch.q)}</span>${slashNum}`
          : `${NUM[degree(ch.root)]}<span class="sup">${ch.q}</span>${slashNum}`;
        romanText = solfaMode
          ? NUM[degree(ch.root)] + ch.q + ' · ' + romanOf(ch.root, ch.q)
          : romanOf(ch.root, ch.q) + ' · ' + solfaOf(ch.root);
      }
      const chips = [
        `<span class="pill note">${notes.map(noteName).join('  ·  ')}</span>`,
        `<span class="pill">${notes.length} note${notes.length > 1 ? 's' : ''}</span>`
      ];
      if (rung.length) chips.push(`<span class="pill ringing">${rung.length} ringing</span>`);
      else if (sustain) chips.push('<span class="pill">sustained</span>');
      text = {
        chordClass: 'big', chordHTML,
        numClass: labelsOff ? 'big empty' : 'big', numHTML: labelsOff ? '—' : numHTML,
        romanText: labelsOff ? '' : romanText, metaHTML: chips.join(''), numEyebrow: eyebrow
      };
    }

    /* the trail: the chords that came before this one, newest first. A chord
       only counts once it has held for a third of a second — the first note
       of a rolled chord, or a passing shape, never enters. A new chord
       pushes the one it replaced; silence changes nothing. */
    if (ch && text.chordHTML !== TRAIL.pending) {
      TRAIL.pending = text.chordHTML; TRAIL.pendingNum = text.numHTML;
      clearTimeout(TRAIL.timer);
      TRAIL.timer = setTimeout(() => {
        if (!TRAIL.pending || TRAIL.pending === TRAIL.current) return;
        if (TRAIL.current) { TRAIL.list.unshift({ c: TRAIL.current, n: TRAIL.currentNum }); TRAIL.list.length = Math.min(TRAIL.list.length, 4); }
        TRAIL.current = TRAIL.pending; TRAIL.currentNum = TRAIL.pendingNum;
        paint();
      }, 320);
    }
    const state = Object.assign(
      { accent, mode, keys, ring, rootPc, tags, cTags, keyLight, velocity, backdrop, tint, tintColor, keySize: +ksize.value, clip: Object.assign({}, CLIP), trail: TRAIL.list.slice(0, CLIP.trail) },
      text
    );

    setClass(chordEl, state.chordClass); setHTML(chordEl, state.chordHTML);
    setClass(numEl, state.numClass); setHTML(numEl, state.numHTML);
    if (romanEl._t !== state.romanText) { romanEl._t = state.romanText; romanEl.textContent = state.romanText; }
    setHTML(metaEl, state.metaHTML);
    paintKeys(state);

    lastPublished = state;
    if (BRIDGE) BRIDGE.publish(state);
    if (FRAME.active) clipPush();
  }

  function applyTheme(persist = true) {
    paintTheme();
    $('modebtn').textContent = mode === 'dark' ? '☾' : '☀';
    $('modebtn').title = mode === 'dark' ? 'Switch to light' : 'Switch to dark';
    [...$('swatches').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === accent)));
    if (persist) store({ accent, mode });
    paint();
  }

  (function buildSwatches() {
    const box = $('swatches');
    Object.entries(ACCENTS).forEach(([k, A]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.k = k; b.title = A.label; b.setAttribute('aria-label', A.label);
      b.style.background = `linear-gradient(140deg,${A.stops[1]},${A.stops[2]})`;
      b.addEventListener('click', () => { accent = k; applyTheme(); });
      box.appendChild(b);
    });
  })();

  /* ================= notes ================= */
  /* Everything the pedal is still holding, but nobody is playing, stops
     counting towards the chord. Keys under the fingers are untouched — a
     left hand holding while the right hand moves is still one chord. */
  function demote() {
    sustained.forEach((n) => { if (!held.has(n)) ringing.add(n); });
  }

  const on = (n, v) => {
    const now = performance.now();
    if (now - lastOnset > GATHER) demote();   // a new chord, not a rolled one
    lastOnset = now;
    ringing.delete(n);                        // struck again: back in the chord
    held.set(n, v);
    sustained.add(n);
    paintSoon();
  };

  const off = (n) => {
    held.delete(n);
    if (!sustain) { sustained.delete(n); ringing.delete(n); }
    paintSoon();
  };

  function setSustain(b) {
    if (pedalMode === 'ignore') b = false;   // the pedal is a spectator
    sustain = b;
    sustBadge.textContent = b ? 'Sustain held' : 'Sustain off';
    sustBadge.classList.toggle('warn', b);
    if (!b) {
      sustained.forEach((n) => { if (!held.has(n)) sustained.delete(n); });
      ringing.clear();
    }
    paintSoon();
  }

  /* mouse */
  let mouseNote = null;
  bed.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.wk,.bk'); if (!el) return;
    const r = el.getBoundingClientRect();
    const v = Math.round(38 + ((e.clientY - r.top) / r.height) * 88);
    mouseNote = +el.dataset.n;
    const vel = Math.min(127, Math.max(10, v));
    capture([0x90, mouseNote, vel]);
    on(mouseNote, vel);
    bed.setPointerCapture(e.pointerId);
  });
  const release = () => { if (mouseNote !== null) { capture([0x80, mouseNote, 0]); off(mouseNote); mouseNote = null; } };
  bed.addEventListener('pointerup', release);
  bed.addEventListener('pointercancel', release);

  /* computer keyboard */
  const KMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  let oct = 4;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const t = e.target.tagName;
    if (t === 'SELECT' || t === 'INPUT' || t === 'BUTTON' || t === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); capture([0xB0, 64, 127]); setSustain(true); return; }
    const l = e.key.toLowerCase();
    if (l === 'z') { oct = Math.max(1, oct - 1); return; }
    if (l === 'x') { oct = Math.min(7, oct + 1); return; }
    const k = KMAP[l]; if (k === undefined) return;
    e.preventDefault(); capture([0x90, 12 * (oct + 1) + k, 92]); on(12 * (oct + 1) + k, 92);
  });
  addEventListener('keyup', (e) => {
    if (e.key === ' ') { capture([0xB0, 64, 0]); setSustain(false); return; }
    const k = KMAP[e.key.toLowerCase()]; if (k === undefined) return;
    capture([0x80, 12 * (oct + 1) + k, 0]); off(12 * (oct + 1) + k);
  });

  /* ================= MIDI =================
   * Chromium opens Windows MIDI inputs through the WinRT backend on Win10+,
   * which is multi-client: a DAW or Kontakt can hold the same port at the
   * same time. Ports are never opened exclusively here.
   */
  function noPorts() {
    portSel.innerHTML = '';
    const o = document.createElement('option');
    o.textContent = 'No MIDI inputs found'; o.disabled = true;
    portSel.appendChild(o);
    portBadge.textContent = 'No inputs';
    portBadge.classList.add('warn');
    tbPort.textContent = 'No MIDI input';
  }

  function wantedChannel() {
    const v = chsel.value;
    return v === 'Omni' ? -1 : (parseInt(v, 10) - 1);
  }

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({ sysex: false }).then((acc) => {
      const refresh = () => {
        const ins = [...acc.inputs.values()];
        if (!ins.length) { noPorts(); return; }
        const previous = portSel.value;
        portSel.innerHTML = '';
        const all = document.createElement('option');
        all.textContent = 'All inputs';
        portSel.appendChild(all);
        ins.forEach((i) => {
          const o = document.createElement('option');
          o.textContent = i.name;
          portSel.appendChild(o);
        });
        const saved = settingsCache.midiPort;
        const pick = [previous, saved].find((x) => x && [...portSel.options].some((o) => o.textContent === x));
        portSel.value = pick || 'All inputs';
        /* outputs are only used to play a dropped file through */
        const outs = [...acc.outputs.values()];
        const prevOut = outSel.value;
        outSel.innerHTML = '';
        const none = document.createElement('option');
        none.textContent = 'None';
        outSel.appendChild(none);
        outs.forEach((o) => {
          const el = document.createElement('option');
          el.textContent = o.name;
          outSel.appendChild(el);
        });
        const wantOut = [prevOut, settingsCache.midiOut].find(
          (x) => x && [...outSel.options].some((o) => o.textContent === x)
        );
        outSel.value = wantOut || 'None';
        outPort = outs.find((o) => o.name === outSel.value) || null;

        portBadge.textContent = 'Non-exclusive · ' + ins.length + ' port' + (ins.length > 1 ? 's' : '');
        portBadge.classList.remove('warn');
        tbPort.textContent = 'MIDI · shared';
        ins.forEach((i) => {
          i.onmidimessage = (m) => {
            const [s, a, b] = m.data, cmd = s & 0xF0, chan = s & 0x0F;
            const want = portSel.value;
            if (want !== 'All inputs' && want !== i.name) return;
            const wc = wantedChannel();
            if (wc >= 0 && chan !== wc) return;
            if (s < 0xF0) capture(m.data);
            if (cmd === 0x90 && b > 0) on(a, b);
            else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) off(a);
            else if (cmd === 0xB0 && a === 64) setSustain(b >= 64);
            else if (cmd === 0xB0 && (a === 120 || a === 123)) { held.clear(); sustained.clear(); ringing.clear(); paint(); }
          };
        });
      };
      acc.onstatechange = refresh;   // hot-plug: devices appear without a restart
      refresh();
    }).catch(noPorts);
  } else {
    noPorts();
  }


  /* ================= MIDI file playback =================
     A standard MIDI file is parsed here rather than by a library: the product
     ships no runtime dependencies (B41), and the format is small enough to
     read directly. Playback drives the same on()/off() path as a keyboard, so
     the chord naming, the ringing tier and the pop-outs all behave exactly as
     they do when you play. */

  function parseSMF(buffer) {
    const d = new DataView(buffer);
    let p = 0;
    const tag = () => String.fromCharCode(d.getUint8(p++), d.getUint8(p++), d.getUint8(p++), d.getUint8(p++));
    const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
    const u16 = () => { const v = d.getUint16(p); p += 2; return v; };
    const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    if (tag() !== 'MThd') throw new Error('not a MIDI file');
    const headerLen = u32();
    u16();                                   // format 0, 1 and 2 all read the same way here
    const ntrks = u16();
    const division = d.getInt16(p); p += 2;
    p += headerLen - 6;

    const evs = [];
    const tempos = [{ tick: 0, us: 500000 }]; // 120bpm until the file says otherwise
    let parsed = 0;

    while (parsed < ntrks && p + 8 <= d.byteLength) {
      const t = tag(), len = u32(), end = Math.min(p + len, d.byteLength);
      if (t !== 'MTrk') { p = end; continue; }
      parsed++;
      let tick = 0, status = 0;
      while (p < end) {
        tick += vlq();
        let s = d.getUint8(p);
        if (s & 0x80) { status = s; p++; } else { s = status; }   // running status
        const cmd = s & 0xF0, chan = s & 0x0F;
        if (s === 0xFF) {
          const type = d.getUint8(p++), l = vlq();
          if (type === 0x51 && l === 3) {
            tempos.push({ tick, us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
          }
          p += l;
        } else if (s === 0xF0 || s === 0xF7) {
          p += vlq();
        } else if (cmd === 0x90 || cmd === 0x80) {
          const n = d.getUint8(p++), v = d.getUint8(p++);
          /* channel 10 is percussion — it would carpet the keybed */
          if (chan !== 9 && n >= LOW && n <= HIGH) evs.push({ tick, on: cmd === 0x90 && v > 0, n, v, ch: chan });
        } else if (cmd === 0xB0) {
          const c = d.getUint8(p++), v = d.getUint8(p++);
          if (c === 64 && chan !== 9) evs.push({ tick, ped: v >= 64 });
        } else if (cmd === 0xA0 || cmd === 0xE0) { p += 2; }
        else if (cmd === 0xC0 || cmd === 0xD0) { p += 1; }
        else { break; }                       // nothing we understand: leave this track
      }
      p = end;
    }
    if (!evs.length) throw new Error('no notes in that file');

    evs.sort((a, b) => a.tick - b.tick);
    tempos.sort((a, b) => a.tick - b.tick);

    if (division < 0) {                       // SMPTE: frames per second × ticks per frame
      const fps = -(division >> 8), tpf = division & 0xff;
      evs.forEach((e) => { e.t = e.tick / (fps * tpf); });
    } else {
      let time = 0, lastTick = 0, ti = 0, us = tempos[0].us;
      for (const e of evs) {
        while (ti + 1 < tempos.length && tempos[ti + 1].tick <= e.tick) {
          const tp = tempos[++ti];
          time += (tp.tick - lastTick) * us / 1e6 / division;
          lastTick = tp.tick; us = tp.us;
        }
        time += (e.tick - lastTick) * us / 1e6 / division;
        lastTick = e.tick;
        e.t = time;
      }
    }

    /* where each chord starts, for stepping through the song */
    const onsets = [];
    for (const e of evs) {
      if (!e.on) continue;
      if (!onsets.length || e.t - onsets[onsets.length - 1] > 0.06) onsets.push(e.t);
    }
    return { evs, onsets, dur: evs[evs.length - 1].t + 1 };
  }

  /* ---------- the transport ---------- */
  const PLAY = {
    evs: [], onsets: [], dur: 0, i: 0, pos: 0, speed: 1,
    playing: false, loop: false, clock: 0, raf: 0,
    audio: null, aoff: 0, tick: 0                 // a .chordlight take's sound
  };
  const tEl = $('transport'), tName = $('tname'), tPlay = $('tplay'), tSeek = $('tseek'),
        tTime = $('ttime'), tSpeed = $('tspeed'), tLoop = $('tloop'), dropHint = $('drophint');

  let outPort = null;
  const send = (bytes) => { pianoMidi(bytes); try { if (outPort) outPort.send(bytes); } catch { /* port went away */ } };

  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function silence() {
    held.forEach((_, n) => send([0x80, n, 0]));
    send([0xB0, 123, 0]);
    send([0xB0, 64, 0]);
    held.clear(); sustained.clear(); ringing.clear();
    if (sustain) setSustain(false); else paint();
  }

  function dispatch(e) {
    if (e.ped !== undefined) { send([0xB0 | 0, 64, e.ped ? 127 : 0]); setSustain(e.ped); return; }
    if (e.on) { on(e.n, e.v); send([0x90 | e.ch, e.n, e.v]); }
    else { off(e.n); send([0x80 | e.ch, e.n, 0]); }
  }

  /* The sound of a .chordlight take: an <audio> that follows the transport
     clock. `PLAY.aoff` is where the audio's zero sits on the MIDI timeline. */
  const aud = new Audio();
  aud.preservesPitch = true;
  function audioSync(hard) {
    if (!PLAY.audio) return;
    const want = PLAY.pos - PLAY.aoff;
    if (want < 0) { if (!aud.paused) aud.pause(); return; }
    if (hard || Math.abs(aud.currentTime - want) > 0.08) aud.currentTime = want;
    aud.playbackRate = PLAY.speed;
    if (PLAY.playing && aud.paused) aud.play().catch(() => {});
  }

  function seek(t) {
    silence();
    PLAY.pos = Math.max(0, Math.min(t, PLAY.dur));
    /* rebuild what is sounding at that moment, so a scrub lands mid-chord
       rather than on silence */
    const soundingAt = new Map();
    let pedal = false, i = 0;
    for (; i < PLAY.evs.length && PLAY.evs[i].t <= PLAY.pos; i++) {
      const e = PLAY.evs[i];
      if (e.ped !== undefined) pedal = e.ped;
      else if (e.on) soundingAt.set(e.n, e.v);
      else soundingAt.delete(e.n);
    }
    PLAY.i = i;
    soundingAt.forEach((v, n) => { held.set(n, v); sustained.add(n); send([0x90, n, v]); });
    if (pedal) setSustain(true); else paint();
    PLAY.clock = performance.now() / 1000 - PLAY.pos / PLAY.speed;
    audioSync(true);
    face();
  }

  function frame() {
    if (!PLAY.playing) return;
    PLAY.pos = (performance.now() / 1000 - PLAY.clock) * PLAY.speed;
    while (PLAY.i < PLAY.evs.length && PLAY.evs[PLAY.i].t <= PLAY.pos) dispatch(PLAY.evs[PLAY.i++]);
    if (PLAY.audio && (PLAY.tick++ % 30 === 0)) audioSync(false);
    if (PLAY.pos >= PLAY.dur) {
      if (PLAY.loop) { seek(0); }
      else { pause(); PLAY.pos = PLAY.dur; }
    }
    face();
    PLAY.raf = requestAnimationFrame(frame);
  }

  function play() {
    if (!PLAY.evs.length && !PLAY.audio) return;
    if (PLAY.pos >= PLAY.dur) seek(0);
    PLAY.playing = true;
    PLAY.clock = performance.now() / 1000 - PLAY.pos / PLAY.speed;
    tPlay.textContent = '⏸'; tPlay.title = 'Pause';
    audioSync(true);
    PLAY.raf = requestAnimationFrame(frame);
  }

  function pause() {
    PLAY.playing = false;
    cancelAnimationFrame(PLAY.raf);
    tPlay.textContent = '▶'; tPlay.title = 'Play';
    if (!aud.paused) aud.pause();
    silence();
    face();
  }
  function dropAudio() {
    if (!aud.paused) aud.pause();
    if (PLAY.audio) { URL.revokeObjectURL(PLAY.audio); PLAY.audio = null; }
    aud.removeAttribute('src'); aud.load();
    PLAY.aoff = 0;
  }

  function face() {
    tTime.textContent = `${clock(PLAY.pos)} / ${clock(PLAY.dur)}`;
    if (document.activeElement !== tSeek) tSeek.value = String(Math.round(PLAY.pos / PLAY.dur * 1000) || 0);
  }

  function step(dir) {
    const here = PLAY.pos + (dir > 0 ? 0.03 : -0.08);
    const next = dir > 0
      ? PLAY.onsets.find((t) => t > here)
      : [...PLAY.onsets].reverse().find((t) => t < here);
    if (next !== undefined) seek(next);
  }

  /* Loads bytes into the transport. `autoplay` false leaves it cued — a take
     you just finished should not start blaring the moment it is saved. */
  function loadBytes(buffer, name, autoplay = true) {
    const parsed = parseSMF(buffer);
    pause();
    dropAudio();
    Object.assign(PLAY, parsed, { i: 0, pos: 0 });
    tName.textContent = name;
    tName.title = name;
    tEl.classList.remove('empty', 'collapsed');
    if (autoplay) play(); else seek(0);
  }

  /* ---------- .chordlight: a take with its sound and its look ----------
     A plain zip: manifest.json, take.mid, and the mix as mix.m4a / mix.weba
     / mix.wav. Anyone can open it with a zip tool; Chordlight opens it as a
     take. The zip is written stored (no compression) — the audio is already
     compressed and MIDI is tiny — and read stored or deflated. */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipWrite(entries) {
    const enc = new TextEncoder(), parts = [], cd = [];
    let off = 0;
    const u16 = (v) => [v & 0xff, (v >> 8) & 0xff], u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
    const dosT = (() => { const d = new Date(); return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; })();
    for (const { name, bytes } of entries) {
      const n = enc.encode(name), crc = crc32(bytes);
      const local = new Uint8Array([0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(dosT.t), ...u16(dosT.d), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(n.length), ...u16(0), ...n]);
      cd.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(dosT.t), ...u16(dosT.d), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...n]));
      parts.push(local, bytes); off += local.length + bytes.length;
    }
    const cdLen = cd.reduce((a, c) => a + c.length, 0);
    const end = new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(cdLen), ...u32(off), ...u16(0)]);
    const out = new Uint8Array(off + cdLen + end.length);
    let o = 0; for (const p of [...parts, ...cd, end]) { out.set(p, o); o += p.length; }
    return out;
  }
  async function zipRead(buffer) {
    const b = new Uint8Array(buffer), d = new DataView(buffer), dec = new TextDecoder();
    let e = b.length - 22;
    while (e >= 0 && !(b[e] === 0x50 && b[e + 1] === 0x4B && b[e + 2] === 5 && b[e + 3] === 6)) e--;
    if (e < 0) throw new Error('not a Chordlight file');
    const count = d.getUint16(e + 10, true); let p = d.getUint32(e + 16, true);
    const out = new Map();
    for (let i = 0; i < count; i++) {
      const method = d.getUint16(p + 10, true), size = d.getUint32(p + 20, true), usize = d.getUint32(p + 24, true);
      const nl = d.getUint16(p + 28, true), el = d.getUint16(p + 30, true), cl = d.getUint16(p + 32, true), lo = d.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
      const lnl = d.getUint16(lo + 26, true), lel = d.getUint16(lo + 28, true);
      const data = b.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + size);
      if (method === 0) out.set(name, data);
      else if (method === 8) {
        const ds = new DecompressionStream('deflate-raw');
        const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
        out.set(name, new Uint8Array(buf, 0, usize));
      } else throw new Error('unsupported zip entry');
      p += 46 + nl + el + cl;
    }
    return out;
  }
  const isZip = (buffer) => { const b = new Uint8Array(buffer, 0, 4); return b[0] === 0x50 && b[1] === 0x4B && b[2] === 3 && b[3] === 4; };

  /* The look travels with the take: key centre, spelling, labels, accent.
     Applied for this playback, not written to your preferences. */
  function applyLook(m) {
    if (m.keyCenter && [...keysel.options].some((o) => o.value === m.keyCenter)) keysel.value = m.keyCenter;
    if (['auto', 'sharp', 'flat'].includes(m.spelling)) spellsel.value = m.spelling;
    if (['notes', 'solfa', 'off'].includes(m.labelMode)) {
      labelMode = m.labelMode;
      [...$('labelseg').children].forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === labelMode)));
    }
    if (ACCENTS[m.accent]) { accent = m.accent; paintTheme(); [...$('swatches').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === accent))); }
  }
  async function loadChordlight(buffer, name, autoplay) {
    const z = await zipRead(buffer);
    const mf = z.get('manifest.json'); if (!mf) throw new Error('no manifest');
    const m = JSON.parse(new TextDecoder().decode(mf));
    if (m.format !== 'chordlight') throw new Error('not a Chordlight file');
    const mid = z.get((m.midi && m.midi.file) || 'take.mid');
    let parsed = { evs: [], onsets: [], dur: 0 };
    if (mid) { try { parsed = parseSMF(mid.buffer.slice(mid.byteOffset, mid.byteOffset + mid.byteLength)); } catch { /* sound only */ } }
    pause(); dropAudio();
    Object.assign(PLAY, parsed, { i: 0, pos: 0 });
    tName.textContent = m.title || name; tName.title = m.title || name;
    tEl.classList.remove('empty', 'collapsed');
    seek(0);
    const a = m.audio && z.get(m.audio.file);
    if (a) {
      const type = m.audio.mime || 'audio/mp4';
      PLAY.audio = URL.createObjectURL(new Blob([a], { type }));
      PLAY.aoff = (m.audio.offsetMs || 0) / 1000;
      aud.src = PLAY.audio;
      aud.load();
      /* the take may end after the last note — let the sound run its length.
         The manifest says how long; a recorder's WebM reports Infinity until
         it has been seeked past the end, so that is the fallback. */
      const extend = (secs) => { if (isFinite(secs) && secs > 0) { PLAY.dur = Math.max(PLAY.dur, secs + PLAY.aoff); face(); } };
      if (m.audio.durationMs) extend(m.audio.durationMs / 1000);
      else aud.addEventListener('loadedmetadata', () => {
        if (isFinite(aud.duration)) { extend(aud.duration); return; }
        const onDur = () => { if (isFinite(aud.duration)) { aud.removeEventListener('durationchange', onDur); extend(aud.duration); aud.currentTime = 0; } };
        aud.addEventListener('durationchange', onDur);
        aud.currentTime = 1e6;
      }, { once: true });
    }
    applyLook(m);
    paint();
    if (autoplay) play();
  }
  /* any take: a .mid, or a .chordlight */
  async function loadAny(buffer, name, autoplay) {
    if (isZip(buffer)) await loadChordlight(buffer, name, autoplay);
    else loadBytes(buffer, name, autoplay);
  }

  async function loadFile(file) {
    try {
      await loadAny(await file.arrayBuffer(), file.name, true);
    } catch (err) {
      tName.textContent = 'Could not read ' + file.name;
      tName.title = String(err.message || err);
    }
  }

  const recList = $('reclist');
  const sessionRecs = [];                       // browser build: what was saved this session
  async function refreshRecList() {
    let items = [];
    if (BRIDGE) { try { items = await BRIDGE.listRecordings(); } catch { items = []; } }
    else items = sessionRecs.map((r) => ({ name: r.name }));
    recList.innerHTML = '';
    const head = document.createElement('option');
    head.value = '';
    head.textContent = items.length ? `Recordings (${items.length})…` : 'Recordings…';
    recList.appendChild(head);
    items.forEach((r) => {
      const o = document.createElement('option');
      const leaf = r.name.split('/').pop();
      o.value = r.name; o.textContent = leaf.replace(/\.(midi?|chordlight)$/i, '') + (/\.chordlight$/i.test(leaf) ? '  ♪' : '');
      recList.appendChild(o);
    });
  }
  recList.addEventListener('change', async () => {
    const name = recList.value;
    recList.value = '';
    if (!name) return;
    try {
      let buffer;
      if (BRIDGE) buffer = await BRIDGE.readRecording(name);
      else buffer = sessionRecs.find((r) => r.name === name).bytes.buffer;
      await loadAny(buffer, name.split('/').pop(), false);
      toast('Cued  ' + name.split('/').pop());
    } catch (err) {
      toast('Could not open ' + name);
    }
  });

  tPlay.addEventListener('click', () => (PLAY.playing ? pause() : play()));
  $('tprev').addEventListener('click', () => step(-1));
  $('tnext').addEventListener('click', () => step(1));
  tSeek.addEventListener('input', () => seek(+tSeek.value / 1000 * PLAY.dur));
  tSpeed.addEventListener('change', () => {
    PLAY.speed = +tSpeed.value;
    PLAY.clock = performance.now() / 1000 - PLAY.pos / PLAY.speed;
    audioSync(false);
  });
  tLoop.addEventListener('click', () => {
    PLAY.loop = !PLAY.loop;
    tLoop.setAttribute('aria-pressed', String(PLAY.loop));
    tLoop.classList.toggle('on', PLAY.loop);
  });
  $('tcollapse').addEventListener('click', (e) => {
    const c = tEl.classList.toggle('collapsed');
    e.currentTarget.textContent = c ? '▴' : '▾';
    e.currentTarget.title = c ? 'Show the controls' : 'Hide the controls';
  });
  $('tclose').addEventListener('click', () => {
    pause();
    dropAudio();
    Object.assign(PLAY, { evs: [], onsets: [], dur: 0, i: 0, pos: 0 });
    tEl.classList.add('empty');
    tName.textContent = 'Drop a .mid or .chordlight anywhere, or open one';
    tName.title = '';
  });

  $('openmidi').addEventListener('click', () => $('midifile').click());
  $('midifile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadFile(f);
    e.target.value = '';          // so the same file can be opened twice
  });

  /* ---------- dropping a file anywhere on the window ---------- */
  const carriesFile = (e) => [...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files');
  ['dragenter', 'dragover'].forEach((k) => window.addEventListener(k, (e) => {
    if (!carriesFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropHint.hidden = false;
  }));
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropHint.hidden = true; });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropHint.hidden = true;
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });


  /* ================= toast ================= */
  const toastEl = $('toast');
  let toastTimer = 0;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 2800);
  }

  /* Recordings go to Documents/Amanorsac Studio/Chordlight 88/Recordings in
     the app; the browser test build downloads them instead. */
  async function saveBytes(name, bytes, mime) {
    if (BRIDGE) {
      try {
        const file = await BRIDGE.saveRecording(name, bytes);
        toast('Saved  ' + file);
      } catch (err) {
        toast('Could not save — ' + (err.message || err));
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    toast('Downloaded  ' + name);
  }
  const stamp = () => {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;
  };

  /* ================= MIDI capture =================
     Everything that reaches the display is also kept for five minutes, so
     the phrase you wish you had recorded can still be saved. Rec makes a
     deliberate take on top of that. */
  const KEEP_SECONDS = 300;
  var CAP = { buf: [] };                     // var: capture() may run before this line
  const REC = { on: false, start: 0, events: [], timer: 0 };
  const recBtn = $('recbtn'), keepBtn = $('keepbtn');

  function capture(bytes) {
    pianoMidi(bytes);
    if (!CAP) return;                        // before the recorder is set up
    const t = performance.now() / 1000;
    const b = Array.from(bytes);
    CAP.buf.push({ t, b });
    const cutoff = t - KEEP_SECONDS;
    while (CAP.buf.length && CAP.buf[0].t < cutoff) CAP.buf.shift();
    if (REC.on) REC.events.push({ t, b });
  }

  /* Standard MIDI file, format 0, 480 ppq at 120 bpm — so one second is
     exactly 960 ticks and the timing is what was played, not quantised. */
  function writeSMF(events, from) {
    const TPS = 960;
    const vlq = (n) => { const out = [n & 0x7f]; n >>= 7; while (n) { out.unshift((n & 0x7f) | 0x80); n >>= 7; } return out; };
    const trk = [...vlq(0), 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20];
    const t0 = from !== undefined ? from : (events.length ? events[0].t : 0);
    const open = new Set();
    let last = 0;
    for (const e of events) {
      const tick = Math.max(last, Math.round((e.t - t0) * TPS));
      trk.push(...vlq(tick - last), ...e.b);
      last = tick;
      const cmd = e.b[0] & 0xF0;
      if (cmd === 0x90 && e.b[2] > 0) open.add((e.b[0] & 0x0F) << 8 | e.b[1]);
      else if (cmd === 0x80 || cmd === 0x90) open.delete((e.b[0] & 0x0F) << 8 | e.b[1]);
    }
    open.forEach((k) => trk.push(...vlq(0), 0x80 | (k >> 8), k & 0x7f, 0));   // nothing left hanging
    trk.push(...vlq(0), 0xFF, 0x2F, 0x00);
    const be16 = (n) => [n >> 8 & 0xff, n & 0xff];
    const be32 = (n) => [n >>> 24 & 0xff, n >>> 16 & 0xff, n >>> 8 & 0xff, n & 0xff];
    return new Uint8Array([
      0x4D, 0x54, 0x68, 0x64, ...be32(6), ...be16(0), ...be16(1), ...be16(480),
      0x4D, 0x54, 0x72, 0x6B, ...be32(trk.length), ...trk
    ]);
  }

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function recFace() {
    const s = Math.floor(performance.now() / 1000 - REC.start);
    recBtn.textContent = TRIAL.on ? `■ ${mmss(Math.min(s, TRIAL.max))} / ${mmss(TRIAL.max)}` : `■ ${mmss(s)}`;
    /* Free Trial: a take stops at one minute (a video's own clock stops it
       when the take belongs to a video) */
    if (TRIAL.on && s >= TRIAL.max && !VID.rec) { stopRec(); trialToast(); }
  }
  function trialToast() { toast('Free trial: recordings stop at 1 minute. The full version records without a limit.'); }
  /* `base` is the name shared with a video or WAV started at the same
     moment, so the three files sort together in the folder. */
  function startRec(base, withWav) {
    if (TRIAL.on && BRIDGE && BRIDGE.trialTake) BRIDGE.trialTake();
    REC.on = true; REC.start = performance.now() / 1000; REC.events = [];
    REC.base = base || `Chordlight take ${stamp()}`;
    recBtn.setAttribute('aria-pressed', 'true');
    recBtn.title = 'Stop and save the take';
    recFace();
    REC.timer = setInterval(recFace, TRIAL.on ? 200 : 500);
    if (withWav) startWav(REC.base).catch((err) => toast('No WAV — ' + (err.message || err)));
    if (alsoPack && !PACK.on) startPack(REC.base, 'rec').catch((err) => toast('No Chordlight file — ' + (err.message || err)));
  }
  function stopRec() {
    REC.on = false;
    clearInterval(REC.timer);
    recBtn.setAttribute('aria-pressed', 'false');
    recBtn.textContent = '● Rec';
    recBtn.title = 'Record the MIDI you play to a .mid file';
    const wav = (WAV.on && WAV.owner === 'rec') ? stopWav() : null;
    if (PACK.on && PACK.owner === 'rec') stopPack(REC.events, REC.start, REC.base, wav);
    if (!REC.events.length) { toast('Nothing was played'); return; }
    keepRecording(REC.base + '.mid', writeSMF(REC.events));
  }
  async function keepRecording(name, bytes) {
    await saveBytes(name, bytes, 'audio/midi');
    sessionRecs.unshift({ name, bytes });
    refreshRecList();
    try { loadBytes(bytes.buffer.slice(0), name, false); } catch { /* unplayable take: leave the transport as it was */ }
  }
  recBtn.addEventListener('click', () => (REC.on ? stopRec() : startRec(null, alsoWav)));
  keepBtn.addEventListener('click', () => {
    /* Free Trial: Keep saves the last minute, not the last five */
    const from = TRIAL.on ? performance.now() / 1000 - TRIAL.max + 0.5 : -Infinity;
    const buf = TRIAL.on ? CAP.buf.filter((e) => e.t >= from) : CAP.buf;
    if (!buf.length) { toast(TRIAL.on ? 'Nothing in the last minute' : 'Nothing in the last five minutes'); return; }
    keepRecording(`Chordlight keep ${stamp()}.mid`, writeSMF(buf));
  });

  /* ================= video ================= */
  const VID = { rec: null, chunks: [], timer: 0, start: 0 };
  const vidBtn = $('vidbtn');
  function vidFace() {
    const s = Math.floor(performance.now() / 1000 - VID.start);
    vidBtn.textContent = TRIAL.on ? `■ ${mmss(Math.min(s, TRIAL.max))} / ${mmss(TRIAL.max)}` : `■ ${mmss(s)}`;
    if (TRIAL.on && s >= TRIAL.max && VID.rec) { stopVideo(); trialToast(); }
  }
  const soundSel = $('videosound'), audioInSel = $('audioin'), vocalInSel = $('vocalin'),
        duckEl = $('duck'), duckV = $('duckv'), offsetEl = $('aoffset'), offsetV = $('aoffsetv'), qualSel = $('vquality');
  let videoSound = 'system', audioInput = '', vocalInput = '', duck = 9, audioOffset = 0, videoQuality = 'good';
  /* System sound is a Windows feature in this release (main.js, SYSTEM_SOUND).
     On a machine without it the two System options are greyed and a saved
     System setting falls back to Inputs. */
  let systemSound = true;
  let systemUnsafe = false;        // this machine has taken the window down asking for the display

  /* Written synchronously, so it survives a renderer that dies mid-call.
     localStorage is per-window and per-install, which is exactly the scope
     wanted: the finding is about this machine's graphics driver. */
  const CAPTURE_MARK = 'chordlight.capturing';
  function markCapture(on) {
    try { if (on) localStorage.setItem(CAPTURE_MARK, String(Date.now())); else localStorage.removeItem(CAPTURE_MARK); }
    catch { /* private mode, or storage refused: the net is best-effort */ }
  }
  /* At startup: a mark still sitting there means the last attempt never
     returned. Count it; at two, stop offering System here. */
  function checkCaptureMark() {
    let left = false, fails = 0;
    try {
      left = !!localStorage.getItem(CAPTURE_MARK);
      fails = parseInt(localStorage.getItem('chordlight.capturefails') || '0', 10) || 0;
      if (left) { fails += 1; localStorage.setItem('chordlight.capturefails', String(fails)); localStorage.removeItem(CAPTURE_MARK); }
    } catch { return; }
    if (!left) return;
    systemUnsafe = fails >= 2;
    if (videoSound === 'system' || videoSound === 'both') {
      videoSound = 'input'; soundSel.value = videoSound; store({ videoSound });
    }
    toast(systemUnsafe
      ? 'System sound closed the window twice on this computer — it is switched off here. The clip records your inputs and the built-in sound.'
      : 'System sound closed the window last time — the clip is set to Inputs. Logs are in About.');
    if (systemUnsafe) applySystemSound(false);
  }

  function applySystemSound(on) {
    systemSound = !!on;
    [...soundSel.options].forEach((o) => {
      if (o.value !== 'system' && o.value !== 'both') return;
      o.disabled = !systemSound;
      const note = systemUnsafe ? ' — not on this computer' : ' — needs macOS 14.2+';
      if (!systemSound && !/ — (needs macOS|not on this)/.test(o.textContent)) o.textContent += note;
    });
    if (!systemSound && (videoSound === 'system' || videoSound === 'both')) {
      videoSound = 'input'; soundSel.value = videoSound; store({ videoSound });
      if (!systemUnsafe) toast('System sound is not available on this Mac yet — the clip records your inputs');
    }
  }
  const clipTitleEl = $('cliptitle'), clipKeysEl = $('clipkeys'), titleFontEl = $('titlefont'), titleSizeEl = $('titlesize'), titleSizeV = $('titlesizev');
  titleFontEl.addEventListener('change', () => { CLIP.font = titleFontEl.value; store({ titleFont: CLIP.font }); paint(); });
  titleSizeEl.addEventListener('input', () => { CLIP.size = +titleSizeEl.value; titleSizeV.textContent = CLIP.size; store({ titleSize: CLIP.size }); paint(); });
  (function buildTitleSwatches() {
    const box = $('titleswatches');
    const preview = { text: '#EAF5FF', accent: '#4ECDE6', alt: '#B9AEFF', white: '#FFFFFF', gold: '#FFB53D' };
    Object.entries(TITLE_COLORS).forEach(([k, C]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.k = k; b.title = C.label; b.setAttribute('aria-label', C.label);
      b.style.background = preview[k];
      b.addEventListener('click', () => { CLIP.color = k; markTitle(); store({ titleColor: k }); paint(); });
      box.appendChild(b);
    });
  })();
  const markTitle = () => [...$('titleswatches').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === CLIP.color)));
  clipTitleEl.addEventListener('input', () => { CLIP.title = clipTitleEl.value.trim().slice(0, 80); store({ clipTitle: CLIP.title }); paint(); });
  clipKeysEl.addEventListener('change', () => { CLIP.keys = clipKeysEl.value; store({ clipKeys: CLIP.keys }); paint(); });
  const trailEl = $('cliptrail'), plateEl = $('plate'), plateAlphaEl = $('platealpha'), plateAlphaV = $('platealphav');
  trailEl.addEventListener('change', () => { CLIP.trail = +trailEl.value; store({ clipTrail: CLIP.trail }); paint(); });
  plateEl.addEventListener('change', () => { CLIP.plate = plateEl.value; store({ plate: CLIP.plate }); paint(); });
  plateAlphaEl.addEventListener('input', () => { CLIP.plateAlpha = +plateAlphaEl.value; plateAlphaV.textContent = CLIP.plateAlpha + '%'; store({ plateAlpha: CLIP.plateAlpha }); paint(); });

  /* Audio inputs only get names once the page has been allowed to use one,
     so both lists are (re)built after any successful capture too. */
  /* `offLabel`, where a select has one, is a real choice and not just the
     absence of a device: the keyboard input needs it, because a player using
     a built-in sound wants the line-in out of the clip altogether rather
     than open and silent. */
  function fillInputs(sel, devs, want, noneLabel, offLabel) {
    const keep = sel.value;
    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = noneLabel;
    sel.appendChild(def);
    if (offLabel) {
      const off = document.createElement('option');
      off.value = 'off'; off.textContent = offLabel;
      sel.appendChild(off);
    }
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Input ${i + 1}`;
      sel.appendChild(o);
    });
    sel.value = [keep, want].find((v) => v && [...sel.options].some((o) => o.value === v)) || '';
  }
  async function refreshInputs() {
    let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); }
    catch { devs = []; }
    fillInputs(audioInSel, devs, audioInput, 'Default input', 'Off — built-in sound only');
    fillInputs(vocalInSel, devs, vocalInput, 'None');
  }
  soundSel.addEventListener('change', () => { videoSound = soundSel.value; store({ videoSound }); });
  audioInSel.addEventListener('change', () => { audioInput = audioInSel.value; store({ audioInput }); });
  vocalInSel.addEventListener('change', () => { vocalInput = vocalInSel.value; store({ vocalInput }); });
  const duckFace = () => { duckV.textContent = duck ? `−${duck} dB` : 'off'; };
  const offsetFace = () => { offsetV.textContent = audioOffset + ' ms'; };
  if (navigator.mediaDevices) {
    refreshInputs();
    navigator.mediaDevices.addEventListener('devicechange', refreshInputs);
  }
  /* ================= the mix =================
     One audio graph serves two jobs. While Advanced is open it meters the
     keyboard and vocal inputs so you can set levels before a take; while a
     clip records, the same graph is what goes into the file. Keyboard and
     system share a gain the vocal pushes down while it hears you (the duck);
     the vocal goes straight in; the whole mix can be delayed a few ms so it
     lines up with the picture. */
  const QUALITY = {
    best:  { fps: 60, vbps: 16e6, abps: 256e3 },
    good:  { fps: 30, vbps: 8e6,  abps: 256e3 },
    small: { fps: 30, vbps: 4e6,  abps: 192e3 }
  };
  /* MP4 (H.264 + AAC) when this machine's recorder can write it — it plays
     everywhere; WebM (VP9 + Opus) otherwise. Only a named H.264 + AAC pair
     counts: a bare "video/mp4" would put VP9 in an MP4, which editors like
     even less than WebM. Decided once, shown in Advanced, used for every
     clip. */
  const CONTAINERS = [
    { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4', label: 'MP4 · H.264 + AAC' },
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4', label: 'MP4 · H.264 + AAC' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM · VP9 + Opus' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', label: 'WebM · VP8 + Opus' },
    { mime: 'video/webm', ext: 'webm', label: 'WebM' }
  ];
  const CONTAINER = (typeof MediaRecorder !== 'undefined' && CONTAINERS.find((c) => MediaRecorder.isTypeSupported(c.mime)))
    || CONTAINERS[CONTAINERS.length - 1];
  const keyGainEl = $('keygain'), vocGainEl = $('vocgain'), keyGainV = $('keygainv'), vocGainV = $('vocgainv'),
        keyMeter = $('keymeter'), vocMeter = $('vocmeter'), duckBadge = $('duckbadge'), mixNote = $('mixnote');
  let keyGainDb = 0, vocGainDb = 0;
  const dbToGain = (db) => Math.pow(10, db / 20);
  const gainFace = () => {
    keyGainV.textContent = (keyGainDb > 0 ? '+' : '') + keyGainDb + ' dB';
    vocGainV.textContent = (vocGainDb > 0 ? '+' : '') + vocGainDb + ' dB';
  };
  keyGainEl.addEventListener('input', () => { keyGainDb = +keyGainEl.value; gainFace(); store({ keyGain: keyGainDb }); if (MIX.keyGain) MIX.keyGain.gain.value = dbToGain(keyGainDb); });
  vocGainEl.addEventListener('input', () => { vocGainDb = +vocGainEl.value; gainFace(); store({ vocGain: vocGainDb }); if (MIX.vocGain) MIX.vocGain.gain.value = dbToGain(vocGainDb); });
  duckEl.addEventListener('input', () => { duck = +duckEl.value; duckFace(); store({ duck }); });
  offsetEl.addEventListener('input', () => {
    audioOffset = +offsetEl.value; offsetFace(); store({ audioOffset });
    if (MIX.delay) MIX.delay.delayTime.value = audioOffset / 1000;
  });
  qualSel.addEventListener('change', () => { videoQuality = qualSel.value; CLIP.quality = videoQuality; store({ videoQuality }); paint(); });

  const rawAudio = (id) => (id
    ? { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    : { echoCancellation: false, noiseSuppression: false, autoGainControl: false });

  async function openInput(id, what) {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: rawAudio(id) });
      refreshInputs();
      return st;
    } catch (err) {
      toast(`No ${what} — ` + (err.message || err));
      return null;
    }
  }

  const MIX = { ctx: null, keyGain: null, vocGain: null, bed: null, delay: null, dest: null,
                keyAn: null, vocAn: null, streams: [], raf: 0, recording: false, ducked: false, piano: false };

  /* ================= the built-in piano =================
     An upright piano that lives inside Chordlight (piano-engine.js, on the
     audio thread). You hear it through the computer, and it goes into every
     clip, WAV and Chordlight file through the mix — so a player with no
     instrument sound, or a Mac that cannot capture one, still records music.
     It runs on its own always-on context for low latency and hands the mix
     a stream, the same way a system-sound capture does. */
  const PIANO = { on: false, bank: 'off', ctx: null, node: null, gain: null, dest: null, ready: false, loading: null,
                  level: 80, attack: 0, release: 0, gen: 0 };   // attack/release in ms, 0 = the instrument's own
  const soundSeg = $('soundseg'), soundVol = $('soundvol'), attSlider = $('attack'), relSlider = $('release');
  /* the instruments that ship — Amanorsac .jmi bundles under sounds/<id>/ */
  const BANKS = {
    grand:     { name: 'Grand 1',    dir: 'sounds/grand' },
    spnatural: { name: 'SP Natural', dir: 'sounds/spnatural' },
    softep:    { name: 'Soft EP 1',  dir: 'sounds/softep' }
  };
  async function readAssetBytes(name) {
    if (BRIDGE && BRIDGE.asset) { const u8 = BRIDGE.asset(name); if (!u8) throw new Error('missing ' + name); return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }
    const r = await fetch(name.split('/').map(encodeURIComponent).join('/')); if (!r.ok) throw new Error('missing ' + name); return r.arrayBuffer();
  }
  /* 16-bit copy of a decoded channel. A decaying sample is held to 8 s with
     a fade at the end (the tails beyond are at -50 dB and below), which keeps
     a 240-zone instrument near 250 MB in memory instead of 500. */
  const MAX_SAMPLE_SEC = 8, FADE_SEC = 0.4;
  const toI16 = (f32, sr, cap) => {
    const n = cap ? Math.min(f32.length, Math.round(MAX_SAMPLE_SEC * sr)) : f32.length;
    const fadeN = Math.min(n, Math.round(FADE_SEC * sr)), fadeFrom = n - fadeN;
    const o = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      let x = f32[i];
      if (cap && n < f32.length && i >= fadeFrom) x *= (n - i) / fadeN;
      o[i] = x >= 1 ? 32767 : x <= -1 ? -32768 : (x * 32767) | 0;
    }
    return o;
  };
  /* Loads a bundle: the map first (the engine knows every zone at once),
     then the audio zone by zone, middle keys and middle velocities first,
     so playing can start within a second while the rest streams in. */
  async function loadBank(ctx, node, id, gen) {
    const B = BANKS[id];
    const inst = JSON.parse(new TextDecoder().decode(await readAssetBytes(B.dir + '/instrument.json')));
    const zones = inst.zones.map((z, i) => ({
      id: i, rootNote: z.rootNote, lo: z.keyRangeLo, hi: z.keyRangeHi,
      anchor: z.anchorVelocity != null ? z.anchorVelocity : Math.round((z.velRangeLo + z.velRangeHi) / 2),
      levelDb: z.levelDb != null ? z.levelDb : -20, releaseMs: z.releaseMs || 0,
      files: z.roundRobins.map((r) => ({ file: r.file, loop: r.loop || null })), rr: []
    }));
    /* decodeAudioData resamples to the context's rate, so that is the rate the engine reads at */
    /* key-off samples, when the bundle has them (NOTE-OFF AND KEY-OFF.md §3) */
    const relZones = (inst.releaseZones || []).map((z, i) => ({
      id: 100000 + i, rootNote: z.rootNote, lo: z.keyRangeLo, hi: z.keyRangeHi,
      velLo: z.velRangeLo != null ? z.velRangeLo : 1, velHi: z.velRangeHi != null ? z.velRangeHi : 127,
      rtDecayDb: z.rtDecayDb != null ? z.rtDecayDb : 3,
      files: z.roundRobins.map((r) => ({ file: r.file, loop: null })), rr: []
    }));
    node.port.postMessage({
      t: 'bank', sr: ctx.sampleRate, playback: inst.playback || {}, sustaining: inst.soundType === 'sustaining',
      zones: zones.map((z) => ({ id: z.id, rootNote: z.rootNote, lo: z.lo, hi: z.hi, anchor: z.anchor, levelDb: z.levelDb, releaseMs: z.releaseMs, rr: [] })),
      releaseZones: relZones.map((z) => ({ id: z.id, rootNote: z.rootNote, lo: z.lo, hi: z.hi, velLo: z.velLo, velHi: z.velHi, rtDecayDb: z.rtDecayDb, rr: [] }))
    });
    const order = zones.slice().sort((a, b) => (Math.abs(a.rootNote - 60) + Math.abs(a.anchor - 72) / 8) - (Math.abs(b.rootNote - 60) + Math.abs(b.anchor - 72) / 8)).concat(relZones);
    let done = 0;
    for (const z of order) {
      if (PIANO.gen !== gen) return;                 // another bank was chosen meanwhile
      const rr = [], transfer = [];
      for (const f of z.files) {
        const buf = await ctx.decodeAudioData(await readAssetBytes(B.dir + '/' + f.file));
        const cap = !f.loop && (inst.soundType || 'decaying') === 'decaying' && z.id < 100000;   // key-off samples play to their end
        const L = toI16(buf.getChannelData(0), buf.sampleRate, cap), R = buf.numberOfChannels > 1 ? toI16(buf.getChannelData(1), buf.sampleRate, cap) : L;
        rr.push({ L, R, len: L.length, loop: f.loop }); transfer.push(L.buffer); if (R !== L) transfer.push(R.buffer);
      }
      if (PIANO.gen !== gen) return;
      node.port.postMessage({ t: 'zone', id: z.id, rr }, transfer);
      done++;
      if (done === Math.min(24, zones.length)) toast(B.name + ' ready — loading the rest in the background');
    }
    toast(B.name + ' fully loaded');
  }
  async function startPiano(id) {
    stopPiano();
    const gen = ++PIANO.gen;
    PIANO.loading = (async () => {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const inline = window.CHORDLIGHT_INLINE && window.CHORDLIGHT_INLINE.piano;
      await ctx.audioWorklet.addModule(inline ? URL.createObjectURL(new Blob([inline], { type: 'text/javascript' })) : 'piano-engine.js');
      const node = new AudioWorkletNode(ctx, 'chordlight-piano', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      const gain = ctx.createGain(); gain.gain.value = PIANO.level / 100;
      node.connect(gain);
      gain.connect(ctx.destination);
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      if (PIANO.gen !== gen) { ctx.close(); return; }
      Object.assign(PIANO, { ctx, node, gain, dest, ready: true });
      sendShape();                 // the attack and release the player set, on the new engine
      toast('Loading ' + BANKS[id].name + '…');
      await ctx.resume().catch(() => {});
      await loadBank(ctx, node, id, gen);
    })().catch((err) => { if (PIANO.gen === gen) toast(BANKS[id].name + ' could not load — ' + (err.message || err)); });
    PIANO.loading.finally(() => { if (PIANO.gen === gen) PIANO.loading = null; });
    return PIANO.loading;
  }
  function stopPiano() {
    PIANO.gen++;
    if (PIANO.node) PIANO.node.port.postMessage({ t: 'all' });
    if (PIANO.ctx) { try { PIANO.ctx.close(); } catch { /* gone */ } }
    Object.assign(PIANO, { ctx: null, node: null, gain: null, dest: null, ready: false, loading: null });
  }
  function setPiano(bank) {
    if (!BANKS[bank]) bank = 'off';
    PIANO.bank = bank; PIANO.on = bank !== 'off';
    [...soundSeg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bank === bank)));
    if (PIANO.on) startPiano(bank); else stopPiano();
  }
  soundSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-bank]'); if (!b) return;
    setPiano(b.dataset.bank); store({ sound: PIANO.bank });
  });
  soundVol.addEventListener('input', () => {
    PIANO.level = +soundVol.value;
    if (PIANO.gain) PIANO.gain.gain.setTargetAtTime(PIANO.level / 100, PIANO.ctx.currentTime, 0.02);
    store({ soundLevel: PIANO.level });
  });

  /* ---------- Attack and release, by hand ----------
     Both are in milliseconds and both have a "Natural" position at zero,
     which hands the decision back to the instrument: its own releaseMs where
     the bundle states one, otherwise this engine's time-to-silence by
     register. Attack at zero is the hammer as recorded; above zero the head
     of the sample fades in, which is how you get a swell out of a piano.
     Captured per note at note-on, so moving either slider never jumps a note
     that is already sounding. */
  const shapeLabel = (ms, zeroWord) => (ms > 0 ? ms + ' ms' : zeroWord);
  function sendShape() {
    if (!PIANO.node) return;
    PIANO.node.port.postMessage({ t: 'attack', ms: PIANO.attack });
    PIANO.node.port.postMessage({ t: 'release', ms: PIANO.release });
  }
  function paintShape() {
    attSlider.value = PIANO.attack; relSlider.value = PIANO.release;
    $('attackv').textContent = shapeLabel(PIANO.attack, 'Natural');
    $('releasev').textContent = shapeLabel(PIANO.release, 'Instrument');
  }
  attSlider.addEventListener('input', () => {
    PIANO.attack = +attSlider.value; paintShape(); sendShape(); store({ pianoAttack: PIANO.attack });
  });
  relSlider.addEventListener('input', () => {
    PIANO.release = +relSlider.value; paintShape(); sendShape(); store({ pianoRelease: PIANO.release });
  });
  /* every MIDI message the display sees — played live, or from the
     transport — reaches the piano too */
  if (!BRIDGE) window.__PIANO = PIANO;   // bench
  if (!BRIDGE) window.__MIX = MIX;       // bench
  function pianoMidi(b) {
    if (!PIANO.ready || !PIANO.node) return;
    const cmd = b[0] & 0xF0;
    if (cmd === 0x90 && b[2] > 0) PIANO.node.port.postMessage({ t: 'on', n: b[1], v: b[2] });
    else if (cmd === 0x80 || cmd === 0x90) PIANO.node.port.postMessage({ t: 'off', n: b[1] });
    else if (cmd === 0xB0 && b[1] === 64) PIANO.node.port.postMessage({ t: 'pedal', down: b[2] >= 64 });
    else if (cmd === 0xB0 && (b[1] === 120 || b[1] === 123)) PIANO.node.port.postMessage({ t: 'all' });
  }

  /* ---------- WAV: the mix, uncompressed ----------
     24-bit, 48 kHz, stereo, tapped after the delay so it is exactly what the
     clip hears. Samples are packed to 24-bit as they arrive (288 KB/s) rather
     than kept as floats. The packing runs on the audio thread (wav-tap.js),
     so a busy window can never cost the file a block; where an audio
     worklet cannot load, a ScriptProcessor in the window does it instead. */
  const WAV = { on: false, owner: '', tap: null, chunks: [], frames: 0, base: '' };
  const alsoMidiBtn = $('alsomidi'), alsoWavBtn = $('alsowav'), fmtBadge = $('fmtbadge');
  let alsoMidi = false, alsoWav = false;
  const markAlso = () => {
    alsoMidiBtn.setAttribute('aria-pressed', String(alsoMidi)); alsoMidiBtn.classList.toggle('on', alsoMidi);
    alsoWavBtn.setAttribute('aria-pressed', String(alsoWav)); alsoWavBtn.classList.toggle('on', alsoWav);
    alsoPackBtn.setAttribute('aria-pressed', String(alsoPack)); alsoPackBtn.classList.toggle('on', alsoPack);
  };
  alsoMidiBtn.addEventListener('click', () => { alsoMidi = !alsoMidi; markAlso(); store({ alsoMidi }); });
  alsoWavBtn.addEventListener('click', () => { alsoWav = !alsoWav; markAlso(); store({ alsoWav }); });

  async function startWav(base) {
    if (WAV.on) return;
    if (!MIX.ctx) await buildMix(null);          // Rec without Advanced open: inputs only
    if (!MIX.ctx) throw new Error('no audio graph');
    const ctx = MIX.ctx;
    WAV.chunks = []; WAV.frames = 0; WAV.base = base; WAV.on = true; WAV.owner = MIX.recording ? 'video' : 'rec';
    /* the audio thread first */
    try {
      if (!ctx._wavTap) {
        const inline = window.CHORDLIGHT_INLINE && window.CHORDLIGHT_INLINE.wav;
        ctx._wavTap = ctx.audioWorklet.addModule(inline ? URL.createObjectURL(new Blob([inline], { type: 'text/javascript' })) : 'wav-tap.js');
      }
      await ctx._wavTap;
      if (!WAV.on || ctx !== MIX.ctx) return;
      const node = new AudioWorkletNode(ctx, 'chordlight-wav-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      node.port.onmessage = (e) => { if (!WAV.on || !(e.data instanceof Uint8Array)) return; WAV.chunks.push(e.data); WAV.frames += e.data.length / 6; };
      MIX.delay.connect(node);
      const mute = ctx.createGain(); mute.gain.value = 0;
      node.connect(mute); mute.connect(ctx.destination);
      WAV.tap = node; WAV.mute = mute;
      return;
    } catch { ctx._wavTap = null; /* the window, then */ }
    const tap = ctx.createScriptProcessor(4096, 2, 2);
    tap.onaudioprocess = (e) => {
      if (!WAV.on) return;
      const L = e.inputBuffer.getChannelData(0), R = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : L;
      const out = new Uint8Array(L.length * 6);
      for (let i = 0, o = 0; i < L.length; i++) {
        for (const v of [L[i], R[i]]) {
          const x = Math.max(-1, Math.min(1, v));
          const n = Math.round(x < 0 ? x * 8388608 : x * 8388607);
          out[o++] = n & 0xff; out[o++] = (n >> 8) & 0xff; out[o++] = (n >> 16) & 0xff;
        }
      }
      WAV.chunks.push(out); WAV.frames += L.length;
    };
    MIX.delay.connect(tap);
    const mute = ctx.createGain(); mute.gain.value = 0;   // a ScriptProcessor only runs when routed somewhere
    tap.connect(mute); mute.connect(ctx.destination);
    WAV.tap = tap; WAV.mute = mute;
  }
  function stopWav() {
    if (!WAV.on) return;
    WAV.on = false;
    try { if (WAV.tap && WAV.tap.port) WAV.tap.port.postMessage('stop'); } catch { /* gone */ }
    try { WAV.tap.disconnect(); WAV.mute.disconnect(); } catch { /* graph already closed */ }
    const rate = 48000, bits = 24, ch = 2, dataLen = WAV.frames * ch * bits / 8;
    const head = new DataView(new ArrayBuffer(44));
    const str = (o, t) => { for (let i = 0; i < t.length; i++) head.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); head.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, ch, true);
    head.setUint32(24, rate, true); head.setUint32(28, rate * ch * bits / 8, true);
    head.setUint16(32, ch * bits / 8, true); head.setUint16(34, bits, true);
    str(36, 'data'); head.setUint32(40, dataLen, true);
    const file = new Uint8Array(44 + dataLen);
    file.set(new Uint8Array(head.buffer), 0);
    let o = 44; for (const c of WAV.chunks) { file.set(c, o); o += c.length; }
    WAV.chunks = [];
    const wasOwner = WAV.owner; WAV.owner = '';
    if (WAV.frames > rate / 4) saveBytes(WAV.base + '.wav', file, 'audio/wav');
    if (wasOwner === 'rec' && !MIX.recording && !PACK.on) monitorInputs();   // give the graph back to the meters, or close it
    return file;
  }

  /* ---------- .chordlight: packing ----------
     The mix, compressed (AAC in .m4a where the recorder can, else Opus in
     .weba), recorded alongside the MIDI take from the same graph. With
     + WAV on, the WAV goes inside instead. The MIDI is written from the
     moment Rec started, not from the first note, so the two line up. */
  const AUDIO_CONTAINERS = [
    { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', label: 'AAC' },
    { mime: 'audio/webm;codecs=opus', ext: 'weba', label: 'Opus' },
    { mime: 'audio/webm', ext: 'weba', label: 'Opus' }
  ];
  const AUDIO_CONTAINER = (typeof MediaRecorder !== 'undefined' && AUDIO_CONTAINERS.find((c) => MediaRecorder.isTypeSupported(c.mime)))
    || AUDIO_CONTAINERS[AUDIO_CONTAINERS.length - 1];
  const PACK = { on: false, owner: '', rec: null, chunks: [], start: 0, base: '' };
  const alsoPackBtn = $('alsopack');
  let alsoPack = false;
  alsoPackBtn.addEventListener('click', () => { alsoPack = !alsoPack; markAlso(); store({ alsoPack }); });

  async function startPack(base, owner) {
    if (PACK.on) return;
    if (!MIX.ctx) await buildMix(null);
    if (!MIX.ctx) throw new Error('no audio graph');
    const rec = new MediaRecorder(MIX.dest.stream, { mimeType: AUDIO_CONTAINER.mime, audioBitsPerSecond: 256e3 });
    Object.assign(PACK, { on: true, owner, rec, chunks: [], base, start: 0 });
    rec.ondataavailable = (e) => { if (e.data.size) PACK.chunks.push(e.data); };
    rec.onstart = () => { PACK.start = performance.now() / 1000; };
    rec.start(1000);
  }
  /* `events`/`from`: the MIDI take and its zero. `wav`: bytes to put inside
     instead of the compressed mix, when + WAV is on. */
  function stopPack(events, from, base, wav) {
    if (!PACK.on) return;
    PACK.on = false;
    const rec = PACK.rec, owner = PACK.owner;
    const durationMs = PACK.start ? Math.round((performance.now() / 1000 - PACK.start) * 1000) : 0;
    PACK.rec = null; PACK.owner = '';
    const finish = async () => {
      const mid = writeSMF(events, from);
      const audioBlob = new Blob(PACK.chunks, { type: AUDIO_CONTAINER.mime.split(';')[0] });
      PACK.chunks = [];
      const useWav = !!(wav && wav.length > 44);
      const audioBytes = useWav ? wav : new Uint8Array(await audioBlob.arrayBuffer());
      const audioFile = useWav ? 'mix.wav' : 'mix.' + AUDIO_CONTAINER.ext;
      const offsetMs = Math.round(((PACK.start || from) - from) * 1000);
      const manifest = {
        format: 'chordlight', version: 1,
        app: 'Chordlight 88' + (APP_VERSION ? ' ' + APP_VERSION : ''),
        created: new Date().toISOString(),
        title: CLIP.title || base,
        keyCenter: keysel.value, spelling: spellsel.value, labelMode, accent,
        midi: { file: 'take.mid' },
        audio: audioBytes.length ? { file: audioFile, mime: useWav ? 'audio/wav' : AUDIO_CONTAINER.mime.split(';')[0], offsetMs, durationMs } : null
      };
      const entries = [
        { name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
        { name: 'take.mid', bytes: mid }
      ];
      if (manifest.audio) entries.push({ name: audioFile, bytes: audioBytes });
      const file = zipWrite(entries);
      await saveBytes(base + '.chordlight', file, 'application/zip');
      sessionRecs.unshift({ name: base + '.chordlight', bytes: file });
      refreshRecList();
      if (owner === 'rec' && !MIX.recording) monitorInputs();
    };
    if (rec && rec.state !== 'inactive') { rec.onstop = () => finish().catch((err) => toast('Could not pack — ' + (err.message || err))); rec.stop(); }
    else finish().catch((err) => toast('Could not pack — ' + (err.message || err)));
  }
  const rms = (an, buf) => {
    an.getFloatTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
  };
  const meterWidth = (db) => Math.max(0, Math.min(100, (db + 60) / 60 * 100));   // −60 dBFS … 0

  /* Builds the graph from the chosen inputs. `sysTrack` is the system sound
     a window capture carried, only while recording. Returns nothing; the
     graph lives in MIX until tearDownMix(). */
  async function buildMix(sysTrack) {
    tearDownMix();
    const wantInput = videoSound === 'input' || videoSound === 'both';
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    const dest = ctx.createMediaStreamDestination();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = audioOffset / 1000;
    delay.connect(dest);
    const bed = ctx.createGain();            // keyboard + system: what the duck pushes down
    bed.connect(delay);
    const keyGain = ctx.createGain(); keyGain.gain.value = dbToGain(keyGainDb); keyGain.connect(bed);
    const vocGain = ctx.createGain(); vocGain.gain.value = dbToGain(vocGainDb); vocGain.connect(delay);
    const keyAn = ctx.createAnalyser(); keyAn.fftSize = 512; keyGain.connect(keyAn);
    const vocAn = ctx.createAnalyser(); vocAn.fftSize = 512; vocGain.connect(vocAn);
    Object.assign(MIX, { ctx, dest, delay, bed, keyGain, vocGain, keyAn, vocAn, streams: [] });

    if (sysTrack) ctx.createMediaStreamSource(new MediaStream([sysTrack])).connect(bed);
    MIX.piano = false;
    if (PIANO.on && PIANO.dest && videoSound !== 'none') {
      ctx.createMediaStreamSource(PIANO.dest.stream).connect(bed);
      MIX.piano = true;
    }
    let hasVocal = false;
    if (wantInput || !MIX.recording) {
      /* 'off' is the player's word, not a missing device: the input is never
         opened, so nothing of the room reaches the clip and the built-in
         sound stands alone. */
      const keyStream = audioInput === 'off' ? null : await openInput(audioInput, 'keyboard input');
      if (MIX.ctx !== ctx) { keyStream && keyStream.getTracks().forEach((t) => t.stop()); return; }   // torn down meanwhile
      if (keyStream) { MIX.streams.push(keyStream); ctx.createMediaStreamSource(keyStream).connect(keyGain); }
      if (vocalInput && vocalInput !== audioInput) {
        const vocStream = await openInput(vocalInput, 'vocal input');
        if (MIX.ctx !== ctx) { vocStream && vocStream.getTracks().forEach((t) => t.stop()); return; }
        if (vocStream) { MIX.streams.push(vocStream); ctx.createMediaStreamSource(vocStream).connect(vocGain); hasVocal = true; }
      }
    }
    const kb = new Float32Array(keyAn.fftSize), vb = new Float32Array(vocAn.fftSize);
    let tick = 0;
    const loop = () => {
      if (MIX.ctx !== ctx) return;
      const kdb = rms(keyAn, kb), vdb = hasVocal ? rms(vocAn, vb) : -120;
      keyMeter.style.width = meterWidth(kdb) + '%';
      vocMeter.style.width = meterWidth(vdb) + '%';
      keyMeter.parentElement.classList.toggle('hot', kdb > -3);
      vocMeter.parentElement.classList.toggle('hot', vdb > -3);
      /* the duck: a voice at the mic, not room tone */
      if (hasVocal && duck > 0 && (tick++ % 2 === 0)) {
        const talking = vdb > -42;
        const target = talking ? dbToGain(-duck) : 1;
        bed.gain.setTargetAtTime(target, ctx.currentTime, talking ? 0.02 : 0.25);
        if (talking !== MIX.ducked) { MIX.ducked = talking; duckBadge.classList.toggle('lit', talking); }
      } else if (MIX.ducked) { MIX.ducked = false; bed.gain.setTargetAtTime(1, ctx.currentTime, 0.1); duckBadge.classList.remove('lit'); }
      MIX.raf = requestAnimationFrame(loop);
    };
    MIX.raf = requestAnimationFrame(loop);
  }
  function tearDownMix() {
    cancelAnimationFrame(MIX.raf);
    MIX.streams.forEach((st) => st.getTracks().forEach((t) => t.stop()));
    if (MIX.ctx) { try { MIX.ctx.close(); } catch { /* already gone */ } }
    Object.assign(MIX, { ctx: null, keyGain: null, vocGain: null, bed: null, delay: null, dest: null, keyAn: null, vocAn: null, streams: [], ducked: false, piano: false });
    keyMeter.style.width = '0%'; vocMeter.style.width = '0%';
    duckBadge.classList.remove('lit');
  }
  /* Meters run while Advanced is open and no clip is recording; a clip
     owns the graph for its duration. */
  function monitorInputs() {
    if (MIX.recording || WAV.on || PACK.on) return;
    if (tab === 'sound' && !setup.hidden) { buildMix(null).catch(() => {}); mixNote.textContent = 'Meters live'; }
    else { tearDownMix(); mixNote.textContent = 'Meters run while Sound is open'; }
  }
  [audioInSel, vocalInSel].forEach((sel) => sel.addEventListener('change', monitorInputs));

  /* The frame runs for two customers: a clip being recorded (at the clip's
     rate) and the Preview panel (up to 30 fps). Either keeps it alive; when
     both are gone the canvas is dropped.

     Two hosts. Normally the clip lives on its own thread (clip-worker.js):
     the window sends it a snapshot when something changes and it does the
     drawing and feeds the recorder at a steady rate, so a fast passage can
     never make the clip stutter or the keys fall behind. If this machine
     cannot start that thread, the window draws the clip itself, as before. */
  const PREVIEW = { on: false, box: $('preview'), el: $('previewcanvas'), ctx: null, size: 480, off: null };
  const CW = { worker: null, mode: '', ready: null, grabs: new Map(), gid: 0, picUrl: null, feedGen: 0, feedTimer: 0, safety: 0, size: '' };

  function clipFonts() {
    const inline = window.CHORDLIGHT_INLINE && window.CHORDLIGHT_INLINE.fonts;
    const bytes = (f) => { if (!BRIDGE || !BRIDGE.asset) return null; const b = BRIDGE.asset(`fonts/${f}.woff2`); return b ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : null; };
    return [['Inter', 400, 'inter-400'], ['Inter', 500, 'inter-500'], ['Inter', 600, 'inter-600'], ['Inter', 700, 'inter-700'],
      ['JetBrains Mono', 400, 'jetbrains-mono-400'], ['JetBrains Mono', 500, 'jetbrains-mono-500'], ['JetBrains Mono', 600, 'jetbrains-mono-600'],
      ['Barlow Condensed', 600, 'barlow-condensed-600'], ['Barlow Condensed', 700, 'barlow-condensed-700']]
      .map(([family, weight, f]) => ({ family, weight, data: bytes(f), url: (inline && inline[f]) || new URL(`fonts/${f}.woff2`, location.href).href }));
  }
  /* decided once: the worker if it starts and its fonts load, else the window */
  function clipMode() {
    if (CW.ready) return CW.ready;
    CW.ready = new Promise((resolve) => {
      const useMain = () => {
        if (CW.mode) return;
        if (CW.worker) { try { CW.worker.terminate(); } catch { /* gone */ } }
        CW.worker = null; CW.mode = 'main'; resolve('main');
      };
      if (!CLIPDRAW || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function'
        || typeof MediaStreamTrackGenerator !== 'function' || !HTMLCanvasElement.prototype.transferControlToOffscreen) { useMain(); return; }
      /* ways to start the thread, tried in turn: the bench's inline copy, the
         file beside this page, the same file read by the app and run from
         memory. If none starts and loads its fonts, the window draws. */
      const fromText = (txt) => new Worker(URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })));
      const inline = window.CHORDLIGHT_INLINE && window.CHORDLIGHT_INLINE.worker;
      const ways = inline ? [() => fromText(inline)] : [
        () => new Worker('clip-worker.js'),
        () => {
          const a = BRIDGE && BRIDGE.asset && BRIDGE.asset('clip-draw.js'), b = BRIDGE && BRIDGE.asset && BRIDGE.asset('clip-worker.js');
          if (!a || !b) throw new Error('no assets');
          const dec = new TextDecoder();
          return fromText(dec.decode(a) + '\n' + dec.decode(b));
        }
      ];
      let timer = 0;
      const next = () => {
        clearTimeout(timer);
        if (CW.worker) { try { CW.worker.terminate(); } catch { /* gone */ } CW.worker = null; }
        const way = ways.shift();
        if (!way) { useMain(); return; }
        try { CW.worker = way(); } catch { next(); return; }
        timer = setTimeout(next, 6000);
        CW.worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); if (!CW.mode) next(); };
        CW.worker.onmessage = onMsg;
        CW.worker.postMessage({ t: 'fonts', list: clipFonts() });
      };
      const onMsg = (e) => {
        const m = e.data || {};
        if (m.t === 'ready') {
          clearTimeout(timer);
          if (CW.mode) return;
          if (m.ok && m.gen) { CW.mode = 'worker'; resolve('worker'); } else next();
        } else if (m.t === 'grab') {
          const cb = CW.grabs.get(m.id); CW.grabs.delete(m.id); if (cb) cb(m.blob);
        }
      };
      next();
    });
    return CW.ready;
  }

  /* worker: what to draw, sent whenever the window repaints (and checked
     four times a second for anything that changed the look without a note) */
  function clipPush() {
    if (!FRAME.active || CW.mode !== 'worker') return;
    CW.worker.postMessage({ t: 'snap', S: clipSnap() });
    videoFeed();
    const want = (backdrop === 'picture' && picture && picture.kind === 'picture') ? picture.url : '';
    if (want !== CW.picUrl) sendPicture();
  }
  async function sendPicture() {
    const url = (backdrop === 'picture' && picture && picture.kind === 'picture') ? picture.url : '';
    CW.picUrl = url;
    let bitmap = null;
    if (url) {
      try {
        const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
        bitmap = await createImageBitmap(im);
      } catch { bitmap = null; }
    }
    if (CW.picUrl !== url || !CW.worker) { if (bitmap) bitmap.close(); return; }   // changed again meanwhile
    CW.worker.postMessage({ t: 'pic', key: picKeyNow(), bitmap }, bitmap ? [bitmap] : []);
  }
  /* worker: a video backdrop is decoded here and handed over frame by frame */
  function videoFeed() {
    const want = FRAME.active && CW.mode === 'worker' && backdrop === 'video' && picture && picture.kind === 'video';
    if (want === !!CW.feedTimer) return;
    clearInterval(CW.feedTimer); CW.feedTimer = 0;
    const gen = ++CW.feedGen;
    if (!want) { CW.worker.postMessage({ t: 'video', bitmap: null }); return; }
    let busy = false;
    CW.feedTimer = setInterval(() => {
      if (busy || gen !== CW.feedGen || bgVideo.readyState < 2 || !bgVideo.videoWidth) return;
      busy = true;
      createImageBitmap(bgVideo).then((bm) => {
        busy = false;
        if (gen === CW.feedGen && CW.worker) CW.worker.postMessage({ t: 'video', bitmap: bm }, [bm]); else bm.close();
      }, () => { busy = false; });
    }, 1000 / (FRAME.rec ? FRAME.fps : 30));
  }

  /* the window's own loop — the fallback host */
  function frameLoop(ts) {
    if (!FRAME.rec && !PREVIEW.on) { FRAME.raf = 0; return; }
    const fps = FRAME.rec ? FRAME.fps : 30;
    if (ts - FRAME.last >= 1000 / fps - 1) {
      FRAME.last = ts;
      try {
        const drew = drawFrame();
        if (drew && PREVIEW.on && PREVIEW.ctx) PREVIEW.ctx.drawImage(FRAME.canvas, 0, 0, PREVIEW.el.width, PREVIEW.el.height);
        /* a still picture is still a picture: the recorder gets a frame at
           least four times a second even when nothing was redrawn */
        if (!drew && FRAME.rec && FRAME.track && ts - FRAME.fed > 250) { FRAME.track.requestFrame(); FRAME.fed = ts; }
        if (drew) FRAME.fed = ts;
      } catch { /* one bad frame */ }
    }
    FRAME.raf = requestAnimationFrame(frameLoop);
  }
  const runFrames = () => { if (!FRAME.raf) FRAME.raf = requestAnimationFrame(frameLoop); };

  async function ensureFrame() {
    const [W, H] = frameSize();
    FRAME.active = true;
    const mode = await clipMode();
    if (mode === 'worker') {
      FRAME.W = W; FRAME.H = H;
      if (CW.size !== W + 'x' + H) { CW.size = W + 'x' + H; CW.worker.postMessage({ t: 'size', W, H }); }
      clipPush();
      if (!CW.safety) CW.safety = setInterval(clipPush, 250);
      if (backdrop === 'video' && picture && picture.kind === 'video') bgVideo.play().catch(() => {});
      return;
    }
    if (!FRAME.canvas || FRAME.W !== W || FRAME.H !== H) {
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      Object.assign(FRAME, { canvas, ctx: canvas.getContext('2d', { alpha: false }), W, H, last: 0 });
      if (CLIPDRAW) CLIPDRAW.reset();
    }
    try {
      await document.fonts.load(`700 ${Math.round(132 * H / 1080)}px "Barlow Condensed"`);
      await document.fonts.load('500 14px "JetBrains Mono"');
      const F = TITLE_FONTS[CLIP.font] || TITLE_FONTS.inter;
      await document.fonts.load(`${F.weight} ${Math.round(CLIP.size * H / 1080)}px ${F.css}`);
    } catch { /* system fonts then */ }
    if (backdrop === 'picture' && picture && picture.kind === 'picture' && (!FRAME.pic || FRAME.pic.src !== picture.url)) {
      await new Promise((ok) => { const im = new Image(); im.onload = () => { FRAME.pic = im; if (CLIPDRAW) CLIPDRAW.reset(); ok(); }; im.onerror = () => ok(); im.src = picture.url; });
    }
    if (backdrop === 'video' && picture && picture.kind === 'video') bgVideo.play().catch(() => {});
  }
  /* nothing needs a frame any more: let the memory go */
  function releaseFrame() {
    FRAME.active = false;
    if (CW.mode === 'worker') {
      clearInterval(CW.safety); CW.safety = 0;
      videoFeed();
      CW.worker.postMessage({ t: 'free' }); CW.size = ''; CW.picUrl = null;
      return;
    }
    cancelAnimationFrame(FRAME.raf); FRAME.raf = 0; FRAME.canvas = null; FRAME.ctx = null; FRAME.pic = null;
    if (CLIPDRAW) CLIPDRAW.free();
  }
  /* a new picture or video was chosen while the clip is live */
  function clipPictureChanged() {
    FRAME.pic = null; CW.picUrl = null;
    if (CLIPDRAW) CLIPDRAW.reset();
    if (FRAME.active) { clearInterval(CW.feedTimer); CW.feedTimer = 0; ensureFrame(); }
  }
  async function startFrames(fps) {
    await ensureFrame();
    FRAME.rec = true; FRAME.fps = fps; FRAME.fed = 0;
    if (CW.mode === 'worker') {
      const gen = new MediaStreamTrackGenerator({ kind: 'video' });
      clearInterval(CW.feedTimer); CW.feedTimer = 0; videoFeed();    // the feed follows the clip's rate
      CW.worker.postMessage({ t: 'snap', S: clipSnap() });
      CW.worker.postMessage({ t: 'rec', writable: gen.writable, fps }, [gen.writable]);
      FRAME.track = gen;
      return new MediaStream([gen]);
    }
    if (CLIPDRAW) CLIPDRAW.reset();
    drawFrame();
    runFrames();
    const stream = FRAME.canvas.captureStream(fps);
    FRAME.track = stream.getVideoTracks()[0];
    return stream;
  }
  function stopFrames() {
    FRAME.rec = false; FRAME.track = null;
    PREVIEW.box.classList.remove('rec');
    if (CW.mode === 'worker') { CW.worker.postMessage({ t: 'stop' }); clearInterval(CW.feedTimer); CW.feedTimer = 0; videoFeed(); }
    if (!PREVIEW.on) releaseFrame();
  }

  /* ---------- Preview: what the clip will look like, live ---------- */
  const previewBtn = $('previewbtn');
  function sizePreview() {
    const w = PREVIEW.size, h = Math.round(w * 9 / 16), dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    PREVIEW.box.style.setProperty('--pw', w + 'px');
    if (CW.mode === 'worker') {
      if (!PREVIEW.off) {
        PREVIEW.off = PREVIEW.el.transferControlToOffscreen();
        CW.worker.postMessage({ t: 'preview', canvas: PREVIEW.off, w: pw, h: ph, on: PREVIEW.on }, [PREVIEW.off]);
      } else CW.worker.postMessage({ t: 'preview', w: pw, h: ph, on: PREVIEW.on });
    } else {
      PREVIEW.el.width = pw; PREVIEW.el.height = ph;
      PREVIEW.ctx = PREVIEW.el.getContext('2d', { alpha: false });
    }
    $('previewlabel').textContent = `Clip preview · ${FRAME.W || frameSize()[0]}×${FRAME.H || frameSize()[1]}${CW.mode === 'worker' ? ' · own thread' : ''}`;
  }
  async function showPreview(v) {
    PREVIEW.on = v;
    PREVIEW.box.hidden = !v;
    previewBtn.setAttribute('aria-pressed', String(v));
    previewBtn.classList.toggle('on', v);
    if (v) {
      await ensureFrame(); sizePreview();
      if (CW.mode !== 'worker') {
        if (CLIPDRAW) CLIPDRAW.reset();
        drawFrame(); if (PREVIEW.ctx && FRAME.canvas) PREVIEW.ctx.drawImage(FRAME.canvas, 0, 0, PREVIEW.el.width, PREVIEW.el.height);
        runFrames();
      }
    } else {
      if (CW.mode === 'worker') CW.worker.postMessage({ t: 'preview', on: false });
      if (!FRAME.rec) releaseFrame();
    }
  }
  previewBtn.addEventListener('click', () => showPreview(!PREVIEW.on));
  $('previewclose').addEventListener('click', () => showPreview(false));
  $('previewsize').addEventListener('click', () => {
    PREVIEW.size = PREVIEW.size === 360 ? 480 : PREVIEW.size === 480 ? 720 : 360;
    sizePreview();
  });
  /* drag it anywhere by its header */
  (function dragPreview() {
    const head = $('previewhead'); let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = PREVIEW.box.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const b = PREVIEW.box;
      b.style.left = Math.max(0, Math.min(innerWidth - b.offsetWidth, e.clientX - drag.dx)) + 'px';
      b.style.top = Math.max(0, Math.min(innerHeight - b.offsetHeight, e.clientY - drag.dy)) + 'px';
      b.style.right = 'auto'; b.style.bottom = 'auto';
    });
    head.addEventListener('pointerup', () => { drag = null; });
  })();
  /* bench build: look at a frame (a data URL, from whichever host draws) */
  if (!BRIDGE) window.chordlightFrame = () => new Promise((ok) => {
    if (CW.mode === 'worker') {
      const id = ++CW.gid;
      CW.grabs.set(id, (blob) => { if (!blob) { ok(null); return; } const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
      CW.worker.postMessage({ t: 'grab', id });
    } else ok(FRAME.canvas ? FRAME.canvas.toDataURL('image/png') : null);
  });
  if (!BRIDGE) window.chordlightHost = () => CW.mode;
  /* bench build, lesson engine: draw the clip now, on the window's own host,
     and hand back the frame only when it changed (null when it did not) */
  if (!BRIDGE) window.chordlightLesson = {
    start: async () => { await ensureFrame(); return CW.mode; },
    frame: (type) => {
      if (paintTimer) paint();
      return drawFrame() ? FRAME.canvas.toDataURL(type || 'image/jpeg', 0.93) : null;
    }
  };
  if (!BRIDGE) window.chordlightClip = CLIP;   // bench build: poke the clip look

  /* System sound — what the keyboard is triggering in a DAW or Kontakt — is
     the one thing a drawn frame cannot carry. On Windows the loopback comes
     from the desktop capturer, asked for sound only; if that is refused, a
     screen capture is opened for its audio and its picture thrown away. */
  async function systemAudio() {
    if (!BRIDGE || !systemSound) return null;   // never asks for the display on a Mac
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video: false });
      const t = st.getAudioTracks()[0]; if (t) return { track: t, stop: () => st.getTracks().forEach((x) => x.stop()) };
    } catch { /* next */ }
    /* The picture of this request is thrown away on the very next line — all
       it is carrying is the loopback audio — so it asks for the SCREEN, not
       this window. Window capture of a frameless window trips some graphics
       drivers ("Error starting video capture") and takes the renderer down
       with it; 2.0.4 switched this to 'window' while fixing the Mac, which
       never asks for the display at all, so nothing on a Mac could show what
       it did to Windows. It is back to 'screen', which is the robust source
       and was what shipped up to 2.0.3.

       The mark is the safety net. A renderer that dies inside the await
       below never reaches a catch, so the only way to know it happened is to
       write something before and look for it at the next launch. Two deaths
       and System is withdrawn on this machine for good. */
    try {
      markCapture(true);
      BRIDGE.captureKind('screen');
      const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      st.getVideoTracks().forEach((t) => t.stop());
      markCapture(false);
      const t = st.getAudioTracks()[0]; if (t) return { track: t, stop: () => st.getTracks().forEach((x) => x.stop()) };
      st.getTracks().forEach((x) => x.stop());
    } catch { markCapture(false); }
    return null;
  }

  async function buildStream() {
    const wantSystem = systemSound && (videoSound === 'system' || videoSound === 'both');
    const Q = QUALITY[videoQuality] || QUALITY.good;
    const picture = await startFrames(Q.fps);
    const tracks = [picture.getVideoTracks()[0]];
    let sys = null;
    if (wantSystem) { sys = await systemAudio(); if (!sys) toast('No system sound on this machine — inputs only'); }
    MIX.recording = true;
    await buildMix(sys ? sys.track : null);
    const audioTrack = MIX.dest.stream.getAudioTracks()[0];
    const hasSound = !!sys || MIX.streams.length > 0 || MIX.piano;
    if (hasSound && audioTrack) tracks.push(audioTrack);
    else if (videoSound !== 'none') toast('No sound source could be opened — picture only (pick Grand, SP or EP on the title bar for a built-in sound)');
    const stream = new MediaStream(tracks);
    const stopAll = () => {
      stopFrames();
      picture.getTracks().forEach((t) => t.stop());
      if (sys) sys.stop();
      MIX.recording = false;
      tearDownMix();
      monitorInputs();
    };
    return { stream, stopAll };
  }

  async function startVideo() {
    let built;
    try { built = await buildStream(); }
    catch (err) { MIX.recording = false; monitorInputs(); toast('Could not start video — ' + (err.message || err)); return; }
    const { stream, stopAll } = built;
    const hasAudio = stream.getAudioTracks().length > 0;
    /* a clip with no sound must not ask for an audio codec */
    const mime = hasAudio ? CONTAINER.mime : CONTAINER.mime.replace(/,(mp4a\.40\.2|opus)/, '');
    VID.chunks = [];
    const Q = QUALITY[videoQuality] || QUALITY.good;
    const base = `Chordlight video ${stamp()}`;
    if (TRIAL.on && BRIDGE && BRIDGE.trialTake) BRIDGE.trialTake();
    VID.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Q.vbps, audioBitsPerSecond: Q.abps });
    VID.rec.ondataavailable = (e) => { if (e.data.size) VID.chunks.push(e.data); };
    VID.rec.onstop = async () => {
      const wav = (WAV.on && WAV.owner === 'video') ? stopWav() : null;
      if (PACK.on && PACK.owner === 'video') stopPack(REC.events.slice(), REC.start, base, wav);
      if (REC.on && REC.base === base) stopRec();
      stopAll();
      const blob = new Blob(VID.chunks, { type: CONTAINER.mime.split(';')[0] });
      saveBytes(`${base}.${CONTAINER.ext}`, new Uint8Array(await blob.arrayBuffer()), CONTAINER.mime.split(';')[0]);
    };
    /* the same take, on the side: what you played, and the sound uncompressed */
    if ((alsoMidi || alsoPack) && !REC.on) startRec(base, false);
    if (alsoWav) startWav(base).catch((err) => toast('No WAV — ' + (err.message || err)));
    if (alsoPack) startPack(base, 'video').catch((err) => toast('No Chordlight file — ' + (err.message || err)));
    VID.rec.start(1000);
    if (BRIDGE && BRIDGE.recBusy) BRIDGE.recBusy(true);
    PREVIEW.box.classList.add('rec');
    VID.start = performance.now() / 1000;
    vidBtn.setAttribute('aria-pressed', 'true');
    vidBtn.title = 'Stop and save the video';
    vidFace();
    VID.timer = setInterval(vidFace, TRIAL.on ? 200 : 500);
  }
  function stopVideo() {
    clearInterval(VID.timer);
    if (BRIDGE && BRIDGE.recBusy) BRIDGE.recBusy(false);
    vidBtn.setAttribute('aria-pressed', 'false');
    vidBtn.textContent = '◉ Video';
    vidBtn.title = 'Record a video of this window';
    if (VID.rec && VID.rec.state !== 'inactive') VID.rec.stop();
    VID.rec = null;
  }
  vidBtn.addEventListener('click', () => (VID.rec ? stopVideo() : startVideo()));

  if (BRIDGE) {
    $('recfolder').hidden = false;
    $('recfolder').addEventListener('click', () => BRIDGE.openRecordings());
  }

  /* ================= stage ================= */
  const stageBtn = $('stagebtn'), stageExit = $('stageexit');
  let hintTimer = 0;
  function onStage(v) {
    document.body.classList.toggle('onstage', v);
    stageExit.hidden = !v;
    if (v) hint();
  }
  function hint() {
    document.body.classList.add('hint');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => document.body.classList.remove('hint'), 1800);
  }
  function toggleStage() {
    if (BRIDGE) { BRIDGE.windowControl('fullscreen'); return; }
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  stageBtn.addEventListener('click', toggleStage);
  stageExit.addEventListener('click', toggleStage);
  if (BRIDGE) BRIDGE.onFullscreen(onStage);
  else document.addEventListener('fullscreenchange', () => onStage(!!document.fullscreenElement));
  window.addEventListener('mousemove', () => { if (document.body.classList.contains('onstage')) hint(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('onstage')) toggleStage();
  });

  /* ================= backdrop ================= */
  const backdropSel = $('backdrop'), tintEl = $('tint'), tintV = $('tintv'), picBadge = $('picbadge');
  const tintFace = () => { tintV.textContent = tint + '%'; };
  function picFace() {
    picBadge.hidden = !!picture;
    picBadge.textContent = 'No picture or video yet — choose one';
  }
  backdropSel.addEventListener('change', () => {
    backdrop = backdropSel.value;
    store({ backdrop });
    const need = backdrop === 'picture' ? 'picture' : backdrop === 'video' ? 'video' : null;
    if (need && (!picture || picture.kind !== need)) $('picfile').click();
    paintBackdrop(); paint();
  });
  tintEl.addEventListener('input', () => { tint = +tintEl.value; tintFace(); store({ backdropTint: tint }); paintBackdrop(); paint(); });
  (function buildTintSwatches() {
    const box = $('tintswatches');
    Object.entries(TINTS).forEach(([k, T]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.k = k; b.title = T.label; b.setAttribute('aria-label', T.label);
      b.style.background = T.c;
      b.addEventListener('click', () => { tintColor = k; markTint(); store({ backdropTintColor: k }); paintBackdrop(); paint(); });
      box.appendChild(b);
    });
  })();
  const markTint = () => [...$('tintswatches').children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === tintColor)));
  $('pickpic').addEventListener('click', () => $('picfile').click());
  $('picfile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const ext = (f.name.split('.').pop() || 'png').toLowerCase();
      const isVideo = /^video\//.test(f.type) || ['mp4', 'm4v', 'webm', 'mov'].includes(ext);
      if (BRIDGE) picture = await BRIDGE.setBackdropFile(f);
      else if (isVideo) picture = { kind: 'video', url: URL.createObjectURL(f), mime: f.type };
      else picture = { kind: 'picture', url: await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); }) };
      backdrop = picture.kind; backdropSel.value = backdrop;
      store({ backdrop });
      picFace(); paintBackdrop();
      clipPictureChanged();
      /* the pop-outs fetch the new picture themselves */
      if (BRIDGE) BRIDGE.publish(Object.assign({}, lastPublished || {}, { backdrop, tint, tintColor, pictureChanged: true }));
      paint();
      toast('Backdrop  ' + f.name);
    } catch (err) {
      toast('Could not use that picture — ' + (err.message || err));
    }
  });

  /* ================= window chrome and pop-outs ================= */
  const CARD_OF = { chord: 'chordcard', number: 'numcard', keys: 'keycard' };

  function markPop(btn, open) {
    btn.textContent = open ? '⇲' : '⇱';
    btn.title = open ? 'Dock it back' : 'Pop it out';
    btn.classList.toggle('on', open);
    if (!BRIDGE) return;                       // browser preview floats the card instead
    const which = btn.dataset.pop;
    const card = $(CARD_OF[which]);
    if (card) card.classList.toggle('popped', open);
    if (which === 'chord') {
      $('chordeyebrow').textContent = open ? 'Chord · in its own window' : 'Chord';
    } else if (which === 'number') {
      numEyebrow.textContent = open
        ? 'Number · in its own window'
        : 'Number · key of ' + keysel.value;
    } else if (which === 'keys') {
      $('keyeyebrow').textContent = open ? 'Keys · in their own window' : 'Keys · 88 · A0 — C8';
    }
  }

  if (BRIDGE) {
    document.querySelectorAll('[data-win]').forEach((b) => {
      b.addEventListener('click', () => BRIDGE.windowControl(b.dataset.win));
    });
    document.querySelectorAll('[data-pop]').forEach((b) => {
      b.addEventListener('click', async () => {
        const card = $(CARD_OF[b.dataset.pop]);
        const r = card ? card.getBoundingClientRect() : null;
        const docked = r ? {
          width: r.width, height: r.height,
          x: window.screenX + r.left, y: window.screenY + r.top
        } : null;
        markPop(b, await BRIDGE.togglePopout(b.dataset.pop, docked));
      });
    });
    BRIDGE.onPopoutChanged(({ name, open }) => {
      const b = document.querySelector(`[data-pop="${name}"]`);
      if (b) markPop(b, open);
    });
  } else {
    document.querySelectorAll('[data-pop]').forEach((b) => {
      b.addEventListener('click', () => {
        const card = $(CARD_OF[b.dataset.pop]);
        markPop(b, card.classList.toggle('floating'));
      });
    });
    let drag = null;
    document.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.card.floating');
      if (!card || e.target.closest('select,button')) return;
      const r = card.getBoundingClientRect();
      drag = { card, dx: e.clientX - r.left, dy: e.clientY - r.top };
      card.setPointerCapture(e.pointerId);
    });
    document.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const c = drag.card;
      c.style.setProperty('--fx', Math.max(8, Math.min(innerWidth - c.offsetWidth - 8, e.clientX - drag.dx)) + 'px');
      c.style.setProperty('--fy', Math.max(8, Math.min(innerHeight - c.offsetHeight - 8, e.clientY - drag.dy)) + 'px');
    });
    document.addEventListener('pointerup', () => { drag = null; });
  }

  /* ================= settings ================= */
  let settingsCache = {};
  let APPINFO = null;
  function store(patch) {
    Object.assign(settingsCache, patch);
    if (BRIDGE) BRIDGE.setSettings(patch);
    else { try { localStorage.setItem('chordlight.settings', JSON.stringify(settingsCache)); } catch { /* ignore */ } }
  }

  /* ---------- About screen ---------- */
  const about = $('about'), aboutbtn = $('aboutbtn');
  const openAbout = (open) => {
    about.hidden = !open;
    aboutbtn.classList.toggle('on', open);
    if (open) $('aboutclose').focus(); else aboutbtn.focus();
  };
  aboutbtn.addEventListener('click', () => openAbout(about.hidden));
  $('aboutclose').addEventListener('click', () => openAbout(false));
  about.addEventListener('click', (e) => { if (e.target === about) openAbout(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !about.hidden) openAbout(false);
  }, true);
  about.querySelectorAll('[data-link]').forEach((b) => {
    b.addEventListener('click', () => BRIDGE && BRIDGE.openExternal(b.dataset.link));
  });

  /* ---------- Licensing (License Integration Standard §7) ----------
     The interface follows one flag. The activation screen covers the app
     until a proof verifies; About shows the status and Deactivate. */
  const actScrim = $('activate'), keyInput = $('keyinput'), actBtn = $('activatebtn'), actMsg = $('actmsg');
  const licRow = $('licencerow'), licBadge = $('licbadge'), aboutLic = $('aboutlicence'), aboutLicMsg = $('aboutlicmsg');
  let LIC = { licensed: true, free: true };
  const whenDate = (ms) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  function paintLicense(st) {
    LIC = st || LIC;
    if (TRIAL.on) { paintTrial(TRIAL.st); return; }
    if (LIC.free) {
      aboutLic.textContent = 'Ships unlicensed — no activation, no account';
      $('privacynote').textContent = 'Chordlight makes no network requests of any kind. It never reads your sessions or presets, never sends audio or MIDI anywhere, and contains no analytics or telemetry. Updates are handled by Amanorsac Hub, not by this app.';
      licRow.hidden = true; actScrim.hidden = true; licBadge.hidden = true;
      return;
    }
    actScrim.hidden = !!LIC.licensed;
    if (!LIC.licensed && !about.hidden) openAbout(false);
    actBtn.disabled = !!LIC.busy;
    actMsg.textContent = LIC.message || '';
    licBadge.hidden = !(LIC.licensed && LIC.offlineSoon);
    aboutLic.textContent = LIC.licensed
      ? `Licensed to this computer · ${LIC.keyMasked}${LIC.graceUntil ? ' · works offline until ' + whenDate(LIC.graceUntil) : ''}`
      : (LIC.hasKey ? 'Key saved, not yet verified — connect to the internet' : 'Not activated');
    licRow.hidden = !LIC.hasKey;
    aboutLicMsg.textContent = LIC.licensed ? '' : (LIC.message || '');
    $('deactivate').disabled = !!LIC.busy;
    if (!LIC.licensed && !LIC.busy) setTimeout(() => keyInput.focus(), 50);
  }
  keyInput.addEventListener('input', () => {
    /* XXXX-XXXX-XXXX-XXXX as they type; the server uppercases too */
    const raw = keyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    keyInput.value = raw.replace(/(.{4})(?=.)/g, '$1-');
  });
  const doActivate = async () => { if (!BRIDGE) return; paintLicense(await BRIDGE.licenseActivate(keyInput.value)); };
  actBtn.addEventListener('click', doActivate);
  keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doActivate(); });
  actScrim.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => BRIDGE && BRIDGE.openExternal(b.dataset.link)));
  $('deactivate').addEventListener('click', async () => { if (!BRIDGE) return; paintLicense(await BRIDGE.licenseDeactivate()); });
  if (BRIDGE) {
    BRIDGE.onLicense(paintLicense);
    BRIDGE.licenseStatus().then(paintLicense).catch(() => {});
  }

  /* ---------- Free Trial edition ----------
     The name says Free Trial everywhere — title bar, About, the window title
     and a small mark in every recorded clip. A badge counts the days down.
     When the trial ends the main process closes this window itself. */
  function paintTrial(st) {
    if (st) TRIAL.st = st;
    if (!TRIAL.on) return;
    st = TRIAL.st || { daysLeft: 7 };
    document.title = 'Chordlight 88 Free Trial';
    $('trialtag').hidden = false;
    const left = st.daysLeft || 0;
    const badge = $('trialbadge');
    badge.hidden = false;
    badge.textContent = `Free Trial · ${left} day${left === 1 ? '' : 's'} left`;
    badge.classList.toggle('warn', left <= 2);
    badge.title = st.endsAt ? `The free trial ends ${whenDate(st.endsAt)}. Recordings stop at 1 minute.` : 'Recordings stop at 1 minute.';
    $('abouttitle').textContent = 'Chordlight 88 Free Trial';
    aboutLic.textContent = st.endsAt
      ? `Free trial · ${left} day${left === 1 ? '' : 's'} left · ends ${whenDate(st.endsAt)} · recordings up to 1 minute`
      : 'Free trial · 7 days · recordings up to 1 minute';
    $('privacynote').textContent = 'The free trial makes no network requests of any kind — the 7 days are counted on this computer. It never reads your sessions or presets, never sends audio or MIDI anywhere, and contains no analytics or telemetry. Updates are handled by Amanorsac Hub, not by this app.';
    licRow.hidden = true; actScrim.hidden = true; licBadge.hidden = true;
    $('buyfull').hidden = false;
  }
  $('trialbadge').addEventListener('click', () => BRIDGE && BRIDGE.openExternal('https://amanorsac.studio'));
  if (BRIDGE && BRIDGE.onRecovered) BRIDGE.onRecovered((r) => {
    const why = r && r.reason === 'oom' ? 'it ran out of memory' : 'the recorder stopped unexpectedly';
    toast(`Chordlight restarted — ${why}. Your settings are kept.` + (r && r.file ? ' A log was saved in About › Logs.' : ''), 9000);
  });
  if (BRIDGE && BRIDGE.trialStatus) {
    BRIDGE.trialStatus().then((st) => {
      if (!st || !st.trial) return;
      TRIAL.on = true; TRIAL.max = st.maxRecSeconds || 60;
      paintTrial(st); paint();
    }).catch(() => {});
    if (BRIDGE.onTrial) BRIDGE.onTrial((st) => paintTrial(st));
  } else if (TRIAL.on) paintTrial(null);

  /* ---------- Setup, in tabs ----------
     Play, Sound, Clip, Look. The drawer remembers which one you were on, so
     a player who lives in Clip is not handed MIDI ports every time. The mix
     meters are expensive — they hold inputs open — so they follow the Sound
     tab rather than the drawer: open it and they run, leave it and they stop. */
  const setup = $('setup'), setupbtn = $('setupbtn'), setupTabs = $('setuptabs');
  const TABS = ['play', 'sound', 'clip', 'look'];
  let tab = 'play';
  function showTab(which) {
    tab = TABS.includes(which) ? which : 'play';
    for (const b of setupTabs.querySelectorAll('button[data-tab]')) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-selected', String(on));
    }
    for (const t of TABS) $('tab-' + t).hidden = t !== tab;
  }
  setupTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    showTab(b.dataset.tab);
    store({ setupTab: tab });
    monitorInputs();
  });
  setupbtn.addEventListener('click', () => {
    const open = setup.hidden;
    setup.hidden = !open;
    setupbtn.setAttribute('aria-expanded', String(open));
    setupbtn.classList.toggle('on', open);
    monitorInputs();
  });

  $('modebtn').addEventListener('click', () => { mode = mode === 'dark' ? 'light' : 'dark'; applyTheme(); });
  ksize.addEventListener('input', (e) => {
    bed.style.setProperty('--kh', e.target.value + 'px');
    store({ keySize: +e.target.value });
    paint();
  });
  keysel.addEventListener('change', () => { store({ keyCenter: keysel.value }); paint(); });
  spellsel.addEventListener('change', () => { store({ spelling: spellsel.value }); paint(); });
  chsel.addEventListener('change', () => store({ midiChannel: chsel.value }));
  portSel.addEventListener('change', () => store({ midiPort: portSel.value }));
  outSel.addEventListener('change', () => {
    silence();
    outPort = null;
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess({ sysex: false }).then((acc) => {
        outPort = [...acc.outputs.values()].find((o) => o.name === outSel.value) || null;
      }).catch(() => { outPort = null; });
    }
    store({ midiOut: outSel.value });
  });
  velSel.addEventListener('change', () => {
    velocity = velSel.value === 'on';
    store({ velocity: velSel.value });
    paint();
  });
  lightSel.addEventListener('change', () => {
    keyLight = lightSel.value;
    store({ keyLight });
    paint();
  });
  pedalSel.addEventListener('change', () => {
    pedalMode = pedalSel.value;
    if (pedalMode === 'all') ringing.clear();
    if (pedalMode === 'ignore') setSustain(false);
    store({ pedalMode });
    paint();
  });
  $('labelseg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    labelMode = b.dataset.mode;
    [...e.currentTarget.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    store({ labelMode });
    paint();
  });

  let APP_VERSION = '';
  async function boot() {
    if (BRIDGE) {
      settingsCache = await BRIDGE.getSettings();
      const info = await BRIDGE.appInfo();
      APP_VERSION = info.version;
      /* a double-clicked .chordlight or .mid, at launch or while running */
      BRIDGE.onOpenFile(async ({ name, bytes }) => {
        try { await loadAny(bytes, name, false); toast('Cued  ' + name); }
        catch (err) { toast('Could not open ' + name + ' — ' + (err.message || err)); }
      });
      APPINFO = info;
      if (info.platform === 'darwin') document.body.classList.add('mac');
      if (info.systemSound === false && !settingsCache.videoSound) videoSound = 'input';   // a Mac's first run: Inputs
      const v = document.querySelector('.wordmark span');
      if (v) v.textContent = 'Amanorsac Studio · v' + info.version;
      $('aboutversion').textContent = info.version;
      $('aboutruntime').textContent = 'Electron ' + info.electron + ' · Chromium ' + info.chrome
        + (info.edition === 'legacy' ? ' · build for older Macs' : '');
      $('aboutprefs').textContent = info.preferencesFile;
      $('aboutsys').textContent = info.systemSound
        ? 'Available — Video sound › System records what is playing'
        : 'Not on macOS in this version (Apple needs macOS 14.2+ and a newer runtime — coming in 2.1). Inputs and the built-in clip record as usual.';
      $('openlogs').addEventListener('click', () => BRIDGE.openLogs && BRIDGE.openLogs());
    } else {
      try { settingsCache = JSON.parse(localStorage.getItem('chordlight.settings') || '{}'); } catch { settingsCache = {}; }
    }
    if (ACCENTS[settingsCache.accent]) accent = settingsCache.accent;
    if (settingsCache.mode === 'light' || settingsCache.mode === 'dark') mode = settingsCache.mode;
    if (settingsCache.keyCenter) keysel.value = settingsCache.keyCenter;
    if (settingsCache.spelling) spellsel.value = settingsCache.spelling;
    if (settingsCache.midiChannel) chsel.value = settingsCache.midiChannel;
    if (settingsCache.keySize) { ksize.value = settingsCache.keySize; bed.style.setProperty('--kh', settingsCache.keySize + 'px'); }
    if (['none', 'system', 'input', 'both'].includes(settingsCache.videoSound)) videoSound = settingsCache.videoSound;
    soundSel.value = videoSound;
    if (BRIDGE && APPINFO) applySystemSound(APPINFO.systemSound !== false);
    if (BRIDGE) checkCaptureMark();
    if (Number.isFinite(+settingsCache.soundLevel)) PIANO.level = Math.max(0, Math.min(100, +settingsCache.soundLevel));
    soundVol.value = PIANO.level;
    /* the built-in piano is on from the first run on a Mac (no system sound
       there yet) and off on Windows, where a DAW is usually making the sound */
    const soundDefault = (APPINFO && APPINFO.systemSound === false) ? 'grand' : 'off';
    setPiano(BANKS[settingsCache.sound] || settingsCache.sound === 'off' ? settingsCache.sound : soundDefault);
    if (Number.isFinite(+settingsCache.pianoAttack)) PIANO.attack = Math.max(0, Math.min(400, +settingsCache.pianoAttack));
    if (Number.isFinite(+settingsCache.pianoRelease)) PIANO.release = Math.max(0, Math.min(1500, +settingsCache.pianoRelease));
    paintShape();
    showTab(settingsCache.setupTab);
    if (typeof settingsCache.audioInput === 'string') audioInput = settingsCache.audioInput;
    if (typeof settingsCache.vocalInput === 'string') vocalInput = settingsCache.vocalInput;
    refreshInputs();
    if (Number.isFinite(+settingsCache.duck)) duck = Math.max(0, Math.min(24, +settingsCache.duck));
    duckEl.value = duck; duckFace();
    if (Number.isFinite(+settingsCache.audioOffset)) audioOffset = Math.max(0, Math.min(300, +settingsCache.audioOffset));
    offsetEl.value = audioOffset; offsetFace();
    if (QUALITY[settingsCache.videoQuality]) videoQuality = settingsCache.videoQuality;
    qualSel.value = videoQuality; CLIP.quality = videoQuality;
    alsoMidi = settingsCache.alsoMidi === true; alsoWav = settingsCache.alsoWav === true; alsoPack = settingsCache.alsoPack === true; markAlso();
    if (typeof settingsCache.clipTitle === 'string') { CLIP.title = settingsCache.clipTitle.slice(0, 80); clipTitleEl.value = CLIP.title; }
    if (['bottom', 'middle', 'top'].includes(settingsCache.clipKeys)) CLIP.keys = settingsCache.clipKeys;
    clipKeysEl.value = CLIP.keys;
    if ([0, 2, 4].includes(+settingsCache.clipTrail)) CLIP.trail = +settingsCache.clipTrail;
    trailEl.value = String(CLIP.trail);
    if (['off', 'dark', 'light'].includes(settingsCache.plate)) CLIP.plate = settingsCache.plate;
    plateEl.value = CLIP.plate;
    if (Number.isFinite(+settingsCache.plateAlpha)) CLIP.plateAlpha = Math.max(20, Math.min(100, +settingsCache.plateAlpha));
    plateAlphaEl.value = CLIP.plateAlpha; plateAlphaV.textContent = CLIP.plateAlpha + '%';
    if (TITLE_FONTS[settingsCache.titleFont]) CLIP.font = settingsCache.titleFont;
    titleFontEl.value = CLIP.font;
    if (Number.isFinite(+settingsCache.titleSize)) CLIP.size = Math.max(18, Math.min(140, +settingsCache.titleSize));
    titleSizeEl.value = CLIP.size; titleSizeV.textContent = CLIP.size;
    if (TITLE_COLORS[settingsCache.titleColor]) CLIP.color = settingsCache.titleColor;
    markTitle();
    fmtBadge.textContent = CONTAINER.label;
    fmtBadge.title = CONTAINER.ext === 'mp4' ? 'This machine records straight to MP4' : 'This machine cannot write MP4 — clips are WebM';
    refreshRecList();
    backdrop = ['picture', 'video', 'green', 'blue'].includes(settingsCache.backdrop) ? settingsCache.backdrop : 'theme';
    backdropSel.value = backdrop;
    if (Number.isFinite(+settingsCache.backdropTint)) tint = Math.max(0, Math.min(100, +settingsCache.backdropTint));
    tintEl.value = tint; tintFace();
    if (TINTS[settingsCache.backdropTintColor]) tintColor = settingsCache.backdropTintColor;
    markTint();
    if (BRIDGE) { try { picture = await BRIDGE.getBackdrop(); } catch { picture = null; } }
    if (typeof picture === 'string') picture = { kind: 'picture', url: picture };
    picFace(); paintBackdrop();
    if (Number.isFinite(+settingsCache.keyGain)) keyGainDb = Math.max(-24, Math.min(12, +settingsCache.keyGain));
    if (Number.isFinite(+settingsCache.vocGain)) vocGainDb = Math.max(-24, Math.min(12, +settingsCache.vocGain));
    keyGainEl.value = keyGainDb; vocGainEl.value = vocGainDb; gainFace();
    monitorInputs();
    if (settingsCache.velocity === 'on' || settingsCache.velocity === 'off') {
      velocity = settingsCache.velocity === 'on';
      velSel.value = settingsCache.velocity;
    }
    if (settingsCache.keyLight === 'solid' || settingsCache.keyLight === 'gradient') {
      keyLight = settingsCache.keyLight;
      lightSel.value = keyLight;
    }
    if (['all', 'chord', 'ignore'].includes(settingsCache.pedalMode)) {
      pedalMode = settingsCache.pedalMode;
      pedalSel.value = pedalMode;
    }
    if (settingsCache.labelMode) {
      labelMode = settingsCache.labelMode;
      [...$('labelseg').children].forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === labelMode)));
    }
    if (settingsCache.popout) {
      for (const name of ['chord', 'number', 'keys']) {
        const b = document.querySelector(`[data-pop="${name}"]`);
        if (b && settingsCache.popout[name]) markPop(b, true);
      }
    }
    applyTheme(false);
    if (BRIDGE) BRIDGE.ready();
  }

  boot();
})();
