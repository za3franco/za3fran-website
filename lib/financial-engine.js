/* lib/financial-engine.js
 * Za3fran universal financial engine — method version fe-1.0.0
 *
 * Pure module: inputs (plain JSON) -> outputs (plain JSON). No I/O, no model calls,
 * no randomness, no Date.now(). Same inputs always give the same outputs.
 *
 * Brain rule 1: every number that appears in a deliverable comes from here.
 * All money outputs are whole currency units. Every total is the sum of the
 * rounded lines shown, so a table always adds up.
 *
 * Accounting chain (one direction only):
 *   revenue (excl. VAT) - COGS = gross margin
 *   gross margin - payroll - rent - other opex = EBITDA
 *   EBITDA - depreciation = EBIT
 *   EBIT - interest = profit before tax
 *   profit before tax - corporate tax = net result
 *
 * Simplifications (stated in every plan's limits section):
 *   - Operating years run 12 months from opening, not calendar fiscal years.
 *   - VAT is neutral: prices are converted to excl.-VAT revenue; VAT cash timing is not modelled.
 *   - Capex amounts are entered excluding recoverable VAT.
 *   - Corporate tax for an operating year is paid in one amount after a lag.
 */
'use strict';

const METHOD_VERSION = 'fe-1.0.0';

/* ----------------------------- helpers ----------------------------- */

const r = (x) => Math.round(x);
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const yearOf = (m) => Math.floor(m / 12); // operating year index (0-based) for month index m

function fail(path, msg) {
  const e = new Error(`financial-engine: ${path}: ${msg}`);
  e.code = 'FE_INPUT';
  throw e;
}
function num(v, path, { min = -Infinity, max = Infinity } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, `expected a number, got ${JSON.stringify(v)}`);
  if (v < min || v > max) fail(path, `${v} outside [${min}, ${max}]`);
  return v;
}
function arr(v, path) {
  if (!Array.isArray(v)) fail(path, 'expected an array');
  return v;
}
const byYear = (v, y) => (Array.isArray(v) ? v[Math.min(y, v.length - 1)] : v);

/** Parse 'YYYY-MM' to {y, m0} (m0 = 0..11). */
function parseYM(s, path) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!m) fail(path, `expected 'YYYY-MM', got ${JSON.stringify(s)}`);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) fail(path, 'month out of range');
  return { y: Number(m[1]), m0: mo - 1 };
}
function addMonths({ y, m0 }, k) {
  const t = y * 12 + m0 + k;
  return { y: Math.floor(t / 12), m0: ((t % 12) + 12) % 12 };
}
const ymStr = ({ y, m0 }) => `${y}-${String(m0 + 1).padStart(2, '0')}`;

/** Count how many times each weekday (0=Sun..6=Sat) occurs in a calendar month. */
function weekdayCounts({ y, m0 }) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const days = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) counts[new Date(Date.UTC(y, m0, d)).getUTCDay()]++;
  return { counts, days };
}

/* --------------------------- scenarios ----------------------------- */

/**
 * A range node anywhere in the inputs: { base, low, high, fav: 'high'|'low' }.
 * fav says which end is good for the business (ticket: 'high'; rent: 'low').
 * conservative takes the unfavourable end, optimistic the favourable end.
 * Other keys on the node (source, unit, …) are ignored by the engine.
 */
function isRange(x) {
  return x && typeof x === 'object' && !Array.isArray(x) && 'base' in x && ('low' in x || 'high' in x);
}
function pickScenario(node, scenario, path) {
  if (isRange(node)) {
    const base = num(node.base, `${path}.base`);
    const low = 'low' in node ? num(node.low, `${path}.low`) : base;
    const high = 'high' in node ? num(node.high, `${path}.high`) : base;
    if (low > base || base > high) fail(path, `range must satisfy low <= base <= high (${low}, ${base}, ${high})`);
    if (scenario === 'base') return base;
    if (node.fav !== 'high' && node.fav !== 'low') fail(path, "range needs fav: 'high' or 'low'");
    const good = node.fav === 'high' ? high : low;
    const bad = node.fav === 'high' ? low : high;
    return scenario === 'optimistic' ? good : bad;
  }
  if (Array.isArray(node)) return node.map((x, i) => pickScenario(x, scenario, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) out[k] = pickScenario(node[k], scenario, `${path}.${k}`);
    return out;
  }
  return node;
}

/* ------------------------- default rules --------------------------- */

/** Red-flag thresholds. PROPOSED — pending Arnaud's review of the method (strategy §17). */
const DEFAULT_RULES = {
  max_cruise_occupancy: 0.85,      // seats filled per turn, any service, at cruise
  ebitda_margin_high: 0.22,        // above: unusually high for full-service, check
  ebitda_margin_low: 0.08,         // below: thin
  payroll_pct_band: [0.20, 0.38],  // of revenue excl. VAT
  rent_pct_max: 0.12,
  prime_cost_max: 0.65,            // COGS + payroll
  dscr_warn: 1.5,
  dscr_min: 1.25,
  payback_min_years: 2.0,          // a payback faster than this is flagged as implausible
};

