/* Canaille re-run fixture, 8 Oct 2026 (resolver ar-1.1.0, engine fe-1.1.0).
 *
 * 1. brain: a snapshot of the LIVE Brain (brain_parameters + brain_values_effective) for the
 *    Gauthier -> Casablanca -> Morocco chain and the bistro_wine_bar format, pulled via Supabase
 *    on 8 Oct 2026. Text-only rows are omitted (the resolver does not read them). Real research,
 *    status 'researched' (none verified yet).
 * 2. concept: Canaille's effective concept (CRR-amended), as loadEffectiveConcept returns it.
 * 3. intake: Arnaud's answers of 8 Oct 2026 (opening, rent offer, Ramadan, 20% equity) plus
 *    Za3fran ESTIMATES for the roster and the investment lines, labelled source: 'estimate'.
 *    Arnaud asked for these to be researched; they are replaced by founder figures or by the
 *    future installation & equipment tool. Funding is a rule (intake.sizing), sized by the
 *    resolver from the engine's total uses (ar-1.4.0).
 */
'use strict';

const MA = '6e6218db-0e40-4fc9-9528-30465935d145';
const CASA = '746b3105-984f-448f-a886-db4d725e31bc';
const GAUTHIER = '258db599-2e4c-43ea-8fda-9e27ebc6514d';

const P = (key, scope, fav, unit, regulatory = false) => ({ key, scope, fav, unit, regulatory });
const parameters = [
  P('tax.corporate_brackets', 'local', null, 'json', true), P('tax.minimum_tax_pct', 'local', 'low', 'pct', true),
  P('tax.vat_food_service', 'local', 'low', 'pct', true), P('tax.vat_alcohol', 'local', 'low', 'pct', true),
  P('tax.loss_carryforward_years', 'local', 'high', 'years', true), P('tax.minimum_tax_exempt_months', 'local', 'high', 'months', true),
  P('labour.salary_monthly', 'local', 'low', 'currency_per_month'), P('labour.employer_charges_pct', 'local', 'low', 'pct', true),
  P('labour.extra_months', 'local', 'low', 'months', true),
  P('property.rent_m2_month', 'local', 'low', 'currency_per_m2_month'), P('property.deposit_months', 'local', 'low', 'months'),
  P('property.key_money', 'local', 'low', 'currency'), P('property.rent_escalation', 'local', 'low', 'json', true),
  P('operating.insurance_annual', 'local', 'low', 'currency'), P('operating.card_fee_pct', 'local', 'low', 'pct'),
  P('finance.sme_lending_rate', 'local', 'low', 'pct'), P('finance.loan_term_months', 'local', 'high', 'months'),
  P('finance.inflation_pct', 'local', 'low', 'pct'), P('regulation.alcohol_licence', 'local', 'low', 'json', true),
  P('calendar.dated_factors', 'local', null, 'json'), P('calendar.seasonality', 'local', null, 'json'),
  P('calendar.ramadan_windows', 'local', null, 'json'), P('calendar.ramadan_trading_level', 'local', 'high', 'factor'),
  P('market.average_ticket', 'local', null, 'currency'),
  P('benchmark.food_cost_pct', 'format', 'low', 'pct'), P('benchmark.beverage_cost_pct', 'format', 'low', 'pct'),
  P('benchmark.turns', 'format', 'high', 'factor'), P('benchmark.cruise_occupancy', 'format', 'high', 'pct'),
  P('benchmark.ramp_months', 'format', 'low', 'months'), P('benchmark.ramp_start_factor', 'format', 'high', 'factor'),
  P('benchmark.beverage_share', 'format', 'high', 'pct'), P('benchmark.utilities_pct', 'format', 'low', 'pct'),
  P('benchmark.marketing_pct', 'format', 'low', 'pct'), P('benchmark.other_opex_pct', 'format', 'low', 'pct'),
  P('benchmark.maintenance_capex_pct', 'format', 'low', 'pct'),
  // added later on 8 Oct 2026 (ar-1.2.0 cost lines)
  P('tax.drinks_outlet_pct', 'local', 'low', 'pct', true), P('tax.communal_services_pct', 'local', 'low', 'pct', true),
  P('labour.workplace_accident_pct', 'local', 'low', 'pct'), P('labour.staff_meal_cost', 'local', 'low', 'currency'),
  P('operating.fixed_annual', 'local', 'low', 'currency'), P('operating.revenue_pct', 'format', 'low', 'pct'),
  P('finance.guarantee_cap', 'local', null, 'currency'),
];

