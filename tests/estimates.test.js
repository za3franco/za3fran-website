/* Run: node --test tests/*.test.js
 * Automatic estimates (lib/estimates.js est-1.0.0, resolver ar-1.5.0).
 * Canaille as Arnaud entered it on the live form on 9 Oct 2026: 50 seats, lunch Mon–Fri, dinner
 * Wed–Sat, 200 m², rent 30,000, alcohol, founder on the floor at 20,000, estimates requested for the
 * team and the investment.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../lib/estimates.js');
const R = require('../lib/assumption-resolver.js');
const E = require('../lib/financial-engine.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');

const services = [{ id: 'lunch', days: [1, 2, 3, 4, 5] }, { id: 'dinner', days: [3, 4, 5, 6] }];
const byRole = (lines) => Object.fromEntries(lines.map((l) => [l.role, l]));
const byKey = (lines) => Object.fromEntries(lines.map((l) => [l.key, l]));

test('team: Canaille answers give a full team inside the normal payroll band (sm-2)', () => {
  const r = X.estimateRoster({ seats: 50, services, alcohol: true, founder: { works: true, monthly_gross: 20000 }, model: M.STAFFING, legalHours: 44 });
  const t = byRole(r.lines);
  assert.deepEqual(Object.fromEntries(r.lines.map((l) => [l.role, l.count])),
    { chef: 1, founder: 1, server: 3, cook: 3, commis: 2, kitchen_porter: 2, bartender: 2, sommelier: 1, cleaner: 1 });
  assert.equal(r.open_hours_week.base, 51);
  assert.match(t.sommelier.note, /dinner only/);
  assert.match(t.cleaner.note, /4 h per open day × 6 days/);
  assert.match(t.cook.note, /paid leave, public holidays/);
  assert.equal(t.founder.source, 'founder');               // the founder gave the salary
  assert.equal(t.founder.monthly_gross, 20000);
  assert.equal(t.founder.brain_role, 'manager');
  for (const l of r.lines.filter((x) => x.role !== 'founder')) {
    assert.equal(l.source, 'estimate');
    assert.ok(l.count_low <= l.count && l.count <= l.count_high, l.role);
    assert.ok(l.note);
  }
});

test('team: no founder on the floor -> a manager; no alcohol -> no bartender; small venue -> no commis', () => {
  const r = X.estimateRoster({ seats: 30, services: [{ id: 'dinner', days: [2, 3, 4, 5, 6] }], alcohol: false, founder: { works: false }, model: M.STAFFING, legalHours: 44 });
  const roles = r.lines.map((l) => l.role);
  assert.ok(roles.includes('manager'));
  assert.ok(!roles.includes('founder'));
  assert.ok(!roles.includes('bartender'));
  assert.ok(!roles.includes('sommelier'));
  assert.ok(roles.includes('cleaner'));
  assert.ok(!roles.includes('commis'));
  assert.equal(X.estimateRoster({ seats: 30, services: [], model: M.STAFFING, legalHours: 44 }), null);
  assert.equal(X.estimateRoster({ seats: 30, services, model: null, legalHours: 44 }), null);
});

test('investment: per m², per seat, lump, percentages and pre-opening', () => {
  const payroll = { base: 80000, low: 75000, high: 90000 };
  const chef = { base: 14600, low: 14600, high: 14600 };
  const rent = { base: 30000, low: 30000, high: 30000 };
  const r = X.estimateInvestment({ seats: 50, surface_m2: 200, alcohol: true, rent, payroll, chefMonthly: chef, model: M.CAPEX });
  const k = byKey(r.lines);
  assert.equal(k.fitout.amount, 600000);
  assert.equal(k.kitchen_equipment.amount, 350000);
  assert.equal(k.initial_stock.amount, 150000);          // 50 × (1,000 + 2,000 drinks)
  assert.equal(k.architect.amount, 60000);
  assert.equal(k.architect.high, 90000);                 // 15% of the base fit-out, not of its high end
  // pre-opening = 1 × payroll + 1 × chef + 3 × rent + 40,000 launch
  assert.equal(k.preopening.amount, Math.round((80000 + 14600 + 90000 + 40000) / 1000) * 1000);
  const contBase = ['fitout', 'architect', 'kitchen_equipment', 'furniture', 'bar_wine', 'tableware'].reduce((a, x) => a + k[x].amount, 0);
  assert.equal(k.contingency.amount, Math.round(contBase * 0.1 / 1000) * 1000);
  for (const l of r.lines) {
    assert.equal(l.source, 'estimate');
    assert.ok(l.low <= l.amount && l.amount <= l.high, l.key);
    assert.equal(l.amount % 1000, 0);
  }
});

test('investment: no alcohol drops the bar and the drinks stock; no surface uses m² per seat', () => {
  const r = X.estimateInvestment({ seats: 40, alcohol: false, rent: null, payroll: null, chefMonthly: null, model: M.CAPEX });
  const k = byKey(r.lines);
  assert.ok(!k.bar_wine);
  assert.equal(k.initial_stock.amount, 40000);
  assert.equal(r.surface_m2, 136);                        // 40 × 3.4
  assert.equal(k.fitout.amount, 408000);
  assert.match(k.fitout.note, /m² per seat/);
  assert.equal(k.preopening.amount, 40000);               // launch only: no team, no rent known
});

/* ------------------------- through the resolver ------------------------- */
const fx = M.withEstimateMethods(C);
const intake = {
  ...C.intake,
  services: [{ id: 'lunch', days: [1, 2, 3, 4, 5], ticket: 350 }, { id: 'dinner', days: [3, 4, 5, 6], ticket: 650 }],
  surface_m2: 200, rent_monthly: 30000, rent_free_months: 3,
  roster: undefined, investment: undefined,
  estimate: { roster: true, investment: true },
  founder: { works: true, monthly_gross: 20000 },
};
const run = (ik, brain = fx) => R.resolveAssumptions({ concept: C.concept, intake: ik, market: C.market, format: 'bistro_wine_bar',
  brain: { parameters: brain.parameters, values: brain.values }, options: { analyseImpact: false } });