/* ------------------------------ engine ----------------------------- */

/**
 * computePlan(inputs) — one scenario, plain numbers only (no range nodes).
 * See tests/fixtures for complete input examples.
 */
function computePlan(inp) {
  if (!inp || typeof inp !== 'object') fail('inputs', 'missing');
  const H = num(inp.horizon_months ?? 36, 'horizon_months', { min: 24, max: 120 });
  if (H % 12) fail('horizon_months', 'must be a multiple of 12');
  const Y = H / 12;
  const open = parseYM(inp.opening, 'opening');
  const rules = { ...DEFAULT_RULES, ...(inp.rules || {}) };

  /* ---- capacity & calendar ---- */
  const seats = num(inp.seats, 'seats', { min: 1 });
  const services = arr(inp.services, 'services').map((s, i) => {
    const p = `services[${i}]`;
    const days = arr(s.days, `${p}.days`);
    days.forEach((d, j) => num(d, `${p}.days[${j}]`, { min: 0, max: 6 }));
    if (new Set(days).size !== days.length) fail(`${p}.days`, 'duplicate weekday');
    return {
      id: String(s.id || `service${i}`),
      days,
      turns: num(s.turns, `${p}.turns`, { min: 0.1, max: 6 }),
      occupancy: s.occupancy, // number or per-year array, 0..1, checked below
      ticket: num(s.ticket, `${p}.ticket`, { min: 0 }),   // average spend per cover, as priced to the guest
      bev_share: num(s.bev_share ?? 0, `${p}.bev_share`, { min: 0, max: 1 }), // share of ticket that is beverage
    };
  });
  services.forEach((s, i) => {
    const occ = Array.isArray(s.occupancy) ? s.occupancy : [s.occupancy];
    occ.forEach((o, j) => num(o, `services[${i}].occupancy[${j}]`, { min: 0, max: 1 }));
  });
  const cal = inp.calendar || {};
  const seasonality = cal.seasonality || Array(12).fill(1);
  const closed = cal.closed_fraction || Array(12).fill(0);
  if (seasonality.length !== 12) fail('calendar.seasonality', 'needs 12 values (Jan..Dec)');
  if (closed.length !== 12) fail('calendar.closed_fraction', 'needs 12 values (Jan..Dec)');
  seasonality.forEach((v, i) => num(v, `calendar.seasonality[${i}]`, { min: 0, max: 3 }));
  closed.forEach((v, i) => num(v, `calendar.closed_fraction[${i}]`, { min: 0, max: 1 }));
  const dated = cal.dated_factors || {}; // { 'YYYY-MM': factor } e.g. Ramadan
  for (const k of Object.keys(dated)) { parseYM(k, `calendar.dated_factors.${k}`); num(dated[k], `calendar.dated_factors.${k}`, { min: 0, max: 3 }); }

  const ramp = inp.ramp || {};
  const rampCurve = ramp.curve ? arr(ramp.curve, 'ramp.curve') : null;
  const rampMonths = num(ramp.months_to_cruise ?? 0, 'ramp.months_to_cruise', { min: 0, max: 36 });
  const rampStart = num(ramp.start_factor ?? 1, 'ramp.start_factor', { min: 0, max: 1 });
  const rampAt = (m) => {
    if (rampCurve) return m < rampCurve.length ? num(rampCurve[m], `ramp.curve[${m}]`, { min: 0, max: 1.5 }) : 1;
    if (m >= rampMonths) return 1;
    return rampStart + (1 - rampStart) * (m / rampMonths);
  };

  const vatFood = num(inp.tax?.vat_food ?? 0, 'tax.vat_food', { min: 0, max: 0.5 });
  const vatBev = num(inp.tax?.vat_beverage ?? vatFood, 'tax.vat_beverage', { min: 0, max: 0.5 });
  const priceGrowth = num(inp.growth?.price_pct ?? 0, 'growth.price_pct', { min: -0.5, max: 1 });
  const costGrowth = num(inp.growth?.cost_pct ?? 0, 'growth.cost_pct', { min: -0.5, max: 1 });
  const wageGrowth = num(inp.growth?.wage_pct ?? costGrowth, 'growth.wage_pct', { min: -0.5, max: 1 });

  /* ---- costs ---- */
  const foodCost = num(inp.cogs?.food_pct, 'cogs.food_pct', { min: 0, max: 1 });
  const bevCost = num(inp.cogs?.beverage_pct ?? foodCost, 'cogs.beverage_pct', { min: 0, max: 1 });

  const lab = inp.labour || {};
  const charges = num(lab.employer_charges_pct ?? 0, 'labour.employer_charges_pct', { min: 0, max: 1 });
  const extraMonths = num(lab.extra_months ?? 0, 'labour.extra_months', { min: 0, max: 4 }); // 13th month etc.
  const roster = arr(lab.roster || [], 'labour.roster').map((x, i) => ({
    role: String(x.role || `role${i}`),
    count: num(x.count, `labour.roster[${i}].count`, { min: 0 }),
    monthly_gross: num(x.monthly_gross, `labour.roster[${i}].monthly_gross`, { min: 0 }),
  }));
  // Optional top-down payroll (used only to replay a plan that stated payroll as one figure).
  const payrollOverride = lab.annual_total != null ? num(lab.annual_total, 'labour.annual_total', { min: 0 }) : null;
  if (!roster.length && payrollOverride == null) fail('labour', 'needs a roster or annual_total');
  const rosterMonthlyY1 = sum(roster, (x) => x.count * x.monthly_gross) * (1 + extraMonths / 12) * (1 + charges);
  const headcount = sum(roster, (x) => x.count);

  const rent = inp.rent || {};
  const rentMonthly = num(rent.monthly ?? 0, 'rent.monthly', { min: 0 });
  const rentEsc = num(rent.escalation_pct ?? 0, 'rent.escalation_pct', { min: 0, max: 1 });
  const rentEvery = num(rent.escalation_every_years ?? 1, 'rent.escalation_every_years', { min: 1, max: 20 });
  const rentFree = num(rent.free_months ?? 0, 'rent.free_months', { min: 0, max: 24 });

  const opex = arr(inp.opex || [], 'opex').map((x, i) => ({
    key: String(x.key || `opex${i}`),
    label: x.label || x.key,
    fixed_monthly: num(x.fixed_monthly ?? 0, `opex[${i}].fixed_monthly`, { min: 0 }),
    pct_of_revenue: num(x.pct_of_revenue ?? 0, `opex[${i}].pct_of_revenue`, { min: 0, max: 1 }),
  }));
  const opexKeys = opex.map((o) => o.key);
  if (new Set(opexKeys).size !== opexKeys.length) fail('opex', 'duplicate key');

  /* ---- investment & funding ---- */
  const NOT_SPENT = new Set(['cash_reserve']); // stays in the bank at opening
  const capex = arr(inp.investment || [], 'investment').map((x, i) => {
    const p = `investment[${i}]`;
    const amount = num(x.amount, `${p}.amount`, { min: 0 });
    const low = num(x.low ?? amount, `${p}.low`, { min: 0 });
    const high = num(x.high ?? amount, `${p}.high`, { min: 0 });
    if (low > amount || amount > high) fail(p, 'needs low <= amount <= high');
    return {
      key: String(x.key || `line${i}`), label: x.label || x.key,
      category: String(x.category || 'other'),
      amount: r(amount), low: r(low), high: r(high),
      depreciation_years: num(x.depreciation_years ?? 0, `${p}.depreciation_years`, { min: 0, max: 50 }),
    };
  });
  const uses = {
    lines: capex,
    total: sum(capex, (x) => x.amount),
    total_low: sum(capex, (x) => x.low),
    total_high: sum(capex, (x) => x.high),
  };
  const fund = inp.funding || {};
  const equity = r(num(fund.equity ?? 0, 'funding.equity', { min: 0 }));
  const otherFunds = r(num(fund.other ?? 0, 'funding.other', { min: 0 }));
  const loans = arr(fund.loans || [], 'funding.loans').map((l, i) => ({
    label: l.label || `loan${i + 1}`,
    amount: r(num(l.amount, `funding.loans[${i}].amount`, { min: 0 })),
    annual_rate: num(l.annual_rate, `funding.loans[${i}].annual_rate`, { min: 0, max: 0.5 }),
    term_months: num(l.term_months, `funding.loans[${i}].term_months`, { min: 1, max: 360 }),
    grace_months: num(l.grace_months ?? 0, `funding.loans[${i}].grace_months`, { min: 0, max: 60 }),
  }));
  loans.forEach((l, i) => { if (l.grace_months >= l.term_months) fail(`funding.loans[${i}]`, 'grace must be shorter than term'); });
  const sources = { equity, loans_total: sum(loans, (l) => l.amount), other: otherFunds };
  sources.total = sources.equity + sources.loans_total + sources.other;
  const envelope = fund.envelope != null ? r(num(fund.envelope, 'funding.envelope', { min: 0 })) : sources.total;

  /* ---- tax ---- */
  const brackets = arr(inp.tax?.corporate_brackets || [{ upto: null, rate: 0 }], 'tax.corporate_brackets');
  brackets.forEach((b, i) => num(b.rate, `tax.corporate_brackets[${i}].rate`, { min: 0, max: 0.6 }));
  const minTaxPct = num(inp.tax?.minimum_tax_pct_of_revenue ?? 0, 'tax.minimum_tax_pct_of_revenue', { min: 0, max: 0.05 });
  const minTaxAmt = num(inp.tax?.minimum_tax_amount ?? 0, 'tax.minimum_tax_amount', { min: 0 });
  const lossYears = num(inp.tax?.loss_carryforward_years ?? 99, 'tax.loss_carryforward_years', { min: 0, max: 99 });
  const taxLag = num(inp.tax?.payment_lag_months ?? 3, 'tax.payment_lag_months', { min: 0, max: 12 });
  const corpTax = (profit) => {
    let left = Math.max(0, profit), prev = 0, t = 0;
    for (const b of brackets) {
      const cap = b.upto == null ? Infinity : b.upto;
      const slice = Math.max(0, Math.min(left, cap - prev));
      t += slice * b.rate; left -= slice; prev = cap;
      if (left <= 0) break;
    }
    return t;
  };

  const wc = inp.working_capital || {};
  const supplierDays = num(wc.supplier_days ?? 0, 'working_capital.supplier_days', { min: 0, max: 120 });

  /* ---- loan schedules (month -1 = drawdown, month 0 = first operating month) ---- */
  const loanSched = loans.map((l) => {
    const i = l.annual_rate / 12;
    const amortN = l.term_months - l.grace_months;
    const pmt = i === 0 ? l.amount / amortN : (l.amount * i) / (1 - Math.pow(1 + i, -amortN));
    let bal = l.amount;
    const rows = [];
    for (let k = 0; k < l.term_months; k++) {
      const interest = r(bal * i);
      let principal = k < l.grace_months ? 0 : r(pmt - bal * i);
      if (k === l.term_months - 1) principal = bal; // close exactly
      principal = Math.min(principal, bal);
      bal = bal - principal;
      rows.push({ month: k, interest, principal, balance: bal });
    }
    return { ...l, payment: r(pmt), rows };
  });
  const loanAt = (m, f) => sum(loanSched, (L) => (L.rows[m] ? L.rows[m][f] : 0));

  /* ---- depreciation ---- */
  const deprMonthlyFull = sum(capex, (x) => (x.depreciation_years > 0 && !NOT_SPENT.has(x.category) ? x.amount / (x.depreciation_years * 12) : 0));
  const deprEndMonth = (x) => x.depreciation_years * 12;

  /* ---- monthly operating model ---- */
  const months = [];
  for (let m = 0; m < H; m++) {
    const ym = addMonths(open, m);
    const y = yearOf(m);
    const { counts } = weekdayCounts(ym);
    const season = seasonality[ym.m0] * (dated[ymStr(ym)] ?? 1);
    const openShare = 1 - closed[ym.m0];
    const rf = rampAt(m);
    const priceIdx = Math.pow(1 + priceGrowth, y);

    let covers = 0, foodRev = 0, bevRev = 0, serviceCount = 0;
    const perService = {};
    let clamped = false, seatServices = 0;
    const openDays = counts.reduce((a, c, d) => a + (services.some((s) => s.days.includes(d)) ? c : 0), 0) * openShare;
    for (const s of services) {
      const n = sum(s.days, (d) => counts[d]) * openShare;           // service occurrences this month
      const occ = byYear(s.occupancy, y) * rf * season;
      const occCapped = Math.min(occ, 1);
      if (occ > 1 + 1e-9) clamped = true;
      const c = Math.round(seats * s.turns * occCapped * n); // whole guests; revenue is computed from these
      const ticket = s.ticket * priceIdx;
      const f = (c * ticket * (1 - s.bev_share)) / (1 + vatFood);
      const b = (c * ticket * s.bev_share) / (1 + vatBev);
      perService[s.id] = { services: n, covers: c, revenue: f + b };
      covers += c; foodRev += f; bevRev += b; serviceCount += n; seatServices += seats * s.turns * n;
    }
    const revenueFood = r(foodRev), revenueBev = r(bevRev);
    const revenue = revenueFood + revenueBev;
    const cogs = r(foodRev * foodCost) + r(bevRev * bevCost);

    const wageIdx = Math.pow(1 + wageGrowth, y);
    const payroll = r(payrollOverride != null ? (payrollOverride / 12) * wageIdx : rosterMonthlyY1 * wageIdx);
    const rentIdx = Math.pow(1 + rentEsc, Math.floor(y / rentEvery));
    const rentM = m < rentFree ? 0 : r(rentMonthly * rentIdx);
    const costIdx = Math.pow(1 + costGrowth, y);
    const opexLines = {};
    for (const o of opex) opexLines[o.key] = r(o.fixed_monthly * costIdx + o.pct_of_revenue * revenue);
    const opexTotal = sum(Object.values(opexLines));

    const ebitda = revenue - cogs - payroll - rentM - opexTotal;
    const depreciation = r(sum(capex, (x) => (x.depreciation_years > 0 && !NOT_SPENT.has(x.category) && m < deprEndMonth(x)
      ? x.amount / (x.depreciation_years * 12) : 0)));
    const ebit = ebitda - depreciation;
    const interest = loanAt(m, 'interest');
    const pbt = ebit - interest;

    months.push({
      index: m, month: ymStr(ym), year: y + 1,
      services: Math.round(serviceCount * 100) / 100,
      open_days: Math.round(openDays * 100) / 100,
      seat_services: seatServices,
      covers: r(covers),
      per_service: Object.fromEntries(Object.entries(perService).map(([k, v]) => [k, { services: Math.round(v.services * 100) / 100, covers: r(v.covers) }])),
      capacity_clamped: clamped,
      revenue_food: revenueFood, revenue_beverage: revenueBev, revenue,
      cogs, gross_margin: revenue - cogs,
      payroll, rent: rentM, opex: opexLines, opex_total: opexTotal,
      ebitda, depreciation, ebit, interest, profit_before_tax: pbt,
      principal: loanAt(m, 'principal'),
    });
  }

  /* ---- annual P&L, tax with loss carry-forward ---- */
  const annual = [];
  const lossPool = []; // { year, amount }
  for (let y = 0; y < Y; y++) {
    const ms = months.slice(y * 12, y * 12 + 12);
    const a = { year: y + 1, from: ms[0].month, to: ms[11].month };
    for (const k of ['covers', 'revenue_food', 'revenue_beverage', 'revenue', 'cogs', 'gross_margin', 'payroll', 'rent', 'opex_total', 'ebitda', 'depreciation', 'ebit', 'interest', 'profit_before_tax', 'principal']) {
      a[k] = sum(ms, (x) => x[k]);
    }
    a.opex = Object.fromEntries(opexKeys.map((k) => [k, sum(ms, (x) => x.opex[k])]));
    a.services = Math.round(sum(ms, (x) => x.services) * 100) / 100;
    // losses
    for (let i = lossPool.length - 1; i >= 0; i--) if (y + 1 - lossPool[i].year > lossYears) lossPool.splice(i, 1);
    let taxable = a.profit_before_tax;
    if (taxable > 0) {
      for (const L of lossPool) { const use = Math.min(L.amount, taxable); L.amount -= use; taxable -= use; }
    } else if (taxable < 0) {
      lossPool.push({ year: y + 1, amount: -taxable }); taxable = 0;
    }
    const minimum = Math.max(minTaxPct * a.revenue, a.revenue > 0 ? minTaxAmt : 0);
    a.taxable_profit = r(taxable);
    a.corporate_tax = r(Math.max(corpTax(taxable), minimum));
    a.net_result = a.profit_before_tax - a.corporate_tax;
    a.debt_service = a.interest + a.principal;
    a.dscr = a.debt_service > 0 ? round2((a.ebitda - a.corporate_tax) / a.debt_service) : null;
    a.ratios = ratios(a);
    annual.push(a);
  }

  /* ---- cash plan (pre-opening month + monthly) ---- */
  const spentAtOpening = sum(capex, (x) => (NOT_SPENT.has(x.category) ? 0 : x.amount));
  const cash = [];
  let bal = sources.total - spentAtOpening;
  cash.push({ index: -1, month: ymStr(addMonths(open, -1)), label: 'pre-opening', inflow_funding: sources.total, outflow_investment: spentAtOpening, net: bal, balance: bal });
  let prevPayables = 0;
  for (const mo of months) {
    const payables = r((mo.cogs * supplierDays) / 30);
    const dWC = payables - prevPayables; prevPayables = payables;
    let taxPaid = 0;
    // tax of operating year y is paid taxLag months after that year ends
    for (const a of annual) if ((a.year * 12 - 1) + taxLag === mo.index) taxPaid += a.corporate_tax;
    const net = mo.ebitda - mo.interest - mo.principal - taxPaid + dWC;
    bal += net;
    cash.push({ index: mo.index, month: mo.month, ebitda: mo.ebitda, interest: mo.interest, principal: mo.principal, tax_paid: taxPaid, working_capital: dWC, net, balance: bal });
  }
  const cash24 = cash.slice(0, 25); // pre-opening + 24 months
  const minCash = cash24.reduce((a, c) => (c.balance < a.balance ? c : a), cash24[0]);

  /* ---- break-even (on a given operating year's structure) ---- */
  const breakeven = annual.map((a) => breakevenFor(a, { months, opex }));

  /* ---- payback & returns ---- */
  const totalInvest = uses.total;
  let cum = 0, paybackYears = null;
  for (const a of annual) {
    const cf = a.ebitda - a.corporate_tax; // unlevered, after tax
    if (paybackYears == null && cum + cf >= totalInvest && cf > 0) paybackYears = round2(a.year - 1 + (totalInvest - cum) / cf);
    cum += cf;
  }

  /* ---- capacity summary ---- */
  const weeklyServices = services.map((s) => ({ id: s.id, per_week: s.days.length, turns: s.turns, max_covers_per_service: seats * s.turns }));
  const capacity = {
    seats,
    services_per_week: sum(services, (s) => s.days.length),
    open_days_per_week: new Set(services.flatMap((s) => s.days)).size,
    max_covers_per_week: r(sum(services, (s) => seats * s.turns * s.days.length)),
    services: weeklyServices,
    any_month_clamped: months.some((x) => x.capacity_clamped),
  };

  const out = {
    method_version: METHOD_VERSION,
    currency: inp.currency || null,
    opening: ymStr(open),
    capacity,
    uses_of_funds: uses,
    sources_of_funds: sources,
    funding_envelope: envelope,
    funding_gap: { base: sources.total - uses.total, low_case: sources.total - uses.total_low, high_case: sources.total - uses.total_high,
      high_case_vs_envelope_pct: envelope ? round4(uses.total_high / envelope - 1) : null,
      low_case_vs_envelope_pct: envelope ? round4(uses.total_low / envelope - 1) : null },
    payroll: {
      method: payrollOverride != null ? 'annual_total' : 'roster',
      headcount: roster.length ? headcount : null,
      monthly_year1: r(payrollOverride != null ? payrollOverride / 12 : rosterMonthlyY1),
      annual_year1: annual[0].payroll,
      roster: roster.map((x) => ({ ...x, monthly_cost: r(x.count * x.monthly_gross * (1 + extraMonths / 12) * (1 + charges)) })),
    },
    loans: loanSched.map((L) => ({ label: L.label, amount: L.amount, annual_rate: L.annual_rate, term_months: L.term_months, grace_months: L.grace_months, payment: L.payment,
      by_year: Array.from({ length: Math.ceil(L.term_months / 12) }, (_, y) => {
        const rs = L.rows.slice(y * 12, y * 12 + 12);
        return { year: y + 1, interest: sum(rs, (x) => x.interest), principal: sum(rs, (x) => x.principal), closing_balance: rs[rs.length - 1].balance };
      }) })),
    months,
    annual,
    cash_plan: cash24,
    min_cash: { month: minCash.month, balance: minCash.balance },
    breakeven,
    payback_years: paybackYears,
    labour_cost_per_cover: annual.map((a) => (a.covers ? round2(a.payroll / a.covers) : null)),
  };
  out.flags = redFlags(out, inp, services, seats, rules);
  out.checks = invariants(out);
  return out;
}

