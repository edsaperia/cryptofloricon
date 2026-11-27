/*
 * The 404 page is served for any missing address, at whatever depth, but its
 * links and stylesheet are written relative to the site's root. This finds
 * the root by asking for a marker file at each level of the address,
 * shallowest first, and then points the page's relative links there. Without
 * JavaScript, or opened from disk, the page still shows its text.
 */
(function () {
  'use strict';
  var MARKER = '{{marker}}';
  if (!window.fetch || location.protocol === 'file:') return;
  var parts = location.pathname.split('/').filter(Boolean);
  var bases = [];
  for (var i = 0; i <= parts.length; i++) bases.push('/' + parts.slice(0, i).join('/') + (i ? '/' : ''));

  function useBase(base) {
    var b = document.createElement('base');
    b.href = base;
    document.head.insertBefore(b, document.head.firstChild);
    // Load the stylesheet again from the root, since the first try missed.
    var old = document.querySelector('link[data-site-css]');
    if (old) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = base + 'assets/site.css' + (old.getAttribute('href').match(/\?.*$/) || [''])[0];
      old.parentNode.replaceChild(css, old);
    }
    // Images were requested before the base existed; ask again.
    var imgs = document.querySelectorAll('img[src]');
    for (var k = 0; k < imgs.length; k++) imgs[k].src = imgs[k].getAttribute('src');
    document.body && document.body.setAttribute('data-root', base);
  }

  // If the page sits at the root already, its relative paths are right.
  (function tryNext(k) {
    if (k >= bases.length) return;
    fetch(bases[k] + MARKER, { method: 'HEAD', cache: 'no-store' }).then(function (res) {
      if (res.ok) { if (bases[k] !== location.pathname.replace(/[^/]*$/, '')) whenReady(function () { useBase(bases[k]); }); }
      else tryNext(k + 1);
    }, function () { tryNext(k + 1); });
  })(0);

  function whenReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
})();
