'use strict';
// Builds the whole site into a temporary folder and checks what a visitor
// would reach: a page for every code, and no broken internal link.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, loadLexicon } = require('../build');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-site-'));
const result = build(out);
test.after(() => fs.rmSync(out, { recursive: true, force: true }));

const read = rel => fs.readFileSync(path.join(out, rel), 'utf8');

function allFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? allFiles(path.join(dir, d.name), base + d.name + '/') : [base + d.name]);
}

test('every code has its page at /<code>/index.html', () => {
  const codes = [...new Set(loadLexicon().map(e => e.code))];
  for (const code of codes) assert.ok(fs.existsSync(path.join(out, code, 'index.html')), code);
  // Hand-written spot checks of the old URL scheme.
  for (const code of ['2', '14', '1334', '2445', '2244', '222555']) assert.ok(fs.existsSync(path.join(out, code, 'index.html')), code);
  assert.equal(result.codes.length, 177);
});

// A title is its text (visually hidden, for screen readers) and drawings of its words.
const titleText = text => `<h1 class="title"><span class="visually-hidden">${text}</span><span class="drawn" aria-hidden="true">`;

test('/2/ is "I love you"', () => {
  assert.ok(read('2/index.html').includes(titleText('I love you')));
});

test('/1334/ is My work here is done alone, and /2445/ is Despair', () => {
  const a = read('1334/index.html');
  assert.ok(a.includes(titleText('My work here is done')));
  assert.doesNotMatch(a, /Despair/);
  assert.ok(read('2445/index.html').includes(titleText('Despair')));
});