function round2(x) { return Math.round(x * 100) / 100; }
function round4(x) { return Math.round(x * 10000) / 10000; }

function ratios(a) {
  const p = (x) => (a.revenue ? round4(x / a.revenue) : null);
  return {
    cogs: p(a.cogs), gross_margin: p(a.gross_margin), payroll: p(a.payroll), rent: p(a.rent),
    prime_cost: p(a.cogs + a.payroll), opex: p(a.opex_total), ebitda: p(a.ebitda), ebit: p(a.ebit), net: p(a.net_result ?? 0),
    average_ticket_excl_vat: a.covers ? round2(a.revenue / a.covers) : null,
  };
}

/**
 * Break-even for one operating year.
 *   variable ratio = (COGS + revenue-driven opex) / revenue
 *   operating break-even (EBIT = 0):   (payroll + rent + fixed opex + depreciation) / (1 - variable ratio)
 *   cash break-even (cash flow = 0):   (payroll + rent + fixed opex + interest + principal) / (1 - variable ratio)
 * Expressed as revenue per year and per month, covers per open day, and seat occupancy.
 */
function breakevenFor(a, ctx) {
  const pctSum = sum(ctx.opex, (o) => o.pct_of_revenue);
  if (!a.revenue) return { year: a.year, operating: null, cash: null };
  const varRatio = a.cogs / a.revenue + pctSum;
  const fixedOpex = a.opex_total - pctSum * a.revenue;
  const cm = 1 - varRatio;
  const ticket = a.revenue / a.covers; // excl. VAT, this year's mix
  const ms = ctx.months.filter((x) => x.year === a.year);
  const openDays = sum(ms, (x) => x.open_days);
  const seatServices = sum(ms, (x) => x.seat_services); // seats × turns × service occurrences
  const point = (fixed) => {
    if (cm <= 0) return { revenue_year: null, revenue_month: null, covers_per_open_day: null, occupancy: null, note: 'variable costs exceed revenue' };
    const rev = fixed / cm;
    const covers = rev / ticket;
    return {
      fixed_costs: r(fixed),
      revenue_year: r(rev), revenue_month: r(rev / 12),
      covers_year: r(covers), covers_per_open_day: round2(covers / openDays),
      occupancy: round4(covers / seatServices),
    };
  };
  return {
    year: a.year,
    variable_ratio: round4(varRatio),
    operating: point(a.payroll + a.rent + fixedOpex + a.depreciation),
    cash: point(a.payroll + a.rent + fixedOpex + a.interest + a.principal),
  };
}

