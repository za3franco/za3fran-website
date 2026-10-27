/* Brain staffing method sm-3, 27 Oct 2026 (migration 20261027_staffing_model_sm3.sql): sm-2 unchanged plus the
 * year-3 growth rule decided by Arnaud (Brief #11, decision 7c). withGrowth(fx) swaps the staffing row of a
 * fixture that already carries the 9 Oct estimate methods (estimate-models-2026-10-09.js) for the sm-3 row. */
'use strict';
const M = require('./estimate-models-2026-10-09.js');

const GROWTH = { roles: ['server', 'cook', 'commis', 'kitchen_porter', 'bartender'], elasticity: { base: 1, low: 0.7, high: 1 }, step: 0.5, from_year: 3,
  note: 'Hours of covers-driven roles follow covers from year 2 to year 3; rounded to half-time posts' };
const STAFFING = { ...M.STAFFING, version: 'sm-3', growth: GROWTH };
const SM3_ID = '13356846-04af-4d57-9fd5-58b20eb06aea';

function withGrowth(fx) {
  return { ...fx, values: fx.values.map((v) => (v.parameter_key === 'benchmark.staffing_model'
    ? { ...v, id: SM3_ID, value_json: STAFFING, observed_at: '2026-10-27' } : v)) };
}
module.exports = { GROWTH, STAFFING, SM3_ID, withGrowth };