test('the main pages exist', () => {
  for (const f of ['index.html', 'decode/index.html', 'encode/index.html', 'browse/index.html',
    'browse/love/index.html', 'story/index.html', '404.html']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
});

test('browse lists all 177 entries; the Love tag page lists 49', () => {
  assert.equal((read('browse/index.html').match(/class="entry-row"/g) || []).length, 177);
  assert.equal((read('browse/love/index.html').match(/class="entry-row"/g) || []).length, 49);
});

test('#123 now links "Do you feel the same?" where it said #32', () => {
  const e = loadLexicon().find(x => x.id === 123);
  const html = read(e.code + '/index.html');
  assert.ok(html.includes('<a class="xref" href="../14455/">Do you feel the same?</a> enable delicate enquiries'));
  assert.ok(!html.includes('#32'));
});

test('the home title is three parts: phrase, "– to –", phrase', () => {
  const h1 = read('index.html').match(/<h1 class="title">([\s\S]*?)<\/h1>/)[1];
  assert.ok(h1.startsWith('<span class="visually-hidden">A Lexicon of Ciphers – to – Encrypt and Decrypt Floral Bouquets</span>'));
  // The drawings in three spans: 4 words, then "– to –" (3), then 5 words.
  const parts = [...h1.matchAll(/<span class="(line|joiner)">([\s\S]*?)<\/span>/g)].map(m => m[1] + ' ' + (m[2].match(/<svg\b/g) || []).length);
  assert.deepEqual(parts, ['line 4', 'joiner 3', 'line 5']);
});

test('the dividers are inlined, without the scan they were traced from', () => {
  const home = read('index.html');
  const large = home.match(/<div class="divider divider-large" role="presentation">(<svg[\s\S]*?<\/svg>)<\/div>/);
  assert.ok(large, 'large divider inlined as <svg>');
  assert.equal((large[1].match(/<path /g) || []).length, 14);
  const browse = read('browse/index.html');
  const small = browse.match(/<div class="divider divider-small" role="presentation">(<svg[\s\S]*?<\/svg>)<\/div>/);
  assert.ok(small, 'small divider inlined as <svg>');
  assert.equal((small[1].match(/<path /g) || []).length, 6);
  for (const html of [home, browse]) {
    assert.doesNotMatch(html, /<image|data:image\/jpeg|id="Layer_1"|<\?xml|<!DOCTYPE svg/);
  }
});

test('/1334/ shows its stems and flowers in the 2015 display order', () => {
  const html = read('1334/index.html');
  const stems = [...html.matchAll(/<img class="stem"[^>]*data-digit="(\d)"/g)].map(m => m[1]);
  assert.deepEqual(stems, ['3', '3', '1', '4']);
  assert.ok(html.includes('aria-label="Two chrysanths, a lily, and a carnation"'));
  assert.ok(html.includes('<p class="flower-words">Two chrysanths, a lily, and a carnation</p>'));
});

test('the Decode buttons run Chrysanth, Lily, Gerbera, Rose, Carnation', () => {
  const decode = read('decode/index.html');
  assert.deepEqual([...decode.matchAll(/class="flower-btn" data-digit="(\d)" aria-label="([^"]+)"/g)].map(m => m[1] + ' ' + m[2]),
    ['3 Add a chrysanth', '1 Add a lily', '5 Add a gerbera', '2 Add a rose', '4 Add a carnation']);
  assert.deepEqual([...decode.matchAll(/<span class="flower-name">([^<]+)<\/span>/g)].map(m => m[1]),
    ['Chrysanth', 'Lily', 'Gerbera', 'Rose', 'Carnation']);
});

// The Key is gone (Ed, 2026-11-23: "we write a text description underneath anyway").
test('no page has the Key toggle, its panel or the word Key as a label', () => {
  const pages = allFiles(out).filter(f => f.endsWith('.html'));
  assert.ok(pages.length > 177, 'pages checked: ' + pages.length);
  for (const f of pages) {
    const html = read(f);
    assert.doesNotMatch(html, /<details|<summary|class="key|key-flowers/, f);
    const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /\bKey\b/, f);
  }
  const css = read('assets/site.css');
  assert.doesNotMatch(css, /\.key\b|key-flowers/);
  for (const js of ['assets/encode.js', 'assets/decode.js']) assert.doesNotMatch(read(js), /key-flowers/, js);
});

test('Send a Message hands its script the five flower pictures', () => {
  const html = read('encode/index.html');
  const m = html.match(/<ul class="results entry-list" id="results"[^>]*data-flowers="([^"]+)"/);
  assert.ok(m, 'data-flowers on #results');
  const map = JSON.parse(m[1].replace(/&quot;/g, '"'));
  assert.deepEqual(Object.keys(map).sort(), ['1', '2', '3', '4', '5']);
  for (const src of Object.values(map)) {
    assert.match(src, /^\.\.\/assets\//);
    assert.ok(fs.existsSync(path.join(out, 'encode', src)), src);
  }
});

test('no page or script calls the flower "Chrysanthemum"', () => {
  // The story's prose ("roses and chrysanthemums carpeted the church") is not a label and stays.
  for (const f of allFiles(out).filter(f => /\.(html|js)$/.test(f))) {
    assert.doesNotMatch(read(f), /Chrysanthemum/, f);
  }
});

test('every page ends with the colophon: the copyright, then the contact address (Ed, 46b)', () => {
  const pages = allFiles(out).filter(f => f.endsWith('.html'));
  assert.ok(pages.length >= 196);
  for (const f of pages) {
    assert.ok(read(f).includes('<p class="colophon">&copy; Original Content London<span class="sep"> &middot; </span>' +
      '<a href="mailto:ed@newspeak.house">ed@newspeak.house</a></p>\n</footer>'), f);
  }
});

test('every page credits everyone in the footer, and the bottom tabs are Story and Browse (Ed, 20c, 46b)', () => {
  for (const f of allFiles(out).filter(f => f.endsWith('.html'))) {
    const html = read(f);
    assert.ok(!fs.existsSync(path.join(out, 'how-it-works')));
    assert.doesNotMatch(html, /how-it-works|How it works/, f);
    assert.match(html, /<nav class="tabs bottom"><a href="[^"]*story\/">&bull; Story &bull;<\/a><a href="[^"]*browse\/">&bull; Browse &bull;<\/a><\/nav>/, f);
    const foot = html.slice(html.indexOf('<footer'));
    for (const name of ['Edward Saperia', 'Sasha Garwood &amp; Grant Howitt', 'Kimi Lawrie &amp; Eugen Rochko', 'Sam Ballard &amp; Евгений Олегович']) {
      assert.ok(foot.includes(name), f + ': ' + name);
    }
  }
});

test('no generated page has a broken internal link', () => {
  const files = allFiles(out);
  const checked = { refs: 0, pages: 0 };
  const broken = [];
  const resolveTo = (fromFile, ref) => {
    const clean = ref.replace(/[?#].*$/, '');
    if (clean === '') return fromFile; // a link to an anchor on the same page
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
    if (clean.endsWith('/') || clean === '.' || clean === './') target = path.posix.join(target, 'index.html');
    return target;
  };
  const isExternal = ref => /^(https?:|mailto:|data:|\/\/)/.test(ref);
  for (const f of files) {
    let refs = [];
    const text = read(f);
    if (f.endsWith('.html')) {
      checked.pages++;
      refs = [...text.matchAll(/\s(?:href|src)="([^"]*)"/g)].map(m => m[1]);
    } else if (f.endsWith('.css')) {
      refs = [...text.matchAll(/url\("?([^")]+)"?\)/g)].map(m => m[1]);
    } else continue;
    for (const ref of refs) {
      if (isExternal(ref)) continue;
      assert.ok(!ref.startsWith('/'), `${f}: "${ref}" is not relative`);
      checked.refs++;
      const target = resolveTo(f, ref);
      if (target.startsWith('..') || !fs.existsSync(path.join(out, target))) broken.push(`${f} -> ${ref}`);
    }
  }
  assert.deepEqual(broken, []);
  assert.ok(checked.pages >= 196, `checked ${checked.pages} pages`);
  assert.ok(checked.refs > 5000, `checked ${checked.refs} links`);
});

// Message pages no longer list their tags (Ed, 2026-11-23: "you can get to them via the encode page").
test('no message page shows its tags line; /2445/ does not link to Sorrow', () => {
  const codes = [...new Set(loadLexicon().map(e => e.code))];
  assert.equal(codes.length, 177);
  for (const code of codes) assert.doesNotMatch(read(code + '/index.html'), /entry-tags/, code);
  const despair = read('2445/index.html');
  assert.doesNotMatch(despair, /browse\/sorrow\//);
  assert.doesNotMatch(despair, />Sorrow</);
  assert.doesNotMatch(read('assets/site.css'), /entry-tags/);
});

test('every tag page is still linked from Send a Message and from Browse', () => {
  const tagPages = allFiles(out).filter(f => /^browse\/[^/]+\/index\.html$/.test(f)).map(f => f.split('/')[1]);
  assert.equal(tagPages.length, 14);
  for (const s of ['love', 'sorrow', 'anger', 'rejection', 'warning']) assert.ok(tagPages.includes(s), s);
  const encode = read('encode/index.html');
  const browse = read('browse/index.html');
  for (const s of tagPages) {
    assert.ok(encode.includes(`href="../browse/${s}/"`), 'encode -> ' + s);
    assert.ok(browse.includes(`href="../browse/${s}/"`), 'browse -> ' + s);
  }
});

// Browse rows: title on the left, the bouquet on the right, no flowers-in-words text (Ed, 2026-11-23).
const browseRows = html => [...html.matchAll(/<li class="entry-row">([\s\S]*?)<\/li>/g)].map(m => m[1]);
const visibleText = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('Browse rows show no flowers-in-words text, but keep it for screen readers', () => {
  for (const f of ['browse/index.html', 'browse/love/index.html', 'browse/sorrow/index.html']) {
    const html = read(f);
    assert.doesNotMatch(html, /row-flowers/, f);
    for (const row of browseRows(html)) {
      assert.doesNotMatch(visibleText(row), /\b\d (Chrysanths?|Lil(y|ies)|Gerberas?|Roses?|Carnations?)\b/, f + ': ' + visibleText(row));
    }
  }
  const despair = browseRows(read('browse/index.html')).find(r => r.includes('href="../2445/"'));
  assert.equal(visibleText(despair), 'Despair');
  assert.ok(despair.includes('role="img" aria-label="A gerbera, a rose, and two carnations"'));
});

test('each Browse row links to its message, title first and then its bouquet', () => {
  const rows = browseRows(read('browse/index.html'));
  assert.equal(rows.length, 177);
  for (const row of rows) {
    const m = row.match(/^<a href="\.\.\/(\d+)\/(#m\d+)?"><span class="row-title">[^<]+<\/span><span class="bouquet bouquet-small"/);
    assert.ok(m, row.slice(0, 160));
    assert.ok(fs.existsSync(path.join(out, m[1], 'index.html')), m[1]);
    const digits = [...row.matchAll(/data-digit="(\d)"/g)].map(x => x[1]).sort().join('');
    assert.equal(digits, m[1].split('').sort().join(''), m[1]);
  }
  // Hand-written spot checks, in the order Browse lists them (by code).
  const first = rows.slice(0, 3).map(r => r.match(/href="\.\.\/([^"]+)"/)[1]);
  assert.deepEqual(first, ['1/', '11/', '111/']);
  assert.ok(rows.some(r => r.startsWith('<a href="../2/"><span class="row-title">I love you</span>')));
});

// Send a Message's search results match Browse (Ed, 28a, 2026-11-23): title left, bouquet right, no flower words.
// Runs the built encode.js against a minimal DOM: only what the script touches, behaving as a browser's does.
function runEncode(query) {
  const vm = require('vm');
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    appendChild(c) { this.children.push(c); return c; }
    set textContent(t) { this._text = String(t); this.children = []; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set innerHTML(h) { if (h !== '') throw new Error('unexpected innerHTML'); this.children = []; this._text = ''; }
    addEventListener(type, fn) { this['on' + type] = fn; }
    toHtml() {
      const a = Object.entries({ class: this.className, href: this.href, src: this.src, ...this.attrs })
        .filter(([, v]) => v).map(([k, v]) => ` ${k}="${v}"`).join('');
      const t = this.tagName.toLowerCase();
      return `<${t}${a}>${this._text}${this.children.map(c => c.toHtml()).join('')}</${t}>`;
    }
  }
  const html = read('encode/index.html');
  const results = new El('ul');
  results.setAttribute('data-flowers', html.match(/data-flowers="([^"]+)"/)[1].replace(/&quot;/g, '"'));
  const input = new El('input');
  input.value = '';
  const body = new El('body');
  body.setAttribute('data-root', '../');
  const document = { body, createElement: t => new El(t), getElementById: id => ({ keyword: input, results }[id]) };
  const ctx = vm.createContext({ document });
  ctx.window = ctx;
  for (const f of ['assets/cipher.js', 'assets/lexicon.js', 'assets/encode.js']) vm.runInContext(read(f), ctx, { filename: f });
  input.value = query;
  input.oninput();
  return results.children.map(li => li.toHtml());
}

test('a Send a Message result is title then bouquet, with no visible flower words', () => {
  const rows = runEncode('love');
  assert.ok(rows.length >= 50, 'results for "love": ' + rows.length);
  for (const row of rows) {
    assert.match(row, /^<li class="entry-row"><a href="\.\.\/\d+\/(#m\d+)?"><span class="row-title">[^<]+<\/span><span class="bouquet bouquet-small" role="img" aria-label="[^"]+">(<img class="stem" src="\.\.\/assets\/flowers\/\d\.png"><\/img>)+<\/span><\/a><\/li>$/, row);
    assert.doesNotMatch(visibleText(row), /\b\d (Chrysanths?|Lil(y|ies)|Gerberas?|Roses?|Carnations?)\b/, row);
  }
  const iLoveYou = rows.find(r => r.includes('href="../2/"'));
  assert.equal(visibleText(iLoveYou), 'I love you');
  assert.ok(iLoveYou.includes('aria-label="A rose"'));
  // The results list takes Browse's row styles.
  assert.match(read('encode/index.html'), /<ul class="results entry-list" id="results"/);
});

// Flowers in natural words everywhere (Ed, 2026-11-24): "Two roses and two carnations", never "2 Roses, 2 Carnations".
test('/2244/ and /2/ name their flowers in natural words under the bouquet', () => {
  assert.ok(read('2244/index.html').includes('<p class="flower-words">Two roses and two carnations</p>'));
  assert.ok(read('2/index.html').includes('<p class="flower-words">A rose</p>'));
  assert.ok(read('2244/index.html').includes('role="img" aria-label="Two roses and two carnations"'));
  assert.ok(read('1334/index.html').includes('<p class="flower-words">Two chrysanths, a lily, and a carnation</p>'));
});

test('no built file names flowers in the counted style', () => {
  const counted = /\b\d+ (Chrysanths?|Lil(y|ies)|Gerberas?|Roses?|Carnations?)\b/i;
  const files = allFiles(out).filter(f => /\.(html|js|json|xml|txt)$/.test(f));
  assert.ok(files.length > 177, 'files scanned: ' + files.length);
  for (const f of files) assert.doesNotMatch(read(f), counted, f);
});

// Runs the built decode.js against a minimal DOM: only what the script touches, behaving as a browser's does.
function runDecode() {
  const vm = require('vm');
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.textContent = ''; this.classes = new Set(); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    appendChild(c) { this.children.push(c); return c; }
    set innerHTML(h) { if (h !== '') throw new Error('unexpected innerHTML'); this.children = []; }
    addEventListener(type, fn) { this['on' + type] = fn; }
    get classList() { const s = this.classes; return { toggle: (c, on) => (on ? s.add(c) : s.delete(c)) }; }
  }
  const html = read('decode/index.html');
  const buttons = [...html.matchAll(/class="flower-btn" data-digit="(\d)"[^>]*><img src="([^"]+)"/g)].map(([, d, src]) => {
    const b = new El('button');
    b.setAttribute('data-digit', d);
    const img = new El('img'); img.setAttribute('src', src);
    const count = new El('span');
    b.querySelector = sel => ({ img, '.flower-count': count }[sel]);
    return b;
  });
  assert.equal(buttons.length, 5);
  const els = { built: new El('span'), 'stem-count': new El('p'), result: new El('div'), clear: new El('button'), submit: new El('button') };
  const body = new El('body');
  body.setAttribute('data-root', '../');
  const document = {
    body,
    createElement: t => new El(t),
    getElementById: id => els[id],
    querySelectorAll: sel => (sel === '.flower-btn' ? buttons : [])
  };
  const ctx = vm.createContext({ document });
  ctx.window = ctx;
  for (const f of ['assets/cipher.js', 'assets/lexicon.js', 'assets/decode.js']) vm.runInContext(read(f), ctx, { filename: f });
  const tap = d => { const b = buttons.find(x => x.getAttribute('data-digit') === d); b.onclick({ currentTarget: b }); };
  return { tap, line: () => els['stem-count'].textContent, clear: () => els.clear.onclick() };
}

test('Decode names the bouquet in natural words as flowers are tapped', () => {
  const d = runDecode();
  assert.equal(d.line(), '');
  d.tap('3');
  assert.equal(d.line(), 'A chrysanth');
  d.tap('1');
  assert.equal(d.line(), 'A chrysanth and a lily');
  d.tap('4'); d.tap('4');
  assert.equal(d.line(), 'A chrysanth, a lily, and two carnations');
  d.clear();
  assert.equal(d.line(), '');
});