/* ----------------------------- flags ------------------------------- */

function redFlags(out, inp, services, seats, R) {
  const flags = [];
  const add = (code, severity, message, data) => flags.push({ code, severity, message, data });

  for (const s of services) {
    const yrs = Array.isArray(s.occupancy) ? s.occupancy : [s.occupancy];
    yrs.forEach((o, y) => {
      if (o > R.max_cruise_occupancy) add('CAPACITY_OCCUPANCY', o >= 0.95 ? 'critical' : 'warning',
        `${s.id}: cruise occupancy ${Math.round(o * 100)}% of ${seats} seats × ${s.turns} turn(s) in year ${y + 1}, above ${Math.round(R.max_cruise_occupancy * 100)}%`,
        { service: s.id, year: y + 1, occupancy: o, covers_per_service: Math.round(seats * s.turns * o) });
    });
  }
  if (out.capacity.any_month_clamped) add('CAPACITY_CLAMPED', 'critical', 'Seasonal peaks exceed physical capacity in at least one month; covers were capped at seats × turns', null);

  const fg = out.funding_gap;
  if (fg.base < 0) add('FUNDING_GAP_BASE', 'critical', `Uses exceed sources by ${-fg.base}`, { gap: fg.base });
  else if (fg.high_case < 0) add('FUNDING_GAP_HIGH', 'warning', `High-case investment exceeds sources by ${-fg.high_case}`, { gap: fg.high_case, vs_envelope_pct: fg.high_case_vs_envelope_pct });
  if (out.min_cash.balance < 0) add('CASH_NEGATIVE', 'critical', `Cash goes negative (${out.min_cash.balance}) in ${out.min_cash.month}`, out.min_cash);

  out.annual.forEach((a) => {
    const q = a.ratios;
    if (a.year === 1) return; // ramp year: margins are not representative
    if (q.ebitda != null && q.ebitda > R.ebitda_margin_high) add('EBITDA_MARGIN_HIGH', 'warning', `Year ${a.year} EBITDA margin ${pct(q.ebitda)} is unusually high for the format`, { year: a.year, value: q.ebitda });
    if (q.ebitda != null && q.ebitda < R.ebitda_margin_low) add('EBITDA_MARGIN_LOW', 'warning', `Year ${a.year} EBITDA margin ${pct(q.ebitda)} is thin`, { year: a.year, value: q.ebitda });
    if (q.payroll != null && (q.payroll < R.payroll_pct_band[0] || q.payroll > R.payroll_pct_band[1])) add('PAYROLL_OUT_OF_BAND', 'warning', `Year ${a.year} payroll ${pct(q.payroll)} of revenue, outside ${pct(R.payroll_pct_band[0])}–${pct(R.payroll_pct_band[1])}`, { year: a.year, value: q.payroll });
    if (q.rent != null && q.rent > R.rent_pct_max) add('RENT_HIGH', 'warning', `Year ${a.year} rent ${pct(q.rent)} of revenue`, { year: a.year, value: q.rent });
    if (q.prime_cost != null && q.prime_cost > R.prime_cost_max) add('PRIME_COST_HIGH', 'warning', `Year ${a.year} prime cost ${pct(q.prime_cost)}`, { year: a.year, value: q.prime_cost });
  });
  out.annual.forEach((a) => {
    if (a.dscr == null) return;
    if (a.dscr < 1) add('DSCR_BELOW_1', 'critical', `Year ${a.year} DSCR ${a.dscr}: operations do not cover debt service`, { year: a.year, dscr: a.dscr });
    else if (a.dscr < R.dscr_min) add('DSCR_LOW', 'critical', `Year ${a.year} DSCR ${a.dscr} below ${R.dscr_min}`, { year: a.year, dscr: a.dscr });
    else if (a.dscr < R.dscr_warn) add('DSCR_TIGHT', 'warning', `Year ${a.year} DSCR ${a.dscr} below ${R.dscr_warn}`, { year: a.year, dscr: a.dscr });
  });
  if (out.payback_years != null && out.payback_years < R.payback_min_years) add('PAYBACK_IMPLAUSIBLE', 'warning', `Payback ${out.payback_years} years is faster than ${R.payback_min_years}; check revenue and cost assumptions`, { years: out.payback_years });
  if (out.sources_of_funds.loans_total > 0 && out.annual.every((a) => a.interest === 0)) add('NO_INTEREST', 'critical', 'Loan present but no interest charged', null);
  return flags;
}
const pct = (x) => `${Math.round(x * 1000) / 10}%`;

