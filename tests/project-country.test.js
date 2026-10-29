/* Run: node --test tests/*.test.js
 * Country of the project vs payment currency (29 Oct 2026): amounts and market follow the project's
 * country; the payment currency (visitor's location) never decides the market.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CR = require('../lib/concept-record.js');

test('form keeps the project country and the currency of the amounts', () => {
  const { v2, errors } = CR.normalizeForm({ project_country: 'ma', currency: 'mad', ramadan: 'normal' });
  assert.deepEqual(errors, []);
  assert.equal(v2.project_country, 'MA');
  assert.equal(v2.currency, 'MAD');
  assert.equal(CR.normalizeForm({ project_country: 'Maroc' }).errors[0].code, 'bad_country');
});

test('record currency = project currency, not the payment currency', () => {
  const rec = CR.fromSubmission({ concept_name: 'X', currency: 'EUR', language: 'fr',
    concept_v2: { project_country: 'MA', currency: 'MAD', ramadan: 'reduced' } });
  assert.equal(rec.currency, 'MAD');
  assert.equal(rec.project_country, 'MA');
});

test('older submissions without a project country keep the payment currency', () => {
  const rec = CR.fromSubmission({ concept_name: 'X', currency: 'MAD', concept_v2: { ramadan: 'closed' } });
  assert.equal(rec.currency, 'MAD');
  assert.equal(rec.project_country, undefined);
});
