#!/usr/bin/env node
/*
 * The book's interior, as print-ready PDFs at two trim sizes from one layout:
 *
 *   book/out/cryptofloricon-a6-interior.pdf       A6, 105 × 148 mm (the special edition)
 *   book/out/cryptofloricon-5.5x8.5-interior.pdf  5.5 × 8.5 in (the Amazon edition)
 *
 * Usage:  cd scripts && npm ci         (once: Paged.js, hyphenation patterns, the body face)
 *         node scripts/build-book.mjs [--size a6|us] [--html]
 *
 * --html writes the pages' HTML and stops (open it in Chromium to see the
 * layout live); otherwise each size is laid out by Paged.js in Playwright's
 * Chromium (pre-installed, as for draw-previews.mjs) and printed to PDF.
 * Nothing here runs in CI; test/book.test.js checks the book's data instead.
 *
 * The book follows the 2013 print master (April 2013, 90 × 140 mm): a half
 * title, the title page, the Story, then one entry to a page in the 2013 order
 * (book/order.json), each with its bouquet, its drawn script title and its
 * passage, cross-references printed as the referenced title with its page
 * number set small; at the back the table for decoding a bouquet by its
 * flowers, which 2013 had, and an index of titles, which it did not.
 *
 * Print: black ink only. Text and the drawn titles are pure black; the brown
 * woodcut stems and the logo are turned into black ink on white (each pixel's
 * ink is its opacity times its darkness, the darkest brown counting as solid
 * black) and flattened, so the PDF has no colour and no transparency. The
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
 * pages, so the gutter is at least 12.7 mm; each size here clears that, with
 * room to spare for a hardback's tighter opening. Bookvault publishes no fixed
 * interior margins (its templates come from its quote tool), so A6 uses the
 * same rule. The folio sits in the bottom margin, still well inside 6.4 mm.
 */
const SIZES = {
  a6: {
    file: 'cryptofloricon-a6-interior.pdf',
    label: 'A6, 105 × 148 mm',
    width: '105mm', height: '148mm',
    inside: 14, outside: 10, top: 12, bottom: 16,
    body: 8.2, leading: 11.4,         // pt
    title: 17,                        // pt: one em of the drawn script, ascender to descender
    stems: 16,                        // mm: the bouquet above each title
    folio: 7,                         // pt
    index: { stem: 7, row: 9, head: 6, rowsFirst: 10, rowsPer: 12, text: 7.4, leading: 10.4 }
  },
  us: {
    file: 'cryptofloricon-5.5x8.5-interior.pdf',
    label: '5.5 × 8.5 in',
    width: '5.5in', height: '8.5in',
    inside: 17, outside: 14, top: 17, bottom: 22,
    body: 10.6, leading: 15,
    title: 22,
    stems: 26,
    folio: 8.5,
    index: { stem: 8.4, row: 11.2, head: 7.5, rowsFirst: 11, rowsPer: 14, text: 9, leading: 13 }
  }
};

/* ---------- arguments ---------- */

const args = process.argv.slice(2);
const sizeArg = args.includes('--size') ? args[args.indexOf('--size') + 1] : null;
if (sizeArg && !SIZES[sizeArg]) throw new Error(`--size must be one of ${Object.keys(SIZES).join(', ')}`);
const sizes = sizeArg ? [sizeArg] : Object.keys(SIZES);
const htmlOnly = args.includes('--html');

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
 * Turn each brown drawing into black ink on white, in Chromium's canvas: a
 * pixel's ink is its opacity times its darkness, scaled so the darkest brown
 * (the 95th percentile of the solid pixels) is solid black, then flattened
 * onto white. The result is a neutral grey image with no alpha channel.
 */
