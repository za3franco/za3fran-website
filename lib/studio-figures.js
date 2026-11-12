/* lib/studio-figures.js — Concept Studio orders of magnitude (M7), version sf-1.0.0 (12 Nov 2026, lot 1).
 *
 * The Studio's draft concept -> a concept record (cr-1.0.0 fields) -> the Validator's own engine
 * (validator-v2 runFinancials + buildFacts, ~0.1 s, no model call). The Studio NEVER calls assess() or finalize():
 * no score, no verdict (Arnaud, 30 Oct 2026). It states findings of the engine (« the need exceeds your budget by X »).
 *
 *   draftRecord({ draft, format, K })                  -> { record, origins, gaps }
 *   figures({ draft, format, K, market, brain, lang, today }) -> { status, figures, ranges, origins, gaps, findings, facts }
 *   investmentAtTypicalSize({ format, K, market, brain, base }) -> M3 budget filter (engine investment at the format's typical size)
 *
 * Order of each assumption (method §4 M7): the founder's figure -> a dated menu of the Brain (lot 6) -> the Za3fran
 * range of the format (A9, « estimation à confirmer »). A value none of them gives stays a gap: nothing is filled in silence.
 * PURE module.
 */
'use strict';

const V = require('./validator-v2.js');
const E = require('./financial-engine.js');
const FMT = require('./formats.js');
const SEL = require('./studio-select.js');

const FIGURES_VERSION = 'sf-1.0.0';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const mid = (r) => (r && isNum(r.low) && isNum(r.high) ? Math.round((r.low + r.high) / 2) : null);

/**
 * draft = what the session holds: { concept_name?, district?, services: [{ id, days?, ticket?, covers? }], seats?, surface_m2?,
 *   rent_monthly?, budget_amount?, own_funds?, alcohol?, licence_cost?, ramadan?, opening?, founder_works? }
 */
function draftRecord({ draft, format, K }) {
  const d = draft || {};
  const f = SEL.formatBySlug(K, format);
  const origins = {}; const gaps = [];
  if (!f) return { record: null, origins, gaps: [{ path: 'format', code: 'unknown_format' }] };
  const ranges = f.ranges || {};
  const take = (path, founderValue, range) => {
    if (isNum(founderValue)) { origins[path] = { source: 'founder' }; return founderValue; }
    const m = mid(range);
    if (m != null) { origins[path] = { source: 'estimate', low: range.low, high: range.high, origin: range.origin || 'za3fran_range', note: range.note || null }; return m; }
    gaps.push({ path, code: 'missing' });
    return null;
  };
  // Services: the founder's list, else the format's typical services (catalogue trait) — days are never assumed.
  let svc = Array.isArray(d.services) && d.services.length ? d.services : null;
  if (!svc) {
    const typical = (f.traits && f.traits.services) || [];
    if (typical.length) { svc = typical.map((id) => ({ id })); origins.services = { source: 'catalogue', note: 'typical services of the format' }; }
    else { gaps.push({ path: 'services', code: 'missing' }); svc = []; }
  } else origins.services = { source: 'founder' };
  const services = svc.filter((s) => FMT.SERVICE_IDS.includes(s.id)).map((s) => {
    const row = { id: s.id };
    if (Array.isArray(s.days) && s.days.length) { row.days = s.days.slice(); origins[`services.${s.id}.days`] = { source: 'founder' }; }
    else gaps.push({ path: `services.${s.id}.days`, code: 'missing' });
    const t = take(`services.${s.id}.ticket`, s.ticket, ranges.ticket && ranges.ticket[s.id]);
    if (t != null) row.ticket = t;
    if (isNum(s.covers)) { row.covers = s.covers; origins[`services.${s.id}.covers`] = { source: 'founder' }; }
    return row;
  });
  const seats = take('seats', d.seats, ranges.seats);
  const surface = take('surface_m2', d.surface_m2, ranges.surface_m2);
  const record = {
    schema: 'cr-1.0.0',
    concept_name: d.concept_name || null,
    concept_type: 'other', format_family: f.family || undefined,
    city: 'Casablanca', neighbourhood: d.district || '',
    project_country: 'MA', currency: 'MAD', language: 'fr',
    services,
    seats: seats != null ? String(seats) : undefined,
    surface_m2: surface != null ? surface : undefined,
    founder_works: d.founder_works !== false,
  };
  if (isNum(d.rent_monthly)) { record.rent_monthly = d.rent_monthly; origins.rent_monthly = { source: 'founder' }; }
  else origins.rent_monthly = { source: 'brain_rent', note: 'district rent per m², else the Casablanca median' };
  if (isNum(d.budget_amount)) { record.budget_amount = d.budget_amount; record.budget = String(d.budget_amount); origins.budget_amount = { source: 'founder' }; }
  if (isNum(d.own_funds)) { record.own_funds = d.own_funds; origins.own_funds = { source: 'founder' }; }
  if (d.alcohol === true || d.alcohol === false) record.alcohol = d.alcohol;
  else if (f.traits && f.traits.alcohol === 'core') { record.alcohol = true; origins.alcohol = { source: 'catalogue', note: 'alcohol is at the core of the format' }; }
  else if (f.traits && f.traits.alcohol === 'no') record.alcohol = false;
  else gaps.push({ path: 'alcohol', code: 'missing' });
  if (record.alcohol === true && isNum(d.licence_cost)) record.licence_cost = d.licence_cost;
  if (d.ramadan) record.ramadan = d.ramadan; else gaps.push({ path: 'ramadan', code: 'missing' });   // never assumed (method §5)
  if (d.opening) record.opening = d.opening; else gaps.push({ path: 'opening', code: 'missing' });
  return { record, origins, gaps };
}

