// ============================================================
// /api/dashboard.js — data of the private sales dashboard /pilotage (Arnaud only)
//
// Access: the same personal code and signed cookie as /brain (BRAIN_APP_CODE, BRAIN_APP_SECRET;
// login through /api/brain-inbox action 'login'). No other secret.
//
// GET                → all figures (lib/dashboard.js), recomputed at each call (live).
// POST {action:'add', sold_on, kind, client, email, amount, currency, note} → sale entered by hand
// POST {action:'delete', id}                                               → remove such a sale
//
// Sources: Stripe checkout sessions + refunds (za3fran.io sales; Zahir Guest subscriptions apart),
// `payments` (YouCan Pay, MAD), `offline_sales`, Supabase activity tables, Brevo Scorecard list.
// Exchange rates for the MAD totals: open.er-api.com (free, daily), cached 6 hours.
//
// Env: DASHBOARD_TEST_EMAILS (comma list, + tags ignored), DASHBOARD_LAUNCH_DATE (YYYY-MM-DD),
//      DASHBOARD_MONTHLY_TARGET_MAD (default 27000), BREVO_API_KEY, STRIPE_SECRET_KEY.
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import BI from '../lib/brain-inbox.js';
import * as D from '../lib/dashboard.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const SCORECARD_LIST_ID = 3; // api/scorecard.js
const KINDS = ['accompagnement', 'conseil', 'client_mystere', 'design', 'autre'];

const send = (res, code, body) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(body); };
function signedIn(req) {
  return BI.sessionValid(BI.parseCookies(req.headers.cookie)[BI.COOKIE_NAME], process.env.BRAIN_APP_SECRET);
}

let _rates = null; let _ratesAt = 0;
async function getRates() {
  if (_rates && Date.now() - _ratesAt < 6 * 3600 * 1000) return _rates;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/MAD');
    const j = await r.json();
    if (j && j.result === 'success' && j.rates && j.rates.EUR && j.rates.USD) {
      _rates = { EUR: 1 / j.rates.EUR, USD: 1 / j.rates.USD, date: j.time_last_update_utc || null, source: 'open.er-api.com' };
      _ratesAt = Date.now();
    }
  } catch (_) { /* keep the previous rates, or none */ }
  return _rates;
}

async function stripeData() {
  if (!process.env.STRIPE_SECRET_KEY) return { sessions: [], refundsByPi: {}, zahir: null, error: 'no_key' };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sessions = [];
  for await (const s of stripe.checkout.sessions.list({ status: 'complete', limit: 100 })) sessions.push(s);
  const refundsByPi = {};
  for await (const r of stripe.refunds.list({ limit: 100 })) {
    if (r.status === 'succeeded' && r.payment_intent) refundsByPi[r.payment_intent] = (refundsByPi[r.payment_intent] || 0) + r.amount;
  }
  // Zahir Guest: active and trialing subscriptions, monthly recurring revenue after percentage discounts.
  const zahir = { active: 0, trialing: 0, mrrByCurrency: {}, tiers: {}, tests: 0 };
  const tests = D.testEmailSet(process.env.DASHBOARD_TEST_EMAILS);
  for (const status of ['active', 'trialing']) {
    for await (const sub of stripe.subscriptions.list({ status, limit: 100, expand: ['data.customer'] })) {
      const email = sub.customer && sub.customer.email;
      if (email && tests.has(D.normEmail(email))) { zahir.tests++; continue; }
      zahir[status]++;
      const tier = (sub.metadata && sub.metadata.tier) || 'autre';
      zahir.tiers[tier] = (zahir.tiers[tier] || 0) + 1;
      if (status !== 'active') continue;
      const coupons = [];
      if (sub.discount && sub.discount.coupon) coupons.push(sub.discount.coupon);
      (sub.discounts || []).forEach((d) => { if (d && typeof d === 'object' && d.coupon) coupons.push(d.coupon); });
      const pct = coupons.reduce((a, c) => Math.max(a, c.percent_off || 0), 0);
      for (const it of (sub.items && sub.items.data) || []) {
        const p = it.price || {};
        const unit = (p.unit_amount || 0) * (it.quantity || 1) / 100;
        const months = p.recurring ? (p.recurring.interval === 'year' ? 12 : p.recurring.interval === 'week' ? 12 / 52 : 1) * (p.recurring.interval_count || 1) : 1;
        const cur = String(p.currency || 'eur').toUpperCase();
        zahir.mrrByCurrency[cur] = (zahir.mrrByCurrency[cur] || 0) + (unit / months) * (1 - pct / 100);
      }
    }
  }
  return { sessions, refundsByPi, zahir };
}

