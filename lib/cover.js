'use strict';
/*
 * The book cover's geometry, as data: the KDP cover sizes and zones, and the
 * pattern of flowers laid over them. Shared by scripts/build-cover.mjs (which
 * draws the PDF) and test/cover.test.js. Standard library only. All lengths
 * are in inches, measured from the top left of the full cover file.
 *
 * The design (Ed, 2026-11-27): a cream ground with a sparse diamond lattice
 * of the five woodcut flowers in black, exactly one of each down the spine,
 * and the blackletter logo across the front in a band of two omitted rows.
 */

// The five flowers in the display order, by digit (1 lily, 2 rose, 3 chrysanth, 4 carnation, 5 gerbera).
const ORDER = ['3', '1', '5', '2', '4'];

/*
 * KDP's figures, read on kdp.amazon.com 2026-11-27:
 * - Paperback ("Create a Paperback Cover", help topic G201953020, and
 *   "Paperback Submission Guidelines", G201857950): bleed 0.125" on the top,
 *   bottom and outside edges; cover width = bleed + back + spine + front +
 *   bleed; spine for black-and-white on cream paper = pages × 0.0025"; text at
 *   least 0.125" inside the trim and content not meant to be trimmed at least
 *   0.25" from the outside edge; spine content 0.0625" clear of each fold;
 *   the spine may shift up to 0.125" either way.
 * - Hardcover, case laminate ("Create a Hardcover Cover", GDTKFJPNQCBTMRV6):
 *   the image extends 0.51" past the edge of the front cover (the wrap); text
 *   and images 0.635" from the edge of the book, 0.125" inside the margin
 *   line; a 0.4" hinge between the spine and the safe area of each board.
 *   KDP publishes the hardcover's spine width and board size only through its
 *   cover calculator, so they are inputs here (see build-cover.mjs).
 * - Barcode ("Barcodes", G5HDYGP4BXLX4RUW, and the two cover pages): KDP
 *   places a 2" × 1.2" white box in the lower right of the back cover, at
 *   least 0.25" from the spine and the trim (paperback); on a hardcover at
 *   least 0.76" from the bottom of the cover and 0.25" from the spine hinge.
 */
const KDP = {
  bleed: 0.125,
  creamPerPage: 0.0025,
  safeFromTrim: 0.25,
  spineFoldClear: 0.0625,
  spineShift: 0.125,
  hardWrap: 0.51,
  hardSafeInsideBoard: 0.125,
  hardHinge: 0.4,
  barcode: { w: 2, h: 1.2, fromSpine: 0.25, fromTrim: 0.25, hardFromBottom: 0.76, hardFromHinge: 0.25 }
};

// The pattern, from the approved mock-up (covers/wrap2.cjs at 200 px an inch).
const PATTERN = {
  rows: 10,
  rowStep: 0.85,       // 170 px: 21.6 mm
  firstRow: 0.425,     // 85 px from the top of the front cover
  flowerHeight: 0.3,   // 60 px: 7.6 mm
  logoWidthShare: 960 / 1100,
  band: 3              // rows 3 and 4 (from 0) are left out on the front for the logo
};

/*
 * The cover's frame: the full file, the panels, and the zones nothing may enter.
 * kind 'paperback': { pages } (spine from KDP's cream-paper formula).
 * kind 'hardback':  { spine, boardW, boardH } from KDP's cover calculator.
 */
function frame(kind, opts) {
  const trimW = 5.5, trimH = 8.5;
  if (kind === 'paperback') {
    const spine = +(opts.pages * KDP.creamPerPage).toFixed(4);
    const outer = KDP.bleed;
    const panelW = trimW, panelH = trimH;
    const width = outer * 2 + panelW * 2 + spine, height = outer * 2 + panelH;
    const backL = outer, spineL = outer + panelW, frontL = spineL + spine;
    return {
      kind, spine, width, height, outer, panelW, panelH,
      backL, spineL, frontL, top: outer,
      // Nothing may sit nearer an outer edge than this, or nearer a fold than foldClear.
      safeOuter: outer + KDP.safeFromTrim,
      foldClear: KDP.spineShift,
      spineSafe: KDP.spineFoldClear,
      barcode: {
        x: spineL - KDP.barcode.fromSpine - KDP.barcode.w,
        y: outer + panelH - KDP.barcode.fromTrim - KDP.barcode.h,
        w: KDP.barcode.w, h: KDP.barcode.h
      }
    };
  }
  if (kind === 'hardback') {
    const { spine, boardW, boardH } = opts;
    const outer = KDP.hardWrap;
    const width = outer * 2 + boardW * 2 + spine, height = outer * 2 + boardH;
    const backL = outer, spineL = outer + boardW, frontL = spineL + spine;
    return {
      kind, spine, width, height, outer, panelW: boardW, panelH: boardH,
      backL, spineL, frontL, top: outer,
      safeOuter: outer + KDP.hardSafeInsideBoard,
      foldClear: KDP.hardHinge,
      spineSafe: KDP.spineFoldClear,
      barcode: {
        x: spineL - KDP.hardHinge - KDP.barcode.hardFromHinge - KDP.barcode.w,
        y: height - KDP.barcode.hardFromBottom - KDP.barcode.h,
        w: KDP.barcode.w, h: KDP.barcode.h
      }
    };
  }
  throw new Error('kind must be paperback or hardback');
}

