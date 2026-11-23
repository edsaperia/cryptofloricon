#!/usr/bin/env node
'use strict';
/*
 * Builds the Cryptofloricon static site.
 *
 *   node build.js            writes the site into ./site
 *   node build.js <folder>   writes it somewhere else
 *
 * Reads data/lexicon.json, content/*.html and src/, and needs nothing but
 * Node's standard library. Every link and asset path in the output is
 * relative, so the site works at a domain root, under a sub-path such as
 * /cryptofloricon/ on github.io, or from any preview folder.
 */

const fs = require('fs');
const path = require('path');
const Cipher = require('./lib/cipher');
const { escapeHtml: esc, slug, renderBody } = require('./lib/render');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

/*
 * Artwork. Each entry is the path the real file will have in the site
 * ("final"), the Dropbox file it is believed to come from ("from"), and a
 * labelled stand-in under src/placeholders/ used until the real file is put
 * at src/<final>. Dropping the real file in needs no code change: the build
 * uses it as soon as it exists.
 */
const ASSETS = {
  paper: { final: 'assets/paper.png', from: '/Cryptofloricon Dev/img/paper.png', placeholder: null },
  logo: { final: 'assets/logo.png', from: '/Cryptofloricon Dev/img/logotype.png', placeholder: null },
  flower1: { final: 'assets/flowers/1.png', from: '/Cryptofloricon Dev/img/1.png', placeholder: 'placeholders/flowers/1.svg' },
  flower2: { final: 'assets/flowers/2.png', from: '/Cryptofloricon Dev/img/2.png', placeholder: 'placeholders/flowers/2.svg' },
  flower3: { final: 'assets/flowers/3.png', from: '/Cryptofloricon Dev/img/3.png', placeholder: 'placeholders/flowers/3.svg' },
  flower4: { final: 'assets/flowers/4.png', from: '/Cryptofloricon Dev/img/4.png', placeholder: 'placeholders/flowers/4.svg' },
  flower5: { final: 'assets/flowers/5.png', from: '/Cryptofloricon Dev/img/5.png', placeholder: 'placeholders/flowers/5.svg' },
  cornerTL: { final: 'assets/borders/tl.svg', from: '/Cryptofloricon Dev/img/tl.svg', placeholder: 'placeholders/borders/tl.svg' },
  cornerTR: { final: 'assets/borders/tr.svg', from: '/Cryptofloricon Dev/img/tr.svg', placeholder: 'placeholders/borders/tr.svg' },
  cornerBL: { final: 'assets/borders/bl.svg', from: '/Cryptofloricon Dev/img/bl.svg', placeholder: 'placeholders/borders/bl.svg' },
  cornerBR: { final: 'assets/borders/br.svg', from: '/Cryptofloricon Dev/img/br.svg', placeholder: 'placeholders/borders/br.svg' },
  dividerLarge: { final: 'assets/dividers/large.svg', from: '/Cryptofloricon Dev/img/ldiv.svg', placeholder: 'placeholders/dividers/large.svg' },
  dividerSmall: { final: 'assets/dividers/small.svg', from: '/Cryptofloricon Dev/img/sdiv.svg', placeholder: 'placeholders/dividers/small.svg' },
  bracketLeft: { final: 'assets/brackets/left.png', from: '/Cryptofloricon Dev/img/brl.png', placeholder: 'placeholders/brackets/left.svg' },
  bracketRight: { final: 'assets/brackets/right.png', from: '/Cryptofloricon Dev/img/brr.png', placeholder: 'placeholders/brackets/right.svg' },
  favicon: { final: 'assets/favicon.ico', from: '/Cryptofloricon Dev/favicon.ico', placeholder: null },
  // Andrade Script Pro, the title font (licensed to Ed; the repository is private for this reason).
  fontWoff: { final: 'assets/fonts/andrade-script-pro.woff', from: '/Cryptofloricon Dev/css/fonts/title.woff', placeholder: null },
  fontTtf: { final: 'assets/fonts/andrade-script-pro.ttf', from: '/Cryptofloricon Dev/css/fonts/title.ttf', placeholder: null }
};

const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap';

// The marker the 404 page looks for to find the site's root (see src/notfound.js).
const ROOT_MARKER = 'cryptofloricon-root.txt';

function loadLexicon() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'lexicon.json'), 'utf8'));
}

