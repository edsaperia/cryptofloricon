#!/usr/bin/env node
/*
 * Draws one word in a given font as SVG outlines, for a heading whose font
 * may not be embedded or committed.
 *
 *   cd scripts && npm ci                                  once, for HarfBuzz (harfbuzzjs)
 *   node scripts/draw-word.mjs <font.ttf> <word> <out.svg> [--shift i:units,...]
 *
 * --shift moves glyph i (from 0) right by that many font units (left if
 * negative), to match lettering that was spaced by hand.
 *
 * Used for the book's "Appendix" page, set as in 2013 in Church Text (Dan X.
 * Solo, Dover Publications, 1998), a blackletter in the logo's style:
 *
 *   node scripts/draw-word.mjs church-text.ttf Appendix src/headings/appendix-church-text.svg
 *
 * and for the "Cryptofloricon" logo, which is Church Text typed out with the
 * letters spaced by hand; these shifts reproduce the 2013 raster logo
 * (src/assets/logo.png) to within about 0.3% of its width:
 *
 *   node scripts/draw-word.mjs church-text.ttf Cryptofloricon src/headings/cryptofloricon-church-text.svg \
 *     --shift 1:10,2:12,3:17,4:-8,5:-40,6:-60,7:-80,8:-95,9:-98,10:-105,11:-100,12:-100,13:-100
 *
 * The font's fsType forbids embedding, so the font itself never goes in the
 * repository or a PDF; only this drawing is committed. Whether the font's
 * licence allows printing these outlines in a sold book is UNCONFIRMED.
 *
 * The drawing is shaped with HarfBuzz like scripts/draw-headings.mjs, in font
 * units: the baseline at y=0, the font's ascender to descender tall, as wide
 * as the word's advance.
 */
import fs from 'node:fs';
import * as hb from 'harfbuzzjs';

const [fontPath, word, outPath] = process.argv.slice(2);
const shiftArg = process.argv.includes('--shift') ? process.argv[process.argv.indexOf('--shift') + 1] : '';
const shifts = Object.fromEntries(shiftArg.split(',').filter(Boolean).map(s => s.split(':').map(Number)));
if (!fontPath || !word || !outPath) {
  console.error('usage: node scripts/draw-word.mjs <font.ttf> <word> <out.svg>');
  process.exit(2);
}

const face = new hb.Face(new hb.Blob(fs.readFileSync(fontPath)));
const font = new hb.Font(face);
const { ascender, descender } = font.hExtents();
const height = ascender - descender;

/* A HarfBuzz glyph path (font units, y up) moved to (dx, dy) and turned y down, in whole units. */
function glyphPath(d, dx, dy) {
  if (/[^MLQCZ0-9.,\s-]/.test(d)) throw new Error('Unexpected command in a glyph path: ' + d.slice(0, 40));
  return d.replace(/([MLQCZ])([^MLQCZ]*)/g, (m, cmd, nums) => {
    const n = nums.split(/[ ,]+/).filter(Boolean).map(Number);
    const pts = [];
    for (let i = 0; i < n.length; i += 2) pts.push(Math.round(n[i] + dx) + ' ' + Math.round(-(n[i + 1] + dy)));
    return cmd + pts.join(' ');
  });
}

const buf = new hb.Buffer();
buf.addText(word);
buf.guessSegmentProperties();
hb.shape(font, buf);
const pos = buf.getGlyphPositions();
let x = 0;
let d = '';
buf.getGlyphInfos().forEach((g, i) => {
  if (g.codepoint === 0) throw new Error(`the font has no glyph for a character in "${word}"`);
  d += glyphPath(font.glyphToPath(g.codepoint), x + pos[i].xOffset + (shifts[i] || 0), pos[i].yOffset);
  x += pos[i].xAdvance;
});
const last = buf.getGlyphInfos().length - 1;
const advance = Math.round(x + (shifts[last] || 0));
fs.writeFileSync(outPath,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-ascender} ${advance} ${height}" data-upem="${face.upem}" data-advance="${advance}">`
  + `<title>${word}</title><path d="${d}"/></svg>\n`);
console.log(`wrote ${outPath}: ${advance} × ${height} units (${face.upem} per em)`);
