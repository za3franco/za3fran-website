/* Engine Brain for the Concept Studio tests (lot 1, 12 Nov 2026), built from the fixtures the Validator tests use:
 * the live Canaille snapshot (9 Oct 2026) with the estimate methods, Arnaud's occupancy decision and sm-3, the four
 * other format families (migration 20261028), net market salaries converted with the payroll rules (ar-1.9.0), and the
 * district rents per m² read in Supabase on 12 Nov 2026 (Mahaly.ma, October 2026; Casablanca median for districts
 * without their own row). Same shape as assumption-resolver.loadBrainContext(). */
'use strict';
const C = require('./canaille-live-2026-10-09.js');
const M = require('./estimate-models-2026-10-09.js');
const G = require('./estimate-models-2026-10-27.js');
const O = require('./occupancy-decision-2026-10-09.js');
const RULES = require('./payroll-rules-ma-2026.js');
const FF = require('../tools/build-format-families.js');
const K = require('./studio-knowledge-2026-11-12.js');

const fx = G.withGrowth(O.withOccupancyDecision(M.withEstimateMethods(C)));
const MA = K.ids.country;
const parameters = fx.parameters.some((p) => p.key === 'labour.payroll_rules') ? fx.parameters
  : [...fx.parameters, { key: 'labour.payroll_rules', scope: 'local', grp: 'labour', level: 'country', unit: 'json', value_type: 'json', regulatory: true }];
const values = fx.values
  .map((v) => (v.parameter_key === 'labour.salary_monthly' ? { ...v, value_json: { ...(v.value_json || {}), basis: 'net' } } : v))
  .filter((v) => !(v.parameter_key === 'property.rent_m2_month' && v.market_id !== K.ids.city));
values.push({ id: 'payroll-ma', parameter_key: 'labour.payroll_rules', market_id: MA, format_key: null, qualifier: '', value_json: RULES, source_class: 'published', status: 'researched', source_name: 'test' });
for (const d of K.districts) {
  if (!d.rent) continue;
  values.push({ id: `rent-${d.id}`, parameter_key: 'property.rent_m2_month', market_id: d.id, format_key: null, qualifier: '', value_num: d.rent.m2, low: d.rent.low, high: d.rent.high,
    unit: 'currency_per_m2_month', currency: 'MAD', source_class: 'published', status: d.rent.status, source_name: d.rent.source, observed_at: d.rent.observed_at });
}
values.push(...FF.asBrainRows(MA));
module.exports = { parameters, values };
