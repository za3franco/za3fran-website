/* Run: node --test tests/*.test.js
 * Canaille regression — live Brain snapshot of 9 Oct 2026 (tests/fixtures/canaille-live-2026-10-09.js),
 * resolver ar-1.4.x + engine fe-1.4.x, full pipeline incl. impact analysis.
 * A method change that moves any figure here must be deliberate: bump the version, re-run, compare
 * with Arnaud, then update the expected values below (Brain rule 9).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');

const res = R.resolveAssumptions({
  concept: C.concept, intake: C.intake, market: C.market, format: 'bistro_wine_bar',
  brain: { parameters: C.parameters, values: C.values },
});
const sc = E.runScenarios(res.inputs);
const y = (o, i) => o.annual[i];

test('ready, engine invariants hold in every scenario', () => {
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps));
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.ok(sc[k].checks.ok, `${k}: ${JSON.stringify(sc[k].checks.errors)}`);
});

test('headline figures (base)', () => {
  assert.equal(sc.base.opening, '2027-10');
  assert.equal(sc.base.uses_of_funds.total, 2230000);
  assert.equal(y(sc.base, 0).revenue, 3577090);
  assert.equal(y(sc.base, 1).revenue, 4462446);
  assert.equal(y(sc.base, 2).revenue, 4532755);
  assert.equal(y(sc.base, 1).ebitda, 957604);
  assert.equal(y(sc.base, 1).ratios.ebitda, 0.2146);
  assert.equal(y(sc.base, 1).net_result, 483240);
  assert.equal(y(sc.base, 1).covers, 10747);
  assert.deepEqual(sc.base.annual.map((a) => a.dscr), [1.76, 3.28, 3.34]);
  assert.deepEqual(sc.base.min_cash, { month: '2028-02', balance: 172832 });
  assert.equal(sc.base.payback_years, null);           // not reached within 3 years: text says "beyond year 3"
});

test('scenarios', () => {
  assert.deepEqual(sc.conservative.min_cash, { month: '2028-04', balance: 4369 });
  assert.equal(y(sc.conservative, 1).dscr, 1.66);
  assert.deepEqual(sc.optimistic.annual.map((a) => a.dscr), [4.42, 5.91, 6.04]);
  assert.deepEqual(sc.stress.annual.map((a) => a.dscr), [-3.85, -2.9, -2.99]);  // stress test, never a forecast
});

test('funding: sized from the rule, partner at face value', () => {
  const s = sc.base.sources_of_funds;
  assert.equal(s.loans_total, 1200000);
  assert.deepEqual(s.shareholders.map((h) => [h.amount, h.share_of_capital]), [[446000, 0.433], [584000, 0.567]]);
  assert.equal(res.sizing.price_factor_for_target, 1.3629);
});

test('the 15 verified values are labelled verified in the appendix', () => {
  const ids = new Set(Object.keys(C.VERIFIED));
  const used = res.assumptions.filter((a) => a.value_id && ids.has(a.value_id));
  assert.ok(used.length >= 14, `verified rows used: ${used.length}`);
  for (const a of used) assert.equal(a.source_class, 'za3fran_verified', a.parameter_key);
  // nothing else is labelled verified
  assert.ok(res.assumptions.filter((a) => a.source_class === 'za3fran_verified').every((a) => ids.has(a.value_id)));
  // estimates are never shown as founder figures
  assert.ok(res.assumptions.filter((a) => a.parameter_key.startsWith('investment.') && !a.value_id).every((a) => a.source_class === 'estimate'));
});

test('review list: verified values are not re-queued (ar-1.4.1)', () => {
  const ids = new Set(Object.keys(C.VERIFIED));
  assert.equal(res.review.filter((r) => ids.has(r.value_id)).length, 0, JSON.stringify(res.review));
  assert.ok(res.review.every((r) => r.reason !== 'regulatory' || !ids.has(r.value_id)));
});

test('flags the plan must state', () => {
  const codes = res.flags.map((f) => f.code);
  assert.ok(codes.includes('COVERS_FROM_BENCHMARK'));
  assert.ok(codes.includes('SINGLE_TICKET'));
  assert.ok(codes.includes('FOUNDER_SHARE_OF_CAPITAL'));
  assert.ok(!codes.includes('LOAN_ABOVE_GUARANTEE_CAP'));
});
