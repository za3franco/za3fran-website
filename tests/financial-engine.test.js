/* Run: node --test tests/*.test.js   (Node 18+; no dependencies)
 * Each "v13" test turns an error verified in bp_crrtest_canaille_v13 into an impossibility.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const replay = require('./fixtures/canaille-v13-replay.js');
const clone = (x) => JSON.parse(JSON.stringify(x));
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);

const base = E.computePlan(replay);

test('invariants hold on the Canaille replay', () => {
  assert.deepEqual(base.checks, { ok: true, errors: [] });
});

test('deterministic: same inputs, same outputs', () => {
  assert.deepEqual(E.computePlan(clone(replay)), base);
});

test('v13 #1: one revenue figure per year; quarters add up and each quarter = covers × ticket', () => {
  // v13 showed Y1 revenue 8,910,000 (cover, summary) and 7,509,600 (Section 10).
  // It also mis-multiplied Q1 (45×63×450 = 1,275,750, shown 1,276,350) and Q4 (75×63×450 = 2,126,250, shown 2,138,250).
  const y1 = base.annual[0];
  const quarters = [0, 3, 6, 9].map((i) => sum(base.months.slice(i, i + 3), (m) => m.revenue));
  assert.equal(sum(quarters), y1.revenue);
  for (const m of base.months) assert.equal(m.revenue, Math.round(m.covers * 450)); // VAT 0, single ticket, no split rounding
  const sc = E.runScenarios(replay);
  assert.equal(sc.summary.base.revenue, sc.base.annual[1].revenue); // every summary reads the same object
});

test('v13 #2: investment columns are sums of their lines; gap vs envelope is computed, not written', () => {
  // v13 showed the high column as 1,670,000; its lines sum to 2,070,000 (22% over 1,700,000).
  const u = base.uses_of_funds;
  assert.equal(u.total_high, 2070000);
  assert.equal(u.total_low, 1530000);
  assert.equal(base.funding_gap.high_case_vs_envelope_pct, 0.2176);
  assert.ok(base.flags.some((f) => f.code === 'FUNDING_GAP_BASE' || f.code === 'FUNDING_GAP_HIGH'));
});

test('v13 #3: payroll has one source; staffing figure × 12 = P&L payroll', () => {
  // v13: 65,813/month in staffing (≈790k/yr) vs 1,877,040 in the P&L.
  const inp = clone(replay);
  inp.labour = {
    employer_charges_pct: 0.2, extra_months: 1,
    roster: [
      { role: 'chef', count: 1, monthly_gross: 15000 },
      { role: 'cook', count: 3, monthly_gross: 5000 },
      { role: 'server', count: 4, monthly_gross: 4500 },
    ],
  };
  const o = E.computePlan(inp);
  const m = o.payroll.monthly_year1;
  assert.ok(Math.abs(m * 12 - o.annual[0].payroll) <= 12, `${m}×12 vs ${o.annual[0].payroll}`);
  assert.equal(o.payroll.monthly_year1, Math.round(sum(o.payroll.roster, (x) => x.count * x.monthly_gross) * (1 + 1 / 12) * 1.2));
  for (const mo of o.months.slice(0, 12)) assert.equal(mo.payroll, m);
});

test('v13 #4: EBITDA excludes depreciation; a loan always produces interest', () => {
  // v13's "EBITDA" deducted amortisation (it was EBIT) and the P&L had no interest on a 1,100,000 loan.
  for (const a of base.annual) {
    assert.equal(a.ebitda, a.gross_margin - a.payroll - a.rent - a.opex_total);
    assert.equal(a.ebit, a.ebitda - a.depreciation);
    assert.ok(a.depreciation > 0 && a.interest > 0);
  }
  // Plan's own cost lines, Y1 as printed: true EBITDA ≈ 2,178,700, not 1,985,520.
  const printed = 7509600 - 2252880 - 1877040 - 420000 - 180230 - 225288 - 150192 - 225288;
  assert.equal(printed, 2178682);
});

test('v13 #5: labour cost per cover = annual payroll / annual covers', () => {
  // v13 divided a monthly cost by seats and daily covers ("131 MAD").
  base.annual.forEach((a, i) => assert.equal(base.labour_cost_per_cover[i], Math.round((a.payroll / a.covers) * 100) / 100));
});

test('capacity: founder 100 covers/day on 50 seats and these hours needs 1.25 turns at every service', () => {
  const svc = [{ id: 'lunch', days: [2, 3, 4, 5], turns: 1 }, { id: 'dinner', days: [3, 4, 5, 6], turns: 1 }];
  const c100 = E.checkClaimedCovers({ seats: 50, services: svc, covers_per_day: 100 });
  assert.equal(c100.turns_needed_at_full_seats, 1.25);
  assert.equal(c100.feasible, false);
  assert.equal(E.checkClaimedCovers({ seats: 50, services: svc, covers_per_day: 87 }).turns_needed_at_full_seats, 1.09);
  assert.ok(base.flags.some((f) => f.code === 'CAPACITY_OCCUPANCY' && f.severity === 'critical'));
});

test('occupancy above 100% is rejected at input', () => {
  const inp = clone(replay); inp.services[0].occupancy = 1.2;
  assert.throws(() => E.computePlan(inp), /occupancy/);
});

test('loan schedule repays exactly the amount over the term', () => {
  const L = base.loans[0];
  assert.equal(sum(L.by_year, (y) => y.principal), 1100000);
  assert.equal(L.by_year[L.by_year.length - 1].closing_balance, 0);
  assert.equal(L.payment, 11312);
});

test('grace period: interest only, then amortisation', () => {
  const inp = clone(replay); inp.funding.loans[0].grace_months = 12;
  const o = E.computePlan(inp);
  assert.equal(o.annual[0].principal, 0);
  assert.ok(o.annual[0].interest > 0 && o.annual[1].principal > 0);
});

test('scenarios: conservative <= base <= optimistic, and ranges must be ordered', () => {
  const inp = clone(replay);
  inp.services.forEach((s) => { s.ticket = { base: 450, low: 380, high: 480, fav: 'high' }; });
  inp.cogs.food_pct = { base: 0.30, low: 0.28, high: 0.34, fav: 'low' };
  inp.rent.monthly = { base: 35000, low: 30000, high: 45000, fav: 'low' };
  const sc = E.runScenarios(inp);
  assert.ok(sc.summary.conservative.ebitda < sc.summary.base.ebitda);
  assert.ok(sc.summary.base.ebitda < sc.summary.optimistic.ebitda);
  inp.rent.monthly = { base: 35000, low: 40000, high: 45000, fav: 'low' };
  assert.throws(() => E.runScenarios(inp), /low <= base <= high/);
});

test('sensitivity grid: base cell equals the base case', () => {
  const sc = E.runScenarios(replay);
  assert.equal(sc.sensitivity.grid[1].cells[1].ebitda, sc.summary.base.ebitda);
  assert.ok(sc.sensitivity.grid[0].cells[0].ebitda < sc.summary.base.ebitda);
});

test('calendar: real weekday counts, closures and dated factors (e.g. Ramadan)', () => {
  const { counts } = E._internal.weekdayCounts({ y: 2027, m0: 1 }); // Feb 2027
  assert.equal(sum(counts), 28);
  const inp = clone(replay); inp.calendar = { dated_factors: { '2027-02': 0.5 }, closed_fraction: [0,0,0,0,0,0,0,0.5,0,0,0,0] };
  const o = E.computePlan(inp);
  const feb = o.months.find((m) => m.month === '2027-02'), febB = base.months.find((m) => m.month === '2027-02');
  assert.ok(Math.abs(feb.covers - febB.covers * 0.5) <= 1);
  const aug = o.months.find((m) => m.month === '2027-08'), augB = base.months.find((m) => m.month === '2027-08');
  assert.ok(Math.abs(aug.services - augB.services / 2) < 0.01);
});

test('VAT: guest price is converted to revenue excl. VAT', () => {
  const inp = clone(replay); inp.tax.vat_food = 0.10;
  const o = E.computePlan(inp);
  assert.ok(Math.abs(o.annual[2].revenue - base.annual[2].revenue / 1.1) <= 12);
});

test('tax: losses carry forward; minimum tax applies in a loss year', () => {
  const inp = clone(replay);
  inp.services.forEach((s) => { s.occupancy = [0.2, 0.9, 0.9]; });
  const o = E.computePlan(inp);
  assert.ok(o.annual[0].profit_before_tax < 0);
  assert.equal(o.annual[0].corporate_tax, Math.round(o.annual[0].revenue * 0.0025));
  const loss = -o.annual[0].profit_before_tax;
  assert.equal(o.annual[1].taxable_profit, Math.max(0, o.annual[1].profit_before_tax - loss));
});

test('cash plan: pre-opening + 24 months, balance is the running sum', () => {
  assert.equal(base.cash_plan.length, 25);
  assert.equal(base.cash_plan[0].balance, 1700000 - (1800000 - 175000)); // cash reserve stays in the bank
});

test('break-even: revenue at break-even gives EBIT ≈ 0', () => {
  const be = base.breakeven[1];
  const a = base.annual[1];
  const ebitAtBe = be.operating.revenue_year * (1 - be.variable_ratio) - be.operating.fixed_costs;
  assert.ok(Math.abs(ebitAtBe) < 5);
  assert.ok(be.operating.revenue_year < a.revenue);
});

/* ---- fe-1.1.0: minimum-tax exemption for a new company (Morocco: 36 months, CGI art. 144-I-D) ---- */

