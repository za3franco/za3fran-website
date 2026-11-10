/* Run: node --test tests/*.test.js
 * YouCan Pay for payments in MAD (lib/youcanpay.js, lib/payments.js, lib/payment-fulfil.js):
 * routing, signature, transaction checks, exactly-once fulfilment, and no change for Stripe.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function env(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test('routing: MAD goes to YouCan Pay only when switched on and a key is set; EUR/USD stay on Stripe', async () => {
  const Y = await import('../lib/youcanpay.js');
  env({ MAD_PAYMENT_PROVIDER: null, YOUCANPAY_PRIVATE_KEY: 'k' }, () => assert.equal(Y.providerFor('MAD'), 'stripe'));
  env({ MAD_PAYMENT_PROVIDER: 'youcanpay', YOUCANPAY_PRIVATE_KEY: null }, () => assert.equal(Y.providerFor('MAD'), 'stripe'));
  env({ MAD_PAYMENT_PROVIDER: 'youcanpay', YOUCANPAY_PRIVATE_KEY: 'k' }, () => {
    assert.equal(Y.providerFor('MAD'), 'youcanpay');
    assert.equal(Y.providerFor('EUR'), 'stripe');
    assert.equal(Y.providerFor('USD'), 'stripe');
  });
});

test('payment page and API URLs follow sandbox mode', async () => {
  const Y = await import('../lib/youcanpay.js');
  env({ YOUCANPAY_SANDBOX: 'true' }, () => assert.equal(Y.paymentFormUrl('tok_1', 'fr'), 'https://youcanpay.com/sandbox/payment-form/tok_1?lang=fr'));
  env({ YOUCANPAY_SANDBOX: null }, () => assert.equal(Y.paymentFormUrl('tok_1', 'xx'), 'https://youcanpay.com/payment-form/tok_1?lang=fr'));
});

test('webhook signature: HMAC-SHA256 of the raw body with the private key', async () => {
  const Y = await import('../lib/youcanpay.js');
  const body = Buffer.from('{"event_name":"transaction.paid","payload":{"transaction":{"id":"t1"}}}');
  const sig = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(Y.verifySignature(body, sig, 'secret'), true);
  assert.equal(Y.verifySignature(body, sig.toUpperCase(), 'secret'), true);
  assert.equal(Y.verifySignature(body, sig, 'other'), false);
  assert.equal(Y.verifySignature(Buffer.from(body.toString() + ' '), sig, 'secret'), false);
  assert.equal(Y.verifySignature(body, '', 'secret'), false);
  assert.equal(Y.verifySignature(body, sig, ''), false);
});

test('a transaction must be paid, for this order, in this currency and amount', async () => {
  const Y = await import('../lib/youcanpay.js');
  const p = { id: 'ycp_a', currency: 'MAD', amount_minor: 199000 };
  const ok = { id: 't', status: 1, order_id: 'ycp_a', currency: 'MAD', amount: '199000' };
  assert.equal(Y.transactionMatches(ok, p).ok, true);
  assert.equal(Y.transactionMatches({ ...ok, amount: '1990' }, p).ok, true); // whole dirhams also accepted
  assert.equal(Y.transactionMatches({ ...ok, status: 0 }, p).reason, 'not_paid');
  assert.equal(Y.transactionMatches({ ...ok, order_id: 'ycp_b' }, p).reason, 'order_mismatch');
  assert.equal(Y.transactionMatches({ ...ok, currency: 'EUR' }, p).reason, 'currency_mismatch');
  assert.equal(Y.transactionMatches({ ...ok, amount: '100' }, p).reason, 'amount_mismatch');
});

// ── A tiny in-memory stand-in for the supabase-js calls used by lib/payment-fulfil.js ──
function fakeDb(rows) {
  const table = new Map(rows.map((r) => [r.id, { ...r }]));
  function q() {
    const st = { filters: [], patch: null };
    const api = {
      select() { return api; },
      update(p) { st.patch = p; return api; },
      eq(k, v) { st.filters.push([k, v]); return api; },
      maybeSingle() { return Promise.resolve(run(true)); },
      then(res, rej) { return Promise.resolve(run(false)).then(res, rej); },
    };
    function run(single) {
      const hit = [...table.values()].filter((r) => st.filters.every(([k, v]) => r[k] === v));
      if (st.patch) { hit.forEach((r) => Object.assign(r, st.patch)); return { data: hit.map((r) => ({ id: r.id })), error: null }; }
      return single ? { data: hit[0] || null, error: null } : { data: hit, error: null };
    }
    return api;
  }
  return { from: () => q(), table };
}

const PAY = { id: 'ycp_1', kind: 'validator', product: 'validator', amount_minor: 199000, currency: 'MAD', email: 'a@b.ma', meta: { purchase_type: 'validator', submission_id: 's1' }, status: 'pending' };
const TX = { id: 'tx_1', status: 1, order_id: 'ycp_1', currency: 'MAD', amount: '199000' };

test('confirmAndFulfil: fulfils once, even when the webhook and the return page both arrive', async () => {
  const { confirmAndFulfil } = await import('../lib/payment-fulfil.js');
  const supabase = fakeDb([PAY]);
  let runs = 0;
  const fulfilers = { validator: async () => { runs++; } };
  const fetchTx = async () => TX;
  const [a, b] = await Promise.all([
    confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', source: 'webhook', supabase, fetchTx, fulfilers }),
    confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', source: 'return', supabase, fetchTx, fulfilers }),
  ]);
  assert.equal(runs, 1);
  assert.deepEqual([a.state, b.state].sort(), ['already_paid', 'fulfilled']);
  const row = supabase.table.get('ycp_1');
  assert.equal(row.status, 'paid');
  assert.equal(row.provider_tx_id, 'tx_1');
  assert.ok(row.fulfilled_at);
  const again = await confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', source: 'webhook', supabase, fetchTx, fulfilers });
  assert.equal(again.state, 'already_paid');
  assert.equal(runs, 1);
});

test('confirmAndFulfil: nothing happens without a confirmed, matching transaction', async () => {
  const { confirmAndFulfil } = await import('../lib/payment-fulfil.js');
  const fulfilers = { validator: async () => { throw new Error('must not run'); } };
  // The return page cannot rely on a transaction the API does not confirm.
  let db1 = fakeDb([PAY]);
  let r = await confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', eventTx: TX, source: 'return', supabase: db1, fetchTx: async () => null, fulfilers });
  assert.equal(r.state, 'pending'); assert.equal(db1.table.get('ycp_1').status, 'pending');
  // Wrong amount / unpaid / other order.
  for (const bad of [{ ...TX, amount: '1' }, { ...TX, status: 0 }, { ...TX, order_id: 'ycp_x' }]) {
    db1 = fakeDb([PAY]);
    r = await confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', source: 'webhook', supabase: db1, fetchTx: async () => bad, fulfilers });
    assert.equal(r.ok, false); assert.equal(db1.table.get('ycp_1').status, 'pending');
  }
  // A signed webhook body is used only when the API read fails.
  const db2 = fakeDb([PAY]);
  let ran = 0;
  r = await confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', eventTx: TX, source: 'webhook', supabase: db2, fetchTx: async () => null, fulfilers: { validator: async () => { ran++; } } });
  assert.equal(r.state, 'fulfilled'); assert.equal(ran, 1);
});

test('confirmAndFulfil: a failed delivery is recorded (payment stays paid, no second charge)', async () => {
  const { confirmAndFulfil } = await import('../lib/payment-fulfil.js');
  const supabase = fakeDb([{ ...PAY, kind: 'menu_engineer' }]);
  delete process.env.BREVO_API_KEY;
  const r = await confirmAndFulfil({ paymentId: 'ycp_1', transactionId: 'tx_1', source: 'webhook', supabase, fetchTx: async () => TX, fulfilers: { menu_engineer: async () => { throw new Error('boom'); } } });
  assert.equal(r.state, 'fulfil_failed');
  assert.equal(supabase.table.get('ycp_1').status, 'paid');
  assert.equal(supabase.table.get('ycp_1').fulfil_error, 'boom');
});

test('the three checkout endpoints route MAD to YouCan Pay and keep Stripe otherwise', () => {
  for (const [f, kind] of [['api/submit-validator.js', 'validator'], ['api/submit-business-plan.js', 'business_plan'], ['api/submit-menu-engineer.js', 'menu_engineer']]) {
    const s = read(f);
    assert.match(s, /providerFor\(currency\) === 'youcanpay'/, f);
    assert.ok(s.includes(`kind: '${kind}'`), f);
    assert.ok(s.indexOf('createYoucanCheckout(') < s.indexOf('stripe.checkout.sessions.create('), f + ': YouCan branch before Stripe');
  }
  // Same fulfilment for both providers.
  assert.match(read('api/webhook-validator.js'), /export async function processReport\(/);
  assert.match(read('api/webhook-business-plan.js'), /export async function fulfilBusinessPlan\(/);
  assert.match(read('api/webhook-menu-engineer.js'), /export async function fulfilMenuEngineer\(/);
  assert.match(read('api/webhook-business-plan.js'), /await fulfilBusinessPlan\(\{ customerEmail, meta \}\)/);
  assert.match(read('api/webhook-menu-engineer.js'), /await fulfilMenuEngineer\(\{ customerEmail, meta, paymentRef: session.id \}\)/);
});

test('webhook refuses unsigned calls; success page and status accept a YouCan Pay return', () => {
  const w = read('api/webhook-youcanpay.js');
  assert.match(w, /x-youcanpay-signature/);
  assert.match(w, /status\(403\)/);
  assert.match(w, /transaction\.paid/);
  assert.match(read('api/checkout-status.js'), /req\.query\.pay/);
  assert.match(read('success.html'), /params\.get\('pay'\)/);
  const v = JSON.parse(read('vercel.json'));
  assert.ok(v.functions['api/webhook-youcanpay.js'].maxDuration >= 800);
  assert.ok(v.functions['api/checkout-status.js'].maxDuration >= 800);
});

test('no page names a single payment provider any more; privacy names both', () => {
  for (const f of ['validator.html', 'business-plan.html', 'menu-engineer.html']) {
    assert.ok(!/via Stripe|Stripe payment|paiement Stripe/.test(read(f)), f);
  }
  const p = read('privacy.html');
  assert.match(p, /YouCan Pay/);
  assert.match(p, /Stripe/);
});
