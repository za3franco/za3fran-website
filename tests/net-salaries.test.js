/* Run: node --test tests/*.test.js
 * Resolver ar-1.9.0 (Arnaud, 29 Oct 2026): market salaries the Brain holds net (value_json.basis = 'net', job-board
 * figures) reach the engine as gross, converted with labour.payroll_rules (lib/payroll.js). Canaille fixture:
 * the decided intake of 9 Oct 2026 with Arnaud's occupancy decision and the sm-3 staffing method.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const PAY = require('../lib/payroll.js');
const RULES = require('./fixtures/payroll-rules-ma-2026.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');
const G = require('./fixtures/estimate-models-2026-10-27.js');
const O = require('./fixtures/occupancy-decision-2026-10-09.js');
const decided = require('./fixtures/canaille-intake-decided-2026-10-09.js');

const fx = G.withGrowth(O.withOccupancyDecision(M.withEstimateMethods(C)));
const country = C.market.chain[C.market.chain.length - 1].id;

/** The Brain as it stands after 29 Oct 2026: salary rows marked net, payroll rules for the country. */
function withNetSalaries(f, { rules = true } = {}) {
  const parameters = f.parameters.some((p) => p.key === 'labour.payroll_rules') ? f.parameters
    : [...f.parameters, { key: 'labour.payroll_rules', scope: 'local', grp: 'labour', level: 'country', unit: 'json', value_type: 'json', regulatory: true }];
  const values = f.values.map((v) => (v.parameter_key === 'labour.salary_monthly' ? { ...v, value_json: { basis: 'net' } } : v));
  if (rules) values.push({ id: 'payroll-ma', parameter_key: 'labour.payroll_rules', market_id: country, format_key: null, qualifier: '',
    value_json: RULES, source_class: 'published', status: 'researched', source_name: 'test' });
  return { parameters, values };
}
// Gross salaries raise fixed costs, so Canaille's 3-month reserve target exceeds its decided funding by 20,000
// (a real decision for the founder, shown as a blocking gap). Here the founder accepts it, to compare the figures.
const intake = { ...decided, reserve_choice: 'accept_risk' };
const resolve = (f) => R.resolveAssumptions({ concept: C.concept, intake, market: C.market, format: 'bistro_wine_bar',
  brain: { parameters: f.parameters, values: f.values }, options: { analyseImpact: false } });

test('ar-1.9.0: net market salaries reach the engine as gross; founder figures untouched', () => {
  const a = resolve(fx), b = resolve(withNetSalaries(fx));
  assert.equal(b.status, 'ready');
  const ra = E.pickScenario(a.inputs, 'base', 'inputs').labour.roster, rb = E.pickScenario(b.inputs, 'base', 'inputs').labour.roster;
  ra.forEach((x, i) => {
    const src = b.assumptions.find((s) => s.parameter_key === `labour.roster.${x.role}.monthly_gross`);
    if (src && src.source_class === 'founder') assert.equal(rb[i].monthly_gross, x.monthly_gross, `${x.role} founder salary unchanged`);
    else assert.equal(rb[i].monthly_gross, PAY.netToGross(x.monthly_gross, RULES).gross, `${x.role} converted`);
  });
  const note = b.assumptions.find((s) => s.brain_key === 'labour.salary_monthly' && s.source_class !== 'founder');
  assert.match(note.note, /Published net \d+ .*gross computed with the payroll rules/);
});

test('ar-1.9.0 on Canaille: payroll up, EBITDA down, engine checks still pass (printed for the release note)', () => {
  const pa = E.computePlan(E.pickScenario(resolve(fx).inputs, 'base', 'inputs'));
  const pb = E.computePlan(E.pickScenario(resolve(withNetSalaries(fx)).inputs, 'base', 'inputs'));
  assert.ok(pb.checks.ok);
  for (let y = 0; y < 3; y++) {
    assert.ok(pb.annual[y].payroll > pa.annual[y].payroll);
    assert.equal(pb.annual[y].revenue, pa.annual[y].revenue);
  }
  const pct = (x) => (x * 100).toFixed(1) + '%';
  console.log('[ar-1.9.0 Canaille] payroll Y2', pa.annual[1].payroll, '->', pb.annual[1].payroll, `(+${pct(pb.annual[1].payroll / pa.annual[1].payroll - 1)})`,
    '| payroll/revenue Y2', pct(pa.annual[1].payroll / pa.annual[1].revenue), '->', pct(pb.annual[1].payroll / pb.annual[1].revenue),
    '| EBITDA Y2', pa.annual[1].ebitda, '->', pb.annual[1].ebitda, '| margin', pct(pa.annual[1].ebitda / pa.annual[1].revenue), '->', pct(pb.annual[1].ebitda / pb.annual[1].revenue));
});

test('ar-1.9.0 on Canaille as decided: the higher reserve target becomes a decision for the founder', () => {
  const b = R.resolveAssumptions({ concept: C.concept, intake: decided, market: C.market, format: 'bistro_wine_bar',
    brain: withNetSalaries(fx), options: { analyseImpact: false } });
  assert.equal(b.status, 'blocked');
  assert.deepEqual(b.gaps.filter((g) => g.severity === 'blocking').map((g) => g.path), ['funding.reserve']);
});

test('ar-1.9.0: without payroll rules a net salary is used as held and flagged', () => {
  const b = resolve(withNetSalaries(fx, { rules: false }));
  assert.ok(b.flags.some((f) => f.code === 'NET_SALARY_NOT_CONVERTED'));
  const pa = E.pickScenario(resolve(fx).inputs, 'base', 'inputs').labour.roster.map((x) => x.monthly_gross);
  assert.deepEqual(E.pickScenario(b.inputs, 'base', 'inputs').labour.roster.map((x) => x.monthly_gross), pa);
});