test('fe-1.1.0 — no exemption given: minimum tax unchanged from fe-1.0.0', () => {
  for (const a of base.annual) {
    const ms = base.months.filter((m) => m.year === a.year);
    assert.equal(a.minimum_tax, Math.round(Math.max(replay.tax.minimum_tax_pct_of_revenue * sum(ms, (m) => m.revenue),
      sum(ms, (m) => m.revenue) > 0 ? (replay.tax.minimum_tax_amount || 0) : 0)));
  }
});

test('fe-1.1.0 — 36-month exemption: no minimum tax in years 1 to 3; tax never rises', () => {
  const inp = clone(replay); inp.tax.minimum_tax_exempt_months = 36; inp.tax.minimum_tax_amount = 3000;
  const p = E.computePlan(inp);
  assert.deepEqual(p.checks, { ok: true, errors: [] });
  for (const a of p.annual) {
    assert.equal(a.minimum_tax, 0, `year ${a.year}`);
    assert.ok(a.corporate_tax <= base.annual[a.year - 1].corporate_tax, `year ${a.year} tax cannot rise`);
  }
});

test('fe-1.1.0 — 18-month exemption: year 2 minimum is based on its last 6 months only', () => {
  const inp = clone(replay); inp.tax.minimum_tax_exempt_months = 18;
  const p = E.computePlan(inp);
  const late = sum(p.months.filter((m) => m.index >= 18 && m.index < 24), (m) => m.revenue);
  assert.equal(p.annual[1].minimum_tax, Math.round(inp.tax.minimum_tax_pct_of_revenue * late));
  assert.equal(p.annual[0].minimum_tax, 0);
  assert.equal(p.annual[2].minimum_tax, base.annual[2].minimum_tax);
});

