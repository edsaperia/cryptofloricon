/*
 * Send a Message: type a keyword to find messages whose title or tags match,
 * each shown with its bouquet. The tag list below the box needs no script.
 */
(function () {
  'use strict';
  var Cipher = window.Cipher;
  var entries = window.CF_LEXICON;
  var root = document.body.getAttribute('data-root') || './';
  var byCode = Cipher.indexByCode(entries);
  var input = document.getElementById('keyword');
  var results = document.getElementById('results');

  // Flower pictures as the page already references them (real or placeholder).
  var flowerSrc = {};
  var keyImgs = document.querySelectorAll('.key-flowers img');
  var order = Cipher.KEY_ORDER;
  for (var i = 0; i < keyImgs.length && i < order.length; i++) flowerSrc[order[i]] = keyImgs[i].getAttribute('src');

  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'");
  }

  function matches(e, words) {
    var hay = norm(e.title + ' ' + e.tags.join(' '));
    return words.every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function href(e) {
    return root + e.code + '/' + (byCode[e.code].length > 1 ? '#m' + e.id : '');
  }

  function row(e) {
    var li = document.createElement('li');
    li.className = 'entry-row';
    var a = document.createElement('a');
    a.href = href(e);
    var bq = document.createElement('span');
    bq.className = 'bouquet bouquet-small';
    bq.setAttribute('role', 'img');
    bq.setAttribute('aria-label', Cipher.describe(e.code));
    Cipher.displayStems(e.code).forEach(function (d) {
      var img = document.createElement('img');
      img.className = 'stem';
      img.src = flowerSrc[d];
      img.alt = '';
      bq.appendChild(img);
    });
    var t = document.createElement('span');
    t.className = 'row-title';
    t.textContent = e.title;
    a.appendChild(bq);
    a.appendChild(t);
    var f = document.createElement('span');
    f.className = 'row-flowers';
    f.textContent = Cipher.describe(e.code);
    li.appendChild(a);
    li.appendChild(f);
    return li;
  }

  function search() {
    var q = norm(input.value).trim();
    results.innerHTML = '';
    if (q.length < 2) return;
    var words = q.split(/\s+/);
    var found = entries.filter(function (e) { return matches(e, words); });
    // Title matches first, then tag-only matches; alphabetical within each.
    found.sort(function (a, b) {
      var ta = words.every(function (w) { return norm(a.title).indexOf(w) !== -1; }) ? 0 : 1;
      var tb = words.every(function (w) { return norm(b.title).indexOf(w) !== -1; }) ? 0 : 1;
      return ta - tb || a.title.localeCompare(b.title);
    });
    if (!found.length) {
      var li = document.createElement('li');
      li.className = 'no-results';
      li.textContent = 'No message matches that keyword.';
      results.appendChild(li);
      return;
    }
    found.forEach(function (e) { results.appendChild(row(e)); });
  }

  input.addEventListener('input', search);
  search();
})();
