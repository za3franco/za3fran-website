/* Run: node --test tests/*.test.js
 * Concept workshop (cw-1.0.0, 29 Oct 2026): figures recalculated by the Validator's code, validated patches,
 * the founder's team replacing the estimate, and the list of changes sent to the re-assessment.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/concept-workshop.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');
const G = require('./fixtures/estimate-models-2026-10-27.js');
const O = require('./fixtures/occupancy-decision-2026-10-09.js');
const FF = require('./tools/build-format-families.js');
const REC = require('./fixtures/canaille-record-2026-10-28.js');

const fx = G.withGrowth(O.withOccupancyDecision(M.withEstimateMethods(C)));
const MA = C.market.chain[C.market.chain.length - 1].id;
const brain = { parameters: fx.parameters, values: [...fx.values, ...FF.asBrainRows(MA)] };
const run = (record) => W.preview({ record, market: C.market, brain, reportJson: {}, today: '2026-10-29' });

test('preview: same figures as the Validator, alerts included, team estimated', () => {
  const p = run(REC);
  assert.equal(p.fin_status, 'computed');
  assert.equal(p.figures.ca_a2.value, 5811567);              // = rpt_v2_canaille_7 / bp_v14_canaille_8, year 2
  assert.deepEqual(p.alerts.map((a) => a.code), ['CAPACITY', 'DEBT_SERVICE', 'LICENCE_UNPRICED']);
  assert.equal(p.team.source, 'estimate');
  assert.ok(p.team.lines.some((l) => l.role === 'founder' && l.fixed));
  assert.ok(['STRONG', 'VIABLE', 'FRAGILE', 'HIGH_RISK'].includes(p.verdict));
});

test('patch: a licence figure removes the "not priced" alert; invalid values are refused', () => {
  const { record, errors } = W.applyPatch(REC, { licence_cost: 250000 });
  assert.deepEqual(errors, []);
  assert.ok(!run(record).alerts.some((a) => a.code === 'LICENCE_UNPRICED'));
  assert.equal(W.applyPatch(REC, { seats: 'abc' }).errors[0].path, 'seats');
  assert.equal(W.applyPatch(REC, { own_funds: 9e9 }).errors.some((e) => e.code === 'above_budget' || e.code === 'out_of_range'), true);
  assert.equal(W.applyPatch(REC, { services: [] }).errors[0].code, 'no_service');
});

test("the founder's team replaces the estimate (founder kept, market salaries)", () => {
  const base = run(REC);
  const team = base.team.lines.map((l) => ({ role: l.role, brain_role: l.brain_role, count: l.role === 'chef' ? l.count + 1 : l.count }));
  const { record, errors } = W.applyPatch(REC, { team });
  assert.deepEqual(errors, []);
  const p = run(record);
  assert.equal(p.fin_status, 'computed');
  assert.equal(p.team.source, 'founder');
  assert.equal(p.team.total, base.team.total + 1);
  assert.ok(p.figures.ebe_a2.value < base.figures.ebe_a2.value);   // one more salary
  const back = W.applyPatch(record, { team: null }).record;
  assert.equal(run(back).team.source, 'estimate');
});

test('diffRecords lists what changed, in the report language', () => {
  const svc = W.editable(REC).services.map((s) => (s.id === 'dinner' ? { ...s, ticket: 700, days: [2, 3, 4, 5, 6] } : s));
  const { record } = W.applyPatch(REC, { services: svc, ramadan: 'reduced', rent_monthly: 28000 });
  const d = W.diffRecords(REC, record, 'fr');
  assert.ok(d.some((x) => /^Soir, ticket : 650\sMAD → 700\sMAD$/u.test(x)), d.join(' | '));
  assert.ok(d.some((x) => /^Soir, jours :/.test(x)));
  assert.ok(d.some((x) => /^Ramadan : fermé → ouvert, activité réduite$/.test(x)));
  assert.ok(d.some((x) => /^Loyer mensuel :/.test(x)));
  assert.deepEqual(W.diffRecords(REC, REC, 'fr'), []);
});
