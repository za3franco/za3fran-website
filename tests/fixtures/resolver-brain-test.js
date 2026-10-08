/* TEST DATA ONLY — not research. Invented values with plausible shapes, used to exercise
 * tests/assumption-resolver.test.js. Real Morocco values come from the market-profile research
 * and live in Supabase, never in this file. */
'use strict';
const P = (key, scope, grp, unit, fav, regulatory = false) => ({ key, scope, grp, unit, fav, regulatory });
const parameters = [
  P('tax.corporate_brackets', 'local', 'tax', 'json', null, true),
  P('tax.minimum_tax_pct', 'local', 'tax', 'pct', 'low', true),
  P('tax.vat_food_service', 'local', 'tax', 'pct', 'low', true),
  P('tax.vat_alcohol', 'local', 'tax', 'pct', 'low', true),
  P('tax.loss_carryforward_years', 'local', 'tax', 'years', 'high', true),
  P('labour.salary_monthly', 'local', 'labour', 'currency_per_month', 'low'),
  P('labour.employer_charges_pct', 'local', 'labour', 'pct', 'low', true),
  P('labour.extra_months', 'local', 'labour', 'months', 'low', true),
  P('property.rent_m2_month', 'local', 'property', 'currency_per_m2_month', 'low'),
  P('property.deposit_months', 'local', 'property', 'months', 'low'),
  P('property.key_money', 'local', 'property', 'currency', 'low'),
  P('property.rent_escalation', 'local', 'property', 'json', 'low', true),
  P('operating.insurance_annual', 'local', 'operating', 'currency', 'low'),
  P('operating.card_fee_pct', 'local', 'operating', 'pct', 'low'),
  P('finance.sme_lending_rate', 'local', 'finance', 'pct', 'low'),
  P('finance.loan_term_months', 'local', 'finance', 'months', 'high'),
  P('finance.inflation_pct', 'local', 'finance', 'pct', 'low'),
  P('regulation.alcohol_licence', 'local', 'regulation', 'json', 'low', true),
  P('calendar.dated_factors', 'local', 'calendar', 'json', null),
  P('calendar.seasonality', 'local', 'calendar', 'json', null),
  P('market.average_ticket', 'local', 'market', 'currency', null),
  P('benchmark.food_cost_pct', 'format', 'benchmark', 'pct', 'low'),
  P('benchmark.beverage_cost_pct', 'format', 'benchmark', 'pct', 'low'),
  P('benchmark.turns', 'format', 'benchmark', 'factor', 'high'),
  P('benchmark.cruise_occupancy', 'format', 'benchmark', 'pct', 'high'),
  P('benchmark.ramp_months', 'format', 'benchmark', 'months', 'low'),
  P('benchmark.ramp_start_factor', 'format', 'benchmark', 'factor', 'high'),
  P('benchmark.beverage_share', 'format', 'benchmark', 'pct', 'high'),
  P('benchmark.utilities_pct', 'format', 'benchmark', 'pct', 'low'),
  P('benchmark.other_opex_pct', 'format', 'benchmark', 'pct', 'low'),
  P('benchmark.marketing_pct', 'format', 'benchmark', 'pct', 'low'),
  // ar-1.1.0
  P('calendar.ramadan_windows', 'local', 'calendar', 'json', null),
  P('calendar.ramadan_trading_level', 'local', 'calendar', 'factor', 'high'),
  P('tax.minimum_tax_exempt_months', 'local', 'tax', 'months', 'high', true),
  P('benchmark.maintenance_capex_pct', 'format', 'benchmark', 'pct', 'low'),
].map((p) => ({ ...p, level: p.scope === 'local' ? 'country' : null }));

