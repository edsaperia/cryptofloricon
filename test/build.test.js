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

test('/2/ is "I love you"', () => {
  assert.match(read('2/index.html'), /<h1 class="title">I love you<\/h1>/);
});

test('/1334/ is My work here is done alone, and /2445/ is Despair', () => {
  const a = read('1334/index.html');
  assert.match(a, /<h1 class="title">My work here is done<\/h1>/);
  assert.doesNotMatch(a, /Despair<\/h1>/);
  assert.match(read('2445/index.html'), /<h1 class="title">Despair<\/h1>/);
});

test('the main pages exist', () => {
  for (const f of ['index.html', 'decode/index.html', 'encode/index.html', 'browse/index.html',
    'browse/love/index.html', 'story/index.html', '404.html']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
});

test('browse lists all 177 entries; the Love tag page lists 53', () => {
  assert.equal((read('browse/index.html').match(/class="entry-row"/g) || []).length, 177);
  assert.equal((read('browse/love/index.html').match(/class="entry-row"/g) || []).length, 53);
});

test('#123 now links "Do you feel the same?" where it said #32', () => {
  const e = loadLexicon().find(x => x.id === 123);
  const html = read(e.code + '/index.html');
  assert.ok(html.includes('<a class="xref" href="../14455/">Do you feel the same?</a> enable delicate enquiries'));
  assert.ok(!html.includes('#32'));
});

test('the home title is three parts: phrase, "– to –", phrase', () => {
  assert.ok(read('index.html').includes('<h1 class="title"><span class="line">A Lexicon of Ciphers</span> ' +
    '<span class="joiner">&ndash; to &ndash;</span> <span class="line">Encrypt and Decrypt Floral Bouquets</span></h1>'));
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
  assert.ok(html.includes('aria-label="2 Chrysanths, 1 Lily, 1 Carnation"'));
  assert.ok(html.includes('<p class="flower-words">2 Chrysanths, 1 Lily, 1 Carnation</p>'));
});

test('the Key and the Decode buttons run Chrysanth, Lily, Gerbera, Rose, Carnation', () => {
  const key = read('index.html').match(/<ul class="key-flowers">([\s\S]*?)<\/ul>/)[1];
  assert.deepEqual([...key.matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]),
    ['Chrysanth', 'Lily', 'Gerbera', 'Rose', 'Carnation']);
  const decode = read('decode/index.html');
  assert.deepEqual([...decode.matchAll(/class="flower-btn" data-digit="(\d)" aria-label="([^"]+)"/g)].map(m => m[1] + ' ' + m[2]),
    ['3 Add a chrysanth', '1 Add a lily', '5 Add a gerbera', '2 Add a rose', '4 Add a carnation']);
});

test('no page or script calls the flower "Chrysanthemum"', () => {
  // The story's prose ("roses and chrysanthemums carpeted the church") is not a label and stays.
  for (const f of allFiles(out).filter(f => /\.(html|js)$/.test(f))) {
    assert.doesNotMatch(read(f), /Chrysanthemum/, f);
  }
});

test('every page has the contact address in its footer', () => {
  const pages = allFiles(out).filter(f => f.endsWith('.html'));
  assert.ok(pages.length >= 196);
  for (const f of pages) {
    assert.ok(read(f).includes('&bull; <a href="mailto:ed@newspeak.house">ed@newspeak.house</a> &bull;</p>'), f);
  }
});

test('How it works is gone (Ed, 20c): no page, no link, footer is Story, Browse, address', () => {
  assert.ok(!fs.existsSync(path.join(out, 'how-it-works')));
  for (const f of allFiles(out).filter(f => f.endsWith('.html'))) {
    const html = read(f);
    assert.doesNotMatch(html, /how-it-works|How it works/, f);
    assert.match(html, /<p class="footer-links">&bull; <a href="[^"]*story\/">Story<\/a> &bull; <a href="[^"]*browse\/">Browse<\/a> &bull; <a href="mailto:ed@newspeak.house">ed@newspeak.house<\/a> &bull;<\/p>/, f);
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