async function brevoScorecards() {
  if (!process.env.BREVO_API_KEY) return null;
  const out = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${SCORECARD_LIST_ID}/contacts?limit=500&offset=${offset}`, { headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' } });
    if (!r.ok) return out.length ? out : null;
    const j = await r.json();
    const list = j.contacts || [];
    list.forEach((c) => out.push({ email: c.email, createdAt: c.createdAt }));
    if (list.length < 500) break;
  }
  return out;
}

const all = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data || []; };

async function build() {
  const now = new Date().toISOString();
  const tests = D.testEmailSet(process.env.DASHBOARD_TEST_EMAILS);
  const isTest = (email) => !!email && tests.has(D.normEmail(email));
  const [rates, st, ycp, offline, subs, users, projects, bpRuns, menuRuns, waitlist, workshop, scorecards] = await Promise.all([
    getRates(),
    stripeData().catch((e) => ({ sessions: [], refundsByPi: {}, zahir: null, error: e.message })),
    all(supabase.from('payments').select('*')),
    all(supabase.from('offline_sales').select('*').order('sold_on', { ascending: false })).catch(() => []),
    all(supabase.from('validator_submissions').select('id, created_at, name, email, concept_name, city, currency, status, purchase_type')),
    all(supabase.from('za3fran_users').select('id, email, created_at')),
    all(supabase.from('za3fran_projects').select('id, user_id, created_at, access_code, crr_status, concept_name')),
    all(supabase.from('business_plan_essentials_runs').select('id, project_id, created_at, access_code, status:output_json->>status')),
    all(supabase.from('menu_engineer_runs').select('id, project_id, created_at, access_code, status')),
    all(supabase.from('za3fran_waitlist').select('id, email, tools, submitted_at')),
    all(supabase.from('concept_records').select('project_id, created_at').eq('source', 'readiness_review')),
    brevoScorecards().catch(() => null),
  ]);

  const sales = D.normaliseSales({ stripeSessions: st.sessions, refundsByPi: st.refundsByPi, ycp, offline, testEmails: tests });
  const launchDate = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DASHBOARD_LAUNCH_DATE || '') ? process.env.DASHBOARD_LAUNCH_DATE : '2026-11-17';
  const summary = D.summarise(sales, { now, launchDate, rates, monthlyTargetMad: Number(process.env.DASHBOARD_MONTHLY_TARGET_MAD) || 27000 });

  // Activity (test users and test projects excluded).
  const testUserIds = new Set(users.filter((u) => isTest(u.email)).map((u) => u.id));
  const realUsers = users.filter((u) => !testUserIds.has(u.id));
  const realProjects = projects.filter((p) => !testUserIds.has(p.user_id) && !D.TEST_CODES.includes(String(p.access_code || '').toUpperCase()));
  const realProjectIds = new Set(realProjects.map((p) => p.id));
  const realSubs = subs.filter((s) => !isTest(s.email));
  const paidSubs = realSubs.filter((s) => s.status === 'paid');
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const abandoned = realSubs.filter((s) => s.status === 'pending_payment' && s.created_at >= cutoff)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 25)
    .map((s) => ({ date: s.created_at, name: s.name, email: s.email, concept: s.concept_name, city: s.city, product: s.purchase_type || 'validator' }));
  const failed = realSubs.filter((s) => s.status === 'report_error').map((s) => ({ date: s.created_at, name: s.name, email: s.email, concept: s.concept_name }));
  const realScore = scorecards ? scorecards.filter((c) => !isTest(c.email)) : null;
  const bpReal = bpRuns.filter((r) => realProjectIds.has(r.project_id));
  const menuReal = menuRuns.filter((r) => realProjectIds.has(r.project_id));

  return {
    ok: true, generated_at: now, rates,
    sales: summary,
    recent: sales.filter((s) => !s.test).slice(0, 30),
    tests: sales.filter((s) => s.test).slice(0, 15),
    offline,
    activity: {
      users: D.countByPeriod(realUsers.map((u) => u.created_at), now),
      projects: D.countByPeriod(realProjects.map((p) => p.created_at), now),
      scorecards: realScore ? D.countByPeriod(realScore.map((c) => c.createdAt), now) : null,
      validatorForms: D.countByPeriod(realSubs.map((s) => s.created_at), now),
      validatorPaid: D.countByPeriod(paidSubs.map((s) => s.created_at), now),
      conversion: realSubs.length ? paidSubs.length / realSubs.length : null,
      reviewsStarted: new Set(workshop.filter((w) => realProjectIds.has(w.project_id)).map((w) => w.project_id)).size,
      reviewsCleared: realProjects.filter((p) => p.crr_status === 'cleared').length,
      plansGenerated: bpReal.filter((r) => r.status === 'complete').length,
      plansAwaitingFigures: bpReal.filter((r) => r.status === 'awaiting_intake' || r.status === 'blocked_intake').length,
      menusGenerated: menuReal.filter((r) => r.status === 'complete' || r.status === 'completed').length,
      waitlist: waitlist.filter((w) => !isTest(w.email)).length,
      abandoned, failed,
    },
    zahir: st.zahir,
    errors: { stripe: st.error || null, brevo: scorecards ? null : 'unavailable', rates: rates ? null : 'unavailable' },
    kinds: KINDS,
  };
}

async function addSale(b) {
  const kind = KINDS.includes(b.kind) ? b.kind : null;
  const amount = Number(String(b.amount || '').replace(',', '.'));
  const currency = ['MAD', 'EUR', 'USD'].includes(b.currency) ? b.currency : 'MAD';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.sold_on || '') ? b.sold_on : null;
  if (!kind || !day || !(amount > 0)) return { ok: false, error: 'invalid' };
  const { error } = await supabase.from('offline_sales').insert({
    sold_on: day, kind, currency, amount_minor: Math.round(amount * 100),
    client: String(b.client || '').slice(0, 200), email: String(b.email || '').slice(0, 200) || null,
    note: String(b.note || '').slice(0, 500) || null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export default async function handler(req, res) {
  if (!signedIn(req)) return send(res, 401, { error: 'signed_out' });
  try {
    if (req.method === 'GET') return send(res, 200, await build());
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'add') return send(res, 200, await addSale(b));
      if (b.action === 'delete' && b.id) {
        const { error } = await supabase.from('offline_sales').delete().eq('id', b.id);
        return send(res, 200, error ? { ok: false, error: error.message } : { ok: true });
      }
      return send(res, 400, { error: 'unknown_action' });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error('[dashboard]', e);
    return send(res, 500, { error: 'server', message: String(e.message || e) });
  }
}
