#!/usr/bin/env node
/*
 * Draws the site's script headings from the title font, Andrade Script Pro,
 * as SVG outlines, one file per word, into src/headings/.
 *
 *   cd scripts && npm ci                       once, for HarfBuzz (harfbuzzjs)
 *   node scripts/draw-headings.mjs <font.ttf>  redraw every heading word
 *   node scripts/draw-headings.mjs <font.ttf> --check
 *                                              report what would change, write nothing
 *
 * The font is licensed to Ed (MyFonts order M4359904) and never goes in the
 * repository or the site: it is read from wherever it is given, and only the
 * drawings are committed. Its copy is in Ed's Dropbox at
 * /Cryptofloricon/Fonts/Andrade/MyFontsWebfontsKit/webfonts/title.ttf.
 *
 * Which text to draw comes from the build itself (build.js, run with
 * collectHeadings), so every heading the site shows is covered: page titles,
 * tag titles, all message titles, the Decode script's "Uh oh!" and the
 * story's drop cap. `node build.js` fails on any heading word with no
 * drawing, so a new or renamed title forces a redraw.
 *
 * The words are shaped with HarfBuzz, the shaping engine browsers use, with
 * its default features (kerning and ligatures), so they come out as the
 * webfont drew them. Every drawing shares one vertical frame, the font's
 * ascender to descender with the baseline at y=0, and is as wide as the
 * word's advance, so the words sit on one baseline and space as text does;
 * swashes may reach outside the frame (site.css lets them show).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'headings');
const WORDS = path.join(OUT, 'words');
const INK = '#581a0e'; // site.css --ink: the colour a word file shows in when opened on its own

const args = process.argv.slice(2);
const check = args.includes('--check');
const fontPath = args.find(a => !a.startsWith('--'));
if (!fontPath) {
  console.error('Usage: node scripts/draw-headings.mjs <path to Andrade Script Pro .ttf> [--check]');
  process.exit(2);
}
if (path.resolve(fontPath).startsWith(ROOT + path.sep) && !path.resolve(fontPath).includes(`${path.sep}node_modules${path.sep}`)) {
  console.warn('Warning: the font is inside the repository. It must never be committed (.gitignore keeps *.ttf out).');
}

/* A file name for a word that differs by case on case-blind disks: "I" is _i.svg, "else?" is else=3f.svg. */
function fileFor(word) {
  let name = '';
  for (const ch of word) {
    if (/[a-z0-9]/.test(ch)) name += ch;
    else if (/[A-Z]/.test(ch)) name += '_' + ch.toLowerCase();
    else name += '=' + ch.codePointAt(0).toString(16);
  }
  return name + '.svg';
}

/*
 * A HarfBuzz glyph path (absolute, font units, y up), moved to (dx, dy) and
 * turned y down, as a list of [command, points] in whole units.
 */
function parseGlyph(d, dx, dy) {
  if (/[^MLQCZ0-9.,\s-]/.test(d)) throw new Error('Unexpected command in a glyph path: ' + d.slice(0, 40));
  return [...d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)].map(([, cmd, nums]) => {
    const n = nums.split(/[ ,]+/).filter(Boolean).map(Number);
    const pts = [];
    for (let i = 0; i < n.length; i += 2) pts.push([Math.round(n[i] + dx), Math.round(-(n[i + 1] + dy))]);
    return [cmd, pts];
  });
}

/* Write commands as a compact SVG path: relative coordinates, no needless separators. */
function compactPath(cmds) {
  let out = '';
  let last = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const num = v => (out && /[\d.]$/.test(out) && v >= 0 ? ' ' : '') + v;
  for (const [cmd, pts] of cmds) {
    if (cmd === 'Z') { out += 'z'; last = 'z'; cx = sx; cy = sy; continue; }
    const rel = cmd.toLowerCase();
    if (rel !== last || rel === 'm') out += rel;
    last = rel;
    for (const [x, y] of pts) { out += num(x - cx); out += num(y - cy); }
    [cx, cy] = pts[pts.length - 1];
    if (cmd === 'M') { sx = cx; sy = cy; }
  }
  return out;
}

// What to draw: every heading the build places.
const { build } = require(path.join(ROOT, 'build.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-draw-'));
let headings;
try {
  headings = build(tmp, { collectHeadings: true }).headingTexts;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const words = [...new Set(headings.flatMap(t => t.split(' ').filter(Boolean)))].sort();

const fontData = fs.readFileSync(fontPath);
const face = new hb.Face(new hb.Blob(fontData));
const font = new hb.Font(face);
const upem = face.upem;
const { ascender, descender } = font.hExtents();
const height = ascender - descender;

const manifest = {
  about: 'Drawings of the script headings, made by scripts/draw-headings.mjs from Andrade Script Pro (DSType, licensed to Ed). '
    + 'Each word is one SVG in words/, in font units: the baseline at y=0, ascender to descender tall, as wide as its advance.',
  font: 'Andrade Script Pro',
  fontSha256: crypto.createHash('sha256').update(fontData).digest('hex'),
  unitsPerEm: upem,
  ascender,
  descender,
  words: {},
  headings: [...headings].sort()
};

const files = {};
const notInFont = [];
for (const word of words) {
  const buf = new hb.Buffer();
  buf.addText(word);
  buf.guessSegmentProperties();
  hb.shape(font, buf);
  const infos = buf.getGlyphInfos();
  const pos = buf.getGlyphPositions();
  let x = 0;
  const cmds = [];
  infos.forEach((g, i) => {
    if (g.codepoint === 0) notInFont.push(word);
    cmds.push(...parseGlyph(font.glyphToPath(g.codepoint), x + pos[i].xOffset, pos[i].yOffset));
    x += pos[i].xAdvance;
  });
  const advance = Math.round(x);
  const file = fileFor(word);
  manifest.words[word] = { file, advance };
  files[file] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-ascender} ${advance} ${height}" width="${advance / 10}" height="${height / 10}">`
    + `<title>${word.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`
    + `<path d="${compactPath(cmds)}" fill="${INK}"/></svg>\n`;
}
if (notInFont.length) {
  console.error('The font has no glyph for a character in: ' + [...new Set(notInFont)].join(', '));
  process.exit(1);
}

// Compare with what is committed.
const before = fs.existsSync(WORDS) ? fs.readdirSync(WORDS).filter(f => f.endsWith('.svg')) : [];
const added = Object.keys(files).filter(f => !before.includes(f));
const removed = before.filter(f => !(f in files));
const changed = Object.keys(files).filter(f => before.includes(f) && fs.readFileSync(path.join(WORDS, f), 'utf8') !== files[f]);
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
const manifestFile = path.join(OUT, 'manifest.json');
const manifestChanged = !fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, 'utf8') !== manifestText;

console.log(`${headings.length} headings, ${words.length} words: ${added.length} new, ${changed.length} changed, ${removed.length} no longer used`
  + `${manifestChanged ? '; manifest changes' : ''}.`);
if (check) process.exit(added.length || changed.length || removed.length || manifestChanged ? 1 : 0);

fs.mkdirSync(WORDS, { recursive: true });
for (const [f, svg] of Object.entries(files)) fs.writeFileSync(path.join(WORDS, f), svg);
for (const f of removed) fs.rmSync(path.join(WORDS, f));
fs.writeFileSync(manifestFile, manifestText);
console.log('Wrote ' + path.relative(process.cwd(), OUT));
