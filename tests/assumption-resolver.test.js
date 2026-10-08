/* Run: node --test tests/*.test.js
 * Assumption resolver (ar-1.0.0): four source classes, ranges into scenarios, founder covers,
 * review queue, blocking gaps. Brain data is TEST DATA (tests/fixtures/resolver-brain-test.js).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const T = require('./fixtures/resolver-brain-test.js');
const clone = (x) => JSON.parse(JSON.stringify(x));

const run = (over = {}) => R.resolveAssumptions({
  concept: over.concept || T.concept, intake: over.intake || T.intake, market: T.market, format: 'bistro_wine_bar',
  brain: over.brain || { parameters: T.parameters, values: T.values }, options: over.options || {},
});
const res = run();
const row = (p) => res.assumptions.find((a) => a.parameter_key === p);

test('ready: no blocking gap with complete founder + Brain data', () => {
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps));
  assert.ok(res.inputs);
});

test('source 1 — founder figure wins and carries its own note', () => {
  assert.equal(res.inputs.seats, 50);
  assert.equal(row('seats').source_class, 'founder');
  const mgr = res.inputs.labour.roster.find((x) => x.role === 'manager');
  assert.equal(mgr.monthly_gross, 13000);                         // founder salary beats the Brain's 12,000
  assert.equal(row('labour.roster.manager.monthly_gross').source_class, 'founder');
  assert.equal(row('funding.loan.amount').founder_note, 'Loan request from the intake');
  assert.equal(res.inputs.funding.loans[0].term_months, 84);      // founder term, plain number
});

test('source 2 — Za3fran verified beats published, even at a less specific market level', () => {
  const r = row('funding.loan.annual_rate');
  assert.equal(r.source_class, 'za3fran_verified');
  assert.equal(r.value_num, 0.065);
  assert.deepEqual(res.inputs.funding.loans[0].annual_rate, { base: 0.065, low: 0.055, high: 0.075, fav: 'low' });
});

test('source 3 — published beats estimate; a lapsed verification counts as published', () => {
  const r = row('rent.monthly');
  assert.equal(r.source_class, 'published');                      // city published 200/m² beats district estimate 260
  assert.equal(res.inputs.rent.monthly.base, 200 * 160);
  const brain = { parameters: T.parameters, values: clone(T.values) };
  const v = brain.values.find((x) => x.parameter_key === 'finance.sme_lending_rate' && x.market_id === T.ids.MA);
  v.effective_source_class = 'published'; v.effective_status = 'researched'; // refresh date passed
  v.market_id = 'm-other';                                         // and remove it from the chain
  const r2 = run({ brain });
  assert.equal(r2.assumptions.find((a) => a.parameter_key === 'funding.loan.annual_rate').value_num, 0.09);
});

test('source 4 — estimate is always a range and reaches the scenarios', () => {
  const est = res.assumptions.filter((a) => a.source_class === 'estimate');
  assert.ok(est.length >= 8);
  for (const a of est) if (a.value_json == null) assert.ok(a.low != null && a.high != null, a.parameter_key);
  assert.deepEqual(res.inputs.cogs.food_pct, { base: 0.3, low: 0.28, high: 0.34, fav: 'low' });
  const sc = E.runScenarios(res.inputs);
  for (const k of ['base', 'conservative', 'optimistic']) assert.deepEqual(sc[k].checks, { ok: true, errors: [] }, k);
  assert.ok(sc.summary.conservative.ebitda < sc.summary.base.ebitda);
  assert.ok(sc.summary.base.ebitda < sc.summary.optimistic.ebitda);
  assert.ok(sc.conservative.annual[1].revenue < sc.optimistic.annual[1].revenue);
});

test('founder covers: 100/day on 50 seats is never passed above the 85% cap', () => {
  for (const s of res.inputs.services) {
    assert.equal(s.occupancy.base, 0.85);
    assert.equal(s.occupancy.high, 0.85);                          // not in the optimistic case either
    assert.ok(s.occupancy.low < 0.85);
  }
  const f = res.flags.find((x) => x.code === 'FOUNDER_COVERS_ABOVE_CAP');
  assert.ok(f); assert.equal(f.severity, 'critical');
  assert.equal(f.data.turns_needed_at_full_seats, 1.25);           // 100/day x 5 days / 8 services = 62.5 on 50 seats
  assert.match(row('services.lunch.occupancy').founder_note || row('services.lunch.occupancy').note, /capped at 85%/);
  const sc = E.runScenarios(res.inputs);
  for (const k of ['base', 'conservative', 'optimistic']) assert.ok(!sc[k].flags.some((x) => x.code === 'CAPACITY_OCCUPANCY'), k);
});

test('founder covers within the cap are used as given', () => {
  const r = run({ concept: { ...T.concept, covers: '60' } });       // 60/day -> 37.5 per service -> 75%
  for (const s of r.inputs.services) assert.equal(s.occupancy.base, 0.75);
  assert.ok(!r.flags.some((x) => x.code === 'FOUNDER_COVERS_ABOVE_CAP'));
});

test('no founder covers: occupancy comes from the format benchmark, per service', () => {
  const r = run({ concept: { ...T.concept, covers: '' } });
  assert.deepEqual(r.inputs.services.map((s) => s.occupancy.base), [0.55, 0.7]);
  assert.equal(r.assumptions.find((a) => a.parameter_key === 'services.dinner.occupancy').source_class, 'estimate');
});

test('single concept ticket on two services is flagged; founder vs Brain disagreement goes to review', () => {
  assert.ok(res.flags.some((x) => x.code === 'SINGLE_TICKET'));
  const ev = res.review.find((x) => x.reason === 'founder_evidence' && x.detail.path === 'services.dinner.ticket');
  assert.ok(ev);                                                    // 450 outside the Brain's 300–420
  assert.equal(res.inputs.services[1].ticket, 450);                 // ...but the founder figure is still used
  assert.ok(!res.review.some((x) => x.reason === 'founder_evidence' && x.detail.path.includes('manager'))); // 13,000 inside 10–15k
});

test('review queue: regulatory unverified values and >5% impact values are raised; small ones are not', () => {
  const reasons = (k) => res.review.filter((x) => x.parameter_key === k).map((x) => x.reason);
  assert.ok(reasons('tax.vat_food_service').includes('regulatory'));
  assert.ok(reasons('regulation.alcohol_licence').includes('regulatory'));
  assert.ok(!reasons('finance.sme_lending_rate').includes('regulatory'));  // verified
  assert.ok(reasons('property.key_money').includes('impact_over_5pct'));   // +200k on ~1.7M
  assert.ok(!reasons('operating.card_fee_pct').includes('impact_over_5pct'));
  for (const x of res.impact) assert.equal(x.over_threshold, x.investment_delta_pct > 0.05 || x.breakeven_delta_pct > 0.05);
  const keys = res.review.map((x) => `${x.value_id}|${x.reason}`);
  assert.equal(new Set(keys).size, keys.length);                    // one open item per value and reason
});

test('out-of-range Brain value is not used silently', () => {
  const brain = { parameters: T.parameters, values: clone(T.values) };
  brain.values.find((x) => x.parameter_key === 'benchmark.food_cost_pct').value_num = 0.7;
  brain.values.find((x) => x.parameter_key === 'benchmark.food_cost_pct').high = 0.8;
  const r = run({ brain });
  assert.equal(r.status, 'blocked');
  assert.ok(r.review.some((x) => x.reason === 'out_of_range'));
  assert.ok(r.gaps.some((g) => g.path === 'cogs.food_pct' && g.severity === 'blocking'));
});

test('blocking gaps: no tax data, no roster, no opening -> blocked, no inputs', () => {
  const brain = { parameters: T.parameters, values: T.values.filter((v) => !v.parameter_key.startsWith('tax.')) };
  const r = run({ brain, intake: { ...T.intake, roster: [], opening: undefined } });
  assert.equal(r.status, 'blocked');
  assert.equal(r.inputs, null);
  const paths = r.gaps.filter((g) => g.severity === 'blocking').map((g) => g.path);
  for (const p of ['tax.corporate_brackets', 'tax.vat_food', 'labour.roster', 'opening']) assert.ok(paths.includes(p), p);
});

test('rows for project_assumptions satisfy the table constraints and are unique per run', () => {
  const rows = R.dbRows(res, { projectId: 'p', runId: 'r' });
  for (const x of rows) {
    assert.ok(['founder', 'za3fran_verified', 'published', 'estimate'].includes(x.source_class));
    assert.ok(x.source_class === 'founder' || x.value_id || x.source_class === 'estimate', x.parameter_key);
    assert.ok(x.unit);
    assert.equal(x.method_version, `${E.METHOD_VERSION}+${R.RESOLVER_VERSION}`);
  }
  const k = rows.map((x) => `${x.parameter_key}|${x.qualifier}`);
  assert.equal(new Set(k).size, k.length);
});

test('deterministic: same inputs, same resolution', () => {
  assert.deepEqual(run(), res);
});

/* --------------------------- ar-1.1.0 --------------------------- */

