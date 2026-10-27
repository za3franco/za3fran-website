/* Run: node --test tests/*.test.js
 * Year-3 team growth (Arnaud, 27 Oct 2026): engine fe-1.5.0 (roster from_year), estimates est-1.2.0
 * (estimateGrowthHires), resolver ar-1.7.0, Brain staffing method sm-3. Canaille = the decided intake of
 * 9 Oct 2026 on the live Brain snapshot with Arnaud's occupancy decision (+5 points in year 3).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const X = require('../lib/estimates.js');
const BF = require('../lib/bp-facts.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');
const G = require('./fixtures/estimate-models-2026-10-27.js');
const O = require('./fixtures/occupancy-decision-2026-10-09.js');
const decided = require('./fixtures/canaille-intake-decided-2026-10-09.js');
const clone = (x) => JSON.parse(JSON.stringify(x));

const fx2 = O.withOccupancyDecision(M.withEstimateMethods(C));    // sm-2: no growth rule
const fx3 = G.withGrowth(fx2);                                      // sm-3
const resolve = (intake, fx) => R.resolveAssumptions({ concept: C.concept, intake, market: C.market, format: 'bistro_wine_bar',
  brain: { parameters: fx.parameters, values: fx.values }, options: { analyseImpact: false } });

test('engine fe-1.5.0: a from_year line is charged from that year only', () => {
  const start = E.pickScenario(resolve(decided, fx2).inputs, 'base', 'inputs');   // Canaille opening roster
  const base = E.computePlan(start);
  const inp = clone(start);
  inp.labour.roster.push({ role: 'server', count: 1, monthly_gross: 5000, from_year: 3 });
  const p = E.computePlan(inp);
  assert.equal(p.annual[0].payroll, base.annual[0].payroll);
  assert.equal(p.annual[1].payroll, base.annual[1].payroll);
  assert.ok(p.annual[2].payroll > base.annual[2].payroll);
  assert.equal(p.payroll.monthly_year1, base.payroll.monthly_year1);
  assert.equal(p.payroll.headcount, base.payroll.headcount);
  assert.deepEqual(p.payroll.headcount_by_year, [base.payroll.headcount, base.payroll.headcount, base.payroll.headcount + 1]);
  assert.ok(p.checks.ok);
});

test('estimates est-1.2.0: hires follow covers, half-time steps, fixed roles never grow', () => {
  const roster = [{ role: 'founder', count: 1 }, { role: 'chef', count: 1 }, { role: 'server', count: 4 }, { role: 'cook', count: 3 },
    { role: 'commis', count: 1 }, { role: 'kitchen_porter', count: 1 }, { role: 'bartender', count: 2 }, { role: 'sommelier', count: 1 }];
  const h = X.estimateGrowthHires({ roster, coversRatio: 1.0849, model: G.STAFFING });
  assert.deepEqual(h.lines.map((l) => [l.role, l.count, l.count_low, l.count_high, l.from_year, l.source]),
    [['server', 0.5, 0.5, 0.5, 3, 'estimate'], ['cook', 0.5, 0, 0.5, 3, 'estimate']]);
  assert.match(h.lines[0].note, /covers \+8\.5% on year 2/);
  // a bigger rise gives more hires; no rise, no rule or no covers-driven role gives none
  const big = X.estimateGrowthHires({ roster, coversRatio: 1.3, model: G.STAFFING });
  assert.equal(big.lines.reduce((a, l) => a + l.count, 0), 3.5);   // 11 covers-driven FTE × 30% = 3.3 -> 3.5
  assert.equal(X.estimateGrowthHires({ roster, coversRatio: 1, model: G.STAFFING }), null);
  assert.equal(X.estimateGrowthHires({ roster, coversRatio: 1.2, model: M.STAFFING }), null);
  assert.equal(X.estimateGrowthHires({ roster: [{ role: 'chef', count: 1 }], coversRatio: 1.2, model: G.STAFFING }), null);
  assert.equal(X.ESTIMATES_VERSION, 'est-1.2.0');
});

test('resolver ar-1.7.0: Canaille gets year-3 hires; years 1-2, funding and reserve unchanged', () => {
  const a = resolve(decided, fx2), b = resolve(decided, fx3);
  assert.equal(R.RESOLVER_VERSION, 'ar-1.7.0');
  assert.equal(b.status, 'ready', JSON.stringify(b.gaps.filter((g) => g.severity === 'blocking')));
  assert.equal(a.estimated.hires_y3, null);
  assert.deepEqual(b.estimated.hires_y3.lines.map((l) => [l.role, l.count]), [['server', 0.5], ['cook', 0.5]]);
  const sa = E.runScenarios(a.inputs), sb = E.runScenarios(b.inputs);
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.ok(sb[k].checks.ok, k);
  assert.deepEqual(sb.base.annual.slice(0, 2), sa.base.annual.slice(0, 2));
  assert.deepEqual(sb.base.uses_of_funds, sa.base.uses_of_funds);
  assert.deepEqual(sb.base.min_cash, sa.base.min_cash);
  assert.ok(sb.base.annual[2].payroll > sa.base.annual[2].payroll);
  assert.ok(sb.base.annual[2].ratios.payroll > sa.base.annual[2].ratios.payroll);
  assert.ok(sb.base.annual[2].ratios.ebitda < sa.base.annual[2].ratios.ebitda);
  assert.deepEqual(sb.base.payroll.headcount_by_year, [13, 13, 14]);
  // appendix: labelled estimates, method recorded with its Brain row
  const hires = b.assumptions.filter((x) => /^labour\.hires_y3\.\w+\.count$/.test(x.parameter_key));
  assert.deepEqual(hires.map((x) => [x.parameter_key, x.value_num, x.source_class]),
    [['labour.hires_y3.server.count', 0.5, 'estimate'], ['labour.hires_y3.cook.count', 0.5, 'estimate']]);
  assert.ok(b.assumptions.some((x) => x.parameter_key === 'labour.hires_y3.method' && x.value_id === G.SM3_ID));
});

test('resolver: no hires when the founder gives covers (no year-3 rise) or year-3 lines himself', () => {
  const own = resolve({ ...decided, covers_source: undefined, covers_per_day: 100 }, fx3);
  assert.equal(own.estimated.hires_y3, null);
  const lines = resolve({ ...decided, roster: [...decided.roster, { role: 'server', count: 1, from_year: 3 }] }, fx3);
  assert.equal(lines.estimated.hires_y3, null);
  assert.ok(lines.inputs.labour.roster.some((x) => x.role === 'server' && x.from_year === 3));
});

test('facts bpf-1.2.0: opening team table, year-3 hires stated in the note and the facts', () => {
  const b = resolve(decided, fx3);
  const sc = E.runScenarios(b.inputs);
  const f = BF.buildFacts({ res: b, sc, intake: decided, concept: C.concept, lang: 'fr', register: [], today: '2026-10-27' });
  const F = f.F;
  const T = f.tables;
  assert.equal(T.team.rows.length, b.inputs.labour.roster.filter((x) => !x.from_year).length);
  assert.match(T.teamBank.note, /En année 3, l’équipe est renforcée de 0,5 serveur, 0,5 cuisinier/);
  assert.doesNotMatch(T.teamBank.note, /estim|Za3fran/i);
  assert.equal(F.renforts_a3.v, '0,5 serveur, 0,5 cuisinier (équivalents temps plein)');
  assert.equal(F.effectif_a3.v, '14');
  assert.ok(f.confirm_fixed.some((x) => /Équipe en année 3/.test(x)));
});
