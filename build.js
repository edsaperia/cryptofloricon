#!/usr/bin/env node
'use strict';
/*
 * Builds the Cryptofloricon static site.
 *
 *   node build.js            writes the site into ./site
 *   node build.js <folder>   writes it somewhere else
 *
 * Reads data/lexicon.json, content/*.html and src/, and needs nothing but
 * Node's standard library. The script headings are drawings of the words
 * (src/headings/, made from the title font by scripts/draw-headings.mjs), so
 * the build needs no font, and it fails if a heading has a word not drawn. Every link and asset path in the output is
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
  favicon: { final: 'assets/favicon.ico', from: '/Cryptofloricon Dev/favicon.ico', placeholder: null }
};

/*
 * The script headings. The title font, Andrade Script Pro, is licensed to Ed
 * and is kept out of the repository and the site: scripts/draw-headings.mjs
 * draws each word of each heading from it as an SVG outline, and the build
 * places the drawings inline, a word at a time, so headings still wrap. See
 * src/headings/manifest.json for the words drawn.
 */
const HEADINGS = path.join(SRC, 'headings');

function loadDrawings() {
  const file = path.join(HEADINGS, 'manifest.json');
  const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { words: {} };
  const svgs = {};
  return {
    manifest,
    /* The inline SVG for one word, or null if it has no drawing. */
    word(w) {
      const m = manifest.words[w];
      if (!m) return null;
      if (!(w in svgs)) {
        const src = path.join(HEADINGS, 'words', m.file);
        if (!fs.existsSync(src)) return null;
        const svg = fs.readFileSync(src, 'utf8');
        const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
        const d = svg.match(/<path d="([^"]*)"/)[1];
        const em = +(m.advance / manifest.unitsPerEm).toFixed(3);
        svgs[w] = `<svg viewBox="${viewBox}" style="width:${em}em" focusable="false"><path d="${d}"/></svg>`;
      }
      return svgs[w];
    }
  };
}

/*
 * Share previews (Ed, 2026-11-23): the card a chat or social site shows for
 * a pasted link. Its image must be at an absolute address, so the site's
 * address is here, once. A message page's card shows its bouquet and the
 * flowers in words, never the message; the pictures are drawn by
 * scripts/draw-previews.mjs into src/previews/ and the build fails if a code
 * has none. Every other page shares the site's card.
 */
const SITE_URL = 'https://cryptofloricon.com';
const PREVIEWS = path.join(SRC, 'previews');
// The bunch alone, under the passage on a message page (Ed, 2026-11-25): drawn
// with the previews by scripts/draw-previews.mjs, one per code of two or more stems.
const BUNCHES = path.join(SRC, 'bunches');
/* A bunch's width and height, from its WebP header (VP8X, as the browser writes it with alpha). */
// Every bunch is shown as tall as the stems above the title (Ed, 2026-11-25).
const BUNCH_HEIGHT = 100;
function BUNCH_SIZE(code) {
  const b = fs.readFileSync(path.join(BUNCHES, code + '.webp'));
  if (b.toString('ascii', 12, 16) !== 'VP8X') throw new Error(code + '.webp: expected an extended WebP');
  return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
}
const PREVIEW_SIZE = { width: 1200, height: 630 };
const SITE_SHARE = {
  title: 'Cryptofloricon',
  description: 'A lexicon of ciphers to encrypt and decrypt floral bouquets',
  image: 'site.jpg',
  alt: 'The Cryptofloricon logotype over a chrysanth, a lily, a gerbera, a rose and a carnation'
};
const MESSAGE_DESCRIPTION = 'What could it mean?';

/*
 * Search-engine basics (Ed, 2026-11-23): every page has a meta description,
 * a canonical link and a place in sitemap.xml. Unlike the share card, a
 * message page's description names the message.
 */
const LANGUAGE = 'a Victorian-inspired language of flowers';
const DESCRIPTIONS = {
  home: `A lexicon of ciphers to encrypt and decrypt floral bouquets: ${LANGUAGE} in which a bouquet spells a message.`,
  decode: 'Decode a bouquet: pick its flowers, stem by stem, and read the message it spells in the Cryptofloricon.',
  encode: 'Send a message in flowers: search the Cryptofloricon for what you want to say and find the bouquet that spells it.',
  browse: `Every message in the Cryptofloricon, ${LANGUAGE}, with the bouquet that spells it.`,
  story: `The story of the Cryptofloricon, ${LANGUAGE}, and of the people who made it.`,
  notFound: `Page not found. The Cryptofloricon is ${LANGUAGE}.`
};
const tagDescription = tag => `Messages tagged ${tag} in the Cryptofloricon, ${LANGUAGE}, with the bouquet that spells each.`;
/* "I love you: the meaning of a rose in the Cryptofloricon, …"; shorter if that runs past 160 characters. */
function messageDescription(title, code) {
  const head = `${title}: the meaning of ${Cipher.inWords(code).toLowerCase()} in the Cryptofloricon`;
  const full = `${head}, ${LANGUAGE}.`;
  return full.length <= 160 ? full : head + '.';
}

