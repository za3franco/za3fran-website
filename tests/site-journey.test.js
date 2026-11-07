/* Run: node --test tests/*.test.js
 * Guards the website rebuild of 7 Nov 2026 (customer-journey audit): inaccurate phrases stay out, every public page
 * has its share tags, the default language follows the browser, every footer links the privacy page.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PUBLIC = ['index', 'etablissements', 'accompagnement-concept', 'platform', 'pricing', 'validator', 'scorecard', 'business-plan', 'menu-engineer', 'methodology', 'privacy'];
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

test('the audit\'s inaccurate phrases are gone from every page', () => {
  const banned = [
    /Most popular|Le plus populaire|Best value|Meilleure offre/i,
    /Most operators|La plupart des op[ée]rateurs/i,
    /print-ready|pr[êe]t [àa] imprimer/i,
    /three deliverables|trois livrables|les trois livrables/i,
    /(^|[^0-9])49\s?€|€\s?49\b(?!\d)(?<![0-9]49)/,
    /Livraison instantan[ée]e|Instant delivery/i,
    /Phase 6/i,
    /Sans inscription|No sign-?up/i,
    /1,499|1 499/,
    /flagship|produit phare/i,
    /Instant AI-powered/i,
  ];
  for (const f of PUBLIC) {
    const text = strip(read(f + '.html'));
    for (const re of banned) assert.ok(!re.test(text), `${f}.html still says ${re}`);
  }
});

test('every public page has Open Graph and Twitter share tags with an existing image', () => {
  for (const f of PUBLIC) {
    const h = read(f + '.html');
    for (const p of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
      assert.ok(h.includes(p), `${f}.html missing ${p}`);
    }
    const img = h.match(/property="og:image" content="https:\/\/www\.za3fran\.io(\/assets\/[^"]+)"/);
    assert.ok(img, `${f}.html og:image must be an absolute za3fran.io URL`);
    assert.ok(fs.existsSync(path.join(root, img[1])), `${f}.html og:image file missing`);
  }
});

test('default language follows the browser, the saved choice wins', () => {
  const snippet = read('index.html').match(/<script>\/\* default language from the browser[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
  const run = (languages, saved) => {
    const store = saved ? { za3fran_lang: saved } : {};
    const ctx = { navigator: { languages, language: languages[0] }, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
    vm.runInNewContext(snippet, ctx);
    return store.za3fran_lang;
  };
  assert.equal(run(['fr-FR', 'en']), 'fr');
  assert.equal(run(['ar-MA']), 'fr');
  assert.equal(run(['en-US']), 'en');
  assert.equal(run(['en-US'], 'fr'), 'fr');
  assert.equal(run(['fr-FR'], 'en'), 'en');
  for (const f of [...PUBLIC, 'project', 'readiness-review', 'bp-intake', 'success']) {
    assert.ok(read(f + '.html').includes('default language from the browser'), `${f}.html lacks the browser-language default`);
  }
});

test('every footer links the privacy page', () => {
  for (const f of PUBLIC.filter((x) => x !== 'privacy')) {
    const h = read(f + '.html');
    const foot = h.slice(h.indexOf('<footer'), h.indexOf('</footer>'));
    assert.ok(/href="\/privacy"/.test(foot), `${f}.html footer without a privacy link`);
  }
});

test('homepage: one main button, two doors, three offers, example labelled when present', () => {
  const h = read('index.html');
  assert.equal((h.match(/class="hm-door"/g) || []).length, 2);
  assert.equal((h.match(/class="hm-offer( main)?"/g) || []).length, 3);
  assert.ok(h.includes('href="/accompagnement-concept"') && h.includes('href="/etablissements"'));
  if (/projet d.exemple/i.test(h)) assert.ok(/Projet d.exemple/.test(h));
});

test('pricing: three offers on top, no unbuilt tool priced', () => {
  const p = read('pricing.html');
  const start = p.indexOf('<section class="pricing-section">');
  const end = p.indexOf('<!-- ── RETURNING USERS');
  const top = p.slice(start, end);
  assert.equal((top.match(/<div class="card( featured)?">/g) || []).length, 3);
  assert.ok(!/Financial Builder[\s\S]{0,400}(€|MAD|\$)\s?\d/.test(p));
});