test('ar-1.1.0 — Ramadan choice is required', () => {
  const r = run({ intake: { ...T.intake, ramadan: undefined } });
  assert.equal(r.status, 'blocked');
  assert.ok(r.gaps.some((g) => g.path === 'calendar.ramadan' && g.severity === 'blocking'));
});

test('ar-1.1.0 — month shares come from the Ramadan windows (dates inclusive)', () => {
  const sh = R.ramadanShares([{ start: '2028-01-28', end: '2028-02-26' }]);
  assert.equal(Math.round(sh['2028-01'] * 31), 4);                 // 28-31 Jan
  assert.equal(Math.round(sh['2028-02'] * 29), 26);                // 1-26 Feb (leap year)
});

test('ar-1.1.0 — closed: share of the month open; other dated events still multiply', () => {
  const r = run({ intake: { ...T.intake, ramadan: 'closed' } });
  const d = r.inputs.calendar.dated_factors;
  assert.equal(d['2028-01'], Math.round((1 - 4 / 31) * 1e4) / 1e4);
  assert.equal(d['2028-02'], Math.round((1 - 26 / 29) * 0.6 * 1e4) / 1e4); // Brain test event 0.6 in 2028-02
  assert.equal(typeof d['2028-01'], 'number');                       // closure is a choice, not a range
});

