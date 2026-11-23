'use strict';
/*
 * Small text helpers for the build: escaping, slugs, and turning a lexicon
 * passage into HTML with its cross-references linked.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// A cross-reference is "#" and an entry ID, not preceded by a word character.
// This is the old site's own pattern (msgs.php: '/\B#([0-9]+)/').
var REF = /\B#([0-9]+)/g;

/*
 * Render a passage as HTML paragraphs. Each "#NN" that names an entry ID in
 * byId becomes a link, showing that entry's title, to hrefForId(id); a "#NN"
 * naming no entry (three do: #32, #82, #150) is left as plain text, exactly as
 * written. The wording is otherwise unchanged.
 */
function renderBody(body, byId, hrefForId) {
  return String(body)
    .split(/\n\s*\n/)
    .map(function (para) { return para.trim(); })
    .filter(Boolean)
    .map(function (para) {
      var html = escapeHtml(para).replace(REF, function (whole, id) {
        var target = byId[Number(id)];
        if (!target) return whole;
        return '<a class="xref" href="' + escapeHtml(hrefForId(target.id)) + '">' + escapeHtml(target.title) + '</a>';
      });
      return '<p>' + html.replace(/\n/g, '<br>') + '</p>';
    })
    .join('\n');
}

/* The IDs a passage refers to, in order of appearance. */
function refsIn(body) {
  var ids = [];
  String(body).replace(REF, function (whole, id) { ids.push(Number(id)); return whole; });
  return ids;
}

module.exports = { escapeHtml: escapeHtml, slug: slug, renderBody: renderBody, refsIn: refsIn };
