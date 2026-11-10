// ============================================================
// /lib/payment-fulfil.js — confirm a YouCan Pay payment and fulfil the order once (pf-1.0.0)
//
// Called by /api/webhook-youcanpay (signed event) and by /api/checkout-status when the
// buyer comes back with a transaction id. Both run the same steps:
//   1. read the transaction from YouCan's API (the signed webhook body is a fallback),
//   2. check it pays THIS payment row (status paid, order id, currency, amount),
//   3. claim the row atomically (pending → paid; a second caller gets 0 rows and stops),
//   4. run the same fulfilment as Stripe: Validator report, business-plan run or Menu run.
// ============================================================

import { getTransaction, transactionMatches } from './youcanpay.js';
import { db } from './payments.js';

export const FULFIL_VERSION = 'pf-1.0.0';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';

export function recoverUrl(paymentId) {
  return `${BASE_URL}/api/webhook-youcanpay?recover=${encodeURIComponent(paymentId)}`;
}

/** The real fulfilment functions, loaded only when an order is fulfilled (tests inject their own). */
async function defaultFulfilers() {
  const [v, b, m] = await Promise.all([
    import('../api/webhook-validator.js'),
    import('../api/webhook-business-plan.js'),
    import('../api/webhook-menu-engineer.js'),
  ]);
  return {
    validator: (p) => v.processReport(p.email, null, p.meta.purchase_type || 'validator', p.meta.submission_id || null, { recoverUrl: recoverUrl(p.id) }),
    business_plan: (p) => b.fulfilBusinessPlan({ customerEmail: p.email, meta: p.meta }),
    menu_engineer: (p) => m.fulfilMenuEngineer({ customerEmail: p.email, meta: p.meta, paymentRef: 'ycp:' + p.id }),
  };
}

/**
 * @param {object} o
 * @param {string} o.paymentId        our payments row id (= YouCan order_id)
 * @param {string} [o.transactionId]  YouCan transaction id
 * @param {object} [o.eventTx]        transaction from a signature-checked webhook (used only if the API read fails)
 * @param {string} o.source           'webhook' | 'return'
 * @returns {Promise<{ok:boolean, state:string, reason?:string}>}
 */
export async function confirmAndFulfil({ paymentId, transactionId, eventTx = null, source, supabase = db(), fetchTx = getTransaction, fulfilers = null }) {
  if (!paymentId) return { ok: false, state: 'error', reason: 'no_payment_id' };
  const { data: payment, error } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle();
  if (error || !payment) return { ok: false, state: 'error', reason: 'payment_not_found' };
  if (payment.status !== 'pending') return { ok: true, state: 'already_' + payment.status };

  let tx = null;
  try { tx = transactionId ? await fetchTx(transactionId) : null; } catch (e) { tx = null; }
  if (!tx && source === 'webhook' && eventTx) tx = eventTx;
  if (!tx) return { ok: false, state: 'pending', reason: 'transaction_unconfirmed' };

  const m = transactionMatches(tx, payment);
  if (!m.ok) {
    console.warn(`[payment-fulfil] ${paymentId} not confirmed (${source}): ${m.reason} ${JSON.stringify({ status: tx.status, order_id: tx.order_id, amount: tx.amount, currency: tx.currency })}`);
    return { ok: false, state: 'pending', reason: m.reason };
  }

  // Atomic claim: only one caller moves the row from pending to paid.
  const { data: claimed, error: claimErr } = await supabase.from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), provider_tx_id: String(tx.id || transactionId || ''), confirmed_by: source })
    .eq('id', paymentId).eq('status', 'pending').select('id');
  if (claimErr || !claimed || claimed.length === 0) return { ok: true, state: 'already_paid' };

  console.log(`[payment-fulfil] ${paymentId} paid (${payment.kind}/${payment.product}, ${payment.amount_minor / 100} ${payment.currency}, by ${source}) — fulfilling`);
  const f = fulfilers || await defaultFulfilers();
  const run = f[payment.kind];
  try {
    if (!run) throw new Error(`unknown kind ${payment.kind}`);
    await run(payment);
    await supabase.from('payments').update({ fulfilled_at: new Date().toISOString() }).eq('id', paymentId);
    return { ok: true, state: 'fulfilled' };
  } catch (e) {
    const msg = String(e && e.message || e);
    console.error(`[payment-fulfil] ${paymentId} fulfilment failed:`, msg);
    await supabase.from('payments').update({ fulfil_error: msg.slice(0, 500) }).eq('id', paymentId);
    await notifyFailure(payment, msg);
    return { ok: false, state: 'fulfil_failed', reason: msg };
  }
}

async function notifyFailure(payment, msg) {
  if (!process.env.BREVO_API_KEY) return;
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'Za3fran', email: 'hello@za3fran.io' },
        to: [{ email: 'hello@za3fran.io' }],
        subject: `YouCan Pay — paiement reçu, livraison en échec (${payment.kind})`,
        htmlContent: `<p>Paiement <b>${payment.id}</b> (${payment.amount_minor / 100} ${payment.currency}, ${payment.email || ''}) confirmé, mais la livraison a échoué : ${String(msg).replace(/</g, '&lt;')}</p>`
          + (payment.kind === 'validator' ? `<p><a href="${recoverUrl(payment.id)}">Relancer la génération et la livraison</a></p>` : ''),
      }),
    });
  } catch (_) { /* best effort */ }
}