const MA = 'm-ma', CASA = 'm-casa', GAUTHIER = 'm-gauthier';
let n = 0;
const V = (parameter_key, where, v) => ({
  id: `v${++n}`, parameter_key, market_id: where.market || null, format_key: where.format || null, qualifier: where.q || '',
  value_num: null, low: null, high: null, value_json: null, unit: 'n/a', currency: null,
  source_class: v.cls || 'published', effective_source_class: v.cls || 'published', status: v.status || 'researched', effective_status: v.status || 'researched',
  source_name: v.cls === 'estimate' ? null : 'TEST SOURCE', observed_at: '2026-10-01', confidence: 'medium', ...v.fields,
});
const num = (value_num, low, high) => ({ value_num, low: low ?? null, high: high ?? null });
const F = { format: 'bistro_wine_bar' };
const values = [
  V('tax.corporate_brackets', { market: MA }, { fields: { value_json: [{ upto: 300000, rate: 0.1 }, { upto: 1000000, rate: 0.2 }, { upto: null, rate: 0.31 }] } }),
  V('tax.minimum_tax_pct', { market: MA }, { fields: num(0.0025) }),
  V('tax.vat_food_service', { market: MA }, { fields: num(0.1) }),
  V('tax.vat_alcohol', { market: MA }, { fields: num(0.2) }),
  V('tax.loss_carryforward_years', { market: MA }, { fields: num(4) }),
  V('labour.employer_charges_pct', { market: MA }, { fields: num(0.21, 0.2, 0.22) }),
  V('labour.salary_monthly', { market: CASA, q: 'chef' }, { fields: num(14000, 11000, 18000) }),
  V('labour.salary_monthly', { market: CASA, q: 'cook' }, { fields: num(5500, 4500, 6500) }),
  V('labour.salary_monthly', { market: CASA, q: 'server' }, { fields: num(4500, 3800, 5200) }),
  V('labour.salary_monthly', { market: CASA, q: 'manager' }, { fields: num(12000, 10000, 15000) }),
  // rent: a city-level published value AND a district-level estimate -> published (class first) must win
  V('property.rent_m2_month', { market: CASA }, { fields: num(200, 150, 250) }),
  V('property.rent_m2_month', { market: GAUTHIER }, { cls: 'estimate', fields: num(260, 220, 320) }),
  V('property.deposit_months', { market: CASA }, { fields: num(3, 2, 4) }),
  V('property.key_money', { market: GAUTHIER }, { cls: 'estimate', fields: num(300000, 150000, 500000) }),
  V('operating.insurance_annual', { market: MA }, { fields: num(18000, 12000, 25000) }),
  V('operating.card_fee_pct', { market: MA }, { fields: num(0.02, 0.015, 0.025) }),
  // lending rate: verified at country level beats a published city value
  V('finance.sme_lending_rate', { market: CASA }, { fields: num(0.09, 0.08, 0.1) }),
  V('finance.sme_lending_rate', { market: MA }, { cls: 'za3fran_verified', status: 'verified', fields: { ...num(0.065, 0.055, 0.075), reviewer: 'arnaud', reviewed_at: '2026-10-02' } }),
  V('finance.loan_term_months', { market: MA }, { fields: num(84, 60, 120) }),
  V('finance.inflation_pct', { market: MA }, { fields: num(0.02, 0.01, 0.035) }),
  V('regulation.alcohol_licence', { market: MA }, { fields: { value_json: { base: 150000, low: 80000, high: 250000 } } }),
  V('calendar.seasonality', { market: CASA }, { fields: { value_json: [0.95, 0.95, 1, 1, 1.05, 1, 0.9, 0.85, 1, 1.05, 1.05, 1.1] } }),
  V('calendar.dated_factors', { market: MA }, { fields: { value_json: { '2028-02': 0.6 } } }),
  V('market.average_ticket', { market: CASA, q: 'bistro_wine_bar.dinner' }, { fields: num(360, 300, 420) }),
  V('benchmark.food_cost_pct', F, { cls: 'estimate', fields: num(0.3, 0.28, 0.34) }),
  V('benchmark.beverage_cost_pct', F, { cls: 'estimate', fields: num(0.28, 0.25, 0.32) }),
  V('benchmark.turns', { ...F, q: 'lunch' }, { cls: 'estimate', fields: num(1, 0.9, 1.1) }),
  V('benchmark.turns', { ...F, q: 'dinner' }, { cls: 'estimate', fields: num(1, 1, 1.2) }),
  V('benchmark.cruise_occupancy', { ...F, q: 'lunch' }, { cls: 'estimate', fields: num(0.55, 0.4, 0.7) }),
  V('benchmark.cruise_occupancy', { ...F, q: 'dinner' }, { cls: 'estimate', fields: num(0.7, 0.55, 0.85) }),
  V('benchmark.ramp_months', F, { cls: 'estimate', fields: num(6, 4, 9) }),
  V('benchmark.ramp_start_factor', F, { cls: 'estimate', fields: num(0.6, 0.5, 0.7) }),
  V('benchmark.beverage_share', { ...F, q: 'lunch' }, { cls: 'estimate', fields: num(0.2, 0.15, 0.3) }),
  V('benchmark.beverage_share', { ...F, q: 'dinner' }, { cls: 'estimate', fields: num(0.4, 0.3, 0.5) }),
  V('benchmark.utilities_pct', F, { cls: 'estimate', fields: num(0.035, 0.03, 0.045) }),
  V('benchmark.other_opex_pct', F, { cls: 'estimate', fields: num(0.05, 0.04, 0.07) }),
  V('benchmark.marketing_pct', F, { cls: 'estimate', fields: num(0.02, 0.015, 0.03) }),
  // ar-1.1.0 (TEST DATA: window shapes only)
  V('calendar.ramadan_windows', { market: MA }, { fields: { value_json: [{ start: '2028-01-28', end: '2028-02-26' }, { start: '2029-01-16', end: '2029-02-14' }] } }),
  V('calendar.ramadan_trading_level', { market: MA }, { cls: 'estimate', fields: num(0.6, 0.5, 0.8) }),
  V('tax.minimum_tax_exempt_months', { market: MA }, { fields: num(36) }),
  V('benchmark.maintenance_capex_pct', F, { cls: 'estimate', fields: num(0.025, 0.015, 0.04) }),
];

