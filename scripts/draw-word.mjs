#!/usr/bin/env node
/*
 * Draws one word in a given font as SVG outlines, for a heading whose font
 * may not be embedded or committed.
 *
 *   cd scripts && npm ci                                  once, for HarfBuzz (harfbuzzjs)
 *   node scripts/draw-word.mjs <font.ttf> <word> <out.svg>
 *
 * Used for the book's "Appendix" page, set as in 2013 in Church Text (Dan X.
 * Solo, Dover Publications, 1998), a blackletter in the logo's style:
 *
 *   node scripts/draw-word.mjs church-text.ttf Appendix src/headings/appendix-church-text.svg
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
  d += glyphPath(font.glyphToPath(g.codepoint), x + pos[i].xOffset, pos[i].yOffset);
  x += pos[i].xAdvance;
});
const advance = Math.round(x);
fs.writeFileSync(outPath,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-ascender} ${advance} ${height}" data-upem="${face.upem}" data-advance="${advance}">`
  + `<title>${word}</title><path d="${d}"/></svg>\n`);
console.log(`wrote ${outPath}: ${advance} × ${height} units (${face.upem} per em)`);
