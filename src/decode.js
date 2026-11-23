/*
 * Decode a Message: tap flowers to build a bouquet, then Submit. A bouquet
 * that spells a message opens that message's page (/<code>/); one that spells
 * nothing gets the old site's own "Uh oh!" reply.
 */
(function () {
  'use strict';
  var Cipher = window.Cipher;
  var byCode = Cipher.indexByCode(window.CF_LEXICON);
  var root = document.body.getAttribute('data-root') || './';

  var stems = [];
  var built = document.getElementById('built');
  var stemCount = document.getElementById('stem-count');
  var result = document.getElementById('result');
  var buttons = document.querySelectorAll('.flower-btn');
  var imgFor = {};
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    imgFor[b.getAttribute('data-digit')] = b.querySelector('img').getAttribute('src');
    b.addEventListener('click', onFlower);
  }

  function onFlower(ev) {
    var digit = ev.currentTarget.getAttribute('data-digit');
    clearResult();
    if (stems.length >= Cipher.MAX_STEMS) {
      say('A bouquet holds at most six stems.');
      return;
    }
    stems.push(digit);
    render();
  }

  function render() {
    var code = stems.slice().sort();
    built.innerHTML = '';
    Cipher.displayStems(code.join('')).forEach(function (d) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stem-button';
      btn.setAttribute('aria-label', 'Remove a ' + Cipher.FLOWERS[d].name.toLowerCase());
      var img = document.createElement('img');
      img.className = 'stem';
      img.src = imgFor[d];
      img.alt = '';
      btn.appendChild(img);
      btn.addEventListener('click', function () {
        stems.splice(stems.indexOf(d), 1);
        clearResult();
        render();
      });
      built.appendChild(btn);
    });
    for (var j = 0; j < buttons.length; j++) {
      var dg = buttons[j].getAttribute('data-digit');
      var n = stems.filter(function (s) { return s === dg; }).length;
      buttons[j].querySelector('.flower-count').textContent = n ? '×' + n : '';
      buttons[j].classList.toggle('chosen', n > 0);
    }
    stemCount.textContent = stems.length ? Cipher.describe(code.join('')) : '';
  }

  function clearResult() { result.innerHTML = ''; }

  function say(text) {
    result.innerHTML = '';
    var p = document.createElement('p');
    p.textContent = text;
    result.appendChild(p);
  }

  function clear() {
    stems = [];
    clearResult();
    render();
  }

  document.getElementById('clear').addEventListener('click', clear);

  document.getElementById('submit').addEventListener('click', function () {
    var res = Cipher.decode(stems, byCode);
    if (!res.ok) {
      say(res.reason === 'empty' ? 'Tap at least one flower first.' : 'A bouquet holds at most six stems.');
      return;
    }
    if (res.entries.length) {
      window.location.href = root + res.code + '/';
      return;
    }
    // The old site's reply to a bouquet that spells nothing (msgs.php).
    result.innerHTML = '';
    // The heading is drawn (the script face is not served): the page carries it in a template.
    var h = document.importNode(document.getElementById('uh-oh').content, true);
    var p = document.createElement('p');
    p.textContent = 'This is not a valid cipher. Are you sure you identified the flowers correctly?';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'link-button';
    retry.textContent = '• Retry •';
    retry.addEventListener('click', clear);
    result.appendChild(h);
    result.appendChild(p);
    result.appendChild(retry);
  });

  render();
})();