test('resolver: estimates fill the team and the investment, labelled as estimates', () => {
  const res = run(intake);
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps.filter((g) => g.severity === 'blocking')));
  assert.equal(res.estimated.roster.lines.length, 9);
  assert.equal(res.estimated.investment.lines.length, 11);
  const inv = res.inputs.investment;
  for (const l of res.estimated.investment.lines) {
    const line = inv.find((x) => x.key === l.key);
    assert.ok(line, l.key);
    assert.equal(line.amount, l.amount);
    const a = res.assumptions.find((x) => x.parameter_key === `investment.${l.key}`);
    assert.equal(a.source_class, 'estimate');
    assert.match(a.source_name, /Za3fran estimate/);
  }
  // deposit (Brain) and cash reserve (sizing) are still added on top
  assert.ok(inv.some((x) => x.category === 'deposit'));
  assert.ok(inv.some((x) => x.category === 'cash_reserve'));
  // roster: founder figure for the founder, estimates for the rest
  const counts = res.assumptions.filter((a) => /^labour\.roster\..*\.count$/.test(a.parameter_key));
  assert.equal(counts.find((a) => a.parameter_key === 'labour.roster.founder.count').source_class, 'founder');
  assert.ok(counts.filter((a) => a.parameter_key !== 'labour.roster.founder.count').every((a) => a.source_class === 'estimate'));
  assert.ok(res.assumptions.some((a) => a.parameter_key === 'labour.roster.method' && a.value_id === '60ac8eca-a20e-4a14-bf56-4a92a134d21d'));
  assert.ok(res.assumptions.some((a) => a.parameter_key === 'investment.method' && a.value_id === 'bd89e1e9-fd43-4642-9f56-29f1cbf8ee71'));
  // the engine runs and its checks hold
  const sc = E.runScenarios(res.inputs);
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.ok(sc[k].checks.ok, k);
  assert.ok(sc.base.min_cash.balance >= 0);
  // Arnaud, 9 Oct 2026: a Za3fran estimate must not push the plan out of the normal bands.
  const y2 = sc.base.annual[1].ratios;
  assert.ok(y2.payroll >= 0.2 && y2.payroll <= 0.38, `payroll ${y2.payroll}`);
  assert.ok(y2.ebitda >= 0.08 && y2.ebitda <= 0.22, `ebitda ${y2.ebitda}`);
  assert.ok(!sc.base.flags.some((f) => ['PAYROLL_OUT_OF_BAND', 'EBITDA_MARGIN_HIGH'].includes(f.code) && f.data.year > 1));
});

test('resolver: founder lines win over the estimate request', () => {
  const res = run({ ...intake, roster: C.intake.roster, investment: C.intake.investment });
  assert.equal(res.status, 'ready');
  assert.equal(res.estimated.roster, null);
  assert.equal(res.estimated.investment, null);
});

test('resolver: no method in the Brain -> clear blocking gap, never a guess', () => {
  const res = run(intake, C);
  assert.equal(res.status, 'blocked');
  assert.ok(res.gaps.some((g) => g.path === 'labour.roster' && /staffing method/.test(g.message)));
  assert.ok(res.gaps.some((g) => g.path === 'investment' && /investment method/.test(g.message)));
});

test('resolver: founder-given Canaille intake is unchanged (regression guard)', () => {
  const a = R.resolveAssumptions({ concept: C.concept, intake: C.intake, market: C.market, format: 'bistro_wine_bar', brain: { parameters: C.parameters, values: C.values } });
  const b = R.resolveAssumptions({ concept: C.concept, intake: C.intake, market: C.market, format: 'bistro_wine_bar', brain: { parameters: fx.parameters, values: fx.values } });
  assert.deepEqual(E.runScenarios(b.inputs).base.annual, E.runScenarios(a.inputs).base.annual);
  assert.equal(E.runScenarios(b.inputs).base.uses_of_funds.total, 2230000);
});
