/* Run: node --test tests/*.test.js
 * Prices and savings shown on the site match lib/currency.js (29 Oct 2026).
 * Savings = what the same products cost bought one after another, minus the bundle:
 *   V+BP = V + BP standalone; V+Menu = V + Menu (returning); full = V + BP + Menu at the loyalty rate.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('bundle savings shown on the site are the real differences', async () => {
  const C = await import('../lib/currency.js');
  const a = (p, c) => C.getAmount(p, c);
  const fmtFr = (n) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
  for (const cur of ['EUR', 'MAD', 'USD']) {
    const saveBp = a('validator', cur) + a('essentials_returning', cur) - a('bundle', cur);
    const saveMenu = a('validator', cur) + a('menu', cur) - a('bundle_menu', cur);
    const saveFull = a('validator', cur) + a('essentials_returning', cur) + a('menu_loyalty', cur) - a('bundle_full', cur);
    assert.ok(saveBp > 0 && saveMenu > 0 && saveFull > 0);
    const sym = { EUR: '€', USD: '$' }[cur];
    const en = (n) => cur === 'MAD' ? `MAD ${n.toLocaleString('en-US')}` : `${sym}${n}`;
    const fr = (n) => cur === 'MAD' ? `${fmtFr(n)} MAD` : `${fmtFr(n)}${sym}`;
    const v = read('validator.html');
    assert.ok(v.includes(`${cur}:'Save ${en(saveBp)}'`), `validator.html V+BP ${cur}`);
    assert.ok(v.includes(`${cur}:'Économisez ${fr(saveFull)}'`), `validator.html full ${cur}`);
    const p = read('pricing.html');
    assert.ok(p.includes(`Save ${en(saveMenu)} vs separate`), `pricing.html V+Menu ${cur}`);
    assert.ok(p.includes(`Save ${en(saveFull)} vs buying separately`), `pricing.html full ${cur}`);
    for (const f of ['index.html', 'platform.html']) assert.ok(read(f).includes(`en:'Save ${en(saveBp)}'`), `${f} ${cur}`);
  }
});

test('bundle display price equals the Stripe price (599 / 5 990 / 649)', async () => {
  const C = await import('../lib/currency.js');
  assert.deepEqual(['EUR', 'MAD', 'USD'].map((c) => C.getAmount('bundle', c)), [599, 5990, 649]);
});
