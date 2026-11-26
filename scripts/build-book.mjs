#!/usr/bin/env node
/*
 * The book's interior, as print-ready PDFs at two trim sizes from one layout:
 *
 *   book/out/cryptofloricon-a6-interior.pdf       A6, 105 × 148 mm (the special edition)
 *   book/out/cryptofloricon-5.5x8.5-interior.pdf  5.5 × 8.5 in (the Amazon edition)
 *
 * Usage:  cd scripts && npm ci         (once: Paged.js, hyphenation patterns, the body face)
 *         node scripts/build-book.mjs [--size a6|us] [--html] [--measure] [--title-index]
 *
 * --html writes the pages' HTML and stops (open it in Chromium to see the
 * layout live); otherwise each size is laid out by Paged.js in Playwright's
 * Chromium (pre-installed, as for draw-previews.mjs) and printed to PDF.
 * --measure only fits the entries to their pages and reports (seconds, not
 * minutes). The build stops if any entry runs past its page or loses text.
 * Nothing here runs in CI; test/book.test.js checks the book's data instead.
 *
 * The book follows the 2013 print master (April 2013, 90 × 140 mm): a half
 * title, the title page, the Story, then one entry to a page in the 2013 order
 * (book/order.json), each with its bouquet, its drawn script title and its
 * passage, cross-references printed as the referenced title with its page
 * number set small; at the back the table for decoding a bouquet by its
 * flowers, as 2013 had, without rules; then the colophon on the last
 * left-hand page. An index of titles (2013 had none) is left out for now
 * (Ed, 53); --title-index puts it back.
 *
 * Print: black ink only. Text and the drawn titles are pure black; the brown
 * woodcut stems and the logo become black line art at 1,200 ppi or more,
 * placed as stencils (image masks) that print black on the strokes and
 * nothing elsewhere, so no box shows round them; every colour is rewritten as
 * grey, and the PDF has no colour and no transparency. The
 * body face, Libre Caslon Text (SIL Open Font License), and EB Garamond for
 * the Cyrillic in the credits (OFL; Libre Caslon has no Cyrillic) come from
 * npm and are embedded by Chromium as subsets; no font file is written into
 * the repository. The script titles are the committed outline drawings in
 * src/headings/: the licensed title font is never needed or embedded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Cipher = require('../lib/cipher.js');
const Book = require('../lib/book.js');
const { escapeHtml: esc } = require('../lib/render.js');

const OUT = path.join(ROOT, 'book', 'out');
const MODULES = path.join(ROOT, 'scripts', 'node_modules');
const SRC = path.join(ROOT, 'src');

/*
 * The two sizes. Margins in mm. KDP's minimums (Set Trim Size, Bleed, and
 * Margins, read 2026-11-26), for a book with no bleed: outside, top and bottom
 * at least 6.4 mm (0.25 in); the inside (gutter) at least 9.6 mm for 24–150
 * pages, 12.7 mm for 151–300, 15.9 mm for 301–500. Both books are 151–300
 * pages, so the gutter is at least 12.7 mm. Bookvault publishes no fixed
 * interior margins (its templates come from its quote tool), so A6 uses the
 * same rule. The folio sits in the bottom margin, its foot at least 7.4 mm
 * from the edge.
 *
 * Every entry fits on one page (Ed, 54a), as in the 2013 book, which set
 * Adobe Caslon at 8 pt on 10 pt, about 72 mm wide, on a 90 × 140 mm page. Libre
 * Caslon Text is larger and wider for its size than Adobe Caslon, so 7.6 pt
 * here reads about as large as 2013's 8 pt.
 */
const SIZES = {
  a6: {
    file: 'cryptofloricon-a6-interior.pdf',
    label: 'A6, 105 × 148 mm',
    width: '105mm', height: '148mm',
    inside: 13, outside: 8, top: 8.5, bottom: 12.5,
    body: 7.6, leading: 10,           // pt
    paraGap: 0.4,                     // the space between paragraphs, in lines
    title: 15,                        // pt: one em of the drawn script, ascender to descender
    stems: 13,                        // mm: the bouquet above each title
    folio: 7,                         // pt
    index: { stem: 7, row: 9.6, head: 6, rowsFirst: 10, rowsPer: 12, text: 7.4, leading: 10.4 }
  },
  us: {
    file: 'cryptofloricon-5.5x8.5-interior.pdf',
    label: '5.5 × 8.5 in',
    width: '5.5in', height: '8.5in',
    inside: 14, outside: 11, top: 13, bottom: 17,
    body: 10, leading: 13.4,
    paraGap: 0.5,
    title: 20,
    stems: 20,
    folio: 8.5,
    index: { stem: 8.4, row: 12, head: 7.5, rowsFirst: 12, rowsPer: 15, text: 9, leading: 13 }
  }
};

/* ---------- arguments ---------- */

const args = process.argv.slice(2);
const sizeArg = args.includes('--size') ? args[args.indexOf('--size') + 1] : null;
if (sizeArg && !SIZES[sizeArg]) throw new Error(`--size must be one of ${Object.keys(SIZES).join(', ')}`);
const sizes = sizeArg ? [sizeArg] : Object.keys(SIZES);
const htmlOnly = args.includes('--html');
// --measure: fit the entries to their pages and report, without the slow Paged.js layout.
const measureOnly = args.includes('--measure');
// --title-index: add the Index of Messages (titles A–Z with pages). Left out for now (Ed, 53).
const withTitleIndex = args.includes('--title-index');
// BOOK_SETTINGS='{"a6":{"body":7.8}}' tries other settings without editing SIZES.
if (process.env.BOOK_SETTINGS) {
  for (const [k, v] of Object.entries(JSON.parse(process.env.BOOK_SETTINGS))) Object.assign(SIZES[k], v);
}

