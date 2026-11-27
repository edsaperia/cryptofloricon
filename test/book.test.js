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

// The title index is left out of the book for now (Ed, 53) but kept behind
// build-book.mjs --title-index, so its data stays checked.
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

test('the entries face each other in 2013\'s pairs: entry n is on a left-hand page when n is odd', () => {
  const titles = Book.bookEntries(lexicon).map(e => e.title);
  titles.forEach((t, i) => assert.equal(Book.entrySide(i + 1), (i + 1) % 2 === 1 ? 'left' : 'right', t));
  // The pairs 2013 set side by side across a spread.
  const spread = n => [titles[n - 1], titles[n]];
  for (const [n, pair] of [[1, ['I love you', 'I like you']], [17, ['I can wait', "I can't wait"]], [19, ['You win', 'You lose']], [63, ['Yes', 'No']]]) {
    assert.equal(Book.entrySide(n), 'left');
    assert.equal(Book.entrySide(n + 1), 'right');
    assert.deepEqual(spread(n), pair);
  }
});

test('the Appendix page is a drawing, not a font', () => {
  // Church Text may not be embedded: its word is committed as outlines (scripts/draw-word.mjs).
  const svg = fs.readFileSync(path.join(ROOT, 'src', 'headings', 'appendix-church-text.svg'), 'utf8');
  assert.match(svg, /<title>Appendix<\/title>/);
  assert.match(svg, /<path d="M/);
  assert.match(svg, /data-upem="\d+" data-advance="\d+"/);
});

test('the book-only edit to One last chance (Ed, 61b) applies, and leaves the lexicon untouched', () => {
  const before = fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8');
  const edits = Book.loadEdits();
  assert.equal(edits.length, 1);
  const [edit] = edits;
  assert.equal(edit.id, 44);
  assert.match(edit.source, /2013 print master, p\. 167/);
  assert.match(edit.ruling, /61b/);
  const original = lexicon.find(e => e.id === 44);
  const printed = Book.bookText(lexicon).find(e => e.id === 44);
  // Exactly that text is removed, and the passage ends where 2013's did.
  assert.equal(printed.body, original.body.replace(edit.remove, ''));
  assert.equal(original.body.length - printed.body.length, edit.remove.length);
  assert.match(printed.body, /conditional or otherwise\.$/);
  // Every other entry is unchanged, and so is the lexicon itself.
  Book.bookText(lexicon).forEach((e, i) => { if (e.id !== 44) assert.equal(e, lexicon[i]); });
  assert.ok(original.body.includes(edit.remove), 'the lexicon still has the full passage');
  assert.equal(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8'), before);
  // An edit whose text is not there is refused.
  assert.throws(() => Book.bookText(lexicon, [{ ...edit, remove: 'not in the passage' }]), /0 times, not once/);
});

/* ---------- Caslon's extras (Ed, 80) ---------- */

const plain = text => ({ text, fixed: false });
const ref = text => ({ text, fixed: true });
const ligWords = paras => paras.flat().map(s => s.text).join(' ').match(new RegExp(`${Book.LIG_OPEN}[^${Book.LIG_CLOSE}]*${Book.LIG_CLOSE}`, 'g')) || [];

test('the historical ligatures are sprinkled by a fixed rule: one a paragraph at most, a gap of words between', () => {
  const para = [plain('the first act is just a test of the respect we must show to most of them')];
  // With no gap, the first eligible word in each paragraph, and only one there.
  const out = Book.sprinkleLigatures([para, para], { gap: 0 });
  assert.deepEqual(ligWords(out), ['\uE000first\uE001', '\uE000first\uE001']);
  // The text is otherwise untouched.
  assert.equal(out[0][0].text.replace(/[\uE000\uE001]/g, ''), para[0].text);
  // A gap of 30 words (each paragraph has 17): the count runs on across paragraphs, so the first
  // comes at the first eligible word after word 30, "most" in the second paragraph, and the third has none.
  const state = { since: 0 };
  const gapped = Book.sprinkleLigatures([para, para, para], { gap: 30, state });
  assert.deepEqual(gapped.map(p => ligWords([p]).length), [0, 1, 0]);
  assert.match(gapped[1][0].text, /\uE000most\uE001 of them$/);
  // The same input always gives the same result.
  assert.deepEqual(Book.sprinkleLigatures([para, para, para], { gap: 30 }), gapped);
});

test('no ligature in or right beside a cross-reference, in small capitals, in a capitalised or long word, or on a full page', () => {
  const none = paras => assert.deepEqual(ligWords(Book.sprinkleLigatures(paras, { gap: 0 })), []);
  none([[ref('Just a test'), plain(' first, then nothing')]]);       // the word after a reference
  none([[plain('nothing but first '), ref('Must do')]]);                 // the word before one
  none([[ref('here was a time, many years since,'), plain(' that I contemplated')]]);   // after small capitals
  none([[plain('Stop. Strictly Christmas.')]]);                          // capitals, and Ch is no ligature
  none([[plain('enthusiastically, well-structured')]]);                  // too long; not a plain word
  assert.deepEqual(ligWords(Book.sprinkleLigatures([[plain('the first act')]], { gap: 0, skip: true })), []);
  // One word further on is fine.
  assert.deepEqual(ligWords(Book.sprinkleLigatures([[ref('Yes'), plain(' or first, then nothing')]], { gap: 0 })), ['\uE000first\uE001']);
});

test('a swash capital goes only on an entry\'s first cross-reference, where it has room', () => {
  assert.deepEqual(Book.swashRef([[plain('Some words.')], [plain(''), ref('Tell me the truth'), plain(' is a bold request.')]]), [1, 1]);
  assert.deepEqual(Book.swashRef([[plain('It is suspicious. '), ref('Tell me the truth'), plain(' is a bold request.')]]), [0, 1]);
  assert.equal(Book.swashRef([[plain('Mid-sentence, '), ref('Tell me the truth'), plain(' then more words.')]]), null);
  assert.equal(Book.swashRef([[plain('Ends. '), ref('Tell me'), plain(' or '), ref('Yes'), plain(' close together.')]]), null);
  assert.equal(Book.swashRef([[plain('Ends. '), ref('I love you'), plain(' with no swash worth having.')]]), null);
  assert.equal(Book.swashRef([[plain('No references at all.')]]), null);
  // Over the whole book: few, and each an entry's first reference.
  const lexicon2 = Book.bookText(Book.bookEntries(lexicon));
  const byId = new Map(lexicon2.map(e => [e.id, e]));
  const segs = body => body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => p.split(/\B#(\d+)/).map((t, i) => i % 2 ? ref(byId.get(Number(t)).title) : plain(t)));
  const n = lexicon2.filter(e => Book.swashRef(segs(e.body))).length;
  assert.ok(n > 5 && n < 30, `sparing: ${n} entries`);
  // And the ligatures over the book: an occasional touch, roughly one every few paragraphs.
  const state = { since: 0 };
  const paras = lexicon2.reduce((k, e) => k + segs(e.body).length, 0);
  const ligs = lexicon2.reduce((k, e) => k + ligWords(Book.sprinkleLigatures(segs(e.body), { state })).length, 0);
  assert.ok(ligs > paras / 8 && ligs < paras / 2.5, `${ligs} ligatures in ${paras} paragraphs`);
});
