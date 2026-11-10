// ============================================================
// /api/webhook-youcanpay.js — YouCan Pay events (payments in MAD)
//
// POST: event from YouCan Pay. The X-YOUCANPAY-SIGNATURE header must be the HMAC-SHA256
//       of the raw body keyed with our private key, or the call is refused (403).
//       'transaction.paid' → lib/payment-fulfil.js (transaction re-read from YouCan's API,
//       checked against the payment row, atomic claim, same fulfilment as Stripe).
//       Answer 200 at once; the fulfilment runs in the background (waitUntil).
// GET ?recover=<payment id>: relaunch a Validator report that failed after a confirmed
//       payment (link sent in the failure notice to hello@za3fran.io), like the Stripe recovery.
//
// Webhook URL to set in YouCan Pay: https://www.za3fran.io/api/webhook-youcanpay  (www form)
// ============================================================

import { waitUntil } from '@vercel/functions';
import { verifySignature, txFromEvent } from '../lib/youcanpay.js';
import { confirmAndFulfil, recoverUrl } from '../lib/payment-fulfil.js';
import { db } from '../lib/payments.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** PHP json_encode style (escaped slashes and non-ASCII), the form YouCan's PHP SDK signs. */
function phpJson(value) {
  return JSON.stringify(value)
    .replace(/\//g, '\\/')
    .replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function page(res, title, text, status = 200) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#0a0e18;color:#FAFAF7;padding:40px"><h1 style="color:#E7A63E">${title}</h1><p>${text}</p></body></html>`);
}

async function recover(req, res) {
  const id = String(req.query.recover || '').trim();
  const supabase = db();
  const { data: p } = await supabase.from('payments').select('*').eq('id', id).maybeSingle();
  if (!p) return page(res, 'Not found', 'Paiement inconnu.', 404);
  if (p.status !== 'paid') return page(res, 'Not paid', 'Ce paiement n’est pas confirmé.', 409);
  if (p.kind !== 'validator') return page(res, 'Not supported', 'Relance prévue pour le Validator seulement.', 409);
  const sid = p.meta && p.meta.submission_id;
  const { data: sub } = await supabase.from('validator_submissions').select('id, status').eq('id', sid).maybeSingle();
  if (!sub || sub.status !== 'report_error') return page(res, 'Nothing to relaunch', 'La soumission n’est pas en erreur.', 409);
  const { processReport } = await import('./webhook-validator.js');
  waitUntil(processReport(p.email, null, p.meta.purchase_type || 'validator', sub.id, { fromStatus: 'report_error', recoverUrl: recoverUrl(p.id) }));
  return page(res, 'Relancé', 'La génération et la livraison sont relancées (2 à 3 minutes).');
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query && req.query.recover) return recover(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let raw;
  try { raw = await getRawBody(req); } catch (e) { return res.status(400).json({ error: 'Cannot read body' }); }

  let event = null;
  try { event = JSON.parse(raw.toString('utf8')); } catch (_) { event = null; }

  const sig = req.headers['x-youcanpay-signature'];
  const signed = verifySignature(raw, sig) || (event && verifySignature(Buffer.from(phpJson(event), 'utf8'), sig));
  if (!signed) {
    console.warn('[webhook-youcanpay] invalid signature');
    return res.status(403).json({ error: 'invalid signature' });
  }
  if (!event) return res.status(400).json({ error: 'invalid body' });

  const name = event.event_name || event.name || '';
  if (name !== 'transaction.paid') {
    console.log(`[webhook-youcanpay] event ${name} ignored`);
    return res.status(200).json({ received: true, skipped: true });
  }

  const tx = txFromEvent(event);
  if (!tx || !tx.order_id) return res.status(200).json({ received: true, error: 'no_order_id' });

  console.log(`[webhook-youcanpay] transaction.paid ${tx.id} for ${tx.order_id}`);
  waitUntil(confirmAndFulfil({ paymentId: String(tx.order_id), transactionId: tx.id, eventTx: tx, source: 'webhook' })
    .then((r) => console.log(`[webhook-youcanpay] ${tx.order_id}: ${JSON.stringify(r)}`))
    .catch((e) => console.error('[webhook-youcanpay] fulfil error', e)));
  return res.status(200).json({ received: true });
}
