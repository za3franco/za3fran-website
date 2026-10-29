/* Run: node --test tests/*.test.js
 * Stripe line items (lib/currency.js): a missing price env var never blocks a purchase.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('inline price when no Stripe price env var is set', async () => {
  delete process.env.STRIPE_PRICE_VALIDATOR_MAD;
  const C = await import('../lib/currency.js');
  const li = C.getLineItem('validator', 'MAD');
  assert.equal(li.quantity, 1);
  assert.equal(li.price_data.currency, 'mad');
  assert.equal(li.price_data.unit_amount, 199000);
  assert.equal(C.getLineItem('validator', 'EUR').price_data.unit_amount, 19900);
});

test("'essentials' resolves to the standalone Business Plan price", async () => {
  const C = await import('../lib/currency.js');
  assert.equal(C.getAmount('essentials', 'EUR'), 499);
  assert.ok(C.getLineItem('essentials', 'USD').price_data.unit_amount === 54900);
});

test('every purchasable product has a price in every currency', async () => {
  const C = await import('../lib/currency.js');
  for (const p of ['validator', 'essentials', 'bundle', 'menu', 'menu_loyalty', 'menu_regen', 'bundle_menu', 'bundle_full'])
    for (const cur of ['EUR', 'MAD', 'USD']) assert.ok(C.getLineItem(p, cur), `${p}/${cur}`);
});