/** Engine outputs the cards show — every value straight from the engine or its facts (Brain rule 1). */
function pickFigures(fin, F, record) {
  const o = fin.base.sc.base, cons = fin.base.sc.conservative, opt = fin.base.sc.optimistic;
  const lines = o.uses_of_funds.lines || [];
  const byCat = {};
  for (const l of lines) { const c = l.category || 'other'; byCat[c] = (byCat[c] || 0) + (Number(l.amount) || 0); }
  const reserve = byCat.cash_reserve || 0;
  const v = (k) => (F[k] ? F[k].raw : null);
  const budget = isNum(record.budget_amount) ? record.budget_amount : null;
  return {
    investment: { total_excl_reserve: o.uses_of_funds.total - reserve, high_excl_reserve: v('investissement_haut'), by_category: byCat, reserve },
    funding_need: o.uses_of_funds.total,
    budget, own_funds: isNum(record.own_funds) ? record.own_funds : null,
    budget_gap: budget != null ? budget - o.uses_of_funds.total : null,
    loan_needed: o.sources_of_funds.loans_total,
    headcount: o.payroll.headcount,
    payroll_monthly_y1: o.payroll.monthly_year1,
    revenue: { y1: o.annual[0].revenue, y2: o.annual[1].revenue, y3: o.annual[2].revenue },
    revenue_y3_range: { conservative: cons.annual[2].revenue, base: o.annual[2].revenue, optimistic: opt.annual[2].revenue },
    revenue_y2_range: { conservative: cons.annual[1].revenue, base: o.annual[1].revenue, optimistic: opt.annual[1].revenue },
    ebitda_y2: o.annual[1].ebitda,
    breakeven: { covers_per_open_day: v('point_mort_couverts_jour'), occupancy: v('point_mort_occupation'), revenue_month: v('point_mort_mois') },
    covers_per_day_y2: v('couverts_jour_a2'), occupancy_y2: v('occupation_a2'),
    rent: { monthly: v('loyer_mois'), share_y2: v('loyer_pct_a2') },
    min_cash_conservative: cons.min_cash.balance,
  };
}

/** Findings the Studio may state (method M7): facts of the engine, never « viable ». */
function findingsOf(fig, fin) {
  const out = [];
  const R = E.DEFAULT_RULES;
  if (isNum(fig.budget_gap) && fig.budget_gap < 0) {
    // Said in two parts: the investment alone against the budget, then the cash reserve the prudent case needs.
    const inv = fig.investment.total_excl_reserve;
    if (isNum(fig.budget) && inv > fig.budget) out.push({ code: 'investment_above_budget', data: { shortfall: inv - fig.budget } });
    else out.push({ code: 'reserve_makes_need_above_budget', data: { shortfall: -fig.budget_gap, reserve: fig.investment.reserve } });
  }
  if (isNum(fig.own_funds) && fig.funding_need && fig.own_funds / fig.funding_need < 0.2) out.push({ code: 'own_funds_low_share', data: { share: fig.own_funds / fig.funding_need } });
  if (isNum(fig.breakeven.occupancy) && fig.breakeven.occupancy > R.max_cruise_occupancy) out.push({ code: 'breakeven_above_capacity', data: { occupancy: fig.breakeven.occupancy, cap: R.max_cruise_occupancy } });
  if (isNum(fig.rent.share_y2) && fig.rent.share_y2 > R.rent_pct_max) out.push({ code: 'rent_share_high', data: { share: fig.rent.share_y2, max: R.rent_pct_max } });
  if (isNum(fig.min_cash_conservative) && fig.min_cash_conservative < 0) out.push({ code: 'cash_negative_conservative', data: { low: fig.min_cash_conservative } });
  if (fin.licence_unpriced) out.push({ code: 'licence_unpriced' });
  if (fin.own_funds_assumed) out.push({ code: 'own_funds_assumed' });
  return out;
}