test('ar-1.1.0 — reduced: trading-level range reaches the scenarios', () => {
  const d = res.inputs.calendar.dated_factors['2029-02'];
  assert.equal(d.fav, 'high');
  assert.ok(d.low < d.base && d.base < d.high);
  const sc = E.runScenarios(res.inputs);
  const feb = (k) => sc[k].months.find((m) => m.month === '2029-02').revenue;
  assert.ok(feb('conservative') < feb('optimistic'));
});

test('ar-1.1.0 — normal: no Ramadan factors at all', () => {
  const r = run({ intake: { ...T.intake, ramadan: 'normal' } });
  assert.deepEqual(r.inputs.calendar.dated_factors, { '2028-02': 0.6 });
});

test('ar-1.1.0 — seasonality stored as {base, low, high} becomes per-month ranges', () => {
  const brain = { parameters: T.parameters, values: clone(T.values) };
  brain.values.find((v) => v.parameter_key === 'calendar.seasonality').value_json = { base: Array(12).fill(1), low: Array(12).fill(0.9), high: Array(12).fill(1.1) };
  const r = run({ brain });
  assert.deepEqual(r.inputs.calendar.seasonality[7], { base: 1, low: 0.9, high: 1.1, fav: 'high' });
  assert.ok(r.impact.some((x) => x.path_label === 'calendar.seasonality'));
  const sc = E.runScenarios(r.inputs);
  for (const k of ['base', 'conservative', 'optimistic']) assert.deepEqual(sc[k].checks, { ok: true, errors: [] }, k);
});

test('ar-1.1.0 — rent escalation from the Brain reaches the engine (ar-1.0.0 bug)', () => {
  const brain = { parameters: T.parameters, values: [...clone(T.values),
    { ...clone(T.values[0]), id: 'v-esc', parameter_key: 'property.rent_escalation', value_json: { escalation_pct: 0.1, escalation_every_years: 3 } }] };
  const r = run({ brain });
  assert.equal(r.inputs.rent.escalation_pct, 0.1);
  assert.equal(r.inputs.rent.escalation_every_years, 3);
});

test('ar-1.1.0 — minimum-tax exemption applies to a new company only', () => {
  assert.equal(res.inputs.tax.minimum_tax_exempt_months, 36);
  const r = run({ intake: { ...T.intake, new_company: false } });
  assert.equal(r.inputs.tax.minimum_tax_exempt_months, undefined);
});

test('ar-1.1.0 — maintenance capex reserve from the format benchmark, as a range', () => {
  assert.deepEqual(res.inputs.maintenance_capex.pct_of_revenue, { base: 0.025, low: 0.015, high: 0.04, fav: 'low' });
});

