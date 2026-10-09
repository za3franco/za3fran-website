/* Run: node --test tests/*.test.js
 * Funding sizing (resolver ar-1.4.0) and share premium (engine fe-1.4.0).
 * Canaille regression uses the live snapshot tests/fixtures/canaille-live-2026-10-09.js:
 * the expected figures are the ones Arnaud approved on 8 Oct 2026 (Handoff Brief #8).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const clone = (x) => JSON.parse(JSON.stringify(x));

const runCanaille = (intakeOver = {}) => R.resolveAssumptions({
  concept: C.concept, intake: { ...clone(C.intake), ...intakeOver }, market: C.market, format: 'bistro_wine_bar',
  brain: { parameters: C.parameters, values: C.values }, options: { analyseImpact: false },
});
const canaille = runCanaille();

/* ----------------------------- engine ------------------------------ */

test('fe-1.4.0 — face value by default: share of capital = cash brought / equity', () => {
  const out = E.computePlan(E.pickScenario(canaille.inputs, 'base', 'inputs'));
  const [f, p] = out.sources_of_funds.shareholders;
  assert.equal(f.nominal_capital, f.amount);
  assert.equal(out.sources_of_funds.share_premium, 0);
  assert.equal(f.share_of_capital, 0.433);
  assert.equal(p.share_of_capital, 0.567);
});

test('fe-1.4.0 — a premium lowers the payer\'s share, not the cash brought', () => {
  const x = clone(canaille.inputs);
  x.funding.shareholders[1].price_factor = 1.3629;
  const out = E.computePlan(E.pickScenario(x, 'base', 'inputs'));
  const [f, p] = out.sources_of_funds.shareholders;
  assert.equal(out.sources_of_funds.equity, 446000 + 584000);       // cash unchanged
  assert.equal(p.nominal_capital, Math.round(584000 / 1.3629));
  assert.equal(p.share_premium, 584000 - p.nominal_capital);
  assert.ok(f.share_of_capital >= 0.51 && f.share_of_capital < 0.5101, String(f.share_of_capital));
  assert.equal(out.sources_of_funds.nominal_capital + out.sources_of_funds.share_premium, out.sources_of_funds.equity);
  assert.ok(out.checks.ok, JSON.stringify(out.checks.errors));
});

test('fe-1.4.0 — price_factor below 1 (a discount) is refused', () => {
  const x = E.pickScenario(canaille.inputs, 'base', 'inputs');
  x.funding.shareholders[1].price_factor = 0.8;
  assert.throws(() => E.computePlan(x), /price_factor/);
});

test('priceFactorForControl', () => {
  assert.equal(E.priceFactorForControl({ holder: 446000, others: 584000, target: 0.51 }), 1.3629);
  assert.equal(E.priceFactorForControl({ holder: 600000, others: 400000, target: 0.51 }), 1);   // already in control
  assert.equal(E.priceFactorForControl({ holder: 500000, others: 0 }), 1);
  assert.equal(E.priceFactorForControl({ holder: 0, others: 500000 }), null);
});

/* ---------------------------- resolver ----------------------------- */

test('Canaille regression — sizing reproduces the figures approved on 8 Oct 2026', () => {
  assert.equal(canaille.status, 'ready', JSON.stringify(canaille.gaps));
  const s = canaille.sizing;
  assert.equal(s.reserve, 320000);
  assert.equal(s.total_uses, 2230000);
  assert.equal(s.founder.amount, 446000);
  assert.equal(s.founder.share_of_capital, 0.433);
  assert.equal(s.partner.amount, 584000);
  assert.equal(s.loan.amount, 1200000);
  assert.equal(s.price_factor_for_target, 1.3629);
  assert.ok(s.converged);
  const sc = E.runScenarios(canaille.inputs);
  assert.deepEqual(sc.base.annual.map((a) => a.dscr), [1.76, 3.28, 3.34]);
  assert.equal(sc.conservative.annual[1].dscr, 1.66);
  assert.ok(sc.base.min_cash.balance >= 0 && sc.conservative.min_cash.balance >= 0);
  assert.equal(sc.base.uses_of_funds.total, sc.base.sources_of_funds.total);   // fully funded
});

test('reserve is the smallest step that keeps cash >= 0 in base and conservative', () => {
  const x = clone(canaille.inputs);
  const line = x.investment.find((l) => l.category === 'cash_reserve');
  const less = canaille.sizing.reserve - canaille.sizing.reserve_step;
  line.amount = line.low = line.high = less;
  x.funding.loans[0].amount -= canaille.sizing.reserve_step;   // keep the plan funded (loan at cap minus step)
  x.funding.envelope -= canaille.sizing.reserve_step;
  const mins = ['base', 'conservative'].map((sc) => E.computePlan(E.pickScenario(x, sc, 'inputs')).min_cash.balance);
  assert.ok(Math.min(...mins) < 0, `one step less should go negative: ${mins}`);
});

test('loan cap defaults to the Brain guarantee ceiling', () => {
  const r = runCanaille({ sizing: { founder_share: 0.2 } });
  assert.equal(r.sizing.loan.cap, 1200000);
  assert.equal(r.sizing.loan.cap_source, 'brain_guarantee_cap');
  assert.ok(r.assumptions.some((a) => a.parameter_key === 'funding.sizing.loan_cap' && a.value_id));
});

test('uncapped loan: no partner, founder 100% of capital', () => {
  const r = runCanaille({ sizing: { founder_share: 0.2, loan_cap: 99000000 } });
  assert.equal(r.sizing.partner.amount, 0);
  assert.equal(r.sizing.founder.share_of_capital, 1);
  assert.equal(r.sizing.founder.amount + r.sizing.loan.amount, r.sizing.total_uses);
  assert.equal(r.inputs.funding.shareholders.length, 1);
});

test('founder amount instead of a share', () => {
  const r = runCanaille({ sizing: { founder_amount: 500000, loan_cap: 1200000 } });
  assert.equal(r.sizing.founder.amount, 500000);
  assert.equal(r.sizing.founder.amount + r.sizing.partner.amount + r.sizing.loan.amount, r.sizing.total_uses);
});

test('a founder cash_reserve line is kept, not resized', () => {
  const inv = [...clone(C.intake.investment), { key: 'cash_reserve', label: 'Réserve / Reserve', category: 'cash_reserve', amount: 500000 }];
  const r = runCanaille({ investment: inv });
  assert.equal(r.sizing.reserve, null);
  assert.equal(r.sizing.reserve_from_founder, true);
  assert.equal(r.inputs.investment.filter((l) => l.category === 'cash_reserve').length, 1);
});

test('a rule and amounts together block generation', () => {
  const r = runCanaille({ shareholders: [{ label: 'A', amount: 100000 }] });
  assert.equal(r.status, 'blocked');
  assert.ok(r.gaps.some((g) => g.path === 'funding.sizing' && g.severity === 'blocking'));
});

test('a rule without founder share or amount blocks generation', () => {
  const r = runCanaille({ sizing: { loan_cap: 1200000 } });
  assert.equal(r.status, 'blocked');
  assert.ok(r.gaps.some((g) => g.path === 'funding.sizing.founder'));
});

test('sizing is reproducible: same intake, same result', () => {
  assert.deepEqual(runCanaille().sizing, canaille.sizing);
});
