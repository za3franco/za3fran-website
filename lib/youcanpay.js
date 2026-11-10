// ============================================================
// /lib/youcanpay.js — YouCan Pay for payments in MAD (ycp-1.0.0)
//
// Why: Stripe cannot charge most Moroccan domestic cards in dirhams (only cards
// carrying the e-commerce allowance work). From Morocco, MAD payments go through
// YouCan Pay, a Moroccan payment provider; EUR and USD stay on Stripe.
//
// Flow (no YouCan store, no SDK — plain HTTPS, as in YouCan's official PHP SDK):
//   1. our checkout endpoint saves a row in `payments` (status 'pending'),
//   2. POST {base}/api/tokenize with the private key, order_id = that row's id,
//      amount in minor units (centimes), currency, customer IP, success/error URLs,
//   3. the buyer is sent to {base}/payment-form/{token}?lang=fr (YouCan's page),
//   4. paid → YouCan calls /api/webhook-youcanpay (header X-YOUCANPAY-SIGNATURE =
//      HMAC-SHA256 of the raw body, keyed with the private key) AND the buyer lands
//      on /success.html?pay=<payment id>&transaction_id=…;
//   5. either path re-reads the transaction from YouCan's API (GET transactions/{id}),
//      checks status, order id, amount and currency, then claims the payment row
//      atomically ('pending' → 'paid') so the order is fulfilled exactly once.
//
// Env vars (Vercel):
//   YOUCANPAY_PRIVATE_KEY   ← private key (YouCan Pay → Developers / Settings → API keys)
//   YOUCANPAY_SANDBOX       ← 'true' while testing with the sandbox keys, remove for live
//   MAD_PAYMENT_PROVIDER    ← 'youcanpay' to route MAD payments here; anything else = Stripe
// ============================================================

import crypto from 'node:crypto';

export const YCP_VERSION = 'ycp-1.0.0';
const APP_URL = 'https://youcanpay.com/';
// YouCan's transaction status: 1 = paid (webhook example and SDK).
export const TX_STATUS_PAID = 1;

export function isSandbox() {
  return String(process.env.YOUCANPAY_SANDBOX || '').toLowerCase() === 'true';
}

function apiBase() { return APP_URL + (isSandbox() ? 'sandbox/api/' : 'api/'); }

/** True when MAD payments must go through YouCan Pay (switch + key present). */
export function youcanEnabled() {
  return String(process.env.MAD_PAYMENT_PROVIDER || '').toLowerCase() === 'youcanpay'
    && !!process.env.YOUCANPAY_PRIVATE_KEY;
}

/** Which provider takes a payment in this currency. */
export function providerFor(currency) {
  return currency === 'MAD' && youcanEnabled() ? 'youcanpay' : 'stripe';
}

/** First public IP of the caller (YouCan requires the customer's IP). */
export function clientIp(req) {
  const h = (req && req.headers) || {};
  const fwd = String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim();
  return fwd || (req && req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

export function paymentFormUrl(tokenId, lang) {
  const l = ['fr', 'en', 'ar'].includes(lang) ? lang : 'fr';
  return `${APP_URL}${isSandbox() ? 'sandbox/' : ''}payment-form/${encodeURIComponent(tokenId)}?lang=${l}`;
}

/** Create a payment token. amountMinor = centimes (1 990 MAD → 199000). */
export async function createToken({ orderId, amountMinor, currency = 'MAD', customerIp, successUrl, errorUrl, customer = {}, metadata = {} }) {
  const key = process.env.YOUCANPAY_PRIVATE_KEY;
  if (!key) throw new Error('YOUCANPAY_PRIVATE_KEY is not set');
  const res = await fetch(apiBase() + 'tokenize', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      pri_key: key,
      order_id: String(orderId),
      amount: String(amountMinor),
      currency,
      customer_ip: customerIp,
      success_url: successUrl,
      error_url: errorUrl,
      customer,
      metadata,
    }),
  });
  let body = null;
  try { body = await res.json(); } catch (_) { body = null; }
  const id = body && body.token && body.token.id;
  if (res.status !== 200 || typeof id !== 'string') {
    const msg = (body && body.message) || `status ${res.status}`;
    throw new Error(`YouCan Pay tokenize failed: ${msg}`);
  }
  return id;
}

/** Read one transaction from YouCan's API (null when unknown). */
export async function getTransaction(transactionId) {
  const key = process.env.YOUCANPAY_PRIVATE_KEY;
  if (!key || !transactionId) return null;
  const url = `${apiBase()}transactions/${encodeURIComponent(transactionId)}?pri_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status !== 200) return null;
  try { return await res.json(); } catch (_) { return null; }
}

/** Webhook signature: hex HMAC-SHA256 of the raw body with the private key, compared in constant time. */
export function verifySignature(rawBody, signature, key = process.env.YOUCANPAY_PRIVATE_KEY) {
  if (!key || !signature || rawBody == null) return false;
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Does a YouCan transaction pay this payment row?
 * Amount: YouCan takes centimes; its examples are ambiguous about what it sends back,
 * so both centimes and whole dirhams are accepted (the token is created only by our
 * server with the private key, so a buyer cannot choose the amount).
 */
export function transactionMatches(tx, payment) {
  if (!tx || !payment) return { ok: false, reason: 'missing' };
  if (Number(tx.status) !== TX_STATUS_PAID) return { ok: false, reason: 'not_paid' };
  if (String(tx.order_id) !== String(payment.id)) return { ok: false, reason: 'order_mismatch' };
  const cur = String(tx.currency || tx.base_currency || '').toUpperCase();
  if (cur && cur !== String(payment.currency).toUpperCase()) return { ok: false, reason: 'currency_mismatch' };
  const amt = Number(tx.amount);
  const minor = Number(payment.amount_minor);
  if (!(amt === minor || amt === minor / 100)) return { ok: false, reason: 'amount_mismatch' };
  return { ok: true };
}

/** A transaction object from either a webhook event or a GET transactions/{id} answer. */
export function txFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const p = event.payload || event;
  return p.transaction || null;
}