test('ar-1.1.0 — estimate lines from the intake are labelled estimate, not founder', () => {
  const intake = clone(T.intake);
  intake.investment[0] = { ...intake.investment[0], source: 'estimate', source_name: 'Za3fran research', note: '170 m2 x 3,000/m2' };
  intake.roster[0] = { ...intake.roster[0], source: 'estimate', count_low: 1, count_high: 1 };
  intake.roster.push({ role: 'founder_floor', brain_role: 'manager', count: 1, source: 'estimate' });
  const r = run({ intake });
  const a = (p) => r.assumptions.find((x) => x.parameter_key === p);
  assert.equal(a('investment.fitout').source_class, 'estimate');
  assert.equal(a('investment.fitout').source_name, 'Za3fran research');
  assert.equal(a('labour.roster.chef.count').source_class, 'estimate');
  assert.equal(a('labour.roster.cook.count').source_class, 'founder');
  assert.equal(r.inputs.labour.roster.find((x) => x.role === 'founder_floor').monthly_gross.base, 12000); // test Brain manager salary
  for (const x of R.dbRows(r, { projectId: 'p', runId: 'r' })) assert.ok(['founder', 'estimate', 'published', 'za3fran_verified'].includes(x.source_class));
});

test('ar-1.1.0 — intake budget overrides the concept budget as envelope', () => {
  const r = run({ intake: { ...T.intake, budget: 2400000 } });
  assert.equal(r.inputs.funding.envelope, 2400000);
});

test('TTC convention: the ticket is priced to the guest; revenue is ticket / (1 + VAT)', () => {
  const inp = E.pickScenario(res.inputs, 'base', 'inputs');
  inp.services = [{ id: 'dinner', days: [3], turns: 1, occupancy: 0.5, ticket: 440, bev_share: 0 }];
  inp.calendar = {}; inp.ramp = { months_to_cruise: 0, start_factor: 1 }; inp.growth = { cost_pct: 0, wage_pct: 0, price_pct: 0 };
  const p = E.computePlan(inp);
  const m = p.months[0];
  assert.equal(m.revenue, Math.round(m.covers * 440 / 1.1));       // 10% VAT on food in the test Brain
});

/* --------------------------- ar-1.2.0 --------------------------- */
const withCostLines = () => {
  const P = (key, scope, unit) => ({ key, scope, grp: 'operating', unit, fav: 'low', regulatory: key.startsWith('tax.'), level: scope === 'local' ? 'country' : null });
  const base = clone(T.values[0]);
  const V = (id, parameter_key, extra) => ({ ...base, id, parameter_key, qualifier: '', value_json: null, value_num: null, low: null, high: null, ...extra });
  return {
    parameters: [...T.parameters, P('tax.drinks_outlet_pct', 'local', 'pct'), P('tax.communal_services_pct', 'local', 'pct'),
      P('labour.workplace_accident_pct', 'local', 'pct'), P('labour.staff_meal_cost', 'local', 'currency'),
      P('operating.fixed_annual', 'local', 'currency'), P('operating.revenue_pct', 'format', 'pct')],
    values: [...clone(T.values),
      V('c1', 'tax.drinks_outlet_pct', { market_id: T.ids.CASA, value_num: 0.1, low: 0.08, high: 0.1 }),
      V('c2', 'tax.communal_services_pct', { market_id: T.ids.MA, value_num: 0.105 }),
      V('c3', 'labour.workplace_accident_pct', { market_id: T.ids.MA, value_num: 0.005, low: 0.002, high: 0.012, source_class: 'estimate', effective_source_class: 'estimate' }),
      V('c4', 'labour.staff_meal_cost', { market_id: T.ids.MA, value_num: 20, low: 15, high: 30, source_class: 'estimate', effective_source_class: 'estimate' }),
      V('c5', 'operating.fixed_annual', { market_id: T.ids.MA, qualifier: 'accounting', value_num: 48000, low: 30000, high: 84000, source_class: 'estimate', effective_source_class: 'estimate' }),
      V('c6', 'operating.revenue_pct', { market_id: null, format_key: 'bistro_wine_bar', qualifier: 'laundry', value_num: 0.005, low: 0.003, high: 0.01, source_class: 'estimate', effective_source_class: 'estimate' }),
    ],
  };
};

