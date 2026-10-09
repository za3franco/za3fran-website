/* lib/bp-intake.js — Business Plan intake: validation and preview summary (Phase A, task 4).
 *
 * PURE module (no I/O). Used by api/bp-intake.js and tested in tests/bp-intake.test.js.
 *
 * normalizeIntake(raw)  -> { intake, errors }
 *   Whitelists and type-checks the form payload and turns it into the resolver intake contract
 *   (lib/assumption-resolver.js ar-1.4.x). UI-only choices are kept under intake.ui so the form
 *   can be reloaded exactly as the founder left it; the resolver ignores them.
 *   Nothing is invented here: an empty answer stays empty and the resolver flags the gap.
 *
 * resolverConcept(conceptValues, intake) -> the concept object the resolver expects.
 * previewSummary(result, scenarios)     -> the figures shown back to the founder before generation
 *   (every number comes from the engine output; nothing is computed for display except sums/shares
 *   already present there).
 *
 * bpi-1.3.0 (9 Oct 2026, Arnaud's review of the first v14 plan): decisions before generation.
 *   reserve_months (0-12; default 3 in the resolver), reserve_choice ('include' | 'accept_risk'),
 *   capital_choice ('face' | 'premium51'), competitors [{ name, kind?, lunch_ticket?, dinner_ticket?,
 *   seen_on?, note? }] (3-5 named by the founder; their prices are founder figures). With alcohol, the
 *   licence cost is an investment line (category 'licence'); without it the resolver blocks (ar-1.6.0).
 * bpi-1.2.0 (9 Oct 2026): no manual step. "Za3fran prepares an estimate" sets intake.estimate and the
 *   resolver (ar-1.5.0) builds the team / investment from the Brain at once; the preview returns the
 *   estimated lines so the founder sees them and can take them over. Lines taken over unedited keep
 *   source 'estimate' (row flag est: true from the form). intake.founder carries "works in the
 *   business" for the team estimate. intake.ui.lang records the language the founder used (emails).
 */
'use strict';

