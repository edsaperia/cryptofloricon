#!/usr/bin/env node
/*
 * Draws the share previews: the 1200x630 picture a chat or social site
 * shows when someone pastes a message link (Ed, 2026-11-23). One per code,
 * src/previews/<code>.jpg, showing the bouquet's woodcut stems on the paper
 * with the logotype small above; and src/previews/site.jpg, the logotype
 * over one stem of each flower, for every other page.
 *
 *   node scripts/draw-previews.mjs           draw any preview that is missing
 *   node scripts/draw-previews.mjs --all     redraw every preview
 *
 * Needs Playwright with Chromium (installed outside the repository; build.js
 * and the tests do not need it). The pictures depend only on the codes and
 * the artwork in src/assets/, so a change to a message's text needs no
 * redraw; a new code does, and `node build.js` fails until it is drawn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const Cipher = require('../lib/cipher.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'previews');
const WIDTH = 1200;
const HEIGHT = 630;
const QUALITY = 60; // JPEG: the paper texture makes PNGs several times larger

const all = process.argv.includes('--all');
const dataUri = rel => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'src', rel)).toString('base64');
const PAPER = dataUri('assets/paper.png');
const LOGO = dataUri('assets/logo.png');
const FLOWER = Object.fromEntries([1, 2, 3, 4, 5].map(d => [d, dataUri(`assets/flowers/${d}.png`)]));

// The artwork's natural sizes: every stem is 310px tall, and as wide as its flower.
const STEM_NATURAL_HEIGHT = 310;
const STEM_WIDTH = { 1: 118, 2: 100, 3: 133, 4: 106, 5: 127 };
const GAP = 6;
const MAX_ROW = 1060; // the widest the stems may run, leaving the paper a margin

/* The card: paper, the logotype, and the stems side by side as on the site,
   as tall as maxStem but shrunk to fit a wide bouquet within MAX_ROW. */
function card(stems, { logoWidth, maxStem }) {
  const natural = stems.reduce((w, d) => w + STEM_WIDTH[d], 0);
  const stemHeight = Math.min(maxStem, Math.floor((MAX_ROW - GAP * (stems.length - 1)) * STEM_NATURAL_HEIGHT / natural));
  const imgs = stems.map(d => `<img class="stem" src="${FLOWER[d]}" alt="">`).join('');
  return `<!doctype html><html><head><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px;
  }
  /* The paper, softened a little: its fine grain is invisible at the sizes a
     card is shown, and costs most of each file's bytes. */
  body::before {
    content: ""; position: absolute; inset: -10px; z-index: -1;
    background: #f1e6cc url("${PAPER}") repeat; filter: blur(0.5px);
  }
  .logo { width: ${logoWidth}px; display: block; }
  .bouquet { display: flex; align-items: flex-end; justify-content: center; gap: ${GAP}px; }
  .stem { height: ${stemHeight}px; width: auto; display: block; }
</style></head><body>
<img class="logo" src="${LOGO}" alt="">
<div class="bouquet">${imgs}</div>
</body></html>`;
}

const lexicon = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8'));
const codes = [...new Set(lexicon.map(e => e.code))].sort();
const jobs = codes.map(code => ({ name: code, html: card(Cipher.displayStems(code), { logoWidth: 300, maxStem: 440 }) }));
jobs.push({ name: 'site', html: card(Cipher.KEY_ORDER.map(String), { logoWidth: 640, maxStem: 300 }) });

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
let drawn = 0;
for (const job of jobs) {
  const file = path.join(OUT, job.name + '.jpg');
  if (!all && fs.existsSync(file)) continue;
  await page.setContent(job.html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await page.screenshot({ path: file, type: 'jpeg', quality: QUALITY });
  drawn++;
}
await browser.close();

// Previews for codes no longer in the lexicon.
const keep = new Set(jobs.map(j => j.name + '.jpg'));
const stale = fs.readdirSync(OUT).filter(f => !keep.has(f));
console.log(`Drew ${drawn} preview(s) into ${path.relative(ROOT, OUT)}; ${jobs.length - drawn} already there.` +
  (stale.length ? ` Not in the lexicon (delete them if unwanted): ${stale.join(', ')}` : ''));