/* The share tags for a page at urlPath ("" for the home page, "2244/"; null for none). */
function shareTags(urlPath, share) {
  const tags = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', 'Cryptofloricon'],
    urlPath === null ? null : ['property', 'og:url', SITE_URL + '/' + urlPath],
    ['property', 'og:title', share.title],
    ['property', 'og:description', share.description],
    ['property', 'og:image', SITE_URL + '/previews/' + share.image],
    ['property', 'og:image:width', String(PREVIEW_SIZE.width)],
    ['property', 'og:image:height', String(PREVIEW_SIZE.height)],
    ['property', 'og:image:alt', share.alt],
    ['name', 'twitter:card', 'summary_large_image']
  ].filter(Boolean);
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}">\n`).join('');
}

const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Sorts+Mill+Goudy:ital@0;1&display=swap';

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

/*
 * options.entries replaces the lexicon (for tests). options.collectHeadings
 * lists the headings' text instead of failing on a word with no drawing
 * (scripts/draw-headings.mjs uses it to learn what to draw).
 */
function build(out, options = {}) {
  out = path.resolve(out || path.join(ROOT, 'site'));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const entries = options.entries || loadLexicon();
  const byId = {};
  entries.forEach(e => { byId[e.id] = e; });
  const byCode = Cipher.indexByCode(entries);
  const codes = Object.keys(byCode).sort();
  const tags = [...new Set(entries.flatMap(e => e.tags))].sort();
  const assets = resolveAssets(out);
  const pages = [];
  // A version on the stylesheet and scripts, from their contents, so a browser
  // holding an old copy (GitHub Pages sends max-age=600) fetches the new one.
  const VERSION = require('crypto').createHash('sha1')
    .update(siteCss(assets))
    .update(fs.readFileSync(path.join(ROOT, 'lib', 'cipher.js')))
    .update(['decode.js', 'encode.js', 'notfound.js'].map(f => fs.existsSync(path.join(SRC, f)) ? fs.readFileSync(path.join(SRC, f), 'utf8') : '').join(''))
    .update(JSON.stringify(entries))
    .digest('hex').slice(0, 10);

  /* ---------- shared pieces ---------- */

  // Script text, drawn: each word its own SVG, the words separated by
  // ordinary spaces so a heading wraps as text does.
  const drawings = loadDrawings();
  const headingTexts = new Set();
  const missing = new Set();
  function drawWords(text) {
    headingTexts.add(text);
    return text.split(' ').filter(Boolean).map(w => {
      const svg = drawings.word(w);
      if (!svg) missing.add(w);
      return svg || '';
    }).join(' ');
  }
  // A heading's contents: its text for screen readers, search engines and
  // copy and paste, and the drawings, hidden from screen readers. parts
  // splits a heading into spans with their own classes (the home title).
  function drawn(text, parts) {
    const art = parts
      ? parts.map(([cls, t]) => `<span class="${cls}">${drawWords(t)}</span>`).join(' ')
      : drawWords(text);
    return `<span class="visually-hidden">${esc(text)}</span><span class="drawn" aria-hidden="true">${art}</span>`;
  }

  const rootOf = depth => (depth ? '../'.repeat(depth) : './');
  const asset = (key, r) => (assets[key] ? r + assets[key].path : null);

  // Where an entry lives: its code's page, with an anchor when the code is shared.
  const entryHref = (id, r) => {
    const e = byId[id];
    return r + e.code + '/' + (byCode[e.code].length > 1 ? '#m' + e.id : '');
  };
  const tagHref = (tag, r) => r + 'browse/' + slug(tag) + '/';

  function bouquet(code, r, cls) {
    const label = Cipher.inWords(code);
    const stems = Cipher.displayStems(code).map(d =>
      `<img class="stem" src="${asset('flower' + d, r)}" alt="" data-digit="${d}">`).join('');
    return `<span class="bouquet${cls ? ' ' + cls : ''}" role="img" aria-label="${esc(label)}">${stems}</span>`;
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

  /*
   * The foot of every page (Ed, 46b): the reading links as a second row of
   * tabs (Encode and Decode stay at the top), then a small colophon. The
   * credits run on two lines on wide screens and one per line on a phone;
   * the copyright and the contact address share the last line.
   */
  function footer(r) {
    const credit = (role, names) => `<span class="credit"><i>${role}</i> ${names}</span>`;
    const sep = '<span class="sep"> &middot; </span>';
    return `<nav class="tabs bottom"><a href="${r}story/">&bull; Story &bull;</a><a href="${r}browse/">&bull; Browse &bull;</a></nav>
<footer class="site-footer">
  <p class="credits">${credit('Invented &amp; produced by', 'Edward Saperia')}${sep}${credit('written by', 'Sasha Garwood &amp; Grant Howitt')}<br>
  ${credit('website by', 'Kimi Lawrie &amp; Eugen Rochko')}${sep}${credit('graphics by', 'Sam Ballard &amp; Евгений Олегович')}</p>
  <p class="colophon">&copy; Original Content London<span class="sep"> &middot; </span><a href="mailto:ed@newspeak.house">ed@newspeak.house</a></p>
</footer>`;
  }

  function page({ file, title, description, main, scripts = [], bodyClass = '', head = '', mainClass = 'border', share = SITE_SHARE }) {
    if (!description) throw new Error(file + ': no meta description');
    const depth = file.split('/').length - 1;
    // The 404 page is served at any missing address, so it names no URL of its own.
    const urlPath = file === '404.html' ? null : file.replace(/index\.html$/, '');
    const r = rootOf(depth);
    const fav = asset('favicon', r);
    const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? esc(title) + ' &middot; ' : ''}Cryptofloricon</title>
<meta name="description" content="${esc(description)}">
${urlPath === null ? '' : `<link rel="canonical" href="${SITE_URL}/${urlPath}">\n`}${fav ? `<link rel="icon" href="${fav}">\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_CSS}">
<link rel="stylesheet" href="${r}assets/site.css?v=${VERSION}" data-site-css>
${shareTags(urlPath, share)}${head}</head>
<body class="${bodyClass}" data-root="${r}">
<div class="wrapper">
<header class="masthead">
${logo(r)}
${tabs(r)}
</header>
<main class="${mainClass}">
${main(r)}
</main>
${footer(r)}
</div>
${scripts.map(s => `<script src="${r}assets/${s}?v=${VERSION}"></script>`).join('\n')}
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
    description: DESCRIPTIONS.home,
    bodyClass: 'home',
    main: r => `
<h1 class="title home-title"><span class="line">A Lexicon of Ciphers</span> <span class="joiner">&ndash; to &ndash;</span> <span class="line">Encrypt &amp; Decrypt</span> <span class="line">Floral Bouquets</span></h1>
${divider(r, 'large')}
<p class="intro">Emails, texts, tweets... we are a messaging culture, submerged in an endless deluge of communication. Sometimes, though, we are lost for words. This system makes it a little easier to say those difficult things.</p>
<p class="calls"><a class="call" href="${r}decode/">&bull; Decode a Message &bull;</a> <span class="joiner">&ndash; or &ndash;</span> <a class="call" href="${r}encode/">&bull; Send a Message &bull;</a></p>`
  });

  /* ---------- decode ---------- */

  page({
    file: 'decode/index.html',
    title: 'Decode a Message',
    description: DESCRIPTIONS.decode,
    bodyClass: 'decode',
    scripts: ['cipher.js', 'lexicon.js', 'decode.js'],
    main: r => {
      const buttons = Cipher.KEY_ORDER.map(d =>
        `<button type="button" class="flower-btn" data-digit="${d}" aria-label="Add a ${Cipher.FLOWERS[d].name.toLowerCase()}">` +
        `<img src="${asset('flower' + d, r)}" alt=""><span class="flower-name">${Cipher.FLOWERS[d].key}</span>` +
        `<span class="flower-count" aria-hidden="true"></span></button>`).join('');
      return `
<h1 class="title">${drawn('Decode a Message')}</h1>
<p class="hint">Tap a flower once for each stem in the bouquet.</p>
<div class="flower-picker">${buttons}</div>
<div class="bouquet-build" aria-live="polite"><span class="bouquet bouquet-large" id="built"></span></div>
<p class="stem-count" id="stem-count" aria-live="polite"></p>
<p class="buttons"><button type="button" class="link-button" id="clear">&bull; Clear &bull;</button> <button type="button" class="link-button" id="submit">&bull; Submit &bull;</button></p>
<div id="result" class="decode-result" aria-live="polite"></div>
<template id="uh-oh"><p class="title">${drawn('Uh oh!')}</p></template>
<noscript><p class="hint">Decoding needs JavaScript. Every message is listed on the <a href="${r}browse/">Browse</a> page.</p></noscript>`;
    }
  });

  /* ---------- encode (Send a Message) ---------- */

  page({
    file: 'encode/index.html',
    title: 'Send a Message',
    description: DESCRIPTIONS.encode,
    bodyClass: 'encode',
    scripts: ['cipher.js', 'lexicon.js', 'encode.js'],
    main: r => `
<h1 class="title">${drawn('Send a Message')}</h1>
<form class="search" role="search" onsubmit="return false">
  <label class="visually-hidden" for="keyword">Keyword</label>
  <input type="search" id="keyword" placeholder="Type a keyword" autocomplete="off" spellcheck="false">
</form>
<ul class="results entry-list" id="results" aria-live="polite" data-flowers="${esc(JSON.stringify(
  Object.fromEntries(Cipher.KEY_ORDER.map(d => [d, asset('flower' + d, r)]))))}"></ul>
