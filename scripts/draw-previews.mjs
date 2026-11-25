#!/usr/bin/env node
/*
 * Draws the share previews: the 1200x630 picture a chat or social site
 * shows when someone pastes a message link (Ed, 2026-11-23). One per code,
 * src/previews/<code>.jpg, showing the bouquet's woodcut stems on the paper:
 * two or more stems fanned into a bunch and tied with two crossed bands of
 * ribbon (Ed, 2026-11-25, 49–50), a single stem standing alone, with no
 * logotype (48a); and src/previews/site.jpg, the logotype over one stem of
 * each flower, for every other page.
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
${logoWidth ? `<img class="logo" src="${LOGO}" alt="">` : ''}
<div class="bouquet">${imgs}</div>
</body></html>`;
}

/* The bunch: the stems fanned from one point and tied there. Drawn on a
   canvas so that each flower can be filled with paper (a flower in front
   then hides the ones behind) and the ribbon drawn in uneven, woodcut-like
   lines. The randomness is seeded, so a redraw gives the same picture. */
const BUNCH_PAGE = `<!doctype html><html><head><style>html,body{margin:0}</style></head><body>
<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas><script>
const FLOWER = ${JSON.stringify(FLOWER)};
const PAPER_URI = "${PAPER}";
const INK = '#4f1606';
const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
let PAP;

/* A copy of a stem with everything inside its outline filled with paper. */
function filled(img) {
  const w = img.width + 2, h = img.height + 2, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 1, 1);
  const d = x.getImageData(0, 0, w, h), a = d.data, outside = new Uint8Array(w * h), stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const p = stack.pop(), px = p % w;
    for (const q of [p - 1, p + 1, p - w, p + w]) {
      if (q < 0 || q >= outside.length || outside[q] || Math.abs(q % w - px) > 1 || a[q * 4 + 3] > 60) continue;
      outside[q] = 1; stack.push(q);
    }
  }
  for (let p = 0; p < outside.length; p++) if (!outside[p] && a[p * 4 + 3] <= 60) a[p * 4 + 3] = 255;
  x.putImageData(d, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = x.createPattern(PAP, 'repeat'); x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over';
  x.drawImage(img, 1, 1);
  return c;
}

/* Uneven ink: a line that wanders a little and swells and thins along its length. */
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function curve(p0, c, p1, n = 28) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u*u*p0[0] + 2*u*t*c[0] + t*t*p1[0], u*u*p0[1] + 2*u*t*c[1] + t*t*p1[1]]); }
  return out;
}
function straight(p0, p1, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); }
  return out;
}
const wobble = (pts, a = 1.8) => pts.map(([x, y], i) => i === 0 || i === pts.length - 1 ? [x, y] : [x + (rnd() - 0.5) * a, y + (rnd() - 0.5) * a]);
function ink(x, pts, w) {
  const r = pts.map(() => rnd()), sm = r.map((v, i) => (r[Math.max(0, i - 1)] + v + r[Math.min(r.length - 1, i + 1)]) / 3);
  for (let i = 1; i < pts.length; i++) {
    x.lineWidth = w * (0.55 + 0.9 * sm[i]);
    x.beginPath(); x.moveTo(...pts[i - 1]); x.lineTo(...pts[i]); x.stroke();
  }
}
function outline(x, pts) { x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); }

/* One band of ribbon round the stems, half-width W and height H, its edges
   curving by S as a ring does seen from a little above, shaded at the sides. */
function band(x, W, H, S) {
  const top = curve([-W, -H / 2], [0, -H / 2 + S * 2], [W, -H / 2]);
  const bottom = curve([W, H / 2], [0, H / 2 + S * 2], [-W, H / 2]);
  const shape = [...top, ...bottom];
  outline(x, shape); x.fill();
  x.save(); outline(x, shape); x.clip();
  const hatch = (from, to, step, w) => {
    for (let xx = from; xx <= to; xx += step) {
      const t = xx / W;
      ink(x, wobble(straight([xx, -H / 2 + S * (1 - t * t) * 2 - 3], [xx, H / 2 + S * (1 - t * t) * 2 + 3], 6), 1.2), w);
    }
  };
  hatch(W * 0.55, W, 3.2, 1.6); hatch(-W, -W * 0.78, 3.6, 1.3);
  x.restore();
  ink(x, wobble(top), 4); ink(x, wobble(bottom), 4);
  ink(x, wobble(straight(top[top.length - 1], bottom[0], 4)), 4);
  ink(x, wobble(straight(bottom[bottom.length - 1], top[0], 4)), 4);
}

/* Two tight bands crossing, one set a little above the other (50b). */
function tie(x, n) {
  seed = 23;
  x.strokeStyle = INK; x.lineCap = 'round'; x.lineJoin = 'round'; x.fillStyle = x.createPattern(PAP, 'repeat');
  const w = (13 + 4.5 * n) * 0.55;
  x.save(); x.translate(0, -6); x.rotate(-0.42); band(x, w, 12, 7); x.restore();
  x.save(); x.translate(0, 8); x.rotate(0.42); band(x, w, 12, 7); x.restore();
}

window.draw = async stems => {
  const c = document.getElementById('c'), x = c.getContext('2d');
  PAP = PAP || await load(PAPER_URI);
  x.save(); x.filter = 'blur(0.5px)'; x.fillStyle = '#f1e6cc'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = x.createPattern(PAP, 'repeat'); x.fillRect(-10, -10, c.width + 20, c.height + 20); x.restore();
  const n = stems.length, SCALE = 1.5, PIVOT = 0.80, TIE_X = c.width / 2, TIE_Y = 470;
  const spread = Math.min(50, 50 * (n - 1) / 3) / (n - 1) * Math.PI / 180;
  // The middle stems stand in front and a little taller; the outer ones lean out behind.
  const order = stems.map((d, i) => i).sort((p, q) => Math.abs(q - (n - 1) / 2) - Math.abs(p - (n - 1) / 2));
  for (const i of order) {
    const stem = filled(await load(FLOWER[stems[i]]));
    const off = i - (n - 1) / 2;
    const h = ${STEM_NATURAL_HEIGHT} * SCALE * (1 - 0.10 * Math.abs(off) / Math.max(1, (n - 1) / 2));
    const w = stem.width * h / stem.height;
    x.save(); x.translate(TIE_X, TIE_Y); x.rotate(off * spread); x.drawImage(stem, -w / 2, -h * PIVOT, w, h); x.restore();
  }
  x.save(); x.translate(TIE_X, TIE_Y); tie(x, n); x.restore();
};
</script></body></html>`;