const V = (id, key, market, q, n, lo, hi, json, cls) => ({
  id, parameter_key: key, market_id: market, format_key: null, qualifier: q, value_num: n, low: lo, high: hi, value_json: json,
  source_class: cls, effective_source_class: cls, status: 'researched', effective_status: 'researched',
});
const F = (id, key, q, n, lo, hi) => ({ ...V(id, key, null, q, n, lo, hi, null, 'estimate'), format_key: 'bistro_wine_bar' });
const values = [
  V('bdb2b9bf-4e99-4faf-86fc-961997c76e69', 'tax.corporate_brackets', MA, '', null, null, null, [{ rate: 0.2, upto: null }], 'published'),
  V('6aaf1190-5362-488c-bab5-235d9d565d95', 'tax.minimum_tax_pct', MA, '', 0.0025, null, null, null, 'published'),
  V('839d53f9-9b42-4912-b1ed-e41f99067838', 'tax.vat_food_service', MA, '', 0.1, null, null, null, 'published'),
  V('3f9b2588-6463-447f-81db-729f0f46ac5c', 'tax.vat_alcohol', MA, '', 0.1, null, null, null, 'published'),
  V('f87933dc-3bdb-4a2f-b2dd-65118f900da1', 'tax.loss_carryforward_years', MA, '', 4, null, null, null, 'published'),
  V('edac661b-9979-4f2f-b09a-3d67dd267360', 'tax.minimum_tax_exempt_months', MA, '', 36, null, null, null, 'published'),
  V('2fa4d23b-fa5d-4298-9732-9aa36007561a', 'labour.employer_charges_pct', MA, '', 0.2109, null, null, null, 'published'),
  V('71f31a55-6ac4-48ad-8313-a4a2925f8281', 'labour.extra_months', MA, '', 0, null, null, null, 'published'),
  V('d5a4f11d-2580-4c62-ae8e-e29cfacb7bf3', 'labour.salary_monthly', MA, 'chef', 12000, 8000, 18000, null, 'estimate'),
  V('86ada229-aef9-423d-9b1c-4832a45d41ed', 'labour.salary_monthly', MA, 'cook', 5000, 4000, 6500, null, 'estimate'),
  V('5e7a0fd3-8e10-4382-9445-bc23c9dbdfc9', 'labour.salary_monthly', MA, 'commis', 3800, 3423, 4500, null, 'estimate'),
  V('9ad9a39c-aa8b-4eb2-ab5c-d810a1731f38', 'labour.salary_monthly', MA, 'server', 4200, 3423, 5500, null, 'estimate'),
  V('1c258b75-fc36-421e-988e-affa551cd94b', 'labour.salary_monthly', MA, 'manager', 10000, 8000, 15000, null, 'estimate'),
  V('12f0b6ce-f021-483a-85b7-b63aa2b70366', 'labour.salary_monthly', MA, 'kitchen_porter', 3600, 3423, 4000, null, 'estimate'),
  V('e7959c3a-a6b1-4302-a1c5-119fce3634ac', 'labour.salary_monthly', MA, 'bartender', 4500, 3500, 5500, null, 'estimate'),
  V('b66886f6-588a-476e-a7ec-4d7f904717ba', 'property.rent_m2_month', CASA, '', 140, 95.05, 186.97, null, 'published'),
  V('14c4f331-184d-4df6-8547-0028dfd939e1', 'property.rent_m2_month', GAUTHIER, '', 150, 122, 182, null, 'published'),
  V('93f69ef3-36c4-43f7-952b-6df6b4379b70', 'property.deposit_months', CASA, '', 2, 1, 3, null, 'estimate'),
  V('1face0a2-f6c9-4d6f-84d2-9d667f9f625e', 'property.rent_escalation', MA, '', null, null, null, { escalation_pct: 0.1, escalation_every_years: 3 }, 'published'),
  V('1e84877d-bf91-4fda-874a-aa5cc9cfe43a', 'operating.insurance_annual', MA, '', 12000, 5000, 25000, null, 'estimate'),
  V('51371be0-7324-44fc-9ef6-6914375d0597', 'operating.card_fee_pct', MA, '', 0.012, 0.008, 0.018, null, 'estimate'),
  V('18af1d7c-db31-42b2-98a7-7861433e2045', 'finance.sme_lending_rate', MA, '', 0.075, 0.06, 0.095, null, 'estimate'),
  V('ba8a4570-c840-47d6-8896-e973d91fe94b', 'finance.loan_term_months', MA, '', 84, 60, 144, null, 'estimate'),
  V('8837fd6c-ff3d-4c45-b4c6-5d07adc3d159', 'finance.inflation_pct', MA, '', 0.015, 0.007, 0.022, null, 'published'),
  V('1fe7a62f-c360-45b2-a385-affa92b89b60', 'regulation.alcohol_licence', MA, '', null, null, null, null, 'published'), // text only, no cost
  V('120d700a-bd5b-425c-b2d0-316572c08c72', 'calendar.ramadan_windows', MA, '', null, null, null, [
    { start: '2027-02-08', end: '2027-03-08' }, { start: '2028-01-28', end: '2028-02-26' },
    { start: '2029-01-16', end: '2029-02-14' }, { start: '2030-01-06', end: '2030-02-04' }], 'published'),
  V('00f0b194-4718-4e85-bcad-29e745533be8', 'calendar.ramadan_trading_level', MA, '', 0.65, 0.5, 0.8, null, 'estimate'),
  V('d08c45a6-859e-4fba-a132-47b27839d59b', 'calendar.seasonality', CASA, '', null, null, null, {
    base: [0.85, 1, 1, 1.05, 1.05, 1, 0.9, 0.75, 0.9, 1.05, 1.05, 1.1],
    low: [0.75, 0.9, 0.9, 0.95, 0.95, 0.9, 0.8, 0.6, 0.8, 0.95, 0.95, 1],
    high: [0.95, 1.05, 1.05, 1.1, 1.1, 1.05, 1, 0.85, 0.95, 1.1, 1.1, 1.2] }, 'estimate'),
  F('c654f77a-5579-48e0-ba3a-50e8b5ad0c91', 'benchmark.food_cost_pct', '', 0.3, 0.28, 0.34),
  F('7cb3660b-f8a9-4741-a788-e421a9298daf', 'benchmark.beverage_cost_pct', '', 0.32, 0.24, 0.4),
  F('da1834a8-2f7e-42ce-baa5-3a3a8ff50757', 'benchmark.turns', 'lunch', 1, 0.9, 1.3),
  F('64194f24-6ef1-4910-848f-86c2607bd5ad', 'benchmark.turns', 'dinner', 1, 0.9, 1.3),
  F('704fecac-093d-4186-90bc-e04036c778b7', 'benchmark.cruise_occupancy', 'lunch', 0.5, 0.35, 0.65),
  F('e1e908b3-47a2-420b-b764-06fa990df337', 'benchmark.cruise_occupancy', 'dinner', 0.65, 0.5, 0.8),
  F('f3581ca7-6763-4b0d-8ce9-30067f964936', 'benchmark.ramp_months', '', 9, 6, 12),
  F('8827659e-e9e6-43d1-8c40-3e178482a285', 'benchmark.ramp_start_factor', '', 0.55, 0.4, 0.7),
  F('dafdcdf4-844a-4fb8-865c-e5af04adf9d7', 'benchmark.beverage_share', 'lunch', 0.15, 0.1, 0.25),
  F('314911d5-96e4-432a-bdf4-8fdfe3b209e5', 'benchmark.beverage_share', 'dinner', 0.35, 0.25, 0.5),
  F('745e54c5-42df-4de2-8cbe-0df5eab79d19', 'benchmark.utilities_pct', '', 0.035, 0.02, 0.05),
  F('99e597f1-ceff-42f4-a727-ddc9b294fea7', 'benchmark.marketing_pct', '', 0.04, 0.02, 0.07),
  F('064646ea-da40-46e4-8a7f-1e4bc58cc90e', 'benchmark.other_opex_pct', '', 0.05, 0.03, 0.08),
  F('dd304343-23d0-4f84-8376-58090a955932', 'benchmark.maintenance_capex_pct', '', 0.025, 0.015, 0.04),
  // added later on 8 Oct 2026 (ar-1.2.0 cost lines)
  V('86d824cd-1540-4a6a-a095-ba7f52c6bdfb', 'tax.drinks_outlet_pct', CASA, '', 0.10, 0.08, 0.10, null, 'published'),
  V('313d47b9-db13-41ec-94a9-01a6dfc168e8', 'tax.communal_services_pct', MA, '', 0.105, null, null, null, 'published'),
  V('644577a4-d22f-45d8-919b-ce88d072f97d', 'labour.workplace_accident_pct', MA, '', 0.005, 0.002, 0.012, null, 'estimate'),
  V('c3db07fc-7728-4ea8-a560-a8627b908a83', 'labour.staff_meal_cost', MA, '', 20, 15, 30, null, 'estimate'),
  V('36475114-8b3f-479a-9793-83e8d0882e1c', 'operating.fixed_annual', MA, 'accounting', 50000, 30000, 85000, null, 'estimate'),
  V('439faa32-d8aa-46a7-8cab-feb2ddb059fb', 'operating.fixed_annual', MA, 'music_rights', 6500, 3000, 10000, null, 'estimate'),
  V('864d2b67-2f57-458a-a890-79a0e9d9b2f7', 'operating.fixed_annual', MA, 'security', 18000, 6000, 50000, null, 'estimate'),
  V('094cdff4-2396-474e-88e3-171067bedfb1', 'operating.fixed_annual', MA, 'pest_control', 6000, 3600, 12000, null, 'estimate'),
  V('24f20458-bd8f-4da7-b200-d22f2215b0e8', 'operating.fixed_annual', MA, 'telecom_bank', 9600, 6000, 18000, null, 'estimate'),
  F('121ae799-ab81-4e9a-9dfe-df77553b1112', 'operating.revenue_pct', 'laundry', 0.005, 0.003, 0.01),
  // added later on 8 Oct 2026 (ar-1.3.0 funding)
  V('394235e0-13bc-41bf-b19f-203ab1d003df', 'finance.guarantee_cap', MA, '', 1200000, null, null, null, 'published'),
  V('4e01ecd7-78af-4a9e-bd29-511d325b4cf8', 'finance.sme_lending_rate', MA, 'intelaka', 0.02, null, null, null, 'published'),
  V('0213c44d-9855-4964-bd70-55b3152fcdb6', 'finance.loan_term_months', MA, 'intelaka', 84, 60, 144, null, 'estimate'),
];

