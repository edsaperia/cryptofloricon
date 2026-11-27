#!/usr/bin/env node
/*
 * The KDP cover files for the Amazon edition (5.5 × 8.5 in), from Ed's chosen
 * design (2026-11-27): a flat cream ground, a sparse diamond lattice of the
 * five woodcut flowers in black with exactly one of each down the spine, and
 * the blackletter logo across the front in a band of two omitted rows. No text.
 *
 *   cd scripts && npm ci        (once: pdf-lib)
 *   node scripts/build-cover.mjs [--pages 204] [--hardback-spine <in> --hardback-board <w>x<h>]
 *
 * Writes to book/out/ (git-ignored):
 *   cryptofloricon-cover-paperback.pdf   the full wrap at KDP's exact size
 *   cryptofloricon-cover-hardback.pdf    the case-laminate wrap
 *   …-preview.png                        each with KDP's lines drawn on
 *
 * The geometry and the pattern are in lib/cover.js, with KDP's figures and
 * where each came from; test/cover.test.js checks the pattern. The hardback's
 * spine and board for 204 pages are KDP's cover calculator's (lib/cover.js,
 * KDP.hard204); for another page count, pass the calculator's figures.
 *
 * The logo is Church Text typed out (the same glyphs as the 2013 raster logo,
 * spaced by hand), drawn as vector outlines by scripts/draw-word.mjs into
 * src/headings/cryptofloricon-church-text.svg. The font is never embedded or
 * committed (its fsType forbids embedding). THE LICENCE FOR PRINTING CHURCH
 * TEXT OUTLINES IS UNCONFIRMED.
 *
 * Print: the flowers are 1-bit line art, placed as image masks in 100% black
 * (K); the logo is vector outlines in 100% K. src/assets/flowers-hires/1–5.png were made once from Ed's
 * high-resolution woodcuts (Dropbox web graphics/woodcut symbols/1ink–5ink.png,
 * about 2,700 px tall): ink = opacity × darkness, resized to 720 px tall and cut
 * at half, so about 2,400 ppi at the 7.6 mm they print. The
 * cream is a flat CMYK tint. The PDF is DeviceCMYK only, with no colour profile,
 * no transparency and no text, as KDP's cover pages ask.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Cover = require('../lib/cover.js');
const OUT = path.join(ROOT, 'book', 'out');
const MODULES = path.join(ROOT, 'scripts', 'node_modules');
const { PDFDocument, PDFName, PDFRawStream } = require(path.join(MODULES, 'pdf-lib'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const arg = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const pages = Number(arg('--pages') || 204);

// The ground: the mock-up's cream (#efe4c9) as a flat CMYK tint, and black as 100% K.
const CREAM_RGB = '#efe4c9';
const CREAM_CMYK = [0, 0.05, 0.16, 0.06];

const ART = Object.fromEntries(Cover.ORDER.map(d => [d, path.join(ROOT, 'src', 'assets', 'flowers-hires', `${d}.png`)]));
const LOGO_SVG = fs.readFileSync(path.join(ROOT, 'src', 'headings', 'cryptofloricon-church-text.svg'), 'utf8')
  .replace(/<title>[^<]*<\/title>/, '');
const logoBox = LOGO_SVG.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
// The ink's centre, from the outline's points (absolute coordinates), as shares of the box: the
// logo is centred on its ink, not on its em box.
const LOGO_INK = (() => {
  const n = LOGO_SVG.match(/ d="([^"]+)"/)[1].match(/-?[\d.]+/g).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  const [vx, vy, vw, vh] = logoBox;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { dx: -((cx - vx) / vw - 0.5), dy: -((cy - vy) / vh - 0.5), w: (Math.max(...xs) - Math.min(...xs)) / vw, h: (Math.max(...ys) - Math.min(...ys)) / vh };
})();
const pngSize = f => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const ratio = Object.fromEntries(Object.entries(ART).map(([d, f]) => { const s = pngSize(f); return [d, s.w / s.h]; }));

/* The page: the cream ground and each drawing placed in inches. */
function html(f, lay, preview) {
  const imgs = lay.flowers.map(p =>
    `<img src="${pathToFileURL(ART[p.kind]).href}" style="left:${p.x - p.w / 2}in;top:${p.y - p.h / 2}in;width:${p.w}in;height:${p.h}in">`).join('\n');
  // The logo's box is Church Text's em (ascender to descender) by the word's advance; it is centred on its ink.
  const lh = lay.logo.w * logoBox[3] / logoBox[2];
  const logo = LOGO_SVG.replace('<svg ', `<svg class="logo" style="position:absolute;left:${lay.logo.cx - lay.logo.w / 2 + lay.logo.w * LOGO_INK.dx}in;top:${lay.logo.cy - lh / 2 + lh * LOGO_INK.dy}in;width:${lay.logo.w}in;height:${lh}in;overflow:visible;fill:#000" `);
  const line = (x1, y1, x2, y2, colour, dash) =>
    `<div class="g" style="left:${Math.min(x1, x2)}in;top:${Math.min(y1, y2)}in;width:${Math.abs(x2 - x1) || 0.015}in;height:${Math.abs(y2 - y1) || 0.015}in;background:${colour};${dash ? 'opacity:.75' : ''}"></div>`;
  const rect = (x, y, w, h, colour) => [line(x, y, x + w, y, colour), line(x, y + h, x + w, y + h, colour), line(x, y, x, y + h, colour), line(x + w, y, x + w, y + h, colour)].join('');
  let guides = '';
  if (preview) {
    const trimTop = f.outer, trimBottom = f.height - f.outer;
    guides += rect(f.outer, f.outer, f.width - 2 * f.outer, f.height - 2 * f.outer, '#d00');                         // trim (paperback) / board edge (hardback)
    guides += rect(f.safeOuter, f.safeOuter, f.width - 2 * f.safeOuter, f.height - 2 * f.safeOuter, '#0a0');          // safe area
    for (const x of [f.spineL, f.frontL]) guides += line(x, 0, x, f.height, '#00c');                                    // folds
    for (const x of [f.spineL - f.foldClear, f.frontL + f.foldClear]) guides += line(x, trimTop, x, trimBottom, '#0a0'); // fold / hinge clearance
    for (const x of [f.spineL + f.spineSafe, f.frontL - f.spineSafe]) guides += line(x, trimTop, x, trimBottom, '#0a0'); // spine safe
    const bc = f.barcode;
    guides += `<div class="barcode" style="left:${bc.x}in;top:${bc.y}in;width:${bc.w}in;height:${bc.h}in">barcode (KDP adds it)</div>`;
    guides += `<div class="key">${f.kind}: ${f.width.toFixed(3)} × ${f.height.toFixed(3)} in, spine ${f.spine.toFixed(3)} in${f.provisional ? ' — PROVISIONAL spine and board' : ''}. ` +
      `Red: ${f.kind === 'hardback' ? 'board edge (the wrap lies outside)' : 'trim (the bleed lies outside)'}; blue: spine folds; green: safe area${f.kind === 'hardback' ? ', hinge' : ', fold clearance'} and spine safe area.</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${f.width}in ${f.height}in; margin: 0; }
html, body { margin: 0; padding: 0; }
.cover { position: relative; width: ${f.width}in; height: ${f.height}in; background: ${CREAM_RGB}; overflow: hidden; }
.cover img { position: absolute; display: block; ${preview ? 'mix-blend-mode: multiply;' : ''} }
.g { position: absolute; }
.barcode { position: absolute; background: #fff; outline: 1px solid #c00; font: 11px sans-serif; color: #888; display: flex; align-items: center; justify-content: center; }
.key { position: absolute; left: 0.05in; top: 0.02in; font: 10px sans-serif; color: #c00; background: rgba(255,255,255,.8); padding: 1px 4px; }
</style></head><body><div class="cover">
${imgs}
${logo}
${guides}
</div></body></html>`;
}

/*
 * After Chromium: the exact KDP size (it rounds the paper to whole CSS pixels),
 * the drawings as black image masks, and every colour in DeviceCMYK.
 */
async function finish(file, f) {
  const doc = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  const W = f.width * 72, H = f.height * 72;
  for (const page of doc.getPages()) {
    const { height } = page.getMediaBox();
    for (const box of ['setMediaBox', 'setCropBox', 'setTrimBox']) page[box](0, height - H, W, H);
    page.node.delete(PDFName.of('Annots'));
  }
  if (doc.getPageCount() !== 1) throw new Error(`${file}: ${doc.getPageCount()} pages, not 1`);
  const cmyk = (r, g, b) => {
    const key = [r, g, b].map(Number).join(' ');
    if (key === '0 0 0') return '0 0 0 1';
    if (key === '1 1 1') return '0 0 0 0';
    const hex = '#' + [r, g, b].map(v => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('');
    if (hex === CREAM_RGB) return CREAM_CMYK.join(' ');
    throw new Error(`unexpected colour ${hex} in the cover`);
  };
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (String(dict.get(PDFName.of('Filter'))) !== '/FlateDecode' || dict.get(PDFName.of('DecodeParms'))) continue;
    if (String(dict.get(PDFName.of('Subtype'))) === '/Image') {
      const w = dict.get(PDFName.of('Width')).asNumber(), h = dict.get(PDFName.of('Height')).asNumber();
      const data = zlib.inflateSync(Buffer.from(obj.contents));
      const comps = data.length / (w * h);
      if (comps !== 3 && comps !== 1) throw new Error(`image ${ref}: ${comps} components`);
      const rowBytes = Math.ceil(w / 8);
      const bits = Buffer.alloc(rowBytes * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = data[(y * w + x) * comps];
        if (v > 8 && v < 247) throw new Error(`image ${ref}: not pure black and white`);
        if (v >= 128) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
      dict.delete(PDFName.of('ColorSpace'));
      dict.delete(PDFName.of('SMask'));
      dict.set(PDFName.of('BitsPerComponent'), doc.context.obj(1));
      dict.set(PDFName.of('ImageMask'), doc.context.obj(true));
      doc.context.assign(ref, PDFRawStream.of(dict, zlib.deflateSync(bits, { level: 9 })));
      continue;
    }
    if (dict.get(PDFName.of('Length1')) || dict.get(PDFName.of('Subtype'))) continue;
    let text;
    try { text = zlib.inflateSync(Buffer.from(obj.contents)).toString('latin1'); } catch { continue; }
    if (!/\b(rg|RG|Do)\b/.test(text)) continue;
    const out = text
      .replace(/(^|\s)(\/X\w+ Do)(?=\s)/g, '$1q 0 0 0 1 k $2 Q')
      .replace(/(^|\s)([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)(?=\s)/g, (m, sp, r, g, b, op) => `${sp}${cmyk(r, g, b)} ${op === 'rg' ? 'k' : 'K'}`);
    if (/(^|\s)(sc|SC|scn|SCN|cs|CS|g|G)(?=\s)/.test(out)) throw new Error(`content ${ref}: unexpected colour operators`);
    doc.context.assign(ref, PDFRawStream.of(dict, zlib.deflateSync(Buffer.from(out, 'latin1'))));
  }
  fs.writeFileSync(file, await doc.save({ useObjectStreams: false }));
}

const jobs = [['paperback', Cover.frame('paperback', { pages })]];
const hs = arg('--hardback-spine'), hb = arg('--hardback-board');
if (hs && hb) {
  const [boardW, boardH] = hb.split('x').map(Number);
  jobs.push(['hardback', Cover.frame('hardback', { spine: Number(hs), boardW, boardH })]);
} else if (pages === 204) {
  jobs.push(['hardback', Cover.frame('hardback', Cover.KDP.hard204)]);
} else {
  console.log('hardback: skipped (for a page count other than 204, pass --hardback-spine and --hardback-board from KDP\'s cover calculator)');
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [kind, f] of jobs) {
    const lay = Cover.layout(f, d => ratio[d]);
    // The logo's ink must lie inside the front's live area (clear of the hinge or fold, and the edge).
    const inkW = lay.logo.w * LOGO_INK.w, inkH = lay.logo.w * logoBox[3] / logoBox[2] * LOGO_INK.h;
    if (lay.logo.cx - inkW / 2 < f.frontL + f.foldClear || lay.logo.cx + inkW / 2 > f.width - f.safeOuter ||
        lay.logo.cy - inkH / 2 < f.safeOuter) throw new Error(`${kind}: the logo is outside the live area`);
    const spine = Cover.spineKinds(lay);
    if (spine.length !== 5 || new Set(spine).size !== 5) throw new Error(`${kind}: the spine holds ${spine.join('')}, not one of each flower`);
    const base = path.join(OUT, `cryptofloricon-cover-${kind}`);
    const page = await browser.newPage();
    fs.writeFileSync(base + '.html', html(f, lay, false));
    await page.goto(pathToFileURL(base + '.html').href);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await page.pdf({ path: base + '.pdf', width: `${f.width}in`, height: `${f.height}in`, printBackground: true, pageRanges: '1' });
    await finish(base + '.pdf', f);
    // The preview: the same cover with KDP's lines drawn on, at 100 pixels an inch.
    const preview = await browser.newPage({ viewport: { width: Math.ceil(f.width * 96), height: Math.ceil(f.height * 96) }, deviceScaleFactor: 100 / 96 });
    fs.writeFileSync(base + '-preview.html', html(f, lay, true));
    await preview.goto(pathToFileURL(base + '-preview.html').href);
    await preview.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await preview.screenshot({ path: base + '-preview.png', clip: { x: 0, y: 0, width: f.width * 96, height: f.height * 96 } });
    await page.close(); await preview.close();
    console.log(`${path.basename(base)}.pdf: ${f.width.toFixed(4)} × ${f.height.toFixed(4)} in, spine ${f.spine.toFixed(4)} in, ` +
      `${lay.flowers.length} flowers (spine ${spine.map(d => ({ 1: 'lily', 2: 'rose', 3: 'chrysanth', 4: 'carnation', 5: 'gerbera' })[d]).join(', ')})${f.provisional ? ' PROVISIONAL' : ''}`);
  }
} finally {
  await browser.close();
}