${divider(r, 'small')}
<ul class="tag-list">${tags.map(t => `<li><a href="${tagHref(t, r)}">${esc(t)}</a></li>`).join('')}</ul>
<p class="buttons"><a href="${r}browse/">&bull; Browse &bull;</a></p>`
  });

  /* ---------- share previews ---------- */

  const noPreview = [...codes, 'site'].filter(name => !fs.existsSync(path.join(PREVIEWS, name + '.jpg')));
  if (noPreview.length) {
    throw new Error(`no share preview for ${noPreview.join(', ')}. Draw it: node scripts/draw-previews.mjs`);
  }
  for (const name of [...codes, 'site']) copy(out, path.join(PREVIEWS, name + '.jpg'), 'previews/' + name + '.jpg');
  const bunched = codes.filter(code => code.length > 1);
  const noBunch = bunched.filter(code => !fs.existsSync(path.join(BUNCHES, code + '.webp')));
  if (noBunch.length) {
    throw new Error(`no bunch drawing for ${noBunch.join(', ')}. Draw it: node scripts/draw-previews.mjs`);
  }
  for (const code of bunched) copy(out, path.join(BUNCHES, code + '.webp'), 'bunches/' + code + '.webp');

  /* ---------- a page per code (the old site's /<code> scheme) ---------- */

  for (const code of codes) {
    const list = byCode[code];
    const words = Cipher.inWords(code);
    page({
      file: code + '/index.html',
      title: list.map(e => e.title).join(' / '),
      description: messageDescription(list.map(e => e.title).join(' / '), code),
      // The flowers, never the message: people click to find out.
      share: { title: words, description: MESSAGE_DESCRIPTION, image: code + '.jpg', alt: words },
      bodyClass: 'message',
      main: r => {
        const shared = list.length > 1
          ? `<p class="shared-note">This bouquet spells ${list.length} messages in the lexicon.</p>\n`
          : '';
        const articles = list.map(e => `
