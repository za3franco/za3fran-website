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