const INTAKE_VERSION = 'bpi-1.3.0';
const SERVICE_IDS = ['lunch', 'dinner'];
const CATEGORIES = ['fitout', 'equipment', 'furniture', 'it', 'preopening', 'contingency', 'licence', 'initial_stock', 'deposit', 'key_money', 'other'];
const ROLES = ['manager', 'chef', 'cook', 'commis', 'kitchen_porter', 'server', 'bartender', 'sommelier', 'cleaner', 'other'];
/** Za3fran benchmark families with Brain data, by Validator concept type (others: Za3fran builds on demand). */
const FORMAT_BY_TYPE = { bistro: 'bistro_wine_bar', wine_bar: 'bistro_wine_bar' };
const FORMATS = ['bistro_wine_bar'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function num(v) {
  if (isNum(v)) return v;
  if (typeof v === 'string') {
    const s = v.replace(/[\s  ]/g, '').replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bool = (v) => (v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : null);
const slug = (s) => str(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * @param raw form payload (see bp-intake.html)
 * @returns {{ intake: object, errors: Array<{path:string, code:string}> }}
 *   errors are input-shape problems (bad month, negative amount…); missing answers are left to the
 *   resolver's gaps so the founder sees one list.
 */
function normalizeIntake(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const errors = [];
  const err = (path, code) => errors.push({ path, code });
  const out = { ui: {} };
  if (r.lang === 'fr' || r.lang === 'en') out.ui.lang = r.lang;
  const inRange = (path, v, lo, hi) => { if (v == null) return null; if (v < lo || v > hi) { err(path, 'out_of_range'); return null; } return v; };

  // calendar
  if (r.opening != null && r.opening !== '') {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(r.opening))) out.opening = String(r.opening);
    else err('opening', 'bad_month');
  }
  if (['closed', 'reduced', 'normal'].includes(r.ramadan)) out.ramadan = r.ramadan;
  else if (r.ramadan) err('ramadan', 'bad_choice');
  const nc = bool(r.new_company); if (nc != null) out.new_company = nc;
  const alc = bool(r.alcohol); if (alc != null) out.alcohol = alc;

  // market & format
  const district = str(r.district, 80); if (district) out.district = district;
  if (r.format) { if (FORMATS.includes(r.format)) out.format = r.format; else err('format', 'unknown_format'); }

  // services
  const svc = Array.isArray(r.services) ? r.services : [];
  out.services = [];
  for (const s of svc) {
    if (!s || !SERVICE_IDS.includes(s.id)) { err('services', 'unknown_service'); continue; }
    const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (!days.length) { err(`services.${s.id}.days`, 'no_days'); continue; }
    const row = { id: s.id, days };
    const t = inRange(`services.${s.id}.ticket`, num(s.ticket), 1, 100000); if (t != null) row.ticket = t;
    out.services.push(row);
  }
  if (!out.services.length) delete out.services;

  // covers
  if (r.covers_source === 'benchmark') out.covers_source = 'benchmark';
  else {
    const c = inRange('covers_per_day', num(r.covers_per_day), 1, 5000);
    if (c != null) { out.covers_source = 'founder'; out.covers_per_day = c; }
  }

  // premises
  const rent = inRange('rent_monthly', num(r.rent_monthly), 0, 10000000); if (rent != null) out.rent_monthly = rent;
  const surf = inRange('surface_m2', num(r.surface_m2), 10, 20000); if (surf != null) out.surface_m2 = surf;
  const free = inRange('rent_free_months', num(r.rent_free_months), 0, 24); if (free != null) out.rent_free_months = free;
  const sup = inRange('supplier_days', num(r.supplier_days), 0, 120); if (sup != null) out.supplier_days = sup;

  // team
  out.ui.roster_mode = r.roster_mode === 'estimate' ? 'estimate' : 'founder';
  const fw = bool(r.founder_works); if (fw != null) out.ui.founder_works = fw;
  const fsal = inRange('founder_salary', num(r.founder_salary), 0, 1000000); if (fsal != null) out.ui.founder_salary = fsal;
  if (fw != null) { out.founder = { works: fw }; if (fw && fsal != null) out.founder.monthly_gross = fsal; }
  if (out.ui.roster_mode === 'estimate') out.estimate = { ...(out.estimate || {}), roster: true };
  if (out.ui.roster_mode === 'founder') {
    const roster = [];
    if (fw) {
      const row = { role: 'founder', brain_role: 'manager', count: 1, note: 'Founder works in the business' };
      if (fsal != null) row.monthly_gross = fsal; else row.note += '; salary priced at the market manager salary';
      roster.push(row);
    }
    (Array.isArray(r.roster) ? r.roster : []).forEach((x, i) => {
      if (!x) return;
      const role = ROLES.includes(x.role) ? x.role : null;
      const label = str(x.label, 60);
      if (!role) { err(`roster.${i}.role`, 'unknown_role'); return; }
      const count = inRange(`roster.${i}.count`, num(x.count), 0, 60);
      if (count == null) { err(`roster.${i}.count`, 'missing'); return; }
      const key = role === 'other' ? (slug(label) || `other_${i + 1}`) : role;
      const row = { role: roster.some((y) => y.role === key) ? `${key}_${i + 1}` : key, count };
      if (role !== 'other' && row.role !== role) row.brain_role = role;
      const g = inRange(`roster.${i}.monthly_gross`, num(x.monthly_gross), 0, 1000000); if (g != null) row.monthly_gross = g;
      if (role === 'other' && row.monthly_gross == null) err(`roster.${i}.monthly_gross`, 'salary_needed_for_other');
      if (label) row.note = label;
      if (x.est === true || x.est === 'true') {   // taken over from the Za3fran estimate, not edited
        row.source = 'estimate';
        const lo = num(x.count_low), hi = num(x.count_high);
        if (lo != null && lo <= count) row.count_low = lo;
        if (hi != null && hi >= count) row.count_high = hi;
        const n = str(x.note, 300); if (n) row.note = n;
      }
      roster.push(row);
    });
    if (roster.length) out.roster = roster;
  }

  // investment
  out.ui.investment_mode = r.investment_mode === 'estimate' ? 'estimate' : 'founder';
  if (out.ui.investment_mode === 'estimate') out.estimate = { ...(out.estimate || {}), investment: true };
  if (out.ui.investment_mode === 'founder') {
    const inv = [];
    (Array.isArray(r.investment) ? r.investment : []).forEach((x, i) => {
      if (!x) return;
      const cat = CATEGORIES.includes(x.category) ? x.category : null;
      if (!cat) { err(`investment.${i}.category`, 'unknown_category'); return; }
      const amount = inRange(`investment.${i}.amount`, num(x.amount), 0, 500000000);
      if (amount == null) { err(`investment.${i}.amount`, 'missing'); return; }
      const label = str(x.label, 120) || cat;
      const row = { key: `${slug(label) || cat}_${i + 1}`, label, category: cat, amount };
      const lo = num(x.low), hi = num(x.high);
      if (lo != null || hi != null) {
        if ((lo != null && lo > amount) || (hi != null && hi < amount)) err(`investment.${i}`, 'range_around_amount');
        else { if (lo != null) row.low = lo; if (hi != null) row.high = hi; }
      }
      if (x.est === true || x.est === 'true') {   // taken over from the Za3fran estimate, not edited
        row.source = 'estimate';
        const sn = str(x.source_name, 160); if (sn) row.source_name = sn;
        const n = str(x.note, 300); if (n) row.note = n;
      }
      inv.push(row);
    });
    if (inv.length) out.investment = inv;
  }

  // funding
  out.ui.funding_mode = r.funding_mode === 'amounts' ? 'amounts' : 'rule';
  const loanIn = r.loan && typeof r.loan === 'object' ? r.loan : {};
  const loan = {};
  if (['intelaka'].includes(loanIn.programme)) loan.programme = loanIn.programme;
  const grace = inRange('loan.grace_months', num(loanIn.grace_months), 0, 36); if (grace != null) loan.grace_months = grace;
  if (out.ui.funding_mode === 'rule') {
    const s = r.sizing && typeof r.sizing === 'object' ? r.sizing : {};
    const sizing = {};
    const pct = inRange('sizing.founder_share_pct', num(s.founder_share_pct), 0, 100);
    const amt = inRange('sizing.founder_amount', num(s.founder_amount), 0, 500000000);
    if (s.founder_basis === 'amount' ? amt != null : pct != null) {
      if (s.founder_basis === 'amount') sizing.founder_amount = amt; else sizing.founder_share = Math.round(pct * 100) / 10000;
    }
    if (s.loan_cap === 'guarantee' || s.loan_cap == null || s.loan_cap === '') sizing.loan_cap = 'guarantee';
    else { const c = inRange('sizing.loan_cap', num(s.loan_cap), 0, 500000000); if (c != null) sizing.loan_cap = c; }
    out.sizing = sizing;
    out.loan = loan;   // rate/term/programme only; the amount is sized
  } else {
    const holders = [];
    (Array.isArray(r.shareholders) ? r.shareholders : []).forEach((h, i) => {
      if (!h) return;
      const amount = inRange(`shareholders.${i}.amount`, num(h.amount), 0, 500000000);
      if (amount == null) { err(`shareholders.${i}.amount`, 'missing'); return; }
      const row = { label: str(h.label, 60) || `Associé ${i + 1} / Shareholder ${i + 1}`, amount };
      const sp = num(h.share_pct);
      if (sp != null) { if (sp <= 0 || sp >= 100) err(`shareholders.${i}.share_pct`, 'out_of_range'); else row.share_pct = sp; }
      const pf = num(h.price_factor);   // API only (the form asks for the agreed share instead)
      if (pf != null && pf !== 1) { if (pf < 1 || pf > 20) err(`shareholders.${i}.price_factor`, 'out_of_range'); else row.price_factor = pf; }
      holders.push(row);
    });
    // Agreed shares of capital (bpi-1.1.0): the founder states who owns what; the issue price that
    // makes it so is derived here (the holder paying least per share is at face value, factor 1).
    const withShare = holders.filter((h) => h.share_pct != null);
    if (withShare.length) {
      if (withShare.length !== holders.length) err('shareholders', 'shares_incomplete');
      else if (Math.abs(holders.reduce((a, h) => a + h.share_pct, 0) - 100) > 0.5) err('shareholders', 'shares_sum');
      else if (holders.some((h) => !(h.amount > 0))) err('shareholders', 'shares_need_cash');
      else {
        const perPoint = holders.map((h) => h.amount / h.share_pct);
        const min = Math.min(...perPoint);
        holders.forEach((h, i) => { const f = Math.round((perPoint[i] / min) * 10000) / 10000; if (f > 1) h.price_factor = f; else delete h.price_factor; });
      }
    }
    if (holders.length) out.shareholders = holders;
    const la = inRange('loan.amount', num(loanIn.amount), 0, 500000000);
    if (la != null && la > 0) { loan.amount = la; out.loan = loan; }
  }

  // alcohol licence (bpi-1.3.0): founder figure, kept apart so a Za3fran investment estimate can sit beside it
  const licIn = r.licence && typeof r.licence === 'object' ? r.licence : null;
  if (licIn) {
    const la = inRange('licence.amount', num(licIn.amount), 0, 50000000);
    if (la != null) {
      const lic = { amount: la };
      const lo = num(licIn.low), hi = num(licIn.high);
      if ((lo != null && lo > la) || (hi != null && hi < la)) err('licence', 'range_around_amount');
      else { if (lo != null) lic.low = lo; if (hi != null) lic.high = hi; }
      const n = str(licIn.note, 200); if (n) lic.note = n;
      out.licence = lic;
    }
  }

  // decisions taken before generation (bpi-1.3.0)
  const rm = inRange('reserve_months', num(r.reserve_months), 0, 12); if (rm != null) out.reserve_months = rm;
  if (r.reserve_choice === 'accept_risk' || r.reserve_choice === 'include') out.reserve_choice = r.reserve_choice;
  if (r.capital_choice === 'premium51' || r.capital_choice === 'face') out.capital_choice = r.capital_choice;
  const comps = [];
  (Array.isArray(r.competitors) ? r.competitors : []).slice(0, 8).forEach((c, i) => {
    if (!c) return;
    const name = str(c.name, 80);
    if (!name) return;
    const row = { name, source: 'founder' };
    const kind = str(c.kind, 80); if (kind) row.kind = kind;
    const lt = inRange(`competitors.${i}.lunch_ticket`, num(c.lunch_ticket), 1, 100000); if (lt != null) row.lunch_ticket = lt;
    const dt = inRange(`competitors.${i}.dinner_ticket`, num(c.dinner_ticket), 1, 100000); if (dt != null) row.dinner_ticket = dt;
    if (c.seen_on && /^\d{4}-\d{2}(-\d{2})?$/.test(String(c.seen_on))) row.seen_on = String(c.seen_on);
    const note = str(c.note, 200); if (note) row.note = note;
    comps.push(row);
  });
  if (comps.length) out.competitors = comps;

  return { intake: out, errors };
}

/** Concept values (loadEffectiveConcept().values) + intake -> resolver concept. */
function resolverConcept(values, intake) {
  const v = values || {};
  return {
    seats: v.seats, ticket: v.ticket, covers: v.covers, budget: v.budget,
    city: v.city, district: (intake && intake.district) || v.neighbourhood || '',
  };
}

/** Format key for the resolver: founder's choice, else the concept type mapping, else null (gap). */
function formatFor(conceptType, intake) {
  if (intake && intake.format && FORMATS.includes(intake.format)) return intake.format;
  return FORMAT_BY_TYPE[conceptType] || null;
}

/** Whether the founder asked Za3fran for estimates (built at once by the resolver since ar-1.5.0). */
function estimatesRequested(intake) {
  const ui = (intake && intake.ui) || {};
  return { roster: ui.roster_mode === 'estimate', investment: ui.investment_mode === 'estimate' };
}

/** Estimated team / investment lines for display and take-over (salaries from the resolved assumptions). */
function estimatedLines(result) {
  const est = result.estimated || {};
  const out = {};
  if (est.roster) {
    const sal = (role) => { const a = result.assumptions.find((x) => x.parameter_key === `labour.roster.${role}.monthly_gross`); return a ? a.value_num : null; };
    out.roster = est.roster.lines.map((l) => ({ role: l.role, brain_role: l.brain_role || null, count: l.count, count_low: l.count_low, count_high: l.count_high,
      monthly_gross: l.monthly_gross ?? sal(l.role), source: l.source, note: l.note || null }));
    // Subtotals of the lines shown (bpi-1.2.1)
    const sum = (f) => out.roster.reduce((a, l) => a + (f(l) || 0), 0);
    out.roster_total = { people: sum((l) => l.count), people_low: sum((l) => l.count_low ?? l.count), people_high: sum((l) => l.count_high ?? l.count),
      gross_monthly: sum((l) => (l.monthly_gross != null ? l.count * l.monthly_gross : 0)) };
  }
  if (est.investment) {
    out.investment = est.investment.lines.map((l) => ({ key: l.key, label: l.label, category: l.category, amount: l.amount, low: l.low, high: l.high,
      source_name: l.source_name || null, note: l.note || null }));
    out.surface_m2 = est.investment.surface_m2;
    const sum = (k) => out.investment.reduce((a, l) => a + (l[k] || 0), 0);
    out.investment_total = { amount: sum('amount'), low: sum('low'), high: sum('high') };
  }
  return out.roster || out.investment ? out : null;
}

/**
 * Figures shown back before generation. All numbers are copied from the resolver / engine output.
 * @param result resolveAssumptions() result
 * @param sc     runScenarios(result.inputs) or null when blocked
 */
function previewSummary(result, sc) {
  const out = {
    intake_version: INTAKE_VERSION,
    method_version: result.method_version,
    status: result.status,
    blocking: result.gaps.filter((g) => g.severity === 'blocking').map(({ path, message }) => ({ path, message })),
    warnings: result.gaps.filter((g) => g.severity === 'warning').map(({ path, message }) => ({ path, message })),
    flags: result.flags.map(({ code, severity, message, data }) => ({ code, severity, message, data: data || null })),
    estimates: result.assumptions.filter((a) => a.source_class === 'estimate' && !a.value_id).map((a) => a.parameter_key),
    estimated: estimatedLines(result),
  };
  if (!sc) return out;
  const b = sc.base;
  out.opening = b.opening;
  out.currency = b.currency;
  out.uses = { total: b.uses_of_funds.total, low: b.uses_of_funds.total_low, high: b.uses_of_funds.total_high,
    lines: b.uses_of_funds.lines.map((l) => ({ label: l.label, category: l.category, amount: l.amount })) };
  // Breakdown by category with an investment subtotal (bpi-1.2.1): sums of the engine's own lines.
  const NOT_INVESTMENT = ['deposit', 'key_money', 'cash_reserve'];
  const groups = [];
  for (const l of out.uses.lines) {
    const g = groups.find((x) => x.category === l.category);
    if (g) g.amount += l.amount; else groups.push({ category: l.category, amount: l.amount });
  }
  const order = (c) => (NOT_INVESTMENT.includes(c) ? 1 + NOT_INVESTMENT.indexOf(c) : 0);
  out.uses.groups = groups.sort((a, b) => order(a.category) - order(b.category));
  out.uses.investment_subtotal = groups.filter((g) => !NOT_INVESTMENT.includes(g.category)).reduce((a, g) => a + g.amount, 0);
  out.sources = {
    equity: b.sources_of_funds.equity, loans: b.sources_of_funds.loans_total, total: b.sources_of_funds.total,
    shareholders: (b.sources_of_funds.shareholders || []).map((h) => ({ label: h.label, amount: h.amount, price_factor: h.price_factor, share_of_capital: h.share_of_capital })),
  };
  out.loans = b.loans.map((l) => ({ amount: l.amount, annual_rate: l.annual_rate, term_months: l.term_months, payment: l.payment }));
  out.years = b.annual.map((a) => ({ year: a.year, revenue: a.revenue, ebitda: a.ebitda, ebitda_margin: a.ratios.ebitda, net_result: a.net_result, covers: a.covers, dscr: a.dscr }));
  out.min_cash = b.min_cash;
  out.conservative = { dscr: sc.conservative.annual.map((a) => a.dscr), min_cash: sc.conservative.min_cash };
  out.capacity = { seats: b.capacity.seats, services_per_week: b.capacity.services_per_week, max_covers_per_week: b.capacity.max_covers_per_week };
  out.engine_flags = b.flags.map(({ code, severity, message, data }) => ({ code, severity, message, data: data || null }));
  if (result.sizing) {
    const s = result.sizing;
    out.sizing = { reserve: s.reserve, total_uses: s.total_uses, founder: s.founder, partner: s.partner, loan: s.loan,
      target_share: s.target_share, price_factor_for_target: s.price_factor_for_target };
  }
  return out;
}

module.exports = { normalizeIntake, resolverConcept, formatFor, estimatesRequested, previewSummary, INTAKE_VERSION, SERVICE_IDS, CATEGORIES, ROLES, FORMATS, FORMAT_BY_TYPE };