<article class="entry" id="m${e.id}">
  ${bouquet(code, r, 'bouquet-large')}
  <p class="flower-words">${esc(Cipher.inWords(code))}</p>
  <h1 class="title">${drawn(e.title)}</h1>
  <div class="passage">
${renderBody(e.body, byId, id => entryHref(id, r))}
  </div>
</article>`).join(`\n${divider(r, 'small')}\n`);
        // The bouquet gathered and tied, under the text; a single stem is already shown above.
        const bunch = code.length > 1
          ? `\n<figure class="bunch"><img src="${r}bunches/${code}.webp" alt="" width="${Math.round(BUNCH_SIZE(code).width * BUNCH_HEIGHT / BUNCH_SIZE(code).height)}" height="${BUNCH_HEIGHT}"></figure>`
          : '';
        return shared + articles + bunch;
      }
    });
  }

  /* ---------- browse ---------- */

  function entryRow(e, r) {
    // Title on the left, bouquet on the right; the bouquet's words are its aria-label only (Ed, 2026-11-23).
    return `<li class="entry-row"><a href="${entryHref(e.id, r)}"><span class="row-title">${esc(e.title)}</span>${bouquet(e.code, r, 'bouquet-small')}</a></li>`;
  }
  // The old browse page listed entries by code (browse.php: ORDER BY code ASC).
  const byCodeOrder = entries.slice().sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id - b.id));

  page({
    file: 'browse/index.html',
    title: 'Browse',
    description: DESCRIPTIONS.browse,
    bodyClass: 'browse',
    main: r => `
