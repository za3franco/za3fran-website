/* Run: node --test tests/*.test.js
 * BP intake (lib/bp-intake.js bpi-1.0.0): form payload -> resolver contract -> preview.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const I = require('../lib/bp-intake.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');

// Canaille as the founder would enter it in the form (same answers as the fixture intake).
const canailleForm = {
  opening: '2027-10', ramadan: 'closed', new_company: 'yes', alcohol: 'yes', district: 'Gauthier', format: 'bistro_wine_bar',
  services: [{ id: 'lunch', days: [2, 3, 4, 5] }, { id: 'dinner', days: ['3', '4', '5', '6'] }],
  covers_source: 'benchmark', rent_monthly: '30 000',
  roster_mode: 'founder', founder_works: 'yes',
  roster: [
    { role: 'chef', count: 1 }, { role: 'cook', count: 2 }, { role: 'commis', count: 1 },
    { role: 'kitchen_porter', count: 1 }, { role: 'server', count: 3 }, { role: 'bartender', count: 1 },
  ],
  investment_mode: 'founder',
  investment: C.intake.investment.map((x) => ({ label: x.label, category: x.category, amount: x.amount, low: x.low, high: x.high })),
  funding_mode: 'rule', sizing: { founder_basis: 'share', founder_share_pct: '20', loan_cap: '1200000' },
};

const run = (intake) => R.resolveAssumptions({
  concept: I.resolverConcept({ seats: '50', ticket: '450', covers: '100', budget: '50_150k', city: 'Casablanca', neighbourhood: '' }, intake),
  intake, market: C.market, format: I.formatFor('other', intake),
  brain: { parameters: C.parameters, values: C.values }, options: { analyseImpact: false },
});

test('Canaille form -> same plan as the approved fixture', () => {
  const { intake, errors } = I.normalizeIntake(canailleForm);
  assert.deepEqual(errors, []);
  assert.equal(intake.rent_monthly, 30000);                        // "30 000" accepted
  assert.deepEqual(intake.services[1].days, [3, 4, 5, 6]);
  assert.equal(intake.sizing.founder_share, 0.2);
  assert.equal(intake.roster[0].role, 'founder');
  assert.equal(intake.roster[0].brain_role, 'manager');
  const res = run(intake);
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps));
  const sc = E.runScenarios(res.inputs);
  assert.equal(sc.base.uses_of_funds.total, 2230000);
  assert.deepEqual(sc.base.annual.map((a) => a.dscr), [1.76, 3.28, 3.34]);
  const p = I.previewSummary(res, sc);
  assert.equal(p.sizing.founder.amount, 446000);
  assert.equal(p.sizing.price_factor_for_target, 1.3629);
  assert.equal(p.years.length, 3);
  assert.equal(p.uses.total, 2230000);
  assert.deepEqual(p.blocking, []);
});

test('estimates requested: roster and investment left empty, the resolver blocks, nothing invented', () => {
  const { intake } = I.normalizeIntake({ ...canailleForm, roster_mode: 'estimate', investment_mode: 'estimate' });
  assert.equal(intake.roster, undefined);
  assert.equal(intake.investment, undefined);
  assert.deepEqual(I.estimatesRequested(intake), { roster: true, investment: true });
  const res = run(intake);
  assert.equal(res.status, 'blocked');
  const p = I.previewSummary(res, null);
  assert.ok(p.blocking.some((g) => g.path === 'labour.roster'));
  assert.ok(p.blocking.some((g) => g.path === 'investment'));
  assert.equal(p.uses, undefined);
});

test('missing answers stay missing (Ramadan, opening, services)', () => {
  const { intake } = I.normalizeIntake({ ...canailleForm, ramadan: '', opening: '', services: [] });
  const res = run(intake);
  const paths = res.gaps.filter((g) => g.severity === 'blocking').map((g) => g.path);
  assert.ok(paths.includes('calendar.ramadan'));
  assert.ok(paths.includes('opening'));
  assert.ok(paths.includes('services'));
});

test('input-shape errors are reported, not silently fixed', () => {
  const { errors } = I.normalizeIntake({
    opening: '2027-13', ramadan: 'sometimes', services: [{ id: 'breakfast', days: [1] }, { id: 'lunch', days: [] }],
    roster: [{ role: 'astronaut', count: 1 }, { role: 'other', label: 'Sommelier', count: 1 }],
    investment: [{ category: 'fitout', amount: 100, low: 200 }],
    funding_mode: 'amounts', shareholders: [{ label: 'X', amount: 1000, price_factor: 0.5 }],
    rent_monthly: -5,
  });
  const codes = errors.map((e) => `${e.path}:${e.code}`);
  for (const c of ['opening:bad_month', 'ramadan:bad_choice', 'services:unknown_service', 'services.lunch.days:no_days',
    'roster.0.role:unknown_role', 'roster.1.monthly_gross:salary_needed_for_other', 'investment.0:range_around_amount',
    'shareholders.0.price_factor:out_of_range', 'rent_monthly:out_of_range']) assert.ok(codes.includes(c), `${c} in ${codes}`);
});

test('amounts mode: shareholders with a premium and a loan amount', () => {
  const { intake, errors } = I.normalizeIntake({ ...canailleForm, funding_mode: 'amounts',
    shareholders: [{ label: 'Fondateur', amount: 446000 }, { label: 'Associé', amount: 584000, price_factor: '1,3629' }],
    loan: { amount: 1200000, programme: 'intelaka' } });
  assert.deepEqual(errors, []);
  assert.equal(intake.sizing, undefined);
  assert.equal(intake.shareholders[1].price_factor, 1.3629);
  assert.equal(intake.loan.programme, 'intelaka');
  const res = run({ ...intake, investment: [...intake.investment, { key: 'cash_reserve', label: 'Réserve / Reserve', category: 'cash_reserve', amount: 320000 }] });
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps));
  const out = E.computePlan(E.pickScenario(res.inputs, 'base', 'inputs'));
  assert.ok(out.sources_of_funds.shareholders[0].share_of_capital >= 0.51);
  assert.equal(out.loans[0].annual_rate, 0.02);                    // Intelaka rate from the Brain
});

test('format: founder choice, concept mapping, else none (gap, built on demand)', () => {
  assert.equal(I.formatFor('bistro', {}), 'bistro_wine_bar');
  assert.equal(I.formatFor('other', { format: 'bistro_wine_bar' }), 'bistro_wine_bar');
  assert.equal(I.formatFor('beach_club', {}), null);
  assert.equal(I.normalizeIntake({ format: 'nightclub' }).errors[0].code, 'unknown_format');
});

test('a second row of the same role gets its own key and keeps the market salary lookup', () => {
  const { intake } = I.normalizeIntake({ roster_mode: 'founder', roster: [{ role: 'server', count: 2 }, { role: 'server', count: 1, label: 'Weekend' }] });
  assert.deepEqual(intake.roster.map((x) => [x.role, x.brain_role]), [['server', undefined], ['server_2', 'server']]);
});