/* --------------------------- invariants ---------------------------- */
/** Identities that must hold for every output. Any failure is a bug in the engine. */
function invariants(o) {
  const errs = [];
  const eq = (a, b, what) => { if (a !== b) errs.push(`${what}: ${a} != ${b}`); };
  eq(o.uses_of_funds.total, sum(o.uses_of_funds.lines, (x) => x.amount), 'uses total');
  eq(o.uses_of_funds.total_high, sum(o.uses_of_funds.lines, (x) => x.high), 'uses high total');
  eq(o.uses_of_funds.total_low, sum(o.uses_of_funds.lines, (x) => x.low), 'uses low total');
  for (const m of o.months) {
    eq(m.revenue, m.revenue_food + m.revenue_beverage, `${m.month} revenue split`);
    eq(m.gross_margin, m.revenue - m.cogs, `${m.month} gross margin`);
    eq(m.ebitda, m.gross_margin - m.payroll - m.rent - m.opex_total, `${m.month} EBITDA`);
    eq(m.ebit, m.ebitda - m.depreciation, `${m.month} EBIT`);
    eq(m.profit_before_tax, m.ebit - m.interest, `${m.month} PBT`);
  }
  for (const a of o.annual) {
    const ms = o.months.filter((x) => x.year === a.year);
    eq(a.revenue, sum(ms, (x) => x.revenue), `Y${a.year} revenue = sum of months`);
    eq(a.ebitda, a.gross_margin - a.payroll - a.rent - a.opex_total, `Y${a.year} EBITDA chain`);
    eq(a.ebit, a.ebitda - a.depreciation, `Y${a.year} EBIT chain`);
    eq(a.net_result, a.ebit - a.interest - a.corporate_tax, `Y${a.year} net chain`);
  }
  let bal = 0;
  for (const c of o.cash_plan) { bal += c.net; eq(c.balance, bal, `cash ${c.month}`); }
  return { ok: errs.length === 0, errors: errs };
}