for (const need of ['pagedjs/dist/paged.polyfill.js', 'hyphen/en-gb', 'pdf-lib', '@fontsource/libre-caslon-text/files', '@fontsource/eb-garamond/files']) {
  const p = path.join(MODULES, need);
  if (!fs.existsSync(p) && !fs.existsSync(p + '.js') && !fs.existsSync(path.join(p, 'index.js'))) {
    throw new Error(`scripts/node_modules/${need} is missing: run "cd scripts && npm ci" first`);
  }
}
const { hyphenateSync } = require(path.join(MODULES, 'hyphen/en-gb'));

/* ---------- content ---------- */

const lexicon = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8'));
const entries = Book.bookEntries(lexicon);
const unresolved = Book.unresolvedRefs(entries);
if (unresolved.length) throw new Error('unresolved cross-references: ' + unresolved.map(r => `#${r.from} → #${r.to}`).join(', '));
const byId = new Map(entries.map(e => [e.id, e]));

// The drawn script words (src/headings/), placed as on the site (build.js drawn()).
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'headings', 'manifest.json'), 'utf8'));
const svgCache = new Map();
function drawWord(w) {
  if (svgCache.has(w)) return svgCache.get(w);
  const m = manifest.words[w];
  if (!m) throw new Error(`no drawing for the heading word "${w}": redraw the headings with scripts/draw-headings.mjs`);
  const svg = fs.readFileSync(path.join(SRC, 'headings', 'words', m.file), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const d = svg.match(/<path d="([^"]*)"/)[1];
  const out = `<svg viewBox="${viewBox}" style="width:${+(m.advance / manifest.unitsPerEm).toFixed(3)}em"><path d="${d}"/></svg>`;
  svgCache.set(w, out);
  return out;
}
const drawWords = text => text.split(' ').filter(Boolean).map(drawWord).join(' ');
// The text stays in the page, unseen, so the PDF can be searched and copied.
const drawn = (text, parts) => `<span class="hidden-text">${esc(text)}</span><span class="drawn" aria-hidden="true">${
  parts ? parts.map(([cls, t]) => `<span class="${cls}">${drawWords(t)}</span>`).join(' ') : drawWords(text)}</span>`;