const market = { currency: 'MAD', chain: [{ id: GAUTHIER, level: 'district' }, { id: CASA, level: 'city' }, { id: MA, level: 'country' }] };

// Effective concept (CRR budget amendment active: 1,700,000). District Gauthier is PROVISIONAL.
const concept = { seats: '50', ticket: '450', covers: '100', budget: '1700000', city: 'Casablanca', district: 'Gauthier' };

const EST = 'Za3fran estimate, 8 Oct 2026 (research; to be replaced by founder quotes or the equipment tool)';
const est = (key, label, category, amount, low, high, note) => ({ key, label, category, amount, low, high, source: 'estimate', source_name: EST, note });

const intake = {
  reserve_months: 0,               // ar-1.6.0: this dated record predates the 3-month reserve floor
  opening: '2027-10',              // Arnaud: 12 months from 8 Oct 2026
  alcohol: true,
  ramadan: 'closed',               // Arnaud: Canaille closes during Ramadan
  covers_source: 'benchmark',      // Arnaud, 8 Oct 2026: be more conservative than the concept's 100 covers/day
  new_company: true,
  services: [{ id: 'lunch', days: [2, 3, 4, 5] }, { id: 'dinner', days: [3, 4, 5, 6] }],
  rent_monthly: 30000,             // Arnaud: working figure, no offer in hand
  notes: { 'rent.monthly': 'Working figure from the founder, no landlord offer yet' },
  roster: [
    { role: 'founder_floor', brain_role: 'manager', count: 1, source: 'estimate', note: 'Founder runs the floor and draws a salary; amount not given, priced at the Brain manager salary' },
    { role: 'chef', count: 1, source: 'estimate' },
    { role: 'cook', count: 2, count_low: 2, count_high: 3, source: 'estimate', note: 'Lunch and dinner Wed-Fri: 11-hour days on a 44-hour legal week need rotation' },
    { role: 'commis', count: 1, source: 'estimate' },
    { role: 'kitchen_porter', count: 1, source: 'estimate' },
    { role: 'server', count: 3, count_low: 3, count_high: 4, source: 'estimate', note: 'One server per 5-6 tables (generic industry ratio, not Moroccan)' },
    { role: 'bartender', count: 1, source: 'estimate', note: 'Bar and wine service (50-60 wines by the glass with Coravin); no Moroccan sommelier salary found' },
  ],
  investment: [
    est('fitout', 'Travaux et aménagement / Works and fit-out', 'fitout', 510000, 425000, 765000, 'About 170 m² × 3,000 MAD/m² (range 2,500-4,500); Moroccan anchor is one consultancy blog figure for a 200 m² food unit'),
    est('kitchen_equipment', 'Équipement de cuisine / Kitchen equipment', 'equipment', 350000, 250000, 500000, 'French range €30k-60k for a traditional restaurant, scaled; no Moroccan source'),
    est('furniture', 'Mobilier, décoration, éclairage / Furniture, decor, lighting', 'furniture', 150000, 100000, 250000, 'French range €12k-30k for 60 covers, scaled to 50 seats and local manufacture'),
    est('bar_wine', 'Bar et vin / Bar and wine equipment', 'equipment', 120000, 80000, 180000, 'Wine cabinets, Coravin systems, ice machine, glass washer, coffee machine; judgment'),
    est('tableware', 'Arts de la table / Tableware, glassware, linen', 'equipment', 60000, 40000, 90000, 'Judgment'),
    est('it', 'Informatique et encaissement / IT, payments, sound, cameras', 'it', 50000, 30000, 80000, 'Judgment'),
    est('architect', "Honoraires d'architecte / Architect and design fees", 'fitout', 50000, 35000, 75000, 'About 10% of works; judgment'),
    est('setup_legal', 'Création, notaire, bail, conseil licence / Company set-up, notary, lease, licence adviser', 'preopening', 40000, 20000, 70000, 'Judgment'),
    est('licence', 'Licence alcool / Alcohol licence', 'licence', 0, 0, 0, 'No official fee found (arrêté 3-177-66); any real cost must come from a Moroccan adviser. Stated in limits'),
    est('preopening', "Frais de pré-ouverture / Pre-opening costs", 'preopening', 250000, 150000, 330000, 'Team hired one month early, chef two months earlier, three months of rent during works, launch marketing'),
    est('initial_stock', 'Stock initial / Opening stock', 'initial_stock', 150000, 100000, 220000, 'Mainly about 900 bottles for 50-60 references; no Moroccan wholesale wine prices found'),
    est('contingency', 'Imprévus / Contingency', 'contingency', 120000, 60000, 180000, 'About 10% of works, equipment and furniture (a Moroccan works guide recommends 15%)'),
  ],
  // Funding (Arnaud, 8 Oct 2026): the founder brings 20% of total uses; the bank loan is capped at the
  // state-guarantee ceiling (1.2M); a partner takes shares for the rest. Sized in code by the
  // resolver (ar-1.4.0, intake.sizing) since 9 Oct 2026.
  sizing: { founder_share: 0.2, loan_cap: 1200000 },
};

module.exports = { parameters, values, market, concept, intake };
