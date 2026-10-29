// Guards the bilingual CSS against hiding <option> elements.
// Options carry data-en / data-fr *attributes* (their text is swapped in JS),
// so a bare `[data-fr]{display:none}` rule hides every option in both
// languages and the dropdowns open empty (bug found on 29 Oct 2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));

test('bilingual hide rules never apply to <option>', () => {
  for (const f of pages) {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    const bare = html.match(/\[data-(en|fr)\]\s*\{\s*display\s*:\s*none/g);
    assert.ok(!bare, `${f}: bilingual rule without :not(option) — dropdown options would be hidden`);
  }
});

test('pages with dropdowns use the option-safe rule', () => {
  for (const f of pages) {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    if (!/<option|createElement\('option'\)|`<option/.test(html)) continue;
    assert.ok(html.includes('body:not(.lang-fr) [data-fr]:not(option){display:none;}'), `${f}: missing EN rule`);
    assert.ok(html.includes('body.lang-fr [data-en]:not(option){display:none;}'), `${f}: missing FR rule`);
  }
});