<h1 class="title">${drawn('Browse')}</h1>
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
      description: tagDescription(tag),
      bodyClass: 'browse',
      main: r => `
<h1 class="title">${drawn(tag)}</h1>
<ul class="tag-list">${tags.map(t => `<li>${t === tag ? `<span class="current">${esc(t)}</span>` : `<a href="${tagHref(t, r)}">${esc(t)}</a>`}</li>`).join('')}</ul>
${divider(r, 'small')}
<ul class="entry-list">
${byCodeOrder.filter(e => e.tags.includes(tag)).map(e => entryRow(e, r)).join('\n')}
</ul>
<p class="buttons"><a href="${r}browse/">&bull; Browse &bull;</a></p>`
    });
  }

  /* ---------- story ---------- */

  // The first letter of the story, drawn large. The letter itself stays in
  // the text, made invisible, so the first word is still one word to a
  // screen reader and in copy and paste.
  function dropCap(html) {
    const m = html.match(/<p>([A-Za-z])/);
    if (!m) throw new Error('content/story.html: no first letter for the drop cap');
    // The opening phrase, to its second comma, in small capitals, as in the book (Ed, 79).
    const rest = html.slice(m.index + m[0].length).match(/^[^,<]*,[^,<]*,/);
    if (!rest) throw new Error('content/story.html: no opening phrase for the small capitals');
    return html.replace(m[0] + rest[0], `<p class="opening"><span class="dropcap" aria-hidden="true">${drawWords(m[1])}</span><span class="dropcap-letter">${m[1]}</span><span class="opening-phrase">${rest[0]}</span>`);
  }

  page({
    file: 'story/index.html',
    title: 'Story',
    description: DESCRIPTIONS.story,
    bodyClass: 'story',
    main: () => `
<h1 class="title">${drawn('Introduction')}</h1>
<div class="prose">
${dropCap(fs.readFileSync(path.join(ROOT, 'content', 'story.html'), 'utf8'))}
</div>`
  });

  /* ---------- 404 ---------- */

  // Served by the host for any missing address, so its relative links are
  // written as if it sits at the site's root; notfound.js corrects them when
  // the missing address is deeper (it finds the root by ROOT_MARKER).
  page({
    file: '404.html',
    title: 'Not found',
    description: DESCRIPTIONS.notFound,
    bodyClass: 'notfound',
    // Inlined: a relative script path would itself break at a deep address.
    head: `<script>\n${fs.readFileSync(path.join(SRC, 'notfound.js'), 'utf8').replace('{{marker}}', ROOT_MARKER)}</script>\n`,
    main: r => `
<h1 class="title">${drawn('Uh oh!')}</h1>
<p>Sorry, but the page you were trying to view does not exist.</p>
<p class="calls"><a class="call" href="${r}decode/">&bull; Decode a Message &bull;</a> <span class="joiner">&ndash; or &ndash;</span> <a class="call" href="${r}encode/">&bull; Send a Message &bull;</a></p>`
  });

  /* ---------- sitemap and robots.txt ---------- */

  const listed = pages.filter(f => f !== '404.html').map(f => SITE_URL + '/' + f.replace(/index\.html$/, ''));
  write(out, 'sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    listed.map(u => `<url><loc>${esc(u)}</loc></url>\n`).join('') + '</urlset>\n');
  write(out, 'robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  if (missing.size && !options.collectHeadings) {
    throw new Error(`Script headings with no drawing for ${[...missing].map(w => JSON.stringify(w)).join(', ')}. ` +
      'Redraw them from the title font: see scripts/draw-headings.mjs.');
  }

  return { out, pages, codes, tags, assets, headingTexts: [...headingTexts], missingWords: [...missing] };
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

module.exports = { build, loadLexicon, ASSETS, ROOT_MARKER, SITE_URL };

if (require.main === module) {
  const result = build(process.argv[2]);
  const real = Object.values(result.assets).filter(a => a && a.real).length;
  console.log(`Built ${result.pages.length} pages (${result.codes.length} message pages, ${result.tags.length} tag pages) into ${path.relative(process.cwd(), result.out) || '.'}; artwork: ${real} real file(s), the rest placeholders.`);
}
