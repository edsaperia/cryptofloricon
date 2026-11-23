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

test('every #NN in every passage names an existing entry, so every one becomes a link', () => {
  const missing = [];
  for (const e of Object.values(byId)) {
    for (const id of refsIn(e.body)) if (!byId[id]) missing.push(`#${e.id} cites #${id}`);
    // And nothing that looks like a reference is left unlinked in the rendered passage.
    const text = renderBody(e.body, byId, href).replace(/<a [^>]*>[^<]*<\/a>/g, '');
    if (/\B#\d/.test(text)) missing.push(`#${e.id} keeps an unlinked reference`);
    // A bare "#" with no number was a slip in five passages (Ed, 2026-11-23).
    if (/(^|\s)#(\s|[,.;:]|$)/.test(e.body)) missing.push(`#${e.id} has a bare #`);
  }
  assert.deepEqual(missing, []);
});

test('the three references that were never written are re-pointed (Ed, 2026-11-23)', () => {
  assert.ok(renderBody(byId[123].body, byId, href).includes('<a class="xref" href="entry-153/">Do you feel the same?</a> enable delicate enquiries'));
  assert.ok(renderBody(byId[44].body, byId, href).includes('whereas <a class="xref" href="entry-94/">On one condition</a> answers the Bearer'));
  assert.ok(renderBody(byId[103].body, byId, href).includes('while <a class="xref" href="entry-176/">I give up</a> admits defeat'));
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
