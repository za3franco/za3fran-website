/* Run: node --test tests/*.test.js
 * Sales dashboard (/pilotage, lib/dashboard.js): sources normalised, tests excluded,
 * periods in Morocco's time zone, launch threshold, MAD conversion; page and API wiring.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const sess = (o) => Object.assign({ status: 'complete', payment_status: 'paid', mode: 'payment', currency: 'mad', created: 0, metadata: {}, customer_details: { email: 'client@x.ma' } }, o);
const at = (iso) => Math.floor(new Date(iso).getTime() / 1000);

test('every source is normalised; tests are flagged, not counted', async () => {
  const D = await import('../lib/dashboard.js');
  const tests = D.testEmailSet('arnaud@x.com');
  const sales = D.normaliseSales({
    testEmails: tests,
    stripeSessions: [
      sess({ id: 'a', amount_total: 199000, created: at('2026-11-20T10:00:00Z'), metadata: { purchase_type: 'validator', concept_name: 'A' } }),
      sess({ id: 'b', amount_total: 0, created: at('2026-11-20T10:00:00Z'), metadata: { purchase_type: 'bundle' } }),                    // 100 % promo
      sess({ id: 'c', amount_total: 49900, currency: 'eur', created: at('2026-11-21T10:00:00Z'), metadata: { type: 'business_plan_essentials' }, customer_details: { email: 'Arnaud+x@X.com' } }), // test e-mail
      sess({ id: 'd', mode: 'subscription', amount_total: 24900, metadata: { tenant_id: 't' } }),                                          // Zahir Guest
      sess({ id: 'e', amount_total: 34900, created: at('2026-11-22T10:00:00Z'), metadata: { type: 'menu_engineer', priceTier: 'loyalty', validatorAccessCode: 'ZA3FTEST' } }), // test project
      sess({ id: 'f', amount_total: 49900, currency: 'eur', created: at('2026-11-23T10:00:00Z'), payment_intent: 'pi_f', metadata: { type: 'business_plan_essentials' } }),
    ],
    refundsByPi: { pi_f: 10000 },
    ycp: [
      { id: 'y1', status: 'paid', product: 'bundle', amount_minor: 599000, currency: 'MAD', email: 'b@x.ma', paid_at: '2026-11-24T09:00:00Z', meta: {}, versions: {} },
      { id: 'y2', status: 'paid', product: 'validator', amount_minor: 1000, currency: 'MAD', email: 'b@x.ma', paid_at: '2026-11-24T09:00:00Z', meta: {}, versions: { test_price: true } },
      { id: 'y3', status: 'pending', product: 'validator', amount_minor: 199000, currency: 'MAD' },
    ],
    offline: [{ id: 'o1', sold_on: '2026-11-25', kind: 'accompagnement', amount_minor: 1000000, currency: 'MAD', client: 'Resto X' }],
  });
  const real = sales.filter((s) => !s.test).map((s) => s.id).sort();
  assert.deepEqual(real, ['a', 'f', 'o1', 'y1']);
  assert.equal(sales.find((s) => s.id === 'b').testReason, 'montant 0');
  assert.equal(sales.find((s) => s.id === 'c').testReason, 'e-mail de test');
  assert.equal(sales.find((s) => s.id === 'e').testReason, 'projet de test');
  assert.equal(sales.find((s) => s.id === 'y2').testReason, 'prix de test');
  assert.equal(sales.find((s) => s.id === 'e').product, 'menu_loyalty');
  assert.equal(sales.find((s) => s.id === 'f').refunded, 100);
  assert.ok(!sales.some((s) => s.id === 'd' || s.id === 'y3'));
});

test('periods, MAD totals, threshold and month target', async () => {
  const D = await import('../lib/dashboard.js');
  const mk = (id, product, amount, currency, date) => ({ source: 'stripe', id, product, amount, refunded: 0, currency, date, test: false });
  const sales = [
    mk('1', 'validator', 1990, 'MAD', '2026-11-17T08:00:00Z'),
    mk('2', 'bundle', 5990, 'MAD', '2026-12-02T08:00:00Z'),
    mk('3', 'essentials', 499, 'EUR', '2026-12-02T10:00:00Z'),
    { ...mk('4', 'accompagnement', 10000, 'MAD', '2026-12-02T12:00:00Z'), source: 'manual' },
    { ...mk('5', 'validator', 1990, 'MAD', '2026-12-02T12:00:00Z'), test: true },
    mk('6', 'validator', 1990, 'MAD', '2027-03-01T12:00:00Z'), // after the 90-day window
  ];
  const s = D.summarise(sales, { now: '2026-12-02T15:00:00Z', launchDate: '2026-11-17', rates: { EUR: 10.8, USD: 10 }, monthlyTargetMad: 27000 });
  assert.equal(s.today, '2026-12-02');
  assert.equal(s.periods.today.count, 3);
  assert.equal(Math.round(s.periods.today.mad), 5990 + 5389 + 10000);
  assert.equal(s.periods.month.count, 3);
  assert.equal(s.periods.lastMonth.count, 1);
  assert.equal(s.periods.all.count, 5);
  assert.equal(s.tests.count, 1);
  assert.equal(s.threshold.validators.done, 2);                  // validator + bundle (not the March one)
  assert.equal(s.threshold.bundles.done, 1);
  assert.equal(s.threshold.accompaniments.done, 1);
  assert.equal(s.threshold.daysElapsed, 16);
  assert.ok(Math.abs(s.monthProgress - (5990 + 499 * 10.8 + 10000) / 27000) < 1e-9);
  assert.equal(Object.keys(s.daily).length, 30);
  assert.equal(Object.keys(s.monthly).length, 12);
  // Without rates, euros stay apart and are reported as unconverted.
  const n = D.summarise(sales, { now: '2026-12-02T15:00:00Z', launchDate: '2026-11-17', rates: null });
  assert.equal(n.periods.today.unconverted, 1);
  assert.equal(n.periods.today.byCurrency.EUR, 499);
  assert.equal(n.avgBasketMad, null);
});

test('counts by period and e-mail normalisation', async () => {
  const D = await import('../lib/dashboard.js');
  const c = D.countByPeriod(['2026-12-02T09:00:00Z', '2026-11-30T09:00:00Z', '2026-11-02T09:00:00Z', '2025-12-31T09:00:00Z', null], '2026-12-02T15:00:00Z');
  assert.deepEqual(c, { today: 1, week: 2, month: 1, year: 3, all: 4 });
  assert.equal(D.normEmail(' Arnaud+test@Gmail.com '), 'arnaud@gmail.com');
  assert.ok(D.testEmailSet('').has('hello@za3fran.io'));
});

test('page and API: private, same code as /brain, no index, no personal e-mail in the code', () => {
  const api = read('api/dashboard.js');
  assert.match(api, /sessionValid/);
  assert.match(api, /status\(401|send\(res, 401/);
  const page = read('pilotage.html');
  assert.match(page, /noindex/);
  assert.match(page, /\/api\/brain-inbox/);
  assert.match(page, /body:not\(\.lang-fr\)|za3fran_lang/);
  for (const f of ['api/dashboard.js', 'lib/dashboard.js', 'pilotage.html']) assert.ok(!/arnaudhebrard@/.test(read(f)), f);
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.functions['api/dashboard.js']);
});