/* ------------------- scenarios, sensitivity, claims ------------------- */

const clone = (x) => JSON.parse(JSON.stringify(x));
const minDscr = (o) => { const d = o.annual.map((a) => a.dscr).filter((x) => x != null); return d.length ? Math.min(...d) : null; };
const keyYear = (o) => o.annual[Math.min(1, o.annual.length - 1)]; // first full year after ramp

/** Apply a shock to resolved (plain-number) inputs. */
function shock(inputs, { ticket = 1, occupancy = 1, food_cost_pts = 0, payroll = 1, rent = 1 } = {}) {
  const x = clone(inputs);
  x.services = x.services.map((s) => ({
    ...s,
    ticket: s.ticket * ticket,
    occupancy: Array.isArray(s.occupancy) ? s.occupancy.map((o) => Math.min(1, o * occupancy)) : Math.min(1, s.occupancy * occupancy),
  }));
  x.cogs = { ...x.cogs, food_pct: Math.min(1, x.cogs.food_pct + food_cost_pts) };
  if (x.labour.annual_total != null) x.labour.annual_total *= payroll;
  if (x.labour.roster) x.labour.roster = x.labour.roster.map((rr) => ({ ...rr, monthly_gross: rr.monthly_gross * payroll }));
  if (x.rent) x.rent = { ...x.rent, monthly: (x.rent.monthly || 0) * rent };
  return x;
}

