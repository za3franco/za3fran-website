// ============================================================
// /lib/dashboard.js — sales and activity figures for /pilotage (db-1.0.0)
//
// Pure functions: the API (/api/dashboard) gathers raw rows from Stripe, the `payments`
// table (YouCan Pay), `offline_sales` (sales entered by hand: accompaniment, consulting…),
// Supabase and Brevo; everything below normalises and counts them. Nothing here calls a
// network. Amounts are in major units (dirhams, euros, dollars).
//
// Test purchases are excluded everywhere and counted apart: amount 0 (100 % promo code),
// a test e-mail (DASHBOARD_TEST_EMAILS, +tags ignored), a test project code, the YouCan
// Pay test price or sandbox.
// ============================================================

export const DASHBOARD_VERSION = 'db-1.0.0';
export const TZ = 'Africa/Casablanca';

// Known test projects (instructions: Canaille, paid test projects, example, Zoco).
export const TEST_CODES = ['ESATZMB2', 'E3T9HZ4A', 'T6YW78V8', 'DEMOFG26', 'ZA3FTEST'];

export const PRODUCT_LABELS = {
  validator: { fr: 'Validator', en: 'Validator' },
  bundle: { fr: 'Validator + business plan', en: 'Validator + business plan' },
  bundle_menu: { fr: 'Validator + Menu Engineer', en: 'Validator + Menu Engineer' },
  bundle_full: { fr: 'Pack complet', en: 'Full bundle' },
  essentials: { fr: 'Business plan', en: 'Business plan' },
  menu: { fr: 'Menu Engineer', en: 'Menu Engineer' },
  menu_loyalty: { fr: 'Menu Engineer (fidélité)', en: 'Menu Engineer (loyalty)' },
  accompagnement: { fr: 'Accompagnement concept', en: 'Concept support' },
  conseil: { fr: 'Conseil', en: 'Consulting' },
  client_mystere: { fr: 'Client mystère', en: 'Mystery guest' },
  design: { fr: 'Design', en: 'Design' },
  autre: { fr: 'Autre', en: 'Other' },
  other: { fr: 'Autre', en: 'Other' },
};
// Products that include a Validator (launch threshold: 15 paid Validators, of which ≥ 5 bundles).
export const VALIDATOR_PRODUCTS = ['validator', 'bundle', 'bundle_menu', 'bundle_full'];
export const BUNDLE_PRODUCTS = ['bundle', 'bundle_menu', 'bundle_full'];

/** 'a.b+tag@x.com' → 'a.b@x.com', lower case. */
export function normEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  const at = s.indexOf('@');
  if (at < 0) return s;
  return s.slice(0, at).replace(/\+.*$/, '') + s.slice(at);
}

export function testEmailSet(envValue) {
  const base = ['hello@za3fran.io'];
  const extra = String(envValue || '').split(/[,;\s]+/).filter(Boolean);
  return new Set([...base, ...extra].map(normEmail));
}

/** Product key of a Stripe checkout session made by za3fran.io (null = not a za3fran.io sale). */
export function stripeProduct(session) {
  const m = (session && session.metadata) || {};
  if (session.mode === 'subscription' || m.tenant_id) return null; // Zahir Guest subscriptions
  if (VALIDATOR_PRODUCTS.includes(m.purchase_type)) return m.purchase_type;
  if (m.type === 'business_plan_essentials') return 'essentials';
  if (m.type === 'menu_engineer') return m.priceTier === 'loyalty' ? 'menu_loyalty' : 'menu';
  return 'other';
}

/** One normalised sale. */
function sale(o) {
  return {
    source: o.source, id: o.id, date: o.date, email: o.email || '', name: o.name || '',
    product: o.product, currency: String(o.currency || 'MAD').toUpperCase(),
    amount: Number(o.amount) || 0, refunded: Number(o.refunded) || 0,
    concept: o.concept || '', test: !!o.test, testReason: o.testReason || '',
  };
}

