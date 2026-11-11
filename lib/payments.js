// ============================================================
// /lib/payments.js — checkout through YouCan Pay for payments in MAD (pay-1.0.0)
//
// The three checkout endpoints (submit-validator, submit-business-plan,
// submit-menu-engineer) call createYoucanCheckout() when providerFor(currency)
// says 'youcanpay'; otherwise they keep creating a Stripe session as before.
// The metadata saved here is the same as the Stripe session metadata, so the
// shared fulfilment (lib/payment-fulfil.js) and /api/checkout-status read it the
// same way.
// ============================================================

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getAmount, getProductName } from './currency.js';
import { createToken, paymentFormUrl, clientIp, isSandbox, YCP_VERSION } from './youcanpay.js';

export const PAYMENTS_VERSION = 'pay-1.1.0';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';

let _sb = null;
export function db() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _sb;
}

function testAmountMad() {
  const n = Number(process.env.YOUCANPAY_TEST_AMOUNT_MAD || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** True only when both test env vars are set and the buyer e-mail is exactly the test e-mail. */
export function isTestBuyer(email) {
  const t = String(process.env.YOUCANPAY_TEST_EMAIL || '').trim().toLowerCase();
  return !!t && testAmountMad() > 0 && String(email || '').trim().toLowerCase() === t;
}

/** 'ycp_' + 24 hex characters — our order id at YouCan Pay and the payments row id. */
export function newPaymentId() {
  return 'ycp_' + crypto.randomBytes(12).toString('hex');
}

/** Stripe metadata values are strings; keep the same shape here. */
function stringMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) out[k] = v == null ? '' : String(v);
  return out;
}

/**
 * Save the pending payment, create the YouCan Pay token and return the payment-page URL.
 * kind: 'validator' | 'business_plan' | 'menu_engineer'
 * product: lib/currency.js product key (validator, bundle, bundle_menu, bundle_full, essentials, menu, menu_loyalty)
 */
export async function createYoucanCheckout({ req, kind, product, currency = 'MAD', email, name, language, meta, cancelPath, supabase = db() }) {
  const amountMajor = getAmount(product, currency);
  if (!amountMajor) throw new Error(`No ${currency} price for ${product}`);
  // Live test (11 Nov 2026): the buyer e-mail YOUCANPAY_TEST_EMAIL pays YOUCANPAY_TEST_AMOUNT_MAD instead of
  // the real price, so a real card can test the whole chain for a few dirhams. Delete both env vars after the test.
  const test = isTestBuyer(email);
  const amountMinor = test ? testAmountMad() * 100 : amountMajor * 100;
  const id = newPaymentId();
  const lang = language === 'fr' ? 'fr' : (language === 'ar' ? 'ar' : (language === 'en' ? 'en' : 'fr'));
  const m = stringMeta(meta);

  const { error: insErr } = await supabase.from('payments').insert({
    id, provider: 'youcanpay', kind, product,
    amount_minor: amountMinor, currency,
    email: email || null,
    meta: m,
    status: 'pending',
    sandbox: isSandbox(),
    versions: { payments: PAYMENTS_VERSION, youcanpay: YCP_VERSION, ...(test ? { test_price: true, list_price_minor: amountMajor * 100 } : {}) },
  });
  if (insErr) throw new Error(`payments insert failed: ${insErr.message}`);

  const successUrl = `${BASE_URL}/success.html?pay=${encodeURIComponent(id)}`;
  const errorUrl = `${BASE_URL}${cancelPath || '/'}${(cancelPath || '/').includes('?') ? '&' : '?'}paiement=echec`;
  const token = await createToken({
    orderId: id,
    amountMinor,
    currency,
    customerIp: clientIp(req),
    successUrl,
    errorUrl,
    customer: { name: name || '', email: email || '' },
    metadata: { payment_id: id, kind, product, label: getProductName(product) },
  });
  await supabase.from('payments').update({ provider_token: token }).eq('id', id);
  return { paymentId: id, checkoutUrl: paymentFormUrl(token, lang) };
}