async function inkArt(browser) {
  const dir = path.join(OUT, 'img');
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  const sizes = {};
  for (const [key, rel] of Object.entries(ART)) {
    const src = path.join(SRC, rel);
    const b64 = fs.readFileSync(src).toString('base64');
    const png = await page.evaluate(async (data) => {
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
        const v = Math.round(255 * (1 - ink));
        px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, b64);
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

function html(size, art, fit = new Set()) {
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
    padding-top: ${(S.bottom * 0.3).toFixed(1)}mm;
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
.passage p + p { margin-top: ${S.leading / 2}pt; }
/* Copyfitted entries (see FIT_LINES): a smaller bouquet, lines a touch closer, no gap between paragraphs. */
.entry.fit .bouquet { height: ${(S.stems * 0.72).toFixed(1)}mm; }
.entry.fit .bouquet .stem { height: ${(S.stems * 0.72).toFixed(1)}mm !important; width: auto !important; }
.entry.fit .passage { line-height: ${(S.leading * 0.96).toFixed(2)}pt; }
.entry.fit .passage p + p { margin-top: 0; }
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
table.decode th { font: normal ${S.index.head}pt/1.2 'Libre Caslon Text', serif; font-variant: small-caps; letter-spacing: 0.02em; padding: 0 0 1.2mm; border-bottom: 0.4pt solid #000; text-align: center; }
table.decode th.pg, table.decode td.pg { width: 11%; text-align: right; }
table.decode td { height: ${S.index.row}mm; text-align: center; vertical-align: bottom; padding: 0 0 0.6mm; line-height: 0; }
table.decode tr + tr td { border-top: 0.25pt solid #000; }
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
<section class="entry${i === 0 ? ' first' : ''}${fit.has(e.id) ? ' fit' : ''}" id="e${e.id}" data-id="e${e.id}">
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
${titles}
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
      const rgb = zlib.inflateSync(Buffer.from(obj.contents));
      const grey = Buffer.alloc(rgb.length / 3);
      for (let i = 0; i < grey.length; i++) {
        const [r, g, b] = [rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]];
        if (Math.abs(r - g) > 2 || Math.abs(g - b) > 2) throw new Error(`image ${ref}: not grey`);
        grey[i] = g;
      }
      dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'));
      doc.context.assign(ref, PDFRawStream.of(dict, zlib.deflateSync(grey, { level: 9 })));
      continue;
    }
    if (dict.get(PDFName.of('Length1')) || dict.get(PDFName.of('Subtype'))) continue;  // fonts and the like
    let text;
    try { text = zlib.inflateSync(Buffer.from(obj.contents)).toString('latin1'); } catch { continue; }
    if (!/\b(rg|RG)\b/.test(text)) continue;
    const out = text.replace(/(^|\s)([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)(?=\s)/g, (m, sp, r, g, b, op) => {
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
  // What the layout came to: the pages, and each entry that runs past its page with the lines it carries over.
  const report = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.pagedjs_page')];
    const runOn = [];
    pages.forEach(pg => pg.querySelectorAll('.entry[data-split-from]').forEach(el => {
      const ps = [...el.querySelectorAll('p')];
      const lh = parseFloat(getComputedStyle(ps[0] || el).lineHeight) || 1;
      runOn.push({ id: Number(el.dataset.id.slice(1)), lines: Math.round(ps.reduce((n, p) => n + p.getBoundingClientRect().height, 0) / lh) });
    }));
    const overflow = pages.filter(pg => {
      const area = pg.querySelector('.pagedjs_page_content');
      return area && area.scrollHeight > area.clientHeight + 2;
    }).map(pg => pages.indexOf(pg) + 1);
    return { total: pages.length, runOn, overflow };
  });
  return { page, report, htmlFile };
}

/*
 * Copyfitting: an entry that would carry three lines or fewer over to a second
 * page is set a little tighter (a smaller bouquet, slightly closer lines, no
 * gap between paragraphs) so it keeps to one page, then the book is laid out again.
 */
const FIT_LINES = 3;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const art = await inkArt(browser);
  for (const size of sizes) {
    const S = SIZES[size];
    let result = await layout(browser, size, art, new Set());
    if (htmlOnly) { console.log('wrote', path.relative(ROOT, result.htmlFile)); continue; }
    const fit = new Set(result.report.runOn.filter(r => r.lines <= FIT_LINES).map(r => r.id));
    if (fit.size) {
      await result.page.close();
      result = await layout(browser, size, art, fit);
    }
    const { page, report } = result;
    const pdf = path.join(OUT, S.file);
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: false, outline: false });
    await page.close();
    await finishPdf(pdf, S);
    const titled = r => `${byId.get(r.id).title} (+${r.lines})`;
    console.log(`${S.file}: ${report.total} pages. Set tighter to fit one page: ${fit.size}${fit.size ? ' (' + [...fit].map(id => byId.get(id).title).join('; ') + ')' : ''}. ` +
      `Running past one page: ${report.runOn.length}${report.runOn.length ? ' (' + report.runOn.map(titled).join('; ') + ')' : ''}.` +
      (report.overflow.length ? ` Overflowing pages: ${report.overflow.join(', ')}` : ''));
  }
} finally {
  await browser.close();
}
