'use strict';
// Cross-references in a passage: "#NN" is an entry ID and becomes a link
// showing that entry's title; an ID with no entry stays as plain text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderBody, refsIn } = require('../lib/render');
const { loadLexicon } = require('../build');

const byId = {};
loadLexicon().forEach(e => { byId[e.id] = e; });
const href = id => 'entry-' + id + '/';

test('"#34" becomes a link titled "I love you"', () => {
  const html = renderBody('Reply with #34 at once.', byId, href);
  assert.equal(html, '<p>Reply with <a class="xref" href="entry-34/">I love you</a> at once.</p>');
});

test('"#32", an ID with no entry, stays plain unlinked text', () => {
  const html = renderBody('Delicate enquiries may use #31 or #32.', byId, href);
  assert.equal(html, '<p>Delicate enquiries may use <a class="xref" href="entry-31/">Are you single?</a> or #32.</p>');
});

test('all three dangling references stay plain text in their real passages', () => {
  for (const [from, to] of [[123, 32], [44, 82], [103, 150]]) {
    const html = renderBody(byId[from].body, byId, href);
    assert.ok(html.includes('#' + to), `#${from} should still say #${to}`);
    assert.ok(!html.includes('entry-' + to + '/'), `#${from} should not link #${to}`);
  }
});

test('a "#" inside a word is not a reference, and text is escaped', () => {
  assert.equal(renderBody('C#34 & <b>', byId, href), '<p>C#34 &amp; &lt;b&gt;</p>');
});

test('blank lines make paragraphs; the wording is otherwise unchanged', () => {
  assert.equal(renderBody('One.\n\nTwo\nthree.', byId, href), '<p>One.</p>\n<p>Two<br>three.</p>');
});

test('refsIn lists the IDs a passage cites', () => {
  assert.deepEqual(refsIn('See #1, #34 and #150.'), [1, 34, 150]);
});
