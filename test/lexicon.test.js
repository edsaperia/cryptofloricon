'use strict';
// The lexicon and the cipher. Expected values are written by hand, never read
// from data/lexicon.json, so a missing or stray entry fails a test.
const test = require('node:test');
const assert = require('node:assert/strict');
const Cipher = require('../lib/cipher');
const { loadLexicon } = require('../build');

const entries = loadLexicon();
const byCode = Cipher.indexByCode(entries);
const titles = res => res.entries.map(e => e.title);

test('the lexicon has exactly 177 entries with unique IDs', () => {
  assert.equal(entries.length, 177);
  assert.equal(new Set(entries.map(e => e.id)).size, 177);
});

test('every code is valid: digits 1-5, non-decreasing, 1-6 long', () => {
  for (const e of entries) {
    assert.match(e.code, /^[1-5]{1,6}$/, `#${e.id} ${e.title}: ${e.code}`);
    assert.equal(e.code, e.code.split('').sort().join(''), `#${e.id} code ${e.code} is not in order`);
    assert.ok(Cipher.isValidCode(e.code), `#${e.id} ${e.code}`);
  }
});

test('isValidCode refuses bad codes', () => {
  for (const bad of ['', '6', '0', '21', '1111111', '12a', 2]) assert.equal(Cipher.isValidCode(bad), false, String(bad));
  for (const good of ['1', '5', '14', '1334', '222555']) assert.equal(Cipher.isValidCode(good), true, good);
});

test('177 codes are in use, one per entry: no two entries share a code', () => {
  assert.equal(Object.keys(byCode).length, 177);
  const shared = Object.keys(byCode).filter(c => byCode[c].length > 1);
  assert.deepEqual(shared, []);
});

test('a single rose ("2") decodes to "I love you"', () => {
  const res = Cipher.decode('2', byCode);
  assert.equal(res.ok, true);
  assert.deepEqual(titles(res), ['I love you']);
});

test('a lily and a carnation ("14") decode to "Kiss me, you fool!"', () => {
  assert.deepEqual(titles(Cipher.decode('14', byCode)), ['Kiss me, you fool!']);
});

test('"1334" decodes to #162 My work here is done only (Ed, 2026-11-23)', () => {
  const res = Cipher.decode('1334', byCode);
  assert.deepEqual(res.entries.map(e => [e.id, e.title]), [[162, 'My work here is done']]);
});

test('"2445" decodes to #146 Despair, its January 2013 code (Ed, 2026-11-23)', () => {
  const res = Cipher.decode('2445', byCode);
  assert.deepEqual(res.entries.map(e => [e.id, e.title]), [[146, 'Despair']]);
});

test('a bouquet given in any order decodes the same', () => {
  for (const b of ['41', '14', [4, 1], [1, 4], { 4: 1, 1: 1 }, { 1: 1, 4: 1 }]) {
    const res = Cipher.decode(b, byCode);
    assert.equal(res.code, '14', JSON.stringify(b));
    assert.deepEqual(titles(res), ['Kiss me, you fool!'], JSON.stringify(b));
  }
  for (const b of ['4313', '3341', [3, 4, 1, 3], { 3: 2, 4: 1, 1: 1 }]) {
    assert.deepEqual(titles(Cipher.decode(b, byCode)), ['My work here is done'], JSON.stringify(b));
  }
  for (const b of ['5442', '4254', [5, 4, 4, 2], { 5: 1, 4: 2, 2: 1 }]) {
    assert.deepEqual(titles(Cipher.decode(b, byCode)), ['Despair'], JSON.stringify(b));
  }
});

test('an empty bouquet is refused', () => {
  for (const b of ['', [], {}, { 1: 0 }]) assert.deepEqual(Cipher.decode(b, byCode), { ok: false, reason: 'empty' }, JSON.stringify(b));
});

test('a bouquet of 7 stems is refused', () => {
  for (const b of ['1111111', '1234512', { 2: 7 }, [1, 1, 2, 2, 3, 3, 4]]) {
    assert.deepEqual(Cipher.decode(b, byCode), { ok: false, reason: 'too-many' }, JSON.stringify(b));
  }
});

test('something that is not one of the five flowers is refused', () => {
  for (const b of ['6', '0', '1x', { 7: 1 }, { 1: 1.5 }, null]) {
    assert.deepEqual(Cipher.decode(b, byCode), { ok: false, reason: 'not-a-flower' }, JSON.stringify(b));
  }
});

test('a well-formed bouquet that spells nothing decodes to no entries', () => {
  // Six gerberas: no entry uses this bouquet.
  const res = Cipher.decode('555555', byCode);
  assert.deepEqual(res, { ok: true, code: '555555', entries: [] });
});

test('inWords names the flowers in natural words, in the 2015 display order', () => {
  // Display order (Ed, 18c): Chrysanth, Lily, Gerbera, Rose, Carnation; label "Chrysanth" (19b).
  assert.equal(Cipher.inWords('2'), 'A rose');
  assert.equal(Cipher.inWords('13444'), 'A chrysanth, a lily and three carnations');
  assert.equal(Cipher.inWords('1334'), 'Two chrysanths, a lily and a carnation');
  assert.equal(Cipher.inWords('2445'), 'A gerbera, a rose and two carnations');
  assert.equal(Cipher.inWords('12345'), 'A chrysanth, a lily, a gerbera, a rose and a carnation');
  assert.equal(Cipher.describe, undefined, 'one helper: the counted style is gone');
});

test("displayStems orders a bouquet's stems Chrysanth, Lily, Gerbera, Rose, Carnation", () => {
  assert.deepEqual(Cipher.displayStems('1334'), ['3', '3', '1', '4']);
  assert.deepEqual(Cipher.displayStems('12345'), ['3', '1', '5', '2', '4']);
  assert.deepEqual(Cipher.displayStems('2445'), ['5', '2', '4', '4']);
  assert.deepEqual(Cipher.displayStems('222555'), ['5', '5', '5', '2', '2', '2']);
});

test("Ed's text rulings 25a and 26a are in #7 and #30", () => {
  const body = id => entries.find(e => e.id === id).body;
  assert.ok(body(7).includes('a disparaging #169'));
  assert.ok(!body(7).includes('a cutting #169'));
  assert.ok(body(30).startsWith('Dangerous to bear, and perhaps even more dangerous to receive, this marks'));
});