// Soft hyphens for justified text in a narrow column (Chromium has no hyphenation dictionary here).
const hyph = s => hyphenateSync(s, { minWordLength: 6 });
const typeset = s => hyph(s)
  .replace(/\u00AD(?=['’])/g, '')                     // never "Bearer-’s"
  .replace(/'/g, '’')                                  // the lexicon's few straight apostrophes
  .replace(/ [-–] /g, '\u00a0– ');                     // a spaced hyphen is a dash, and never starts a line

/* A passage as paragraphs, each "#NN" the referenced entry's title, with its page number set small. */
function passage(body) {
  return body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    const parts = p.split(/\B#(\d+)/);
    let html = '';
    parts.forEach((part, i) => {
      if (i % 2 === 0) html += esc(typeset(part));
      else {
        const t = byId.get(Number(part));
        html += `<a class="xref" href="#e${t.id}">${esc(t.title.replace(/'/g, '’'))}</a>`;
      }
    });
    return `<p>${html}</p>`;
  }).join('\n');
}

/* ---------- artwork, in black ink ---------- */

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const ART = {
  flower1: 'assets/flowers/1.png', flower2: 'assets/flowers/2.png', flower3: 'assets/flowers/3.png',
  flower4: 'assets/flowers/4.png', flower5: 'assets/flowers/5.png', logo: 'assets/logo.png'
};

/*
 * Turn each brown drawing into black line art, in Chromium's canvas: a pixel's
 * ink is its opacity times its darkness, scaled so the darkest brown (the 95th
 * percentile of the solid pixels) is solid black. That ink is enlarged
 * smoothly (ART_SCALE) and cut at half, so the result is pure black and pure
 * white at 1,200 ppi or more: line art, as a printer wants it. finishPdf then
 * makes each one a stencil (an image mask) that lays black ink on the strokes
 * and nothing anywhere else, so no box can show around a drawing.
 */
const ART_SCALE = { flower1: 4, flower2: 4, flower3: 4, flower4: 4, flower5: 4, logo: 3 };
async function inkArt(browser) {
  const dir = path.join(OUT, 'img');
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  const sizes = {};
  for (const [key, rel] of Object.entries(ART)) {
    const src = path.join(SRC, rel);
    const b64 = fs.readFileSync(src).toString('base64');
    const png = await page.evaluate(async ([data, scale]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, c.width, c.height);
      const px = id.data;
      const dark = [];
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] > 200) dark.push(1 - (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255);
      }
      dark.sort((a, b) => a - b);
      const ref = dark.length ? Math.max(0.05, dark[Math.floor(dark.length * 0.95)]) : 1;
      for (let i = 0; i < px.length; i += 4) {
        const d = 1 - (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
        const ink = (px[i + 3] / 255) * Math.min(1, d / ref);
        px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = Math.round(255 * ink);
      }
      g.putImageData(id, 0, 0);
      const big = document.createElement('canvas');
      big.width = c.width * scale; big.height = c.height * scale;
      const bg = big.getContext('2d');
      bg.imageSmoothingEnabled = true;
      bg.imageSmoothingQuality = 'high';
      bg.drawImage(c, 0, 0, big.width, big.height);
      const bd = bg.getImageData(0, 0, big.width, big.height);
      const bp = bd.data;
      for (let i = 0; i < bp.length; i += 4) {
        const v = bp[i + 3] >= 128 ? 0 : 255;
        bp[i] = bp[i + 1] = bp[i + 2] = v; bp[i + 3] = 255;
      }
      bg.putImageData(bd, 0, 0);
      return big.toDataURL('image/png').split(',')[1];
    }, [b64, ART_SCALE[key]]);
    fs.writeFileSync(path.join(dir, key + '.png'), Buffer.from(png, 'base64'));
    sizes[key] = pngSize(src);
  }
  await page.close();
  return sizes;
}

// The dividers are line drawings: their strokes in black, the traced-from scan removed (as build.js does).
function divider(name, cls) {
  const svg = fs.readFileSync(path.join(SRC, 'assets', 'dividers', name + '.svg'), 'utf8')
    .replace(/^[\s\S]*?(?=<svg\b)/, '')
    .replace(/<image\b[\s\S]*?<\/image>\s*/g, '')
    .replace(/<svg\b[^>]*?(viewBox="[^"]*")[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" $1 aria-hidden="true">')
    .replace(/stroke="#[0-9a-fA-F]{3,6}"/g, 'stroke="#000"')
    .replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="#000"');
  return `<div class="divider ${cls || ''}">${svg}</div>`;
}

/* ---------- the pages ---------- */

function html(size, art, fit = new Map()) {
  const S = SIZES[size];
  const img = (key, cls, heightMm) => {
    const { width, height } = art[key];
    return `<img class="${cls}" src="img/${key}.png" alt="" style="height:${heightMm}mm;width:${(width * heightMm / height).toFixed(2)}mm">`;
  };
  const bouquet = (code, heightMm) => Cipher.displayStems(code).map(d => img('flower' + d, 'stem', heightMm)).join('');
  const logo = (widthMm) => {
    const { width, height } = art.logo;
    return `<img class="logo" src="img/logo.png" alt="Cryptofloricon" style="width:${widthMm}mm;height:${(height * widthMm / width).toFixed(2)}mm">`;
  };

  const font = (family, file, style, weight) =>
    `${'@'}font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; src: url('${pathToFileURL(path.join(MODULES, file)).href}') format('woff2'); }`;

  const textWidth = `calc(${S.width} - ${S.inside + S.outside}mm)`;

  const css = `
${font('Libre Caslon Text', '@fontsource/libre-caslon-text/files/libre-caslon-text-latin-400-normal.woff2', 'normal', 400)}
${font('Libre Caslon Text', '@fontsource/libre-caslon-text/files/libre-caslon-text-latin-400-italic.woff2', 'italic', 400)}
${font('Libre Caslon Text', '@fontsource/libre-caslon-text/files/libre-caslon-text-latin-700-normal.woff2', 'normal', 700)}
${font('Book Cyrillic', '@fontsource/eb-garamond/files/eb-garamond-cyrillic-400-normal.woff2', 'normal', 400)}
${font('Book Cyrillic', '@fontsource/eb-garamond/files/eb-garamond-cyrillic-400-italic.woff2', 'italic', 400)}

@page {
  size: ${S.width} ${S.height};
  margin: ${S.top}mm ${S.outside}mm ${S.bottom}mm ${S.inside}mm;
  @bottom-center {
    content: counter(page);
    font: ${S.folio}pt 'Libre Caslon Text', serif;
    color: #000;
    vertical-align: top;
    padding-top: ${(S.bottom - 7.4 - S.folio * 0.3528 * 1.2).toFixed(2)}mm;
  }
}
@page :left  { margin-left: ${S.outside}mm; margin-right: ${S.inside}mm; }
@page :right { margin-left: ${S.inside}mm; margin-right: ${S.outside}mm; }
/* No folio on the front matter, the part title, the colophon or any blank page. */
@page front    { @bottom-center { content: none; } }
@page blank    { @bottom-center { content: none; } }
@page :blank   { @bottom-center { content: none; } }
@page story    { @bottom-center { content: counter(page, lower-roman); } }

html { color: #000; background: #fff; }
body {
  margin: 0;
  font: ${S.body}pt/${S.leading}pt 'Libre Caslon Text', 'Book Cyrillic', serif;
  hyphens: manual;
  hyphenate-character: "-";  /* Chromium otherwise looks for U+2010, which Libre Caslon lacks */
  font-variant-numeric: oldstyle-nums;
  font-kerning: normal;
}
p { margin: 0; orphans: 2; widows: 2; }
.hidden-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.sc { font-variant: small-caps; letter-spacing: 0.04em; }
.cy { font-family: 'Book Cyrillic', serif; font-size: 1.16em; line-height: 0; }

/* The drawn script: each word an SVG one em tall (Andrade's ascender to descender), as on the site. */
.title { font-size: ${S.title}pt; line-height: 1.95; text-align: center; font-weight: normal; margin: 0; word-spacing: -0.042em; break-after: avoid; }
.drawn svg { height: 1em; margin: 0.475em 0; vertical-align: top; overflow: visible; fill: #000; }
.title .line, .title .joiner { display: block; }

.divider { text-align: center; }
.divider svg { width: 26mm; height: auto; overflow: visible; }
.divider path { stroke-width: 1.5; }

/* ---------- front matter ---------- */
.front { page: front; }
.half-title, .title-page, .copyright, .part-title, .colophon { break-before: page; height: calc(${S.height} - ${S.top + S.bottom}mm); position: relative; }
.half-title, .part-title { break-before: right; text-align: center; }
.half-title .logo, .part-title .logo { margin-top: 28%; }
.title-page { break-before: right; text-align: center; }
.title-page .logo { margin-top: 12%; }
.title-page .title { font-size: ${(S.title * 0.72).toFixed(1)}pt; margin-top: 1.2em; }
.title-page .divider { margin-top: 1.4em; }
.title-page .byline { position: absolute; bottom: 0; left: 0; right: 0; }
.title-page .byline p + p { margin-top: 0.4em; }
.copyright { break-before: left; font-size: ${(S.body * 0.86).toFixed(2)}pt; line-height: ${(S.leading * 0.86).toFixed(2)}pt; }
.copyright .block { position: absolute; bottom: 0; left: 0; right: 0; }
.copyright p + p { margin-top: ${(S.leading * 0.86 * 0.6).toFixed(2)}pt; }
.copyright .roles i { font-style: italic; }

/* ---------- the Story ---------- */
.story { page: story; break-before: right; }
.story .title { margin-bottom: 0.1em; }
.story .divider { margin: 0 0 ${(S.leading * 1.5).toFixed(1)}pt; }
.story p { text-align: justify; text-indent: 1.2em; }
.story p:first-of-type { text-indent: 0; }
/* The drawn initial: its box is Andrade's em, the capital filling the top 0.6 of it, so it spans three lines. */
.story .dropcap { float: left; font-size: ${(S.leading * 3.6).toFixed(1)}pt; line-height: 1; margin: ${(S.leading * 0.05).toFixed(2)}pt ${(S.body * 0.3).toFixed(1)}pt 0 0; height: ${(S.leading * 2.6).toFixed(1)}pt; }
.story .dropcap svg { display: block; height: 1em; overflow: visible; fill: #000; }
.story p.signature { text-align: right; text-indent: 0; margin-top: ${S.leading / 2}pt; font-style: italic; }

/* ---------- the entries ---------- */
.part-title { page: blank; }
.entry { break-before: page; }
.entry.first { break-before: right; counter-reset: page 1; }
.bouquet { text-align: center; height: ${S.stems}mm; margin: 0 0 ${(S.stems * 0.12).toFixed(1)}mm; line-height: 0; }
.bouquet .stem { display: inline-block; margin: 0 -${(S.stems * 0.04).toFixed(2)}mm; vertical-align: bottom; }
.entry .title { margin: 0 0 ${(S.leading * 0.25).toFixed(1)}pt; }
.passage p { text-align: justify; text-indent: 1.2em; }
.passage p + p { margin-top: ${(S.leading * S.paraGap).toFixed(2)}pt; }
/* The few entries too long for the common setting (see fitEntries): first a smaller bouquet, then also slightly closer lines. */
.entry.fit1 .bouquet, .entry.fit2 .bouquet { height: ${(S.stems * FIT_STEMS).toFixed(1)}mm; }
.entry.fit1 .bouquet .stem, .entry.fit2 .bouquet .stem { height: ${(S.stems * FIT_STEMS).toFixed(1)}mm !important; width: auto !important; }
.entry.fit2 .passage { line-height: ${(S.leading * FIT_LEADING).toFixed(2)}pt; }
.xref { color: #000; text-decoration: none; font-style: italic; }
/* The referenced title's page, set small after it as in 2013. */
.xref::after { content: target-counter(attr(href url), page); font-style: italic; font-size: 0.62em; vertical-align: -0.25em; line-height: 0; margin-left: 0.08em; font-variant-numeric: lining-nums; }

/* ---------- the indexes ---------- */
.back h2 { font: normal ${(S.body * 1.25).toFixed(1)}pt/${S.leading * 1.2}pt 'Libre Caslon Text', serif; font-variant: small-caps; letter-spacing: 0.06em; text-align: center; margin: 0; }
.back .note { font-style: italic; text-align: center; text-wrap: balance; margin: ${S.leading * 0.4}pt 0 ${S.leading * 0.6}pt; font-size: ${(S.body * 0.92).toFixed(2)}pt; line-height: ${(S.leading * 0.92).toFixed(1)}pt; }
.back .divider { margin: ${S.leading * 0.4}pt 0 0; }
.decode-page { break-before: page; }
.decode-page.first { break-before: right; }
table.decode { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.decode th { font: normal ${S.index.head}pt/1.2 'Libre Caslon Text', serif; font-variant: small-caps; letter-spacing: 0.02em; padding: 0 0 1.6mm; text-align: center; }
table.decode th.pg, table.decode td.pg { width: 11%; text-align: right; }
table.decode td { height: ${S.index.row}mm; text-align: center; vertical-align: bottom; padding: 0 0 0.6mm; line-height: 0; }
/* No rules (Ed, 2026-11-26): the rows are carried by their spacing alone. */
table.decode td .stem { margin: 0 -0.25mm; vertical-align: bottom; }
table.decode td.pg { font-size: ${S.index.text}pt; line-height: 1; vertical-align: bottom; padding-bottom: 1mm; font-variant-numeric: lining-nums; }
.titles { break-before: right; }
.titles ol { list-style: none; margin: 0; padding: 0; font-size: ${S.index.text}pt; line-height: ${S.index.leading}pt; }
.titles li { display: flex; align-items: baseline; break-inside: avoid; }
.titles li .t { font-style: italic; }
/* Leaders of full stops, cut to fit: crisper in print than a dotted border. */
.titles li .dots { flex: 1; overflow: hidden; white-space: nowrap; margin: 0 0.3em; text-align: right; direction: rtl; }
.titles li .dots::before { content: '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . '; letter-spacing: 0.12em; }
.titles li a { color: #000; text-decoration: none; font-variant-numeric: lining-nums; }
.titles li a::after { content: target-counter(attr(href url), page); }
.titles li.letter { margin-top: ${(S.index.leading * 0.5).toFixed(1)}pt; }

.colophon { page: blank; break-before: left; text-align: center; }
.colophon .block { position: absolute; bottom: 0; left: 0; right: 0; font-size: ${(S.body * 0.86).toFixed(2)}pt; line-height: ${(S.leading * 0.9).toFixed(1)}pt; }
.colophon .set-in { margin-top: 1em; }
.colophon .name { letter-spacing: 0.14em; font-variant: small-caps; }
`;

  const credit = (role, names) => `<p class="roles"><i>${role}</i> ${names}</p>`;

  const front = `
<section class="front half-title">${logo(S.inside * 3.6)}</section>
<section class="front title-page">
  ${logo(S.inside * 5)}
  <h1 class="title">${drawn('A Lexicon of Ciphers – to – Encrypt and Decrypt Floral Bouquets',
    [['line', 'A Lexicon of Ciphers'], ['joiner', '– to –'], ['line', 'Encrypt and Decrypt Floral Bouquets']])}</h1>
  ${divider('small')}
  <div class="byline">
    <p class="sc">Sasha Garwood &amp; Grant Howitt</p>
    <p class="sc">Original Content London</p>
  </div>
</section>
<section class="front copyright">
  <div class="block">
    <p><span class="sc">Cryptofloricon</span><br><i>A Lexicon of Ciphers to Encrypt and Decrypt Floral Bouquets</i></p>
    <p>${['<i>Invented and produced by</i> Edward Saperia', '<i>Written by</i> Sasha Garwood and Grant Howitt',
      '<i>Graphics by</i> Sam Ballard and <span class="cy">Евгений Олегович</span>'].join('<br>')}</p>
    <p>First made in London in 2013.<br>This edition 2026.</p>
    <p>&copy; Original Content London 2013, 2026.<br>All rights reserved.</p>
    <p>cryptofloricon.com</p>
  </div>
</section>`;

  // The Story, with its first letter drawn large as on the site; the letter itself stays, unseen.
  let story = fs.readFileSync(path.join(ROOT, 'content', 'story.html'), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
  story = story.replace(/>([^<]+)</g, (m, t) => '>' + typeset(t) + '<');
  const first = story.match(/<p>([A-Za-z])/);
  story = story.replace(first[0], `<p><span class="dropcap" aria-hidden="true">${drawWord(first[1])}</span><span class="hidden-text">${first[1]}</span>`);
  const storySection = `
<section class="story">
  <h1 class="title">${drawn('Introduction')}</h1>
  ${divider('small')}
  ${story}
</section>`;

  const entryPages = entries.map((e, i) => `
<section class="entry${i === 0 ? ' first' : ''}${fit.has(e.id) ? ' fit' + fit.get(e.id) : ''}" id="e${e.id}" data-id="e${e.id}">
  <div class="bouquet">${bouquet(e.code, S.stems)}</div>
  <h2 class="title">${drawn(e.title)}</h2>
  <div class="passage">
${passage(e.body)}
  </div>
</section>`).join('');

  // The decoding table, a page at a time so each page has its column heads.
  const rows = Book.decodingIndex(lexicon);
  const chunks = [rows.slice(0, S.index.rowsFirst)];
  for (let i = S.index.rowsFirst; i < rows.length; i += S.index.rowsPer) chunks.push(rows.slice(i, i + S.index.rowsPer));
  const head = `<tr>${Cipher.KEY_ORDER.map(d => `<th>${Cipher.FLOWERS[d].name}</th>`).join('')}<th class="pg">Page</th></tr>`;
  const row = r => `<tr>${r.counts.map((n, i) => `<td>${Array.from({ length: n }, () => img('flower' + Cipher.KEY_ORDER[i], 'stem', S.index.stem)).join('')}</td>`).join('')}<td class="pg">${
    r.entries.map(e => `<a class="pgref" href="#e${e.id}"></a>`).join(', ')}</td></tr>`;
  const decode = chunks.map((c, i) => `
<section class="back decode-page${i === 0 ? ' first' : ''}">
  ${i === 0 ? `<h2>To Decode a Bouquet</h2>
  <p class="note">Count the flowers of each kind in the bouquet you were given, find the row that matches, and turn to the page.</p>` : ''}
  <table class="decode"><thead>${head}</thead><tbody>${c.map(row).join('')}</tbody></table>
</section>`).join('');

  let letter = '';
  const titleItems = Book.titleIndex(lexicon).map(e => {
    const l = Book.titleSortKey(e.title)[0].toUpperCase();
    const cls = l !== letter && letter ? ' class="letter"' : '';
    letter = l;
    return `<li${cls}><span class="t">${esc(e.title.replace(/'/g, '’'))}</span><span class="dots"></span><a href="#e${e.id}"></a></li>`;
  }).join('\n');
  const titles = `
<section class="back titles">
  <h2>Index of Messages</h2>
  ${divider('small')}
  <p class="note">To send a message, find its page: the bouquet is drawn above the title.</p>
  <ol>
${titleItems}
  </ol>
</section>`;

  const colophon = `
<section class="colophon">
  <div class="block">
    <p class="name">Cryptofloricon</p>
    <p>London 2013 &middot; 2026</p>
    <p class="set-in"><i>Set in Libre Caslon Text;<br>the titles drawn from Andrade Script Pro.</i></p>
  </div>
</section>`;

  const partTitle = `<section class="part-title">${logo(S.inside * 3.6)}</section>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>Cryptofloricon (${esc(S.label)})</title>
<style>${css}
table.decode td.pg a.pgref { color: #000; text-decoration: none; }
table.decode td.pg a.pgref::after { content: target-counter(attr(href url), page); }
</style>
<script>
// Paged.js resets the page counter on the first entry's page, but this Chromium keeps that
// reset to the one page, so the pages after it would go on counting from the front matter.
// Number each page after it explicitly, as Paged.js already counted them for target-counter().
// Where a page ends inside a word, Paged.js cuts the word one letter past its soft
// hyphen and adds U+2011, which Libre Caslon lacks. Cut at the soft hyphen instead,
// with an ordinary hyphen, and carry the letters over to the next page's first line.
function mendHyphens() {
  document.querySelectorAll('.pagedjs_hyphen').forEach(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) last = walker.currentNode;
    if (!last || !last.textContent.endsWith('\u2011')) return;
    const m = last.textContent.match(/\u00AD([^\s\u00AD]*)\u2011$/);
    if (!m) { last.textContent = last.textContent.slice(0, -1) + '-'; return; }
    last.textContent = last.textContent.slice(0, -m[0].length) + '-';
    const next = el.dataset.ref && document.querySelector('[data-split-from="' + el.dataset.ref + '"]');
    if (!next || !m[1]) return;
    const w = document.createTreeWalker(next, NodeFilter.SHOW_TEXT);
    if (w.nextNode()) w.currentNode.textContent = m[1] + w.currentNode.textContent;
  });
}
window.PagedConfig = { auto: true, after: (flow) => {
  mendHyphens();
  const pages = [...document.querySelectorAll('.pagedjs_page')];
  const first = pages.findIndex(p => p.querySelector('.entry.first'));
  const style = document.createElement('style');
  style.textContent = pages.map((p, i) => i > first
    ? '.pagedjs_page[data-page-number="' + (i + 1) + '"] { counter-reset: page ' + (i - first + 1) + '; counter-increment: none; }' : '').join(' ');
  document.head.appendChild(style);
  window.__paged = { total: flow.total, firstEntryPage: first + 1 };
} };
</script>
<script src="${pathToFileURL(path.join(MODULES, 'pagedjs/dist/paged.polyfill.js')).href}"></script>
</head>
<body>
${front}
${storySection}
${partTitle}
${entryPages}
${decode}
${withTitleIndex ? titles : ''}
${colophon}
</body>
</html>
`;
}

/* ---------- print ---------- */

const { chromium } = require('playwright');

/*
 * Chromium rounds the paper to whole CSS pixels, so A6 comes out 105.16 × 148.17 mm,
 * and Bookvault checks a PDF's dimensions against the book's. The layout itself is
 * at the exact size from the top left, so trim the sliver off the right and bottom:
 * every page's media box (and trim box) becomes exactly the trim size.
 */
async function finishPdf(file, S) {
  const { PDFDocument } = require(path.join(MODULES, 'pdf-lib'));
  const pt = v => v.endsWith('mm') ? parseFloat(v) * 72 / 25.4 : parseFloat(v) * 72;
  const w = pt(S.width), h = pt(S.height);
  const doc = await PDFDocument.load(fs.readFileSync(file));
  for (const page of doc.getPages()) {
    const { width, height } = page.getMediaBox();
    if (Math.abs(width - w) > 2 || Math.abs(height - h) > 2) throw new Error(`${S.file}: page is ${width} × ${height} pt, not ${w} × ${h}`);
    page.setMediaBox(0, height - h, w, h);
    page.setTrimBox(0, height - h, w, h);
    page.setCropBox(0, height - h, w, h);
  }
  // Black ink only: Chromium writes its black and white as RGB, and the inked
  // drawings as RGB images with an sRGB profile. Every colour in the book is a
  // neutral grey, so rewrite each as DeviceGray: "0 0 0 rg" becomes "0 g", and
  // each image keeps one channel of its three. Stop if any other colour appears.
  const { PDFName, PDFRawStream, PDFArray } = require(path.join(MODULES, 'pdf-lib'));
  const zlib = require('node:zlib');
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const filter = dict.get(PDFName.of('Filter'));
    if (!filter || String(filter) !== '/FlateDecode' || dict.get(PDFName.of('DecodeParms'))) continue;
    if (String(dict.get(PDFName.of('Subtype'))) === '/Image') {
      const cs = dict.get(PDFName.of('ColorSpace'));
      if (!(cs instanceof PDFArray) || String(cs.get(0)) !== '/ICCBased') throw new Error(`image ${ref}: unexpected colour space ${cs}`);
      // Each drawing is pure black and white (inkArt): make it a 1-bit stencil.
      // Sample 0 paints with the current fill colour (black, set where it is
      // drawn, below); 1 leaves the paper untouched.
      const rgb = zlib.inflateSync(Buffer.from(obj.contents));
      const w = dict.get(PDFName.of('Width')).asNumber(), h = dict.get(PDFName.of('Height')).asNumber();
      if (rgb.length !== w * h * 3) throw new Error(`image ${ref}: unexpected data size`);
      const rowBytes = Math.ceil(w / 8);
      const bits = Buffer.alloc(rowBytes * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = 3 * (y * w + x);
          const [r, g, b] = [rgb[o], rgb[o + 1], rgb[o + 2]];
          if (Math.abs(r - g) > 2 || Math.abs(g - b) > 2 || (g > 8 && g < 247)) throw new Error(`image ${ref}: not pure black and white`);
          if (g >= 128) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
      dict.delete(PDFName.of('ColorSpace'));
      dict.set(PDFName.of('BitsPerComponent'), doc.context.obj(1));
      dict.set(PDFName.of('ImageMask'), doc.context.obj(true));
      doc.context.assign(ref, PDFRawStream.of(dict, zlib.deflateSync(bits, { level: 9 })));
      continue;
    }
    if (dict.get(PDFName.of('Length1')) || dict.get(PDFName.of('Subtype'))) continue;  // fonts and the like
    let text;
    try { text = zlib.inflateSync(Buffer.from(obj.contents)).toString('latin1'); } catch { continue; }
    if (!/\b(rg|RG|Do)\b/.test(text)) continue;
    const out = text
      // A stencil paints in the current fill colour: make it black for each drawing.
      .replace(/(^|\s)(\/X\w+ Do)(?=\s)/g, '$1q 0 g $2 Q')
      .replace(/(^|\s)([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)(?=\s)/g, (m, sp, r, g, b, op) => {
      if (r !== g || g !== b) throw new Error(`content ${ref}: colour ${r} ${g} ${b} is not grey`);
      return `${sp}${g} ${op === 'rg' ? 'g' : 'G'}`;
    });
    if (/(^|\s)(sc|SC|scn|SCN|k|K|cs|CS)(?=\s)/.test(out)) throw new Error(`content ${ref}: other colour operators`);
    doc.context.assign(ref, PDFRawStream.of(dict, zlib.deflateSync(Buffer.from(out, 'latin1'))));
  }
  // The cross-references are links on screen; a print file needs none.
  for (const page of doc.getPages()) page.node.delete(PDFName.of('Annots'));
  doc.setTitle('Cryptofloricon');
  doc.setAuthor('Sasha Garwood and Grant Howitt');
  doc.setSubject(`Book interior, ${S.label}`);
  doc.setCreator('scripts/build-book.mjs (Paged.js, Chromium)');
  fs.writeFileSync(file, await doc.save({ useObjectStreams: false }));
}

/*
 * Fitting (Ed, 54a): every entry fits on its one page, as in 2013. Before the
 * slow Paged.js layout, every entry is set in one plain column at the text
 * block's width and measured. An entry too tall for the common setting is
 * helped, subtly and always the same way: first a smaller bouquet (fit1), then
 * also slightly closer lines (fit2); its type is never smaller than the rest.
 * An entry that fits at none of these stops the build.
 */
const FIT_STEMS = 0.72;     // the bouquet's height in fit1 and fit2
const FIT_LEADING = 0.95;   // the passage's leading in fit2
const FIT_SPARE = 1;        // lines kept spare at the foot of each page: the paged layout can differ slightly from this measure

async function fitEntries(browser, size, art) {
  const S = SIZES[size];
  const file = path.join(OUT, `measure-${size}.html`);
  // The same pages without Paged.js: everything in one column the text block's width.
  const textMm = parseFloat(S.width) * (S.width.endsWith('in') ? 25.4 : 1) - S.inside - S.outside;
  fs.writeFileSync(file, html(size, art)
    .replace(/<script>[\s\S]*?<\/script>\s*<script src=[^>]*><\/script>/, '')
    .replace('</style>', `body { width: ${textMm}mm; } .front, .story, .part-title, .back, .colophon { display: none; } .entry { display: flow-root; }</style>`));
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const heightMm = parseFloat(S.height) * (S.height.endsWith('in') ? 25.4 : 1) - S.top - S.bottom;
  const avail = heightMm * 96 / 25.4 - FIT_SPARE * S.leading * 96 / 72;
  const heights = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.entry')];
    const out = {};
    for (const level of [0, 1, 2]) {
      els.forEach(el => { el.classList.remove('fit1', 'fit2'); if (level) el.classList.add('fit' + level); });
      els.forEach(el => { (out[el.dataset.id] = out[el.dataset.id] || [])[level] = el.getBoundingClientRect().height; });
    }
    return out;
  });
  await page.close();
  const fit = new Map();
  const rows = Object.entries(heights).map(([key, h]) => {
    const id = Number(key.slice(1));
    const level = h.findIndex(v => v <= avail);
    if (level > 0) fit.set(id, level);
    return { id, level, fill: (level < 0 ? h[2] : h[level]) / avail, natural: h[0] / avail };
  });
  return { fit, rows, tooLong: rows.filter(r => r.level < 0) };
}

/* Each passage as the reader should see it, letters only: the text with each "#NN" as its title. */
const expectedText = Object.fromEntries(entries.map(e => [`e${e.id}`,
  e.body.replace(/\B#(\d+)/g, (m, id) => byId.get(Number(id)).title).toLowerCase().replace(/[^a-z]/g, '')]));

/* Lay one size out with Paged.js; the page stays open for printing. */
async function layout(browser, size, art, fit) {
  const htmlFile = path.join(OUT, `book-${size}.html`);
  fs.writeFileSync(htmlFile, html(size, art, fit));
  if (htmlOnly) return { htmlFile };
  const page = await browser.newPage();
  // A script error in the page would leave the layout waiting for ever: stop on the first.
  let failed;
  const failure = new Promise((_, reject) => { failed = reject; });
  page.on('pageerror', err => failed(new Error('page error: ' + err.message)));
  await page.goto(pathToFileURL(htmlFile).href);
  await Promise.race([page.waitForFunction(() => window.__paged, null, { timeout: 600000, polling: 500 }), failure]);
  // What the layout came to: the pages, and any entry that runs past its page.
  const report = await page.evaluate((expected) => {
    const pages = [...document.querySelectorAll('.pagedjs_page')];
    // Every word of every passage must be on the page: compare letters with the source.
    const letters = t => t.toLowerCase().replace(/[^a-z]/g, '');
    const lost = Object.entries(expected).filter(([id, want]) =>
      letters([...document.querySelectorAll('.entry[data-id="' + id + '"] .passage')].map(el => el.textContent).join(' ')) !== want).map(([id]) => Number(id.slice(1)));
    const runOn = [...new Set([...document.querySelectorAll('.entry[data-split-from]')].map(el => Number(el.dataset.id.slice(1))))];
    const overflow = pages.filter(pg => {
      const area = pg.querySelector('.pagedjs_page_content');
      return area && area.scrollHeight > area.clientHeight + 2;
    }).map(pg => pages.indexOf(pg) + 1);
    return { total: pages.length, runOn, overflow, lost };
  }, expectedText);
  return { page, report, htmlFile };
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const art = await inkArt(browser);
  for (const size of sizes) {
    const S = SIZES[size];
    const title = id => byId.get(id).title;
    const { fit, rows, tooLong } = await fitEntries(browser, size, art);
    const tightest = rows.filter(r => r.level >= 0).sort((a, b) => b.fill - a.fill).slice(0, 5)
      .map(r => `${title(r.id)} ${Math.round(r.fill * 100)}%${r.level ? ' (fit' + r.level + ')' : ''}`).join('; ');
    const longest = rows.slice().sort((a, b) => b.natural - a.natural).slice(0, 5)
      .map(r => `${title(r.id)} ${Math.round(r.natural * 100)}%`).join('; ');
    const helped = [1, 2].map(l => rows.filter(r => r.level === l).map(r => title(r.id)));
    const summary = `${S.label}: ${S.body}/${S.leading} pt, margins ${S.inside}/${S.outside}/${S.top}/${S.bottom} mm (inside/outside/top/bottom), bouquet ${S.stems} mm.\n` +
      `  Smaller bouquet: ${helped[0].length}${helped[0].length ? ' (' + helped[0].join('; ') + ')' : ''}. Also closer lines: ${helped[1].length}${helped[1].length ? ' (' + helped[1].join('; ') + ')' : ''}.\n` +
      `  Tallest as set (share of the page): ${tightest}.\n  Tallest in the common setting: ${longest}.`;
    if (measureOnly || tooLong.length) {
      console.log(summary + (tooLong.length ? `\n  TOO LONG for one page: ${tooLong.map(r => `${title(r.id)} ${Math.round(r.fill * 100)}%`).join('; ')}` : ''));
      if (tooLong.length && !measureOnly) throw new Error(`${S.file}: ${tooLong.length} entries do not fit on one page`);
      continue;
    }
    const result = await layout(browser, size, art, fit);
    if (htmlOnly) { console.log('wrote', path.relative(ROOT, result.htmlFile)); continue; }
    const { page, report } = result;
    // The checks (54a): no entry may run past its page, and none may lose any of its text.
    if (report.runOn.length || report.lost.length) {
      await page.close();
      throw new Error(`${S.file}: ` + [report.runOn.length && `entries run past their page: ${report.runOn.map(title).join('; ')}`,
        report.lost.length && `entries missing text: ${report.lost.map(title).join('; ')}`].filter(Boolean).join('. '));
    }
    const pdf = path.join(OUT, S.file);
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: false, outline: false });
    await page.close();
    await finishPdf(pdf, S);
    console.log(`${S.file}: ${report.total} pages; every entry on one page.\n${summary}` +
      (report.overflow.length ? `\n  Overflowing pages: ${report.overflow.join(', ')}` : ''));
  }
} finally {
  await browser.close();
}
