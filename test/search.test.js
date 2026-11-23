'use strict';
// Search-engine basics (Ed, 2026-11-23): a meta description on every page,
// which on a message page names the message (the share card still does not),
// a canonical link per page, sitemap.xml and robots.txt. Expected strings are
// written by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, loadLexicon } = require('../build');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-search-'));
const result = build(out);
test.after(() => fs.rmSync(out, { recursive: true, force: true }));
const read = rel => fs.readFileSync(path.join(out, rel), 'utf8');
const meta = (html, attr, key) => (html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`)) || [])[1];
const canonical = html => (html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];

test('/2/ describes itself as "I love you" to search engines, and its share card still does not', () => {
  const html = read('2/index.html');
  assert.equal(meta(html, 'name', 'description'),
    'I love you: the meaning of a rose in the Cryptofloricon, a Victorian-inspired language of flowers.');
  assert.equal(meta(html, 'property', 'og:description'), 'What could it mean?');
  assert.equal(canonical(html), 'https://cryptofloricon.com/2/');
});

test('/2244/ names Patience and its flowers', () => {
  assert.equal(meta(read('2244/index.html'), 'name', 'description'),
    'Patience: the meaning of two roses and two carnations in the Cryptofloricon, a Victorian-inspired language of flowers.');
});

test('every page has one meta description of at most 160 characters, and a canonical link but the 404', () => {
  assert.ok(result.pages.length >= 197);
  for (const file of result.pages) {
    const html = read(file);
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1, file);
    const d = meta(html, 'name', 'description');
    assert.ok(d && d.length >= 30 && d.replace(/&#39;|&amp;|&quot;/g, 'x').length <= 160, `${file}: ${d}`);
    if (file === '404.html') assert.equal(canonical(html), undefined);
    else assert.equal(canonical(html), 'https://cryptofloricon.com/' + file.replace(/index\.html$/, ''), file);
  }
  assert.equal(canonical(read('index.html')), 'https://cryptofloricon.com/');
});

test('sitemap.xml lists every page, all 177 message pages included, with no broken URL', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const urls = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
  const codes = [...new Set(loadLexicon().map(e => e.code))];
  assert.equal(codes.length, 177);
  for (const code of codes) assert.ok(urls.includes(`https://cryptofloricon.com/${code}/`), code);
  for (const u of ['https://cryptofloricon.com/', 'https://cryptofloricon.com/decode/', 'https://cryptofloricon.com/encode/',
    'https://cryptofloricon.com/browse/', 'https://cryptofloricon.com/browse/love/', 'https://cryptofloricon.com/story/']) {
    assert.ok(urls.includes(u), u);
  }
  assert.ok(!urls.some(u => u.includes('404')));
  assert.equal(new Set(urls).size, urls.length);
  for (const u of urls) {
    assert.ok(u.startsWith('https://cryptofloricon.com/') && u.endsWith('/'), u);
    const file = path.join(out, u.slice('https://cryptofloricon.com/'.length), 'index.html');
    assert.ok(fs.existsSync(file), 'broken: ' + u);
  }
  assert.equal(urls.length, result.pages.length - 1);
});

test('robots.txt names the sitemap', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Sitemap: https:\/\/cryptofloricon\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Disallow: \/\s*$/m);
});