/*
 * The flowers. The lattice is anchored so that the spine's centre and the
 * front's centre are both columns (on alternate rows), which makes the front,
 * the back and the spine each symmetrical: dx = (frontCentre - spineCentre) / 2.5.
 * A flower's kind is ORDER[(u + 2v) mod 5], u its column counted along the row's
 * diagonal and v its row, so no flower touches one of its own kind. A flower is
 * kept only if it is whole inside the safe area, clear of the folds (or centred
 * on the spine), out of the barcode box and the logo band, and its mirror image
 * across its own panel is kept too, so each panel stays symmetrical.
 * widthOf(digit) gives a flower's width for its height (from the artwork).
 */
function layout(f, widthOf) {
  const P = PATTERN;
  const spineC = f.spineL + f.spine / 2;
  const frontC = f.frontL + f.panelW / 2;
  const backC = f.backL + f.panelW / 2;
  const dx = (frontC - spineC) / 2.5;
  const h = P.flowerHeight;
  const barcodeClear = 0.125;
  const rows = [];
  const all = [];
  for (let v = 0; v < P.rows; v++) {
    const y = f.top + P.firstRow + v * P.rowStep;
    for (let k = -8; k <= 8; k++) {
      const x = spineC + (k + (v % 2 ? 0.5 : 0)) * dx;
      const u = Math.round((x - spineC) / dx - v / 2);
      const kind = ORDER[(((u + 2 * v) % 5) + 5) % 5];
      all.push({ x, y, v, k, u, kind, w: widthOf(kind) * h, h });
    }
    rows.push(y);
  }
  const panelOf = p => (p.x < f.spineL ? 'back' : p.x > f.frontL ? 'front' : 'spine');
  const inBand = p => panelOf(p) === 'front' && (p.v === P.band || p.v === P.band + 1);
  const allowed = (p, ignoreBarcode) => {
    const l = p.x - p.w / 2, r = p.x + p.w / 2, t = p.y - p.h / 2, b = p.y + p.h / 2;
    if (l < f.safeOuter || r > f.width - f.safeOuter || t < f.safeOuter || b > f.height - f.safeOuter) return false;
    const panel = panelOf(p);
    if (panel === 'spine') {
      return Math.abs(p.x - spineC) < 1e-9 && l >= f.spineL + f.spineSafe && r <= f.frontL - f.spineSafe;
    }
    if (panel === 'back' && r > f.spineL - f.foldClear) return false;
    if (panel === 'front' && l < f.frontL + f.foldClear) return false;
    if (inBand(p)) return false;
    if (ignoreBarcode) return true;
    const bc = f.barcode;
    if (r > bc.x - barcodeClear && l < bc.x + bc.w + barcodeClear && b > bc.y - barcodeClear && t < bc.y + bc.h + barcodeClear) return false;
    return true;
  };
  const key = (x, v) => `${Math.round(x * 1000)}:${v}`;
  const ok = new Set(all.filter(p => allowed(p)).map(p => key(p.x, p.v)));
  // Keep a flower only with its mirror across its panel's centre (the barcode excepted:
  // it sits on the back, and the back's pattern simply gives way to it).
  const mirrorKept = p => {
    const panel = panelOf(p);
    if (panel === 'spine') return true;
    const c = panel === 'front' ? frontC : backC;
    const m = all.find(q => q.v === p.v && Math.abs(q.x - (2 * c - p.x)) < 1e-6);
    if (!m) return false;
    return ok.has(key(m.x, m.v)) || allowed(m, true);
  };
  const flowers = all.filter(p => ok.has(key(p.x, p.v)) && mirrorKept(p)).map(p => ({ ...p, panel: panelOf(p) }));
  const logoW = f.panelW * P.logoWidthShare;
  const logo = { cx: frontC, cy: f.top + P.firstRow + (P.band + 0.5) * P.rowStep, w: logoW };
  return { dx, dy: P.rowStep, spineC, frontC, backC, flowers, logo };
}

/* The kinds down the spine column, top to bottom. */
function spineKinds(lay) {
  return lay.flowers.filter(p => p.panel === 'spine').sort((a, b) => a.y - b.y).map(p => p.kind);
}

module.exports = { ORDER, KDP, PATTERN, frame, layout, spineKinds };
