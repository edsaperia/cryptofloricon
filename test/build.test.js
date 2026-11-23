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
  for (const code of ['2', '14', '1334', '2244', '222555']) assert.ok(fs.existsSync(path.join(out, code, 'index.html')), code);
  assert.equal(result.codes.length, 176);
});

test('/2/ is "I love you"', () => {
  assert.match(read('2/index.html'), /<h1 class="title">I love you<\/h1>/);
});

test('/1334/ shows both Despair and My work here is done', () => {
  const html = read('1334/index.html');
  assert.match(html, /<article class="entry" id="m146">[\s\S]*<h1 class="title">Despair<\/h1>/);
  assert.match(html, /<article class="entry" id="m162">[\s\S]*<h1 class="title">My work here is done<\/h1>/);
});

test('the main pages exist', () => {
  for (const f of ['index.html', 'decode/index.html', 'encode/index.html', 'browse/index.html',
    'browse/love/index.html', 'story/index.html', 'how-it-works/index.html', '404.html']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
});

test('browse lists all 177 entries; the Love tag page lists 53', () => {
  assert.equal((read('browse/index.html').match(/class="entry-row"/g) || []).length, 177);
  assert.equal((read('browse/love/index.html').match(/class="entry-row"/g) || []).length, 53);
});

test('a cross-reference to an entry on a shared code points at its anchor', () => {
  const pages = allFiles(out).filter(f => f.endsWith('.html'));
  const linking = pages.filter(f => /href="\.\.\/1334\/#m(146|162)"/.test(read(f)));
  assert.ok(linking.length > 0, 'some passage links #146 or #162');
});

test('the dangling #32 stays plain text on the page of #123', () => {
  const e = loadLexicon().find(x => x.id === 123);
  const html = read(e.code + '/index.html');
  assert.ok(html.includes('#32'));
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