function summary(o) {
  const k = keyYear(o);
  return { key_year: k.year, revenue: k.revenue, ebitda: k.ebitda, ebitda_margin: k.ratios.ebitda, net_result: k.net_result, min_dscr: minDscr(o), min_cash: o.min_cash.balance, min_cash_month: o.min_cash.month };
}

/** Ticket × covers grid plus single-factor shocks, all on the base inputs. */
function sensitivity(baseInputs) {
  const T = [0.9, 1, 1.1], C = [0.8, 1, 1.2];
  const grid = C.map((c) => ({ covers_factor: c, cells: T.map((t) => ({ ticket_factor: t, ...summary(computePlan(shock(baseInputs, { ticket: t, occupancy: c }))) })) }));
  const singles = [
    ['ticket_-10', { ticket: 0.9 }], ['covers_-20', { occupancy: 0.8 }], ['food_cost_+3pts', { food_cost_pts: 0.03 }],
    ['payroll_+10', { payroll: 1.1 }], ['rent_+20', { rent: 1.2 }],
  ].map(([id, sh]) => ({ id, ...summary(computePlan(shock(baseInputs, sh))) }));
  return { grid, singles };
}

/**
 * runScenarios(rangedInputs): inputs may hold range nodes { base, low, high, fav }.
 * Returns the three cases plus sensitivity around the base case.
 */
