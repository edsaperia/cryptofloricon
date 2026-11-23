/*
 * The Cryptofloricon cipher: turning a bouquet into a code and a code into
 * its message(s). Shared by the build (Node) and the Decode page (browser),
 * so both decode a bouquet the same way.
 *
 * A bouquet is 1 to 6 stems drawn from five flowers. Each flower has a digit;
 * a code is the bouquet's digits sorted ascending, so the order the stems are
 * given in does not matter ("41" and "14" are the same bouquet, code "14").
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Cipher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Flower digits, confirmed by four sources (content audit, 2026-11-23).
  var FLOWERS = {
    1: { name: 'Lily', plural: 'Lilies', key: 'Lily' },
    2: { name: 'Rose', plural: 'Roses', key: 'Rose' },
    3: { name: 'Chrysanth', plural: 'Chrysanths', key: 'Chrysanth' },  // "Chrysanth" everywhere (Ed, 19b)
    4: { name: 'Carnation', plural: 'Carnations', key: 'Carnation' },
    5: { name: 'Gerbera', plural: 'Gerberas', key: 'Gerbera' }
  };

  // The order the old site's key showed the flowers in (one-code.php). Ed
  // (2026-11-23, 18c): flowers are shown in this order everywhere, the key,
  // the Decode buttons, every bouquet's stems and the flowers in words. Codes
  // themselves stay digit-sorted.
  var KEY_ORDER = [3, 1, 5, 2, 4];

  var MAX_STEMS = 6;

  /*
   * Normalise a bouquet to its digits. Accepts a string of digits in any
   * order ("41"), an array of digits ([4, 1]) or a count per flower
   * ({ 1: 1, 4: 1 }). Returns an array of digit characters, unsorted and
   * unchecked, or null if the input is not one of those shapes.
   */
  function stemsOf(bouquet) {
    if (typeof bouquet === 'string') return bouquet.replace(/\s+/g, '').split('').filter(Boolean);
    if (Array.isArray(bouquet)) return bouquet.map(String);
    if (bouquet && typeof bouquet === 'object') {
      var stems = [];
      Object.keys(bouquet).forEach(function (digit) {
        var n = bouquet[digit];
        if (typeof n !== 'number' || n < 0 || Math.floor(n) !== n) { stems.push('x'); return; }
        for (var i = 0; i < n; i++) stems.push(String(digit));
      });
      return stems;
    }
    return null;
  }

  /*
   * Turn a bouquet into its code, or explain why it has none.
   * Returns { ok: true, code } or { ok: false, reason } where reason is
   * 'empty', 'too-many' or 'not-a-flower'.
   */
  function toCode(bouquet) {
    var stems = stemsOf(bouquet);
    if (stems === null) return { ok: false, reason: 'not-a-flower' };
    if (stems.length === 0) return { ok: false, reason: 'empty' };
    if (stems.length > MAX_STEMS) return { ok: false, reason: 'too-many' };
    for (var i = 0; i < stems.length; i++) {
      if (!/^[1-5]$/.test(stems[i])) return { ok: false, reason: 'not-a-flower' };
    }
    return { ok: true, code: stems.slice().sort().join('') };
  }

  /* A code is valid when it is 1-6 digits, each 1-5, in non-decreasing order. */
  function isValidCode(code) {
    if (typeof code !== 'string' || !/^[1-5]{1,6}$/.test(code)) return false;
    for (var i = 1; i < code.length; i++) if (code[i] < code[i - 1]) return false;
    return true;
  }

  /*
   * Decode a bouquet against a lexicon index ({ code: [entry, ...] }).
   * Returns { ok: false, reason } for a bouquet that cannot be a code, or
   * { ok: true, code, entries } where entries is empty when the bouquet is
   * well formed but spells nothing. A code shared by two entries returns both.
   */
  function decode(bouquet, byCode) {
    var result = toCode(bouquet);
    if (!result.ok) return result;
    var entries = (byCode && Object.prototype.hasOwnProperty.call(byCode, result.code)) ? byCode[result.code] : [];
    return { ok: true, code: result.code, entries: entries.slice() };
  }

  /* Group entries by code: { code: [entry, ...] }, each list in ID order. */
  function indexByCode(entries) {
    var byCode = {};
    entries.forEach(function (e) { (byCode[e.code] = byCode[e.code] || []).push(e); });
    Object.keys(byCode).forEach(function (c) { byCode[c].sort(function (a, b) { return a.id - b.id; }); });
    return byCode;
  }

  /* How many of each flower a code holds, in display order: [[digit, count], ...]. */
  function counts(code) {
    var out = [];
    KEY_ORDER.forEach(function (d) {
      var n = String(code).split(String(d)).length - 1;
      if (n) out.push([d, n]);
    });
    return out;
  }

  /* A bouquet's stems in display order, as digit characters: "1334" → ["3", "3", "1", "4"]. */
  function displayStems(code) {
    var out = [];
    counts(code).forEach(function (pair) {
      for (var i = 0; i < pair[1]; i++) out.push(String(pair[0]));
    });
    return out;
  }

  /* "2 Chrysanths, 1 Lily": the flowers a code needs, in words, in display order. */
  function describe(code) {
    return counts(code).map(function (pair) {
      var f = FLOWERS[pair[0]];
      return pair[1] + ' ' + (pair[1] === 1 ? f.name : f.plural);
    }).join(', ');
  }

  return {
    FLOWERS: FLOWERS,
    KEY_ORDER: KEY_ORDER,
    MAX_STEMS: MAX_STEMS,
    toCode: toCode,
    isValidCode: isValidCode,
    decode: decode,
    indexByCode: indexByCode,
    counts: counts,
    displayStems: displayStems,
    describe: describe
  };
});
