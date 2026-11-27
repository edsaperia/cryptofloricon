'use strict';
/*
 * The book's contents, as data: which entries, in what order, how their
 * cross-references resolve, and the two indexes at the back. Shared by
 * scripts/build-book.mjs (which lays the pages out) and test/book.test.js
 * (which checks this data without rendering anything). Standard library only.
 */
const fs = require('fs');
const path = require('path');
const Cipher = require('./cipher.js');
const { refsIn } = require('./render.js');

const ROOT = path.join(__dirname, '..');
const ORDER_FILE = path.join(ROOT, 'book', 'order.json');
const EDITS_FILE = path.join(ROOT, 'book', 'edits.json');

/* The ids in book order (book/order.json: the 2013 print master's sequence). */
function loadOrder(file = ORDER_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).order;
}

/*
 * The lexicon's entries in book order. Throws if the order names an id the
 * lexicon lacks, names one twice, or leaves an entry out: every entry is in
 * the book exactly once.
 */
function bookEntries(entries, order = loadOrder()) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const seen = new Set();
  const problems = [];
  order.forEach(id => {
    if (!byId.has(id)) problems.push(`#${id} is in the book order but not the lexicon`);
    else if (seen.has(id)) problems.push(`#${id} is in the book order twice`);
    seen.add(id);
  });
  entries.forEach(e => { if (!seen.has(e.id)) problems.push(`#${e.id} ${e.title} is missing from the book order`); });
  if (problems.length) throw new Error('book/order.json: ' + problems.join('; '));
  return order.map(id => byId.get(id));
}

/* The book-only edits (book/edits.json): [{ id, title, remove, source, ruling }]. */
function loadEdits(file = EDITS_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).edits;
}

/*
 * The entries as the book prints them: each book-only edit removes its exact
 * text from its entry's passage. Returns new objects; the lexicon's are left
 * as they are. Throws if an edit's entry is missing or its text is not in the
 * passage exactly once, so a changed lexicon cannot silently undo or misplace
 * an edit.
 */
function bookText(entries, edits = loadEdits()) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const changed = new Map();
  edits.forEach(edit => {
    const e = changed.get(edit.id) || byId.get(edit.id);
    if (!e) throw new Error(`book/edits.json: #${edit.id} is not in the lexicon`);
    const n = e.body.split(edit.remove).length - 1;
    if (n !== 1) throw new Error(`book/edits.json: the text to remove from #${edit.id} ${e.title} is there ${n} times, not once`);
    changed.set(edit.id, { ...e, body: e.body.replace(edit.remove, '').replace(/[ \t]+$/gm, '') });
  });
  return entries.map(e => changed.get(e.id) || e);
}

/* Every "#NN" in the book's passages that names no entry in it: [{ from, to }]. */
function unresolvedRefs(entries) {
  const ids = new Set(entries.map(e => e.id));
  return entries.flatMap(e => refsIn(e.body).filter(id => !ids.has(id)).map(id => ({ from: e.id, to: id })));
}

/*
 * A code's sorting key for the decoding index: how many of each flower, in
 * the display order (Chrysanth, Lily, Gerbera, Rose, Carnation), so a reader
 * holding a bouquet can find its row by counting. Rows are sorted by these
 * counts, first flower first, fewest first, as in the 2013 book's table.
 */