test('method version', () => assert.equal(E.METHOD_VERSION, 'fe-1.4.0'));

/* ---- fe-1.1.0: maintenance capex reserve (cash only) ---- */
test('fe-1.1.0 — capex reserve: P&L unchanged; cash, DSCR and payback lower', () => {
  const inp = clone(replay); inp.maintenance_capex = { pct_of_revenue: 0.02 };
  const p = E.computePlan(inp);
  assert.deepEqual(p.checks, { ok: true, errors: [] });
  p.annual.forEach((a, i) => {
    const b = base.annual[i];
    assert.equal(a.ebitda, b.ebitda); assert.equal(a.net_result, b.net_result);   // not a P&L line
    assert.equal(a.maintenance_capex, Math.round(sum(p.months.filter((m) => m.year === a.year), (m) => m.maintenance_capex)));
    assert.ok(a.maintenance_capex > 0);
    if (b.dscr != null) assert.ok(a.dscr < b.dscr, `Y${a.year} DSCR must fall`);
  });
  const last = (o) => o.cash_plan[o.cash_plan.length - 1].balance;
  assert.ok(last(p) < last(base));
  assert.ok(p.breakeven[1].cash.revenue_year > base.breakeven[1].cash.revenue_year);
  assert.equal(p.breakeven[1].operating.revenue_year, base.breakeven[1].operating.revenue_year);
});