/**
 * @param market { currency, chain } built by the caller for the draft's district (studio-brain.marketFor)
 * @param brain  { parameters, values } for that chain and the format family (assumption-resolver.loadBrainContext)
 */
function figures({ draft, format, K, market, brain, lang = 'fr', today }) {
  const f = SEL.formatBySlug(K, format);
  if (!f) return { status: 'unknown_format' };
  if (!f.family || !f.seat_based) return { status: 'outside_engine', format };   // dark kitchen, caterer: said, oriented to an exchange
  const { record, origins, gaps } = draftRecord({ draft, format, K });
  const blocking = gaps.filter((g) => g.path !== 'alcohol' || f.traits.alcohol === 'possible');
  if (blocking.length) return { status: 'needs_input', format, origins, gaps: blocking, record };
  const fin = V.runFinancials({ record, market, brain });
  if (fin.status !== 'computed') return { status: fin.status === 'blocked' ? 'engine_blocked' : fin.status, format, origins, gaps: fin.gaps || [], errors: fin.errors || null, record };
  const F = V.buildFacts({ record, fin, lang, currency: 'MAD', today });
  const fig = pickFigures(fin, F, record);
  return { status: 'computed', format, figures: fig, findings: findingsOf(fig, fin), origins, gaps: [], base_source: fin.base_source, record, facts: F };
}

/** M3 budget filter: the engine at the format's typical size (A9 ranges), with the founder's budget and services. */
function investmentAtTypicalSize({ format, K, market, brain, base, today }) {
  const f = SEL.formatBySlug(K, format);
  if (!f || !f.family) return { status: 'unchecked', gaps: ['outside_engine'] };
  const b = base || {};
  const typical = (f.traits && f.traits.services) || [];
  const draft = {
    district: b.district || '',
    services: typical.map((id) => ({ id, days: [1, 2, 3, 4, 5, 6] })),   // a 6-day week, for this filter only: sizes the investment, never shown as the founder's
    budget_amount: b.budget_amount, own_funds: b.own_funds, ramadan: b.ramadan || 'reduced', opening: b.opening || '2027-09',
    alcohol: f.traits.alcohol === 'core' ? true : f.traits.alcohol === 'no' ? false : b.alcohol === true,
  };
  const r = figures({ draft, format, K, market, brain, today });
  if (r.status !== 'computed') return { status: 'unchecked', gaps: (r.gaps || []).map((g) => g.path || g.code) };
  const estimated = Object.entries(r.origins).filter(([, o]) => o.source === 'estimate').map(([k]) => k);
  return { status: 'computed', investment: r.figures.investment.total_excl_reserve, funding_need: r.figures.funding_need, estimated };
}

/**
 * M8 « ready for the Validator » (method §4 M8): format, services, ticket, covers (or the format's benchmark), seats,
 * surface, rent, budget, opening, Ramadan, alcohol. What is missing is listed, never filled in silence; estimated fields
 * are listed apart (they reach the Validator marked « à confirmer »).
 */
function readyForValidator({ record, origins }) {
  const r = record || {}; const o = origins || {};
  const missing = [];
  if (!r.format_family) missing.push('format');
  const svc = r.services || [];
  if (!svc.length) missing.push('services');
  for (const s of svc) {
    if (!Array.isArray(s.days) || !s.days.length) missing.push(`services.${s.id}.days`);
    if (!isNum(s.ticket)) missing.push(`services.${s.id}.ticket`);
  }
  if (!Number(r.seats)) missing.push('seats');
  if (!isNum(r.surface_m2)) missing.push('surface_m2');
  if (!isNum(r.budget_amount)) missing.push('budget_amount');
  if (!r.opening) missing.push('opening');
  if (!r.ramadan) missing.push('ramadan');
  if (r.alcohol !== true && r.alcohol !== false) missing.push('alcohol');
  const toConfirm = Object.entries(o).filter(([, x]) => x.source === 'estimate' || x.source === 'catalogue' || x.source === 'brain_rent').map(([k]) => k);
  if (!isNum(r.rent_monthly)) toConfirm.push('rent_monthly');
  return { ready: missing.length === 0, missing, to_confirm: [...new Set(toConfirm)] };
}

module.exports = { FIGURES_VERSION, draftRecord, figures, investmentAtTypicalSize, pickFigures, findingsOf, readyForValidator };