function decodingKey(code) {
  return Cipher.KEY_ORDER.map(d => String(code).split(String(d)).length - 1);
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/* The decoding index: one row per code, [{ code, counts, entries }], sorted by decodingKey. */
function decodingIndex(entries) {
  const byCode = Cipher.indexByCode(entries);
  return Object.keys(byCode)
    .map(code => ({ code, counts: decodingKey(code), entries: byCode[code] }))
    .sort((a, b) => compareKeys(a.counts, b.counts));
}

/* A title's place in the alphabetical index: letters and digits only, case ignored. */
function titleSortKey(title) {
  return String(title).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

/* The title index: entries sorted by title. */
function titleIndex(entries) {
  return entries.slice().sort((a, b) => {
    const ka = titleSortKey(a.title), kb = titleSortKey(b.title);
    return ka < kb ? -1 : ka > kb ? 1 : a.id - b.id;
  });
}

/*
 * Which side of the spread entry n (1-based, in book order) is on. As in 2013,
 * entry 1 is on a left-hand page and every entry has one page, so the entries
 * face each other in pairs: 1 | 2 (I love you | I like you), 17 | 18 (I can
 * wait | I can't wait), 63 | 64 (Yes | No). scripts/build-book.mjs checks the
 * laid-out pages against this.
 */
function entrySide(n) {
  return n % 2 === 1 ? 'left' : 'right';
}

/*
 * Adobe Caslon's historical "ct" and "st" ligatures (dlig), sprinkled where the
 * text is quiet (Ed, 80): an occasional antique touch, not every occurrence.
 *
 * A paragraph is a list of segments { text, fixed }: fixed segments are cross-
 * references or small capitals, never touched. The rule, deterministic and
 * running on through the book in reading order (state carries over):
 *   - at most one ligature in a paragraph;
 *   - at least `gap` words since the last one;
 *   - only in a plain lowercase word (letters and apostrophes, any punctuation
 *     outside it) of at most `maxLength` letters with a "ct" or "st" in it (the
 *     word is kept whole, so a long one would strain the justified line);
 *   - never in, or the word right beside, a cross-reference or small capitals;
 *   - none in a paragraph passed with `skip` (a page over about 90% full), though
 *     its words still count towards the gap.
 * The chosen word is marked LIG_OPEN word LIG_CLOSE, so the caller can typeset the text
 * and then turn the marks into a span with the dlig feature; the caller also keeps
 * the word from being hyphenated, so the ligature is never split at a line end.
 */
const LIG_OPEN = '', LIG_CLOSE = '';
const LIG_GAP = 220;
function sprinkleLigatures(paragraphs, { gap = LIG_GAP, maxLength = 9, state = { since: 0 }, skip = false } = {}) {
  return paragraphs.map(segs => {
    let placed = skip;
    return segs.map((seg, si) => {
      if (seg.fixed) { state.since += 1; return seg; }
      const toks = seg.text.split(/(\s+)/);
      const words = toks.map((t, i) => (/\S/.test(t) ? i : -1)).filter(i => i >= 0);
      words.forEach((ti, k) => {
        state.since += 1;
        if (placed || state.since <= gap) return;
        // The word right beside a fixed segment: touching it, or one space away.
        if (k === 0 && si > 0 && segs[si - 1].fixed) return;
        if (k === words.length - 1 && si < segs.length - 1 && segs[si + 1].fixed) return;
        const m = toks[ti].match(/^([^A-Za-z’']*)([a-z][a-z’']*)([^A-Za-z’']*)$/);
        if (!m || m[2].length > maxLength || !/[cs]t/.test(m[2])) return;
        toks[ti] = m[1] + LIG_OPEN + m[2] + LIG_CLOSE + m[3];
        placed = true;
        state.since = 0;
      });
      return { ...seg, text: toks.join('') };
    });
  });
}

/*
 * A swash capital, sparingly (Ed, 80): on the first letter of an entry's first
 * cross-reference, only where it has room, that is where it begins its paragraph
 * or follows the end of a sentence, and no other cross-reference is within three
 * words after it. I, O and U are left alone: their swashes barely differ.
 * Returns [paragraph, segment] of the cross-reference to swash, or null.
 */
const SWASH_LETTERS = /^[A-HJ-NP-TV-Z]/;
function swashRef(paragraphs) {
  for (let p = 0; p < paragraphs.length; p++) {
    const segs = paragraphs[p];
    const si = segs.findIndex(s => s.fixed);
    if (si < 0) continue;
    const before = segs.slice(0, si).map(s => s.text).join('');
    const roomy = /^\s*$/.test(before) || /[.!?][’”']?\s+$/.test(before);
    const after = segs[si + 1];
    const nearNext = after && !after.fixed && si + 2 < segs.length && after.text.trim().split(/\s+/).filter(Boolean).length < 3;
    const crowded = (after && after.fixed) || nearNext;
    return roomy && !crowded && SWASH_LETTERS.test(segs[si].text) ? [p, si] : null;
  }
  return null;
}

module.exports = { ORDER_FILE, EDITS_FILE, loadEdits, bookText, entrySide, loadOrder, bookEntries, unresolvedRefs, decodingKey, compareKeys, decodingIndex, titleSortKey, titleIndex,
  LIG_OPEN, LIG_CLOSE, LIG_GAP, sprinkleLigatures, swashRef };
