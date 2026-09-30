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
  let backdrop = 'theme', tint = 40, tintColor = 'black', picture = null;
  function paintBackdrop() {
    const S = root.style;
    S.setProperty('--tint', (TINTS[tintColor] || TINTS.black).c);
    S.setProperty('--tint-a', String(tint / 100));
    if (backdrop === 'picture' && picture) S.setProperty('--pic', `url("${picture}")`);
    else S.removeProperty('--pic');
    document.body.dataset.backdrop = (backdrop === 'picture' && picture) ? 'picture' : 'theme';
  }
  /* pop-outs: the picture itself is fetched once, not published with every note */
  let pictureAsked = false;
  function applyBackdropState(s) {
    backdrop = s.backdrop || 'theme';
    if (typeof s.tint === 'number') tint = s.tint;
    if (s.tintColor) tintColor = s.tintColor;
    if (backdrop === 'picture' && !picture && BRIDGE && (!pictureAsked || s.pictureChanged)) {
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

  /* velocity colour */
  const hex2rgb = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  function velColor(v) {
    const S = (ACCENTS[accent] || ACCENTS.blue).stops.map(hex2rgb);
    const t = Math.min(1, Math.max(0, v / 127));
    const seg = Math.min(2, Math.floor(t * 3)), f = t * 3 - seg;
    return S[seg].map((c, i) => Math.round(c + (S[seg + 1][i] - c) * f));
  }
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
  const pcName = (pc) => (useFlats() ? FL : SH)[((pc % 12) + 12) % 12];
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
    [[0, 5, 7, 11], 'maj7sus4'], [[0, 2, 5, 7], 'sus4(add9)']
  ];
  const TMAP = new Map();
  T.forEach(([iv, name], i) => {
    const k = iv.slice().sort((a, b) => a - b).join(',');
    if (!TMAP.has(k)) TMAP.set(k, { name, rank: i });
  });

  function detect(notes) {
    if (!notes.length) return null;
    const sorted = notes.slice().sort((a, b) => a - b);
    const bassPc = sorted[0] % 12;
    const pcs = [...new Set(sorted.map((n) => n % 12))];
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
      for (const [k, v] of TMAP) {
        const iv = k.split(',').map(Number);
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
    vbar.style.width = vs.length ? Math.round(Math.max(...vs) / 127 * 100) + '%' : '0%';

    let text;
    if (!ch) {
      text = {
        chordClass: 'big empty', chordHTML: 'Play something',
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

    const state = Object.assign(
      { accent, mode, keys, ring, rootPc, tags, cTags, keyLight, velocity, backdrop, tint, tintColor, keySize: +ksize.value },
      text
    );

    chordEl.className = state.chordClass;
    chordEl.innerHTML = state.chordHTML;
    numEl.className = state.numClass;
    numEl.innerHTML = state.numHTML;
    romanEl.textContent = state.romanText;
    metaEl.innerHTML = state.metaHTML;
    paintKeys(state);

    lastPublished = state;
    if (BRIDGE) BRIDGE.publish(state);
  }
  let lastPublished = null;

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
    paint();
  };

  const off = (n) => {
    held.delete(n);
    if (!sustain) { sustained.delete(n); ringing.delete(n); }
    paint();
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
    paint();
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
    if (t === 'SELECT' || t === 'INPUT' || t === 'BUTTON') return;
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
  const send = (bytes) => { try { if (outPort) outPort.send(bytes); } catch { /* port went away */ } };

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
      o.value = r.name; o.textContent = r.name.replace(/\.(midi?|chordlight)$/i, '') + (/\.chordlight$/i.test(r.name) ? '  ♪' : '');
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
      await loadAny(buffer, name, false);
      toast('Cued  ' + name);
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
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
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

  function recFace() {
    const s = Math.floor(performance.now() / 1000 - REC.start);
    recBtn.textContent = `■ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  /* `base` is the name shared with a video or WAV started at the same
     moment, so the three files sort together in the folder. */
  function startRec(base, withWav) {
    REC.on = true; REC.start = performance.now() / 1000; REC.events = [];
    REC.base = base || `Chordlight take ${stamp()}`;
    recBtn.setAttribute('aria-pressed', 'true');
    recBtn.title = 'Stop and save the take';
    recFace();
    REC.timer = setInterval(recFace, 500);
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
    if (!CAP.buf.length) { toast('Nothing in the last five minutes'); return; }
    keepRecording(`Chordlight keep ${stamp()}.mid`, writeSMF(CAP.buf));
  });

  /* ================= video ================= */
  const VID = { rec: null, chunks: [], timer: 0, start: 0 };
  const vidBtn = $('vidbtn');
  function vidFace() {
    const s = Math.floor(performance.now() / 1000 - VID.start);
    vidBtn.textContent = `■ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const soundSel = $('videosound'), audioInSel = $('audioin'), vocalInSel = $('vocalin'),
        duckEl = $('duck'), duckV = $('duckv'), offsetEl = $('aoffset'), offsetV = $('aoffsetv'), qualSel = $('vquality');
  let videoSound = 'system', audioInput = '', vocalInput = '', duck = 9, audioOffset = 0, videoQuality = 'good';

  /* Audio inputs only get names once the page has been allowed to use one,
     so both lists are (re)built after any successful capture too. */
  function fillInputs(sel, devs, want, noneLabel) {
    const keep = sel.value;
    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = noneLabel;
    sel.appendChild(def);
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
    fillInputs(audioInSel, devs, audioInput, 'Default input');
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
  qualSel.addEventListener('change', () => { videoQuality = qualSel.value; store({ videoQuality }); });

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
                keyAn: null, vocAn: null, streams: [], raf: 0, recording: false, ducked: false };

  /* ---------- WAV: the mix, uncompressed ----------
     24-bit, 48 kHz, stereo, tapped after the delay so it is exactly what the
     clip hears. Samples are packed to 24-bit as they arrive (288 KB/s) rather
     than kept as floats. A ScriptProcessor is old but needs no extra file
     under the CSP; 4096 frames is 85 ms of latency that does not matter to
     a file. */
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
    const tap = ctx.createScriptProcessor(4096, 2, 2);
    WAV.chunks = []; WAV.frames = 0; WAV.base = base; WAV.on = true; WAV.owner = MIX.recording ? 'video' : 'rec';
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
        title: base,
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
    let hasVocal = false;
    if (wantInput || !MIX.recording) {
      const keyStream = await openInput(audioInput, 'keyboard input');
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
    Object.assign(MIX, { ctx: null, keyGain: null, vocGain: null, bed: null, delay: null, dest: null, keyAn: null, vocAn: null, streams: [], ducked: false });
    keyMeter.style.width = '0%'; vocMeter.style.width = '0%';
    duckBadge.classList.remove('lit');
  }
  /* Meters run while Advanced is open and no clip is recording; a clip
     owns the graph for its duration. */
  function monitorInputs() {
    if (MIX.recording || WAV.on || PACK.on) return;
    if (advOpen && !setup.hidden) { buildMix(null).catch(() => {}); mixNote.textContent = 'Meters live'; }
    else { tearDownMix(); mixNote.textContent = 'Meters run while Advanced is open'; }
  }
  [audioInSel, vocalInSel].forEach((sel) => sel.addEventListener('change', monitorInputs));

  /* ---------- the picture ----------
     Three ways to get the window, tried in order:
       1. getDisplayMedia — the main process answers with this window.
       2. The same request with the source id given explicitly, the way
          Electron always allowed before display-media handlers existed.
       3. The screen this window is on. Chromium's window capturer refuses
          some frameless windows on some Windows drivers with "Error
          starting video capture"; the screen capturer never does. */
  async function grabPicture(fps, wantSystem) {
    const errs = [];
    const audioOpt = wantSystem ? true : false;
    if (BRIDGE) BRIDGE.captureKind('window');
    try { return { display: await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: audioOpt }), how: 'window' }; }
    catch (e) { errs.push(e); }
    try { return { display: await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps } }), how: 'window' }; }
    catch (e) { errs.push(e); }
    if (BRIDGE) {
      let ids = null;
      try { ids = await BRIDGE.captureSources(); } catch { ids = null; }
      if (ids && ids.window) {
        try {
          const display = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: ids.window, maxFrameRate: fps } }
          });
          return { display, how: 'window' };
        } catch (e) { errs.push(e); }
      }
      BRIDGE.captureKind('screen');
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio: audioOpt });
        return { display, how: 'screen' };
      } catch (e) { errs.push(e); }
      if (ids && ids.screen) {
        try {
          const display = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: ids.screen, maxFrameRate: fps } }
          });
          return { display, how: 'screen' };
        } catch (e) { errs.push(e); }
      }
    }
    throw errs[errs.length - 1] || new Error('no capture available');
  }

  async function buildStream() {
    const wantSystem = videoSound === 'system' || videoSound === 'both';
    const Q = QUALITY[videoQuality] || QUALITY.best;
    const { display, how } = await grabPicture(Q.fps, wantSystem);
    if (how === 'screen') toast('Recording the screen — this machine cannot capture just the window');
    const tracks = [display.getVideoTracks()[0]];
    const sysTrack = wantSystem ? display.getAudioTracks()[0] : null;
    MIX.recording = true;
    await buildMix(sysTrack);
    const audioTrack = MIX.dest.stream.getAudioTracks()[0];
    const hasSound = !!sysTrack || MIX.streams.length > 0;
    if (hasSound && audioTrack) tracks.push(audioTrack);
    else if (videoSound !== 'none') toast('No sound source could be opened — picture only');
    const stream = new MediaStream(tracks);
    const stopAll = () => {
      display.getTracks().forEach((t) => t.stop());
      MIX.recording = false;
      tearDownMix();
      monitorInputs();
    };
    return { stream, stopAll, ended: display.getVideoTracks()[0] };
  }

  async function startVideo() {
    let built;
    try { built = await buildStream(); }
    catch (err) { MIX.recording = false; monitorInputs(); toast('Could not start video — ' + (err.message || err)); return; }
    const { stream, stopAll, ended } = built;
    const hasAudio = stream.getAudioTracks().length > 0;
    /* a clip with no sound must not ask for an audio codec */
    const mime = hasAudio ? CONTAINER.mime : CONTAINER.mime.replace(/,(mp4a\.40\.2|opus)/, '');
    VID.chunks = [];
    const Q = QUALITY[videoQuality] || QUALITY.good;
    const base = `Chordlight video ${stamp()}`;
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
    ended.addEventListener('ended', () => { if (VID.rec && VID.rec.state !== 'inactive') stopVideo(); });
    VID.rec.start(1000);
    VID.start = performance.now() / 1000;
    vidBtn.setAttribute('aria-pressed', 'true');
    vidBtn.title = 'Stop and save the video';
    vidFace();
    VID.timer = setInterval(vidFace, 500);
  }
  function stopVideo() {
    clearInterval(VID.timer);
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
    if (e.key === 'F11') { e.preventDefault(); toggleStage(); }
    else if (e.key === 'Escape' && document.body.classList.contains('onstage')) toggleStage();
  });

  /* ================= backdrop ================= */
  const backdropSel = $('backdrop'), tintEl = $('tint'), tintV = $('tintv'), picBadge = $('picbadge');
  const tintFace = () => { tintV.textContent = tint + '%'; };
  function picFace() {
    picBadge.hidden = !!picture;
    picBadge.textContent = 'No picture yet — choose one';
  }
  backdropSel.addEventListener('change', () => {
    backdrop = backdropSel.value;
    store({ backdrop });
    if (backdrop === 'picture' && !picture) { $('picfile').click(); }
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
      if (BRIDGE) picture = await BRIDGE.setBackdrop(new Uint8Array(await f.arrayBuffer()), ext);
      else picture = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      backdrop = 'picture'; backdropSel.value = 'picture';
      store({ backdrop });
      picFace(); paintBackdrop();
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
    } else {
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

  const setup = $('setup'), setupbtn = $('setupbtn'), advanced = $('advanced'), advbtn = $('advbtn');
  let advOpen = false;
  function showAdvanced(v) {
    advOpen = v;
    advanced.hidden = !(v && !setup.hidden);
    advbtn.setAttribute('aria-expanded', String(v));
    advbtn.classList.toggle('on', v);
    advbtn.textContent = v ? 'Advanced ▴' : 'Advanced ▾';
  }
  setupbtn.addEventListener('click', () => {
    const open = setup.hidden;
    setup.hidden = !open;
    setupbtn.setAttribute('aria-expanded', String(open));
    setupbtn.classList.toggle('on', open);
    showAdvanced(advOpen);
    monitorInputs();
  });
  advbtn.addEventListener('click', () => { showAdvanced(!advOpen); store({ advanced: advOpen }); monitorInputs(); });

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
      if (info.platform === 'darwin') document.body.classList.add('mac');
      const v = document.querySelector('.wordmark span');
      if (v) v.textContent = 'Amanorsac Studio · v' + info.version;
      $('aboutversion').textContent = info.version;
      $('aboutruntime').textContent = 'Electron ' + info.electron + ' · Chromium ' + info.chrome;
      $('aboutprefs').textContent = info.preferencesFile;
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
    if (typeof settingsCache.audioInput === 'string') audioInput = settingsCache.audioInput;
    if (typeof settingsCache.vocalInput === 'string') vocalInput = settingsCache.vocalInput;
    refreshInputs();
    if (Number.isFinite(+settingsCache.duck)) duck = Math.max(0, Math.min(24, +settingsCache.duck));
    duckEl.value = duck; duckFace();
    if (Number.isFinite(+settingsCache.audioOffset)) audioOffset = Math.max(0, Math.min(300, +settingsCache.audioOffset));
    offsetEl.value = audioOffset; offsetFace();
    if (QUALITY[settingsCache.videoQuality]) videoQuality = settingsCache.videoQuality;
    qualSel.value = videoQuality;
    alsoMidi = settingsCache.alsoMidi === true; alsoWav = settingsCache.alsoWav === true; alsoPack = settingsCache.alsoPack === true; markAlso();
    fmtBadge.textContent = CONTAINER.label;
    fmtBadge.title = CONTAINER.ext === 'mp4' ? 'This machine records straight to MP4' : 'This machine cannot write MP4 — clips are WebM';
    refreshRecList();
    backdrop = settingsCache.backdrop === 'picture' ? 'picture' : 'theme';   // chroma from 1.1 falls back to the theme
    backdropSel.value = backdrop;
    if (Number.isFinite(+settingsCache.backdropTint)) tint = Math.max(0, Math.min(100, +settingsCache.backdropTint));
    tintEl.value = tint; tintFace();
    if (TINTS[settingsCache.backdropTintColor]) tintColor = settingsCache.backdropTintColor;
    markTint();
    if (BRIDGE) { try { picture = await BRIDGE.getBackdrop(); } catch { picture = null; } }
    picFace(); paintBackdrop();
    if (Number.isFinite(+settingsCache.keyGain)) keyGainDb = Math.max(-24, Math.min(12, +settingsCache.keyGain));
    if (Number.isFinite(+settingsCache.vocGain)) vocGainDb = Math.max(-24, Math.min(12, +settingsCache.vocGain));
    keyGainEl.value = keyGainDb; vocGainEl.value = vocGainDb; gainFace();
    showAdvanced(settingsCache.advanced === true);
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