function testReason({ email, amount, code, flag }, tests) {
  if (flag) return flag;
  if (!(amount > 0)) return 'montant 0';
  if (email && tests.has(normEmail(email))) return 'e-mail de test';
  if (code && TEST_CODES.includes(String(code).toUpperCase())) return 'projet de test';
  return '';
}

/**
 * Normalise every source into one list of sales.
 * stripeSessions: complete checkout sessions; refundsByPi: { payment_intent: refunded minor units }
 * ycp: rows of `payments` with status 'paid'; offline: rows of `offline_sales`.
 */
export function normaliseSales({ stripeSessions = [], refundsByPi = {}, ycp = [], offline = [], testEmails }) {
  const tests = testEmails || testEmailSet('');
  const out = [];
  for (const s of stripeSessions) {
    if (s.status !== 'complete' || s.payment_status !== 'paid') continue;
    const product = stripeProduct(s);
    if (!product) continue;
    const m = s.metadata || {};
    const email = (s.customer_details && s.customer_details.email) || s.customer_email || '';
    const amount = (s.amount_total || 0) / 100;
    const reason = testReason({ email, amount, code: m.accessCode || m.validatorAccessCode }, tests);
    out.push(sale({
      source: 'stripe', id: s.id, date: new Date(s.created * 1000).toISOString(), email,
      name: m.submitter_name || m.customerName || (s.customer_details && s.customer_details.name) || '',
      product, currency: s.currency, amount,
      refunded: (refundsByPi[s.payment_intent] || 0) / 100,
      concept: m.concept_name || m.conceptName || '', test: !!reason, testReason: reason,
    }));
  }
  for (const p of ycp) {
    if (p.status !== 'paid') continue;
    const m = p.meta || {};
    const v = p.versions || {};
    const amount = (Number(p.amount_minor) || 0) / 100;
    const flag = p.sandbox ? 'mode test YouCan Pay' : (v.test_price ? 'prix de test' : '');
    const reason = testReason({ email: p.email, amount, code: m.accessCode || m.validatorAccessCode, flag }, tests);
    out.push(sale({
      source: 'youcanpay', id: p.id, date: p.paid_at || p.created_at, email: p.email,
      name: m.submitter_name || m.customerName || '', product: p.product, currency: p.currency, amount,
      concept: m.concept_name || m.conceptName || '', test: !!reason, testReason: reason,
    }));
  }
  for (const o of offline) {
    const amount = (Number(o.amount_minor) || 0) / 100;
    out.push(sale({
      source: 'manual', id: o.id, date: new Date(o.sold_on + 'T12:00:00Z').toISOString(), email: o.email || '',
      name: o.client || '', product: o.kind || 'autre', currency: o.currency, amount,
      concept: o.note || '', test: false,
    }));
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

/** Amount in MAD; rates = { EUR: MAD per 1 EUR, USD: MAD per 1 USD }. null when no rate. */
export function toMad(amount, currency, rates) {
  if (currency === 'MAD') return amount;
  const r = rates && rates[currency];
  return r ? amount * r : null;
}

/** Calendar parts in Morocco's time zone. */
export function localParts(iso, tz = TZ) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const s = f.format(new Date(iso)); // YYYY-MM-DD
  return { day: s, month: s.slice(0, 7), year: s.slice(0, 4) };
}

function addDays(dayStr, n) {
  const d = new Date(dayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekStart(dayStr) {
  const d = new Date(dayStr + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(dayStr, -dow);
}

function emptyBucket() { return { count: 0, mad: 0, byCurrency: {}, unconverted: 0 }; }
function addTo(b, s, rates) {
  const net = s.amount - s.refunded;
  b.count += 1;
  b.byCurrency[s.currency] = (b.byCurrency[s.currency] || 0) + net;
  const m = toMad(net, s.currency, rates);
  if (m == null) b.unconverted += 1; else b.mad += m;
}

/**
 * All the figures of the dashboard.
 * now: ISO date; launchDate: 'YYYY-MM-DD'; rates: { EUR, USD } in MAD.
 */
export function summarise(sales, { now = new Date().toISOString(), launchDate, rates, monthlyTargetMad = 27000 } = {}) {
  const real = sales.filter((s) => !s.test);
  const today = localParts(now).day;
  const thisWeek = weekStart(today);
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  const yesterday = addDays(today, -1);
  const lastMonthDate = new Date(thisMonth + '-15T12:00:00Z'); lastMonthDate.setUTCMonth(lastMonthDate.getUTCMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);

  const periods = { today: emptyBucket(), yesterday: emptyBucket(), week: emptyBucket(), month: emptyBucket(), lastMonth: emptyBucket(), year: emptyBucket(), all: emptyBucket() };
  const byProduct = {};
  const bySource = {};
  const daily = {}; const monthly = {};
  for (let i = 29; i >= 0; i--) daily[addDays(today, -i)] = emptyBucket();
  for (let i = 11; i >= 0; i--) { const d = new Date(thisMonth + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i); monthly[d.toISOString().slice(0, 7)] = emptyBucket(); }

  for (const s of real) {
    const p = localParts(s.date);
    addTo(periods.all, s, rates);
    if (p.day === today) addTo(periods.today, s, rates);
    if (p.day === yesterday) addTo(periods.yesterday, s, rates);
    if (p.day >= thisWeek && p.day <= today) addTo(periods.week, s, rates);
    if (p.month === thisMonth) addTo(periods.month, s, rates);
    if (p.month === lastMonth) addTo(periods.lastMonth, s, rates);
    if (p.year === thisYear) addTo(periods.year, s, rates);
    if (daily[p.day]) addTo(daily[p.day], s, rates);
    if (monthly[p.month]) addTo(monthly[p.month], s, rates);
    byProduct[s.product] = byProduct[s.product] || emptyBucket(); addTo(byProduct[s.product], s, rates);
    bySource[s.source] = bySource[s.source] || emptyBucket(); addTo(bySource[s.source], s, rates);
  }

  // Launch threshold (decided 7 Nov 2026): within 90 days of real communication,
  // ≥ 15 paid Validators of which ≥ 5 bundles, and ≥ 3 concept accompaniments.
  let threshold = null;
  if (launchDate) {
    const end = addDays(launchDate, 89);
    const inWin = real.filter((s) => { const d = localParts(s.date).day; return d >= launchDate && d <= end; });
    const started = today >= launchDate;
    const elapsed = started ? Math.min(90, Math.round((new Date(today + 'T12:00:00Z') - new Date(launchDate + 'T12:00:00Z')) / 86400000) + 1) : 0;
    const rev = emptyBucket(); inWin.forEach((s) => addTo(rev, s, rates));
    threshold = {
      launchDate, endDate: end, started, daysElapsed: elapsed, daysTotal: 90,
      validators: { done: inWin.filter((s) => VALIDATOR_PRODUCTS.includes(s.product)).length, target: 15 },
      bundles: { done: inWin.filter((s) => BUNDLE_PRODUCTS.includes(s.product)).length, target: 5 },
      accompaniments: { done: inWin.filter((s) => s.product === 'accompagnement').length, target: 3 },
      revenue: rev,
    };
  }

  const avgBasketMad = periods.all.count && !periods.all.unconverted ? periods.all.mad / periods.all.count : null;
  return {
    version: DASHBOARD_VERSION,
    today, periods, byProduct, bySource, daily, monthly, threshold,
    monthlyTargetMad, monthProgress: monthlyTargetMad ? periods.month.mad / monthlyTargetMad : null,
    avgBasketMad,
    tests: { count: sales.length - real.length },
  };
}

/** Count rows whose date falls in each period (users, projects, Scorecards…). */
export function countByPeriod(dates, now = new Date().toISOString()) {
  const today = localParts(now).day;
  const thisWeek = weekStart(today);
  const out = { today: 0, week: 0, month: 0, year: 0, all: 0 };
  for (const iso of dates) {
    if (!iso) continue;
    const p = localParts(iso);
    out.all++;
    if (p.day === today) out.today++;
    if (p.day >= thisWeek && p.day <= today) out.week++;
    if (p.month === today.slice(0, 7)) out.month++;
    if (p.year === today.slice(0, 4)) out.year++;
  }
  return out;
}
