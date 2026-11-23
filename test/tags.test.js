'use strict';
// Ed's tag rulings (2026-11-23, decisions 29a-35a): Question is for messages
// that ask the Receiver something, a new tag Request covers asks and pleas,
// bare replies carry Acceptance or Rejection and Perfunction, and every tag
// has its own page with a drawn heading.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, loadLexicon } = require('../build');

const ROOT = path.join(__dirname, '..');
const entries = loadLexicon();
const tagsOf = id => entries.find(e => e.id === id).tags;

test('#24 Help! has Request and not Question (29a, 30a)', () => {
  assert.ok(tagsOf(24).includes('Request'));
  assert.ok(!tagsOf(24).includes('Question'));
});

test('#5 Drink? has Question (29a)', () => {
  assert.ok(tagsOf(5).includes('Question'));
});

test('#74 No has Rejection and Perfunction (31)', () => {
  assert.ok(tagsOf(74).includes('Rejection'));
  assert.ok(tagsOf(74).includes('Perfunction'));
});

test('bare replies that plainly mean yes carry Acceptance, plainly no Rejection (31, 36a)', () => {
  for (const id of [73, 70, 137, 81, 171, 43]) assert.ok(tagsOf(id).includes('Acceptance'), '#' + id + ' Acceptance');
  for (const id of [74, 181, 193, 122]) assert.ok(tagsOf(id).includes('Rejection'), '#' + id + ' Rejection');
  // Never and I think not keep Warning (38a).
  for (const id of [181, 193]) assert.ok(tagsOf(id).includes('Warning'), '#' + id + ' Warning');
});

test('the nine asks named in the ruling all carry Request (30a)', () => {
  for (const id of [24, 15, 168, 101, 33, 56, 62, 100, 9]) assert.ok(tagsOf(id).includes('Request'), '#' + id);
});

test('the data has 14 tags, Request among them', () => {
  const tags = new Set(entries.flatMap(e => e.tags));
  assert.equal(tags.size, 14);
  assert.ok(tags.has('Request'));
  assert.ok(tags.has('Perfunction'), 'Perfunction keeps its name (34b)');
});

// Built only if the data's every heading word has a drawing; otherwise the
// build itself throws, and the page tests below fail with that error.
let out = null;
let buildError = null;
try {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-tags-'));
  build(out);
} catch (e) {
  buildError = e;
}
test.after(() => out && fs.rmSync(out, { recursive: true, force: true }));
const read = rel => {
  if (buildError) throw buildError;
  return fs.readFileSync(path.join(out, rel), 'utf8');
};

test('the Request tag page exists and is linked from Browse and Send a Message', () => {
  const page = read('browse/request/index.html');
  assert.match(page, /<h1 class="title"><span class="visually-hidden">Request<\/span>/);
  // Help! is listed on it.
  assert.match(page, /Help!/);
  assert.ok(read('browse/index.html').includes('href="../browse/request/"'), 'Browse links Request');
  assert.ok(read('encode/index.html').includes('href="../browse/request/"'), 'Send a Message links Request');
});

test('every tag in the data has a tag page and a drawn heading', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'headings', 'manifest.json'), 'utf8'));
  for (const tag of new Set(entries.flatMap(e => e.tags))) {
    assert.ok(manifest.words[tag], tag + ' has a drawing in src/headings');
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'headings', 'words', manifest.words[tag].file)), tag + ' drawing file');
    const slug = tag.toLowerCase();
    const h1 = read('browse/' + slug + '/index.html').match(/<h1 class="title">([\s\S]*?)<\/h1>/);
    assert.ok(h1, tag + ' page has a title');
    assert.ok(h1[1].includes(`<span class="visually-hidden">${tag}</span>`), tag + ' title text');
    assert.match(h1[1], /<svg\b/, tag + ' title is drawn');
  }
});
