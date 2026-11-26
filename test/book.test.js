'use strict';
// The book's source data (lib/book.js, book/order.json): checked here without
// rendering anything, so CI needs no npm install. The PDFs themselves are laid
// out by scripts/build-book.mjs, outside CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Book = require('../lib/book');
const Cipher = require('../lib/cipher');
const { refsIn } = require('../lib/render');

const ROOT = path.join(__dirname, '..');
const lexicon = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8'));
const order = Book.loadOrder();

test('every entry is in the book exactly once', () => {
  assert.equal(order.length, lexicon.length);
  assert.equal(new Set(order).size, order.length, 'no id twice');
  assert.deepEqual([...order].sort((a, b) => a - b), lexicon.map(e => e.id).sort((a, b) => a - b));
  assert.equal(Book.bookEntries(lexicon).length, lexicon.length);
});

test('a missing, doubled or unknown entry in the order is refused', () => {
  assert.throws(() => Book.bookEntries(lexicon, order.slice(1)), /missing from the book order/);
  assert.throws(() => Book.bookEntries(lexicon, [...order, order[0]]), /twice/);
  assert.throws(() => Book.bookEntries(lexicon, [...order, 9999]), /not the lexicon/);
});

test('the order is the 2013 print master\'s', () => {
  // Page by page as printed in April 2013: the opening, a few pairs of opposites, and the close.
  const titles = Book.bookEntries(lexicon).map(e => e.title);
  assert.deepEqual(titles.slice(0, 3), ['I love you', 'I like you', 'By way of introduction']);
  assert.deepEqual(titles.slice(16, 20), ['I can wait', "I can't wait", 'You win', 'You lose']);
  assert.deepEqual(titles.slice(62, 64), ['Yes', 'No']);
  assert.equal(titles[titles.length - 1], 'My work here is done');
  // The order file says where it comes from.
  const file = JSON.parse(fs.readFileSync(Book.ORDER_FILE, 'utf8'));
  assert.match(file.about, /2013 print master/);
});

test('every cross-reference resolves to an entry in the book', () => {
  const entries = Book.bookEntries(lexicon);
  assert.deepEqual(Book.unresolvedRefs(entries), []);
  assert.ok(entries.reduce((n, e) => n + refsIn(e.body).length, 0) > 1000, 'the passages are full of references');
  // An unresolvable one is reported.
  const broken = entries.map(e => (e.id === entries[0].id ? { ...e, body: e.body + ' #9999' } : e));
  assert.deepEqual(Book.unresolvedRefs(broken), [{ from: entries[0].id, to: 9999 }]);
});

test('the decoding index has every code once, sorted by flower counts in display order', () => {
  const rows = Book.decodingIndex(lexicon);
  const codes = new Set(lexicon.map(e => e.code));
  assert.equal(rows.length, codes.size);
  assert.deepEqual(new Set(rows.map(r => r.code)), codes);
  assert.equal(rows.reduce((n, r) => n + r.entries.length, 0), lexicon.length, 'every entry under its code');
  for (let i = 1; i < rows.length; i++) assert.ok(Book.compareKeys(rows[i - 1].counts, rows[i].counts) < 0, rows[i].code);
  rows.forEach(r => {
    // The counts are the bouquet: Chrysanth, Lily, Gerbera, Rose, Carnation.
    const stems = Cipher.displayStems(r.code);
    assert.deepEqual(r.counts, Cipher.KEY_ORDER.map(d => stems.filter(s => s === String(d)).length));
  });
  // As in 2013's table: a lone carnation first, then two, then three.
  assert.deepEqual(rows.slice(0, 3).map(r => r.code), ['4', '44', '444']);
});

test('the title index has every entry once, in alphabetical order', () => {
  const index = Book.titleIndex(lexicon);
  assert.equal(index.length, lexicon.length);
  assert.equal(new Set(index.map(e => e.id)).size, lexicon.length);
  const keys = index.map(e => Book.titleSortKey(e.title));
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i - 1] <= keys[i], keys[i]);
  assert.equal(Book.titleSortKey("You've gotta be kidding me"), 'youve gotta be kidding me');
  assert.equal(Book.titleSortKey('Keep calm & carry on'), 'keep calm and carry on');
});

test('every script title in the book has a drawing', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'headings', 'manifest.json'), 'utf8'));
  const words = new Set(['Introduction', 'A Lexicon of Ciphers', '– to –', 'Encrypt and Decrypt Floral Bouquets', 'T']
    .concat(lexicon.map(e => e.title)).flatMap(t => t.split(' ')).filter(Boolean));
  assert.deepEqual([...words].filter(w => !manifest.words[w]), []);
});