test('ar-1.2.0 — Moroccan cost lines added from the Brain, labelled, and the plan still balances', () => {
  const r = run({ brain: withCostLines() });
  assert.equal(r.status, 'ready', JSON.stringify(r.gaps));
  const line = (k) => r.inputs.opex.find((o) => o.key === k);
  assert.deepEqual(line('accounting').fixed_monthly, { base: 4000, low: 2500, high: 7000, fav: 'low' });
  assert.equal(line('accounting').label, 'Comptabilité et paie / Accounting and payroll');
  assert.deepEqual(line('laundry').pct_of_revenue, { base: 0.005, low: 0.003, high: 0.01, fav: 'low' });
  assert.equal(line('drinks_outlet_tax').pct_of_beverage_revenue.base, 0.1);
  // TSC = 10.5% × Brain rent (200/m² × 160 m² in the test Brain)
  assert.equal(line('communal_services_tax').fixed_monthly.base, Math.round(0.105 * 32000 * 100) / 100);
  // staff meals = 20 × 9 staff × (5 open days × 52 / 12)
  assert.equal(Math.round(line('staff_meals').fixed_monthly.base), Math.round(20 * 9 * 5 * 52 / 12));
  // workplace accident insurance added to employer charges (test Brain 0.21 range 0.20–0.22)
  assert.deepEqual(r.inputs.labour.employer_charges_pct, { base: 0.215, low: 0.202, high: 0.232, fav: 'low' });
  assert.ok(r.review.some((x) => x.parameter_key === 'tax.drinks_outlet_pct' && x.reason === 'regulatory'));
  const sc = E.runScenarios(r.inputs);
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.deepEqual(sc[k].checks, { ok: true, errors: [] }, k);
  assert.ok(sc.base.annual[1].opex.drinks_outlet_tax > 0);
});

test('ar-1.2.0 — a founder line with the same key replaces the Brain line', () => {
  const r = run({ brain: withCostLines(), intake: { ...T.intake, opex: [{ key: 'accounting', label: 'Cabinet X', fixed_monthly: 3000 }] } });
  const acc = r.inputs.opex.filter((o) => o.key === 'accounting');
  assert.equal(acc.length, 1); assert.equal(acc[0].fixed_monthly, 3000);
});

test('ar-1.2.0 — covers_source benchmark ignores the concept covers/day', () => {
  const r = run({ intake: { ...T.intake, covers_source: 'benchmark' } });
  assert.deepEqual(r.inputs.services.map((s) => s.occupancy.base), [0.55, 0.7]);
  assert.ok(!r.flags.some((x) => x.code === 'FOUNDER_COVERS_ABOVE_CAP'));
  assert.ok(r.flags.some((x) => x.code === 'COVERS_FROM_BENCHMARK'));
});

/* --------------------------- ar-1.3.0 --------------------------- */
test('ar-1.3.0 — shareholders set equity; loan programme rate; guarantee ceiling flag', () => {
  const brain = { parameters: [...T.parameters, { key: 'finance.guarantee_cap', scope: 'local', grp: 'finance', unit: 'currency', fav: null, regulatory: false, level: 'country' }],
    values: [...clone(T.values),
      { ...clone(T.values[0]), id: 'g1', parameter_key: 'finance.guarantee_cap', value_json: null, value_num: 1200000 },
      { ...clone(T.values[0]), id: 'i1', parameter_key: 'finance.sme_lending_rate', qualifier: 'intelaka', value_json: null, value_num: 0.02 }] };
  const intake = { ...T.intake, shareholders: [{ label: 'Founder', amount: 300000 }, { label: 'Partner', amount: 500000, source: 'estimate' }], loan: { amount: 1300000, programme: 'intelaka' } };
  const r = run({ brain, intake });
  assert.equal(r.inputs.funding.equity, 800000);
  assert.equal(r.inputs.funding.loans[0].annual_rate.base, 0.02);
  assert.ok(r.flags.some((f) => f.code === 'LOAN_ABOVE_GUARANTEE_CAP'));
  const sc = E.runScenarios(r.inputs);
  assert.deepEqual(sc.base.sources_of_funds.shareholders.map((h) => h.share_of_capital), [0.375, 0.625]);
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.deepEqual(sc[k].checks, { ok: true, errors: [] }, k);
  assert.equal(run({ brain }).inputs.funding.loans[0].annual_rate.base, 0.065); // no programme: standard rate
});