function runScenarios(rangedInputs) {
  const out = {};
  for (const sc of ['base', 'conservative', 'optimistic']) {
    const resolved = pickScenario(rangedInputs, sc, 'inputs');
    out[sc] = computePlan(resolved);
    if (sc === 'base') out.base_inputs = resolved;
  }
  out.sensitivity = sensitivity(out.base_inputs);
  out.summary = { base: summary(out.base), conservative: summary(out.conservative), optimistic: summary(out.optimistic) };
  return out;
}

/**
 * checkClaimedCovers — what a stated "covers per day" means physically.
 * Spreads the weekly covers over every service (equal split) and reports seat occupancy per service.
 */
function checkClaimedCovers({ seats, services, covers_per_day }) {
  const openDays = new Set(services.flatMap((s) => s.days)).size;
  const perWeek = covers_per_day * openDays;
  const svcPerWeek = sum(services, (s) => s.days.length);
  const perService = perWeek / svcPerWeek;
  const rows = services.map((s) => ({ id: s.id, turns: s.turns, covers_per_service: round2(perService), occupancy: round4(perService / (seats * s.turns)) }));
  return {
    covers_per_day, open_days_per_week: openDays, covers_per_week: perWeek, services_per_week: svcPerWeek,
    covers_per_service: round2(perService), turns_needed_at_full_seats: round2(perService / seats),
    services: rows, feasible: rows.every((x) => x.occupancy <= DEFAULT_RULES.max_cruise_occupancy),
  };
}

module.exports = { computePlan, runScenarios, sensitivity, shock, checkClaimedCovers, pickScenario, METHOD_VERSION, DEFAULT_RULES, _internal: { weekdayCounts, parseYM, isRange } };
