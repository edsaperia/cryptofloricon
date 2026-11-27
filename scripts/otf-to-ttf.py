#!/usr/bin/env python3
"""
Convert a CFF-flavoured OpenType font (.otf) to TrueType outlines (.ttf).

    python3 scripts/otf-to-ttf.py <in.otf> <out.ttf>      (needs: pip install fonttools)

Why: Chromium's PDF writer cannot embed CFF outlines and falls back to Type 3
fonts, which print poorly and which print-on-demand preflight checks flag.
With TrueType outlines it embeds a proper CID TrueType subset. The book's
Adobe Caslon Pro files are CFF, so scripts/build-book.mjs converts them with
this script into a cache outside the repository; the converted fonts are as
private as the originals and are never committed.

Curves are converted with fontTools' cu2qu (maximum error 1 unit, about a
thousandth of an em), the same method as fontTools' own otf2ttf snippet.
"""
import sys

from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

MAX_ERR = 1.0
POST_FORMAT = 2.0


def otf_to_ttf(font):
    assert font.sfntVersion == "OTTO", "not a CFF-flavoured OpenType font"
    order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyf = newTable("glyf")
    glyf.glyphOrder = order
    glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(pen, MAX_ERR, reverse_direction=True))
        glyf[name] = pen.glyph()
    font["loca"] = newTable("loca")
    font["glyf"] = glyf
    del font["CFF "]
    if "VORG" in font:
        del font["VORG"]
    glyf.compile(font)
    font["maxp"] = maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    maxp.maxZones = 1
    for attr in ("maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs",
                 "maxStackElements", "maxSizeOfInstructions", "maxComponentElements"):
        setattr(maxp, attr, 0)
    maxp.maxComponentDepth = 0
    maxp.numGlyphs = len(order)
    font["head"].indexToLocFormat = 0
    font["head"].glyphDataFormat = 0
    post = font["post"]
    post.formatType = POST_FORMAT
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = order
    font.sfntVersion = "\000\001\000\000"


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: otf-to-ttf.py <in.otf> <out.ttf>")
    f = TTFont(sys.argv[1])
    otf_to_ttf(f)
    f.save(sys.argv[2])
