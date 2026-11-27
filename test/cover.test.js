'use strict';
// The cover's pattern (lib/cover.js), checked without drawing anything:
// standard library only, so CI needs no npm install.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Cover = require('../lib/cover');

const ROOT = path.join(__dirname, '..');
// Each flower's width for its height, from the committed artwork's PNG header.
const ratio = Object.fromEntries(Cover.ORDER.map(d => {
  const b = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'flowers-hires', `${d}.png`));
  return [d, b.readUInt32BE(16) / b.readUInt32BE(20)];
}));
const covers = [
  ['paperback', Cover.frame('paperback', { pages: 204 })],
  // The hardback's spine and boards come from KDP's cover calculator; try a few plausible ones.
  ['hardback 0.51', Cover.frame('hardback', { spine: 0.51, boardW: 5.5, boardH: 8.5 })],
  ['hardback 0.75', Cover.frame('hardback', { spine: 0.75, boardW: 5.625, boardH: 8.75 })],
  ['paperback 120 pages', Cover.frame('paperback', { pages: 120 })]
];

test('the paperback is KDP\'s size for 204 pages on cream paper', () => {
  const f = covers[0][1];
  assert.equal(f.spine, 0.51);                         // 204 × 0.0025"
  assert.equal(f.width.toFixed(4), '11.7600');         // 0.125 + 5.5 + 0.51 + 5.5 + 0.125
  assert.equal(f.height, 8.75);                        // 0.125 + 8.5 + 0.125
});

for (const [name, f] of covers) {
  const lay = Cover.layout(f, d => ratio[d]);

  test(`${name}: no flower touches one of its own kind`, () => {
    // Neighbours in the diamond lattice: along the row, and diagonally to the rows above and below.
    const near = (a, b) => (a.v === b.v && Math.abs(Math.abs(a.x - b.x) - lay.dx) < 1e-6) ||
      (Math.abs(a.v - b.v) === 1 && Math.abs(Math.abs(a.x - b.x) - lay.dx / 2) < 1e-6);
    let pairs = 0;
    for (const a of lay.flowers) for (const b of lay.flowers) {
      if (a !== b && near(a, b)) { pairs++; assert.notEqual(a.kind, b.kind, `${a.kind} at ${a.x.toFixed(2)},${a.y.toFixed(2)}`); }
    }
    assert.ok(pairs > 50, 'neighbours were checked');
  });

  test(`${name}: the spine holds each of the five flowers exactly once`, () => {
    const kinds = Cover.spineKinds(lay);
    assert.equal(kinds.length, 5);
    assert.deepEqual([...kinds].sort(), [...Cover.ORDER].sort());
    lay.flowers.filter(p => p.panel === 'spine').forEach(p => assert.ok(Math.abs(p.x - lay.spineC) < 1e-9));
  });

  test(`${name}: no flower in the barcode area, nor outside the safe area, nor across a fold`, () => {
    const bc = f.barcode;
    for (const p of lay.flowers) {
      const l = p.x - p.w / 2, r = p.x + p.w / 2, t = p.y - p.h / 2, b = p.y + p.h / 2;
      assert.ok(!(r > bc.x && l < bc.x + bc.w && b > bc.y && t < bc.y + bc.h), `flower in the barcode box at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`);
      assert.ok(l >= f.safeOuter && r <= f.width - f.safeOuter && t >= f.safeOuter && b <= f.height - f.safeOuter, 'inside the safe area');
      if (p.panel === 'back') assert.ok(r <= f.spineL - f.foldClear);
      if (p.panel === 'front') assert.ok(l >= f.frontL + f.foldClear);
      if (p.panel === 'spine') assert.ok(l >= f.spineL + f.spineSafe && r <= f.frontL - f.spineSafe);
    }
  });

  test(`${name}: the front is symmetrical, with the logo band clear`, () => {
    const front = lay.flowers.filter(p => p.panel === 'front');
    for (const p of front) {
      assert.ok(front.some(q => q.v === p.v && Math.abs(q.x - (2 * lay.frontC - p.x)) < 1e-6), 'mirror on the front');
      assert.ok(p.v !== Cover.PATTERN.band && p.v !== Cover.PATTERN.band + 1, 'not in the logo band');
    }
    assert.ok(Math.abs(lay.logo.cx - lay.frontC) < 1e-9);
  });
}

test('the barcode box is where KDP puts it on the paperback: 2" × 1.2", 0.25" from the spine and the trim', () => {
  const f = covers[0][1];
  assert.equal(f.barcode.w, 2);
  assert.equal(f.barcode.h, 1.2);
  assert.ok(Math.abs(f.spineL - (f.barcode.x + f.barcode.w) - 0.25) < 1e-9);
  assert.ok(Math.abs(f.height - f.outer - (f.barcode.y + f.barcode.h) - 0.25) < 1e-9);
});