function write(out, rel, content) {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copy(out, fromAbs, rel) {
  const file = path.join(out, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(fromAbs, file);
}

/* Resolve each asset to the path it has in the output (real file, stand-in, or none). */
function resolveAssets(out) {
  const used = {};
  for (const [key, a] of Object.entries(ASSETS)) {
    const real = path.join(SRC, a.final);
    if (fs.existsSync(real)) {
      copy(out, real, a.final);
      used[key] = { path: a.final, real: true };
    } else if (a.placeholder) {
      const rel = 'assets/' + a.placeholder;
      copy(out, path.join(SRC, a.placeholder), rel);
      used[key] = { path: rel, real: false };
    } else {
      used[key] = null;
    }
  }
  return used;
}

function build(out) {
  out = path.resolve(out || path.join(ROOT, 'site'));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const entries = loadLexicon();
  const byId = {};
  entries.forEach(e => { byId[e.id] = e; });
  const byCode = Cipher.indexByCode(entries);
  const codes = Object.keys(byCode).sort();
  const tags = [...new Set(entries.flatMap(e => e.tags))].sort();
  const assets = resolveAssets(out);
  const pages = [];

  /* ---------- shared pieces ---------- */

  const rootOf = depth => (depth ? '../'.repeat(depth) : './');
  const asset = (key, r) => (assets[key] ? r + assets[key].path : null);

  // Where an entry lives: its code's page, with an anchor when the code is shared.
  const entryHref = (id, r) => {
    const e = byId[id];
    return r + e.code + '/' + (byCode[e.code].length > 1 ? '#m' + e.id : '');
  };
  const tagHref = (tag, r) => r + 'browse/' + slug(tag) + '/';

  function bouquet(code, r, cls) {
    const label = Cipher.describe(code);
    const stems = Cipher.displayStems(code).map(d =>
      `<img class="stem" src="${asset('flower' + d, r)}" alt="" data-digit="${d}">`).join('');
    return `<span class="bouquet${cls ? ' ' + cls : ''}" role="img" aria-label="${esc(label)}">${stems}</span>`;
  }

  function keyPanel(r) {
    const items = Cipher.KEY_ORDER.map(d =>
      `<li><img src="${asset('flower' + d, r)}" alt=""><span>${Cipher.FLOWERS[d].key}</span></li>`).join('');
    return `<details class="key"><summary>Key</summary><ul class="key-flowers">${items}</ul></details>`;
  }

  function tabs(r, extraClass) {
    return `<nav class="tabs${extraClass ? ' ' + extraClass : ''}">` +
      `<a href="${r}encode/">&bull; Encode &bull;</a>` +
      `<a href="${r}decode/">&bull; Decode &bull;</a></nav>`;
  }

  /*
   * The real dividers are inlined so site.css can draw their lines in the
   * corners' brown and weight (the files themselves are black, 1.5 units).
   * Each file also embeds the scanned drawing it was traced from, at 29%
   * opacity (an Illustrator template layer left in on export); the page
   * drops it. A stand-in divider stays an <img>.
   */
  const inlineSvg = {};
  function dividerSvg(key) {
    if (!(key in inlineSvg)) {
      inlineSvg[key] = fs.readFileSync(path.join(SRC, ASSETS[key].final), 'utf8')
        .replace(/^[\s\S]*?(?=<svg\b)/, '')                 // XML prolog, comment, DOCTYPE
        .replace(/<image\b[\s\S]*?<\/image>\s*/g, '')          // the traced-from scan
        .replace(/<svg\b[^>]*?(viewBox="[^"]*")[^>]*>/,
          '<svg xmlns="http://www.w3.org/2000/svg" $1 width="280" height="40" aria-hidden="true" focusable="false">')
        .replace(/\s*<\/svg>\s*$/, '</svg>');
    }
    return inlineSvg[key];
  }

  function divider(r, size) {
    const key = size === 'small' ? 'dividerSmall' : 'dividerLarge';
    const art = assets[key] && assets[key].real ? dividerSvg(key) : `<img src="${asset(key, r)}" alt="">`;
    return `<div class="divider divider-${size || 'large'}" role="presentation">${art}</div>`;
  }

  function logo(r) {
    const img = asset('logo', r);
    const inner = img
      ? `<img src="${img}" alt="Cryptofloricon">`
      : '<span class="logotype">Cryptofloricon</span>';
    return `<a class="logo" href="${r}">${inner}</a>`;
  }

  function footer(r) {
    return `<footer class="site-footer">
  <p class="footer-links">&bull; <a href="${r}story/">Story</a> &bull; <a href="${r}browse/">Browse</a> &bull; <a href="mailto:ed@newspeak.house">ed@newspeak.house</a> &bull;</p>
  <p class="credits">Invented &amp; produced by Edward Saperia<br>
  Written by Sasha Garwood &amp; Grant Howitt<br>
  Website by Kimi Lawrie &amp; Eugen Rochko<br>
  Graphics by Sam Ballard &amp; Евгений Олегович</p>
  <p class="credits">&copy; Original Content London</p>
</footer>`;
  }

  function page({ file, title, main, scripts = [], bodyClass = '', head = '', mainClass = 'border' }) {
    const depth = file.split('/').length - 1;
    const r = rootOf(depth);
    const fav = asset('favicon', r);
    const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? esc(title) + ' &middot; ' : ''}Cryptofloricon</title>
<meta name="description" content="A Lexicon of Ciphers to Encrypt and Decrypt Floral Bouquets">
${fav ? `<link rel="icon" href="${fav}">\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_CSS}">
<link rel="stylesheet" href="${r}assets/site.css" data-site-css>
${head}</head>
<body class="${bodyClass}" data-root="${r}">
<div class="wrapper">
<header class="masthead">
${logo(r)}
${tabs(r)}
${keyPanel(r)}
</header>
<main class="${mainClass}">
${main(r)}
</main>
${tabs(r, 'bottom')}
${footer(r)}
</div>
${scripts.map(s => `<script src="${r}assets/${s}"></script>`).join('\n')}
</body>
</html>
`;
    write(out, file, html);
    pages.push(file);
  }

  /* ---------- static files ---------- */

  write(out, 'assets/site.css', siteCss(assets));
  copy(out, path.join(ROOT, 'lib', 'cipher.js'), 'assets/cipher.js');
  for (const f of ['decode.js', 'encode.js']) copy(out, path.join(SRC, f), 'assets/' + f);
  write(out, 'assets/lexicon.js', '/* Generated by build.js from data/lexicon.json. */\nwindow.CF_LEXICON = ' +
    JSON.stringify(entries.map(e => ({ id: e.id, code: e.code, title: e.title, tags: e.tags }))) + ';\n');
  write(out, ROOT_MARKER, 'The root of the Cryptofloricon site.\n');
  write(out, '.nojekyll', '');

  /* ---------- home ---------- */

  page({
    file: 'index.html',
    title: '',
    bodyClass: 'home',
    main: r => `
<h1 class="title"><span class="line">A Lexicon of Ciphers</span> <span class="joiner">&ndash; to &ndash;</span> <span class="line">Encrypt and Decrypt Floral Bouquets</span></h1>
${divider(r, 'large')}
<p class="intro">Emails, texts, tweets... we are a messaging culture, submerged in an endless deluge of communication. Sometimes, though, we are lost for words. This system makes it a little easier to say those difficult things.</p>
<p class="calls"><a class="call" href="${r}decode/">&bull; Decode a Message &bull;</a> <span class="joiner">&ndash; or &ndash;</span> <a class="call" href="${r}encode/">&bull; Send a Message &bull;</a></p>`
  });

  /* ---------- decode ---------- */

  page({
    file: 'decode/index.html',
    title: 'Decode a Message',
    bodyClass: 'decode',
    scripts: ['cipher.js', 'lexicon.js', 'decode.js'],
    main: r => {
      const buttons = Cipher.KEY_ORDER.map(d =>
        `<button type="button" class="flower-btn" data-digit="${d}" aria-label="Add a ${Cipher.FLOWERS[d].name.toLowerCase()}">` +
        `<img src="${asset('flower' + d, r)}" alt=""><span class="flower-name">${Cipher.FLOWERS[d].key}</span>` +
        `<span class="flower-count" aria-hidden="true"></span></button>`).join('');
      return `
<h1 class="title">Decode a Message</h1>
<p class="hint">Tap a flower once for each stem in the bouquet.</p>
<div class="flower-picker">${buttons}</div>
<div class="bouquet-build" aria-live="polite"><span class="bouquet bouquet-large" id="built"></span></div>
<p class="stem-count" id="stem-count" aria-live="polite"></p>
<p class="buttons"><button type="button" class="link-button" id="clear">&bull; Clear &bull;</button> <button type="button" class="link-button" id="submit">&bull; Submit &bull;</button></p>
<div id="result" class="decode-result" aria-live="polite"></div>
<noscript><p class="hint">Decoding needs JavaScript. Every message is listed on the <a href="${r}browse/">Browse</a> page.</p></noscript>`;
    }
  });

  /* ---------- encode (Send a Message) ---------- */

  page({
    file: 'encode/index.html',
    title: 'Send a Message',
    bodyClass: 'encode',
    scripts: ['cipher.js', 'lexicon.js', 'encode.js'],
    main: r => `
<h1 class="title">Send a Message</h1>
<form class="search" role="search" onsubmit="return false">
  <label class="visually-hidden" for="keyword">Keyword</label>
  <input type="search" id="keyword" placeholder="Type a keyword" autocomplete="off" spellcheck="false">
</form>
<ul class="results" id="results" aria-live="polite"></ul>
${divider(r, 'small')}
<ul class="tag-list">${tags.map(t => `<li><a href="${tagHref(t, r)}">${esc(t)}</a></li>`).join('')}</ul>
<p class="buttons"><a href="${r}browse/">&bull; Browse &bull;</a></p>`
  });

  /* ---------- a page per code (the old site's /<code> scheme) ---------- */

  for (const code of codes) {
    const list = byCode[code];
    page({
      file: code + '/index.html',
      title: list.map(e => e.title).join(' / '),
      bodyClass: 'message',
      main: r => {
        const shared = list.length > 1
          ? `<p class="shared-note">This bouquet spells ${list.length} messages in the lexicon.</p>\n`
          : '';
        const articles = list.map(e => `
<article class="entry" id="m${e.id}">
  ${bouquet(code, r, 'bouquet-large')}
  <p class="flower-words">${esc(Cipher.describe(code))}</p>
  <h1 class="title">${esc(e.title)}</h1>
  <div class="passage">
${renderBody(e.body, byId, id => entryHref(id, r))}
  </div>
  <ul class="entry-tags">${e.tags.map(t => `<li><a href="${tagHref(t, r)}">${esc(t)}</a></li>`).join('')}</ul>
</article>`).join(`\n${divider(r, 'small')}\n`);
        return shared + articles;
      }
    });
  }

  /* ---------- browse ---------- */

  function entryRow(e, r) {
    return `<li class="entry-row"><a href="${entryHref(e.id, r)}">${bouquet(e.code, r, 'bouquet-small')}<span class="row-title">${esc(e.title)}</span></a>` +
      `<span class="row-flowers">${esc(Cipher.describe(e.code))}</span></li>`;
  }
  // The old browse page listed entries by code (browse.php: ORDER BY code ASC).
  const byCodeOrder = entries.slice().sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id - b.id));

  page({
    file: 'browse/index.html',
    title: 'Browse',
    bodyClass: 'browse',
    main: r => `
<h1 class="title">Browse</h1>
<ul class="tag-list">${tags.map(t => `<li><a href="${tagHref(t, r)}">${esc(t)}</a></li>`).join('')}</ul>
${divider(r, 'small')}
<ul class="entry-list">
${byCodeOrder.map(e => entryRow(e, r)).join('\n')}
</ul>`
  });

  for (const tag of tags) {
    page({
      file: 'browse/' + slug(tag) + '/index.html',
      title: tag,
      bodyClass: 'browse',
      main: r => `
<h1 class="title">${esc(tag)}</h1>
<ul class="tag-list">${tags.map(t => `<li>${t === tag ? `<span class="current">${esc(t)}</span>` : `<a href="${tagHref(t, r)}">${esc(t)}</a>`}</li>`).join('')}</ul>
${divider(r, 'small')}
<ul class="entry-list">
${byCodeOrder.filter(e => e.tags.includes(tag)).map(e => entryRow(e, r)).join('\n')}
</ul>
<p class="buttons"><a href="${r}browse/">&bull; Browse &bull;</a></p>`
    });
  }

  /* ---------- story ---------- */

  page({
    file: 'story/index.html',
    title: 'Story',
    bodyClass: 'story',
    main: () => `
<h1 class="title">Introduction</h1>
<div class="prose">
${fs.readFileSync(path.join(ROOT, 'content', 'story.html'), 'utf8')}
</div>`
  });

  /* ---------- 404 ---------- */

  // Served by the host for any missing address, so its relative links are
  // written as if it sits at the site's root; notfound.js corrects them when
  // the missing address is deeper (it finds the root by ROOT_MARKER).
  page({
    file: '404.html',
    title: 'Not found',
    bodyClass: 'notfound',
    // Inlined: a relative script path would itself break at a deep address.
    head: `<script>\n${fs.readFileSync(path.join(SRC, 'notfound.js'), 'utf8').replace('{{marker}}', ROOT_MARKER)}</script>\n`,
    main: r => `
<h1 class="title">Uh oh!</h1>
<p>Sorry, but the page you were trying to view does not exist.</p>
<p class="calls"><a class="call" href="${r}decode/">&bull; Decode a Message &bull;</a> <span class="joiner">&ndash; or &ndash;</span> <a class="call" href="${r}encode/">&bull; Send a Message &bull;</a></p>`
  });

  return { out, pages, codes, tags, assets };
}

/* The stylesheet, with artwork paths filled in (relative to assets/site.css). */
function siteCss(assets) {
  const url = key => (assets[key] ? `url("${assets[key].path.replace(/^assets\//, '')}")` : 'none');
  return fs.readFileSync(path.join(SRC, 'site.css'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (whole, key) => {
      if (!(key in ASSETS)) throw new Error('site.css names an unknown asset: ' + key);
      return url(key);
    });
}

module.exports = { build, loadLexicon, ASSETS, ROOT_MARKER };

if (require.main === module) {
  const result = build(process.argv[2]);
  const real = Object.values(result.assets).filter(a => a && a.real).length;
  console.log(`Built ${result.pages.length} pages (${result.codes.length} message pages, ${result.tags.length} tag pages) into ${path.relative(process.cwd(), result.out) || '.'}; artwork: ${real} real file(s), the rest placeholders.`);
}