const market = { currency: 'MAD', chain: [{ id: GAUTHIER, level: 'district' }, { id: CASA, level: 'city' }, { id: MA, level: 'country' }] };

// Canaille-shaped founder data (effective concept values are strings, as loadEffectiveConcept returns them)
const concept = { seats: '50', ticket: '450', covers: '100', budget: '1700000', city: 'Casablanca' };
const intake = {
  opening: '2027-09', surface_m2: 160, alcohol: true, ramadan: 'reduced',
  services: [{ id: 'lunch', days: [2, 3, 4, 5] }, { id: 'dinner', days: [3, 4, 5, 6] }],
  roster: [{ role: 'chef', count: 1 }, { role: 'cook', count: 3 }, { role: 'server', count: 4 }, { role: 'manager', count: 1, monthly_gross: 13000 }],
  investment: [
    { key: 'fitout', label: 'Aménagement', category: 'fitout', amount: 400000, low: 350000, high: 450000 },
    { key: 'equipment', label: 'Équipement', category: 'equipment', amount: 315000, low: 280000, high: 350000 },
    { key: 'furniture', label: 'Mobilier', category: 'furniture', amount: 140000, low: 120000, high: 160000 },
    { key: 'it', label: 'IT & POS', category: 'it', amount: 50000 },
    { key: 'initial_stock', label: 'Stock initial', category: 'initial_stock', amount: 120000 },
    { key: 'cash_reserve', label: 'Réserve', category: 'cash_reserve', amount: 175000 },
  ],
  loan: { amount: 1100000, term_months: 84 },
  notes: { 'funding.loan.amount': 'Loan request from the intake' },
};

module.exports = { parameters, values, market, concept, intake, ids: { MA, CASA, GAUTHIER } };
