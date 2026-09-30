/* Builds a single-file copy of the shipping renderer that runs in a browser,
   so a change can be played on a real keyboard before it is packaged.
   Chrome only: Web MIDI. Everything is inlined, so the strict CSP the app
   ships with is relaxed to allow the inline copies — the test file is for the
   bench, never for release. */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const [html, css, js] = await Promise.all(
  ['index.html', 'styles.css', 'app.js'].map((f) => readFile(join(R, f), 'utf8'))
);

const out = html
  .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/,
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    'script-src \'unsafe-inline\'; style-src \'unsafe-inline\' https://fonts.googleapis.com; ' +
    'font-src https://fonts.gstatic.com; img-src \'self\' data:; media-src blob:;">')
  .replace('<link rel="stylesheet" href="fonts/fonts.css">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
    'family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700' +
    '&family=JetBrains+Mono:wght@400;500;600&display=swap">')
  .replace('<link rel="stylesheet" href="styles.css">',
    `<style>\n${css}\n/* browser test build: the window buttons belong to Electron */\n.wbtn{display:none}\n</style>`)
  .replace('<script src="app.js"></script>', `<script>\n${js}\n</script>`);

const dest = process.argv[2] || join(R, '..', '..', 'chordlight-test.html');
await writeFile(dest, out, 'utf8');
console.log('wrote', dest, (out.length / 1024).toFixed(0) + ' KB');