test('fe-1.1.0 — capex reserve start_month: nothing set aside before it', () => {
  const inp = clone(replay); inp.maintenance_capex = { pct_of_revenue: 0.02, start_month: 12 };
  const p = E.computePlan(inp);
  assert.equal(p.annual[0].maintenance_capex, 0);
  assert.ok(p.annual[1].maintenance_capex > 0);
  assert.deepEqual(p.checks, { ok: true, errors: [] });
});

/* ---- fe-1.2.0: scenario method (revenue-side halfway) + stress; beverage-based opex ---- */
test('fe-1.2.0 — conservative moves revenue ranges halfway, costs stay at base; stress takes every worst end', () => {
  const inp = clone(replay);
  inp.services.forEach((s) => { s.ticket = { base: 450, low: 350, high: 500, fav: 'high' }; });
  inp.cogs.food_pct = { base: 0.30, low: 0.28, high: 0.34, fav: 'low' };
  assert.equal(E.pickScenario(inp, 'conservative', 'inputs').services[0].ticket, 400);
  assert.equal(E.pickScenario(inp, 'optimistic', 'inputs').services[0].ticket, 475);
  assert.equal(E.pickScenario(inp, 'conservative', 'inputs').cogs.food_pct, 0.30);
  assert.equal(E.pickScenario(inp, 'stress', 'inputs').cogs.food_pct, 0.34);
  assert.equal(E.pickScenario(inp, 'stress', 'inputs').services[0].ticket, 350);
  const sc = E.runScenarios(inp);
  assert.ok(sc.summary.stress.ebitda < sc.summary.conservative.ebitda);
  assert.deepEqual(sc.stress.checks, { ok: true, errors: [] });
  for (const p of ['inputs.services[0].occupancy', 'inputs.ramp.start_factor', 'inputs.calendar.seasonality[3]', 'inputs.calendar.dated_factors.2028-02', 'inputs.growth.price_pct'])
    assert.ok(E._internal.REVENUE_SIDE.test(p), p);
  for (const p of ['inputs.cogs.food_pct', 'inputs.rent.monthly', 'inputs.growth.cost_pct', 'inputs.labour.roster[0].monthly_gross', 'inputs.servicesX'])
    assert.ok(!E._internal.REVENUE_SIDE.test(p), p);
});

test('fe-1.2.0 — opex on beverage revenue: charged on beverage revenue only, break-even still consistent', () => {
  const withBev = clone(replay); withBev.services.forEach((s) => { s.bev_share = 0.35; });
  const ref = E.computePlan(withBev);
  const inp = clone(withBev); inp.opex = [...(inp.opex || []), { key: 'drinks_tax', pct_of_beverage_revenue: 0.1 }];
  const p = E.computePlan(inp);
  assert.deepEqual(p.checks, { ok: true, errors: [] });
  for (const m of p.months) { assert.ok(m.revenue_beverage > 0); assert.equal(m.opex.drinks_tax, Math.round(0.1 * m.revenue_beverage)); }
  assert.ok(p.breakeven[1].operating.revenue_year > ref.breakeven[1].operating.revenue_year);
});

/* ---- fe-1.3.0: shareholders ---- */
test('fe-1.3.0 — shareholders: equity is their sum, shares at face value', () => {
  const inp = clone(replay); delete inp.funding.equity;
  inp.funding.shareholders = [{ label: 'Founder', amount: 400000 }, { label: 'Partner', amount: 600000 }];
  const p = E.computePlan(inp);
  assert.deepEqual(p.checks, { ok: true, errors: [] });
  assert.equal(p.sources_of_funds.equity, 1000000);
  assert.deepEqual(p.sources_of_funds.shareholders.map((h) => h.share_of_capital), [0.4, 0.6]);
  inp.funding.equity = 900000;
  assert.throws(() => E.computePlan(inp), /sum of funding.shareholders/);
});