const lexicon = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8'));
const codes = [...new Set(lexicon.map(e => e.code))].sort();
const jobs = codes.map(code => {
  const stems = Cipher.displayStems(code);
  return stems.length === 1
    ? { name: code, html: card(stems, { logoWidth: 0, maxStem: 440 }) }
    : { name: code, bunch: stems };
});
jobs.push({ name: 'site', html: card(Cipher.KEY_ORDER.map(String), { logoWidth: 640, maxStem: 300 }) });

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
let drawn = 0;
for (const job of jobs) {
  const file = path.join(OUT, job.name + '.jpg');
  if (!all && fs.existsSync(file)) continue;
  if (job.bunch) {
    await page.setContent(BUNCH_PAGE, { waitUntil: 'load' });
    await page.evaluate(stems => window.draw(stems), job.bunch);
  } else {
    await page.setContent(job.html, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  }
  await page.screenshot({ path: file, type: 'jpeg', quality: QUALITY });
  drawn++;
}
await browser.close();

// Previews for codes no longer in the lexicon.
const keep = new Set(jobs.map(j => j.name + '.jpg'));
const stale = fs.readdirSync(OUT).filter(f => !keep.has(f));
console.log(`Drew ${drawn} preview(s) into ${path.relative(ROOT, OUT)}; ${jobs.length - drawn} already there.` +
  (stale.length ? ` Not in the lexicon (delete them if unwanted): ${stale.join(', ')}` : ''));
