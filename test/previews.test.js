'use strict';
// Share previews (Ed, 2026-11-23): a message link pasted into a chat or a
// social site shows the bouquet's stems as the image, the flowers in words
// as the title and "What could it mean?" as the description, and never the
// message itself. Expected strings are written by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Cipher = require('../lib/cipher');
const { build, loadLexicon, SITE_URL } = require('../build');

const ROOT = path.join(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-previews-'));
const result = build(out);
test.after(() => fs.rmSync(out, { recursive: true, force: true }));
const read = rel => fs.readFileSync(path.join(out, rel), 'utf8');

/* Every <meta property="og:…"> and <meta name="twitter:…"> on a page: { key: content }. */
function shareTags(html) {
  const tags = {};
  for (const m of html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)">/g)) tags[m[1]] = m[2];
  return tags;
}
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/* Width and height of a PNG or JPEG, read from its header. */
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  assert.equal(b.readUInt16BE(0), 0xffd8, file + ' is neither PNG nor JPEG');
  let i = 2;
  while (i < b.length) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error('no frame header in ' + file);
}

test('the flowers in words, in the site order with number words', () => {
  assert.equal(Cipher.inWords('2'), 'A rose');
  assert.equal(Cipher.inWords('22'), 'Two roses');
  assert.equal(Cipher.inWords('111'), 'Three lilies');
  assert.equal(Cipher.inWords('23'), 'A chrysanth and a rose');
  assert.equal(Cipher.inWords('1344'), 'A chrysanth, a lily and two carnations');
  assert.equal(Cipher.inWords('2244'), 'Two roses and two carnations');
  assert.equal(Cipher.inWords('14455'), 'A lily, two gerberas and two carnations');
  assert.equal(Cipher.inWords('555555'), 'Six gerberas');
  assert.equal(Cipher.inWords('12345'), 'A chrysanth, a lily, a gerbera, a rose and a carnation');
});

test('/2/ shares as "A rose", "What could it mean?"', () => {
  const t = shareTags(read('2/index.html'));
  assert.equal(t['og:title'], 'A rose');
  assert.equal(t['og:description'], 'What could it mean?');
  assert.equal(t['og:type'], 'website');
  assert.equal(t['og:site_name'], 'Cryptofloricon');
  assert.equal(t['og:url'], 'https://cryptofloricon.com/2/');
  assert.equal(t['og:image'], 'https://cryptofloricon.com/previews/2.jpg');
  assert.equal(t['og:image:width'], '1200');
  assert.equal(t['og:image:height'], '630');
  assert.equal(t['og:image:alt'], 'A rose');
  assert.equal(t['twitter:card'], 'summary_large_image');
});

test('/2244/ shares as "Two roses and two carnations"', () => {
  const t = shareTags(read('2244/index.html'));
  assert.equal(t['og:title'], 'Two roses and two carnations');
  assert.equal(t['og:description'], 'What could it mean?');
});

test('/1334/, the code two entries once shared, has its own preview', () => {
  const t = shareTags(read('1334/index.html'));
  assert.equal(t['og:title'], 'Two chrysanths, a lily and a carnation');
  assert.equal(t['og:image'], 'https://cryptofloricon.com/previews/1334.jpg');
});

test('no share tag on a message page gives away its message', () => {
  const entries = loadLexicon();
  assert.equal(entries.length, 177);
  let checked = 0;
  for (const e of entries) {
    const t = shareTags(read(e.code + '/index.html'));
    assert.ok(Object.keys(t).length >= 9, e.code + ' has its share tags');
    for (const [k, v] of Object.entries(t)) {
      assert.ok(!decode(v).toLowerCase().includes(e.title.toLowerCase()), `${e.code} ${k} reveals "${e.title}"`);
      checked++;
    }
  }
  assert.ok(checked >= 177 * 9);
});

test('every code has a 1200x630 preview, at an absolute og:image URL', () => {
  assert.equal(SITE_URL, 'https://cryptofloricon.com');
  assert.equal(result.codes.length, 177);
  for (const code of result.codes) {
    const t = shareTags(read(code + '/index.html'));
    assert.equal(t['og:image'], `https://cryptofloricon.com/previews/${code}.jpg`);
    const file = path.join(out, 'previews', code + '.jpg');
    assert.ok(fs.existsSync(file), code);
    assert.deepEqual(imageSize(file), { width: 1200, height: 630 }, code);
  }
});

test('the other pages share the site preview', () => {
  const home = shareTags(read('index.html'));
  assert.equal(home['og:title'], 'Cryptofloricon');
  assert.equal(home['og:description'], 'A lexicon of ciphers to encrypt and decrypt floral bouquets');
  assert.equal(home['og:url'], 'https://cryptofloricon.com/');
  assert.equal(home['og:image'], 'https://cryptofloricon.com/previews/site.jpg');
  assert.equal(home['twitter:card'], 'summary_large_image');
  assert.deepEqual(imageSize(path.join(out, 'previews', 'site.jpg')), { width: 1200, height: 630 });
  const browse = shareTags(read('browse/love/index.html'));
  assert.equal(browse['og:url'], 'https://cryptofloricon.com/browse/love/');
  assert.equal(browse['og:image'], 'https://cryptofloricon.com/previews/site.jpg');
});

test('the build fails when a code has no preview', () => {
  const entries = loadLexicon().concat([{ id: 999, code: '555555', title: 'Test', body: 'Test.', tags: ['Love'] }]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofloricon-nopreview-'));
  try {
    assert.equal(fs.existsSync(path.join(ROOT, 'src', 'previews', '555555.jpg')), false);
    assert.throws(() => build(tmp, { entries, collectHeadings: true }), /no share preview for 555555/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
