/* Builds a single-file copy of the shipping renderer that runs in a browser,
   so a change can be played on a real keyboard before it is packaged.
   Chrome only: Web MIDI. Everything is inlined — the page, the clip drawing,
   the clip thread and the WAV tap (handed to the page as text and started
   from blob URLs) — so the strict CSP the app ships with is relaxed to allow
   the inline copies. The test file is for the bench, never for release.
   If `npm install` has copied the fonts, they are inlined too; otherwise the
   page falls back to Google Fonts and the clip thread to the window. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const [html, css, js, draw, worker, wav, piano] = await Promise.all(
  ['index.html', 'styles.css', 'app.js', 'clip-draw.js', 'clip-worker.js', 'wav-tap.js', 'piano-engine.js'].map((f) => readFile(join(R, f), 'utf8'))
);

let fontFiles = [];
try { fontFiles = (await readdir(join(R, 'fonts'))).filter((f) => f.endsWith('.woff2')); } catch { /* none yet */ }
const fonts = {};
for (const f of fontFiles) fonts[f.replace('.woff2', '')] = 'data:font/woff2;base64,' + (await readFile(join(R, 'fonts', f))).toString('base64');
const faceCss = fontFiles.map((f) => {
  const [, fam, w] = f.match(/^(.*)-(\d+)\.woff2$/);
  const family = { inter: 'Inter', 'jetbrains-mono': 'JetBrains Mono', 'barlow-condensed': 'Barlow Condensed' }[fam] || fam;
  return `@font-face{font-family:"${family}";font-weight:${w};src:url(${fonts[f.replace('.woff2', '')]}) format("woff2")}`;
}).join('\n');
const fontLink = fontFiles.length ? `<style>${faceCss}</style>`
  : '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
    'family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700' +
    '&family=JetBrains+Mono:wght@400;500;600&display=swap">';

const inline = { worker: draw + '\n' + worker, wav, piano, fonts: fontFiles.length ? fonts : null };
const safe = (t) => t.replace(/<\/script/gi, '<\\/script');

const out = html
  .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/,
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    'script-src \'unsafe-inline\' blob:; worker-src blob:; style-src \'unsafe-inline\' https://fonts.googleapis.com; ' +
    'font-src data: https://fonts.gstatic.com; img-src \'self\' data: blob:; media-src blob: data: file:; connect-src \'self\' http: https:;">')
  .replace('<link rel="stylesheet" href="fonts/fonts.css">', fontLink)
  .replace('<link rel="stylesheet" href="styles.css">',
    `<style>\n${css}\n/* browser test build: the window buttons belong to Electron */\n.wbtn{display:none}\n</style>`)
  .replace('<script src="clip-draw.js"></script>', `<script>\n${safe(draw)}\n</script>`)
  .replace('<script src="app.js"></script>',
    `<script>window.CHORDLIGHT_INLINE = ${safe(JSON.stringify(inline))};</script>\n<script>\n${safe(js)}\n</script>`);

const dest = process.argv[2] || join(R, '..', '..', 'chordlight-test.html');
await writeFile(dest, out, 'utf8');
console.log('wrote', dest, (out.length / 1024).toFixed(0) + ' KB', fontFiles.length ? '(fonts inlined)' : '(Google Fonts)');
