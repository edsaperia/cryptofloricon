'use strict';
// The edits from the 2013 print master that Ed adopted (2026-11-23).
// Expected wording is written out by hand from his rulings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, loadLexicon } = require('../build');
const { renderBody } = require('../lib/render');

const byId = {};
loadLexicon().forEach(e => { byId[e.id] = e; });
const href = id => 'entry-' + id + '/';

test('#208 Be mine: sarcastically with #180, then a marginally condescending #173', () => {
  const body = byId[208].body;
  assert.ok(body.includes('tactfully with #27, #76 or a simple #74, sarcastically with #180, or with a marginally condescending #173.'));
  assert.ok(!body.includes('#180, sarcastically'));
  assert.ok(!body.includes('sarcastically with #168'));
});

test('#71 Reluctance: "similar ventures may have miscarried previously"', () => {
  const body = byId[71].body;
  assert.ok(body.includes('similar ventures may have miscarried previously'));
  assert.ok(!body.includes('perhaps similar ventures'));
});

test('#41 I can wait: no "#41s"; the Bearer sends "I can wait"', () => {
  for (const e of Object.values(byId)) assert.ok(!e.body.includes('#41s'), `#${e.id}`);
  const html = renderBody(byId[41].body, byId, href);
  const link = '<a class="xref" href="entry-41/">I can wait</a>';
  assert.ok(html.includes(`the Bearer is encouraged to send ${link} every year on the same date`));
  assert.ok(html.includes(`To send ${link} is to say`));
});

test('#158 "box set" and #35 "off key"', () => {
  assert.ok(byId[158].body.includes('box set'));
  assert.ok(!byId[158].body.includes('boxset'));
  assert.ok(byId[35].body.includes('off key'));
  assert.ok(!byId[35].body.includes('offkey'));
});

test('the Story says "aisle", never "isle", and ends with the signature S.G.', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-story-'));
  try {
    build(out);
    const page = fs.readFileSync(path.join(out, 'story', 'index.html'), 'utf8');
    assert.ok(page.includes('as she walked up the aisle,'));
    assert.doesNotMatch(page, /\bisle\b/i);
    const prose = page.slice(page.indexOf('<div class="prose">'), page.indexOf('</main>'));
    const text = prose.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    assert.ok(text.endsWith('to the last Cryptoflorist, in gratitude. S.G.'), text.slice(-80));
    assert.ok(prose.includes('<p class="signature">S.G.</p>'));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
