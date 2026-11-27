'use strict';
// The script headings are drawings of the words (SVG outlines made from
// Andrade Script Pro by scripts/draw-headings.js), so the licensed font is
// neither in the repository nor served. These tests check that every heading
// has its drawing, that its text is still there for screen readers, search
// engines and copy and paste, and that no font or font counter is left.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, loadLexicon } = require('../build');

const ROOT = path.join(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-headings-'));
build(out);
const tmpDirs = [out];
test.after(() => tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

const read = rel => fs.readFileSync(path.join(out, rel), 'utf8');

function allFiles(dir, base = '', skip = new Set()) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (skip.has(base + d.name)) return [];
    return d.isDirectory() ? allFiles(path.join(dir, d.name), base + d.name + '/', skip) : [base + d.name];
  });
}

// The repository's own files: not git's store, installed packages or a built site.
const SKIP = new Set(['.git', 'site', 'node_modules', 'scripts/node_modules']);
const repoFiles = allFiles(ROOT, '', SKIP);
const siteFiles = allFiles(out);
const TEXT = /\.(html|css|js|mjs|json|svg|txt|md|toml|yml|yaml)$/;
const FONT = /\.(ttf|otf|woff2?|eot)$/i;

/* Every element with class "title" in a page, with its inner HTML. */
function titlesIn(html) {
  const found = [];
  const re = /<(h1|p|div)\b[^>]*\bclass="title[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) found.push({ tag: m[0], inner: m[2] });
  return found;
}

/* The HTML with each aria-hidden span (and all it holds, nested spans too) removed. */
function withoutHidden(html) {
  let s = html;
  let at;
  while ((at = s.search(/<span\b[^>]*aria-hidden="true"[^>]*>/)) !== -1) {
    const tag = /<\/?span\b[^>]*>/g;
    tag.lastIndex = at;
    let depth = 0, m;
    while ((m = tag.exec(s))) {
      depth += m[0][1] === '/' ? -1 : 1;
      if (depth === 0) break;
    }
    if (!m) throw new Error('unclosed span in ' + html.slice(at, at + 80));
    s = s.slice(0, at) + ' ' + s.slice(tag.lastIndex);
  }
  return s;
}

/* What a screen reader reads for a heading: its text minus aria-hidden parts. */
function accessibleText(inner) {
  let s = withoutHidden(inner);
  s = s.replace(/<svg\b[\s\S]*?<\/svg>/g, ' ');
  s = s.replace(/<[^>]+>/g, '');
  return s.replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}

test('message titles are drawn, with their text kept for screen readers', () => {
  const two = titlesIn(read('2/index.html'));
  assert.equal(two.length, 1);
  assert.equal(accessibleText(two[0].inner), 'I love you');
  // Three words, three drawings, hidden from screen readers.
  assert.equal((two[0].inner.match(/<svg\b/g) || []).length, 3);
  assert.match(two[0].inner, /<span class="drawn" aria-hidden="true">/);

  const long = titlesIn(read('1344/index.html'));
  assert.equal(accessibleText(long[0].inner), "Don't make promises you can't keep");
  assert.equal((long[0].inner.match(/<svg\b/g) || []).length, 6);
});

test('page titles are drawn: Decode, Send a Message, Browse, a tag, Story, 404', () => {
  const cases = {
    'decode/index.html': 'Decode a Message',
    'encode/index.html': 'Send a Message',
    'browse/index.html': 'Browse',
    'browse/love/index.html': 'Love',
    'browse/perfunction/index.html': 'Perfunction',
    'story/index.html': 'Introduction',
    '404.html': 'Uh oh!'
  };
  for (const [file, text] of Object.entries(cases)) {
    // The page's own title, not the Decode script's "Uh oh!" waiting in its template.
    const t = titlesIn(read(file).replace(/<template\b[\s\S]*?<\/template>/g, ''));
    assert.equal(t.length, 1, file);
    assert.equal(accessibleText(t[0].inner), text, file);
    assert.ok(/<svg\b/.test(t[0].inner), file + ' has drawings');
  }
});

test('every title on every page has drawings and exposes its text', () => {
  let n = 0;
  // The home title is set in Caslon italic, not drawn (Ed, 82e).
  for (const f of siteFiles.filter(f => f.endsWith('.html') && f !== 'index.html')) {
    for (const t of titlesIn(read(f))) {
      n++;
      assert.ok(accessibleText(t.inner).length > 0, f + ': ' + t.tag.slice(0, 80));
      assert.ok(/<svg\b/.test(t.inner), f + ' title is drawn');
      // No drawing is exposed on its own.
      const visible = withoutHidden(t.inner);
      assert.doesNotMatch(visible, /<svg\b/, f);
    }
  }
  // 196 pages less the home page; every page has one title except the code page shared by two messages.
  assert.ok(n >= 195, 'titles checked: ' + n);
});

test('the Decode page carries the drawn "Uh oh!" for its script to show', () => {
  const html = read('decode/index.html');
  const m = html.match(/<template id="uh-oh">([\s\S]*?)<\/template>/);
  assert.ok(m, 'template present');
  const t = titlesIn(m[1]);
  assert.equal(t.length, 1);
  assert.equal(accessibleText(t[0].inner), 'Uh oh!');
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'decode.js'), 'utf8'), /getElementById\('uh-oh'\)/);
});

test('the Story drop cap is drawn and the first word stays whole', () => {
  const html = read('story/index.html');
  assert.match(html, /<span class="dropcap" aria-hidden="true"><svg\b/);
  // "There" is still one word in the text: the T is only made invisible.
  assert.match(html, /<span class="dropcap-letter">T<\/span>here was a time/);
});

test('a title with no drawing fails the build, so a new or renamed title forces a redraw', () => {
  const entries = loadLexicon();
  // On a code that has a share preview, so the build reaches the heading check
  // rather than stopping at the missing preview (test/previews.test.js).
  entries.push({ id: 999, code: '111222', title: 'Quokka zebra', body: 'Test.', tags: ['Love'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-missing-'));
  tmpDirs.push(dir);
  assert.throws(() => build(dir, { entries }), /no drawing for "Quokka", "zebra"/);
});

test('no font file is in the repository or the built site', () => {
  assert.deepEqual(repoFiles.filter(f => FONT.test(f)), []);
  assert.deepEqual(siteFiles.filter(f => FONT.test(f)), []);
});

test('no @font-face and no myfonts.net, in the repository or the built site', () => {
  const offenders = [];
  for (const [base, files] of [[ROOT, repoFiles], [out, siteFiles]]) {
    for (const f of files.filter(f => TEXT.test(f))) {
      // This test file names both on purpose.
      if (base === ROOT && f === 'test/headings.test.js') continue;
      const s = fs.readFileSync(path.join(base, f), 'utf8');
      if (/@font-face/i.test(s)) offenders.push(f + ': @font-face');
      if (/myfonts\.net/i.test(s)) offenders.push(f + ': myfonts.net');
    }
  }
  assert.deepEqual(offenders, []);
});

test('.gitignore keeps font files out', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').map(s => s.trim());
  for (const p of ['*.ttf', '*.otf', '*.woff', '*.woff2']) assert.ok(ignore.includes(p), p);
});
