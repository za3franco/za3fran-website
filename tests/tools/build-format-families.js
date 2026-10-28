/* tests/tools/build-format-families.js — writes the migration seeding the Validator v2 format families
 * (restaurant, cafe_brunch, fast_casual, bar_lounge) into the Brain. Run: node tests/tools/build-format-families.js
 * Every value is source_class 'estimate', status 'researched', with its source or an explicit "judgment" note. */
'use strict';
const fs = require('fs');
const path = require('path');

const S = {
  xenia: ['Xenia, Average restaurant food cost by segment (updated 26 Mar 2026; US reference ranges)', 'https://www.xenia.team/articles/average-restaurant-food-cost', '2026-03-26'],
  restolabs: ['Restolabs, Restaurant labor cost percentage by segment (updated 27 Aug 2026; US; cites NRA 2025 full-service median 36.5%)', 'https://www.restolabs.com/blog/restaurant-labor-cost-percentage', '2026-08-27'],
  stackmatix: ['Stackmatix, Restaurant ad budget by concept (6 Sep 2026; US; QSR 3-5%, fast casual 4-6%, casual 3-5%, fine dining 2-4%, launch 6-10%)', 'https://www.stackmatix.com/blog/restaurant-ad-budget-by-concept', '2026-09-06'],
  bellwether: ['Bellwether Coffee, Coffee shop profit margins (3 May 2026; US; COGS 25-35%, labour 25-35%, rent 8-15%)', 'https://bellwethercoffee.com/blog/coffee-shop-profit-margins', '2026-05-03'],
  dojo: ['Dojo Business, Coffee shop profit margin (16 Jun 2025; secondary aggregator; food COGS 30-35%, drink margins 60-85%)', 'https://dojobusiness.com/blogs/news/coffee-shop-profit-margin', '2025-06-16'],
  backbar: ['Backbar, Average pour cost for bars and restaurants (2025; total beverage cost 18-24%)', 'https://www.getbackbar.com/average-liquor-pour-cost-bars-restaurants', null],
  sbdc: ['SBDCNet, Bars and nightclubs industry overview (undated; US; beer ~40%, spirits ~30%, wine ~7%, food and soft drinks ~10% of sales)', 'https://advisors.sbdcnet.org/industry-overview-trends/bars-and-nightclubs.php', null],
  toast_turns: ['Toast, Table turnover rate (4 Nov 2024; US; fast casual 3-4 turns per meal period, fine dining 1-2 per service)', 'https://pos.toasttab.com/blog/on-the-line/table-turnover-rate', '2024-11-04'],
  higherme: ['Higherme (utilities 3-5%); Restroworks P&L template (3.6%) — same sources as the bistro family', 'https://higherme.com/blog/restaurant-monthly-expenses-you-need-to-budget-for', null],
  other: ['Higherme (repairs 1-3%), Lineup (2-6%) — same sources as the bistro family', 'https://higherme.com/blog/restaurant-monthly-expenses-you-need-to-budget-for', null],
  mmcg: ['Judgment from MMCG Invest, Replacement reserves (hotel FF&E 4-5%) — same reasoning as the bistro family', 'https://www.mmcginvest.com/post/replacement-reserves-in-commercial-real-estate-what-you-should-know', null],
  judgment: ['Za3fran judgment, 28 Oct 2026 (no sourced figure for this format)', null, null],
};

// [param, qualifier, base, low, high, unit, src, confidence, note]
const F = {
  restaurant: [
    ['benchmark.food_cost_pct', '', 0.30, 0.28, 0.35, 'pct', 'xenia', 'medium', 'US ranges: casual/upscale casual 28-32%, fine dining 25-35%. Food cost of food sales.'],
    ['benchmark.beverage_cost_pct', '', 0.28, 0.20, 0.36, 'pct', 'backbar', 'low', 'Bar programmes 18-24%; a wine-led list costs more; Moroccan alcohol taxes push purchase costs up. Judgment within sources.'],
    ['benchmark.beverage_share', 'lunch', 0.15, 0.08, 0.25, 'pct', 'judgment', 'low', 'JUDGMENT. Share of the ticket that is drinks at lunch.'],
    ['benchmark.beverage_share', 'dinner', 0.25, 0.15, 0.35, 'pct', 'judgment', 'low', 'JUDGMENT around the 25% sourced for the bistro family.'],
    ['benchmark.payroll_pct', '', 0.34, 0.30, 0.40, 'pct', 'restolabs', 'medium', 'Check band only. Casual 30-35%, fine dining 35-40%; US figures include benefits.'],
    ['benchmark.marketing_pct', '', 0.04, 0.02, 0.06, 'pct', 'stackmatix', 'medium', 'Casual 3-5%, fine dining 2-4% of revenue.'],
    ['benchmark.utilities_pct', '', 0.035, 0.02, 0.05, 'pct', 'higherme', 'medium', 'US ratios; Moroccan tariffs not yet researched.'],
    ['benchmark.other_opex_pct', '', 0.05, 0.03, 0.08, 'pct', 'other', 'low', 'Repairs, supplies, software. Excludes insurance and card fees.'],
    ['benchmark.maintenance_capex_pct', '', 0.025, 0.015, 0.04, 'pct', 'mmcg', 'low', 'ESTIMATE, JUDGMENT. Cash reserve, not a P&L expense.'],
    ['benchmark.turns', 'lunch', 1.2, 0.9, 1.5, 'factor', 'toast_turns', 'low', 'Design capacity per service. US fine dining 1-2; casual higher. Kept low for Moroccan meal lengths (judgment).'],
    ['benchmark.turns', 'dinner', 1.0, 0.8, 1.4, 'factor', 'toast_turns', 'low', 'Design capacity per service; judgment within the US 1-2 fine-dining range.'],
    ['benchmark.cruise_occupancy', 'lunch', 0.50, 0.35, 0.65, 'pct', 'judgment', 'low', 'JUDGMENT, same as the bistro family (weekday lunch below dinner). To review by Arnaud.'],
    ['benchmark.cruise_occupancy', 'dinner', 0.65, 0.50, 0.80, 'pct', 'judgment', 'low', 'JUDGMENT, slightly below the bistro decision (0.70). To review by Arnaud.'],
    ['benchmark.ramp_months', '', 6, 4, 9, 'months', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.ramp_start_factor', '', 0.65, 0.5, 0.8, 'factor', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.occupancy_growth_y3', '', 0.05, 0, 0.08, 'pct', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['operating.revenue_pct', 'laundry', 0.005, 0.003, 0.01, 'pct', 'judgment', 'low', 'ESTIMATE, JUDGMENT. Linen hire or laundry.'],
  ],
  cafe_brunch: [
    ['benchmark.food_cost_pct', '', 0.32, 0.28, 0.38, 'pct', 'dojo', 'low', 'Food COGS 30-35% of food sales; pastries and sandwiches run higher. Secondary aggregator.'],
    ['benchmark.beverage_cost_pct', '', 0.22, 0.15, 0.30, 'pct', 'bellwether', 'low', 'Coffee drinks 60-85% gross margin (Dojo); overall café COGS 25-35% (Bellwether). Judgment within sources.'],
    ['benchmark.beverage_share', 'breakfast', 0.55, 0.40, 0.70, 'pct', 'judgment', 'low', 'JUDGMENT. Coffee-led morning service.'],
    ['benchmark.beverage_share', 'lunch', 0.35, 0.25, 0.50, 'pct', 'judgment', 'low', 'JUDGMENT. Food-led brunch/lunch.'],
    ['benchmark.beverage_share', 'dinner', 0.40, 0.25, 0.55, 'pct', 'judgment', 'low', 'JUDGMENT. Afternoon/evening service of a café.'],
    ['benchmark.payroll_pct', '', 0.30, 0.25, 0.35, 'pct', 'bellwether', 'medium', 'Check band only. Labour 25-35% of revenue.'],
    ['benchmark.marketing_pct', '', 0.03, 0.01, 0.05, 'pct', 'dojo', 'low', 'Derived from monthly marketing spend of 300-1,000 USD on 25-43k USD revenue (about 1-4%).'],
    ['benchmark.utilities_pct', '', 0.04, 0.02, 0.06, 'pct', 'higherme', 'low', 'Espresso machines and long opening hours: placed above the restaurant ratio. Judgment.'],
    ['benchmark.other_opex_pct', '', 0.05, 0.03, 0.08, 'pct', 'other', 'low', 'Repairs, supplies, software, takeaway packaging.'],
    ['benchmark.maintenance_capex_pct', '', 0.025, 0.015, 0.04, 'pct', 'mmcg', 'low', 'ESTIMATE, JUDGMENT. Cash reserve, not a P&L expense.'],
    ['benchmark.turns', 'breakfast', 3.0, 2.0, 4.0, 'factor', 'judgment', 'low', 'JUDGMENT. Short morning visits (coffee, takeaway counted as covers) over about four hours; no sourced café turn figure found.'],
    ['benchmark.turns', 'lunch', 2.0, 1.5, 2.5, 'factor', 'judgment', 'low', 'JUDGMENT. Brunch/lunch visits are longer.'],
    ['benchmark.turns', 'dinner', 2.0, 1.5, 2.5, 'factor', 'judgment', 'low', 'JUDGMENT. Afternoon/evening visits.'],
    ['benchmark.cruise_occupancy', 'breakfast', 0.40, 0.25, 0.55, 'pct', 'judgment', 'low', 'JUDGMENT. To review by Arnaud.'],
    ['benchmark.cruise_occupancy', 'lunch', 0.45, 0.30, 0.60, 'pct', 'judgment', 'low', 'JUDGMENT. To review by Arnaud.'],
    ['benchmark.cruise_occupancy', 'dinner', 0.35, 0.20, 0.50, 'pct', 'judgment', 'low', 'JUDGMENT. To review by Arnaud.'],
    ['benchmark.ramp_months', '', 6, 4, 9, 'months', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.ramp_start_factor', '', 0.65, 0.5, 0.8, 'factor', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.occupancy_growth_y3', '', 0.05, 0, 0.08, 'pct', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['operating.revenue_pct', 'laundry', 0.002, 0.001, 0.005, 'pct', 'judgment', 'low', 'ESTIMATE, JUDGMENT. Few or no tablecloths.'],
  ],
  fast_casual: [
    ['benchmark.food_cost_pct', '', 0.28, 0.25, 0.32, 'pct', 'xenia', 'medium', 'US QSR and fast casual 25-30%; packaging adds a little.'],
    ['benchmark.beverage_cost_pct', '', 0.25, 0.15, 0.32, 'pct', 'judgment', 'low', 'JUDGMENT. Soft drinks and juices; no sourced figure.'],
    ['benchmark.beverage_share', 'lunch', 0.15, 0.10, 0.25, 'pct', 'judgment', 'low', 'JUDGMENT. Drinks share of a fast-casual ticket.'],
    ['benchmark.beverage_share', 'dinner', 0.15, 0.10, 0.25, 'pct', 'judgment', 'low', 'JUDGMENT.'],
    ['benchmark.payroll_pct', '', 0.29, 0.25, 0.33, 'pct', 'restolabs', 'medium', 'Check band only. QSR 25-30%, fast casual 28-33%.'],
    ['benchmark.marketing_pct', '', 0.045, 0.03, 0.06, 'pct', 'stackmatix', 'medium', 'QSR 3-5%, fast casual 4-6% of revenue.'],
    ['benchmark.utilities_pct', '', 0.04, 0.025, 0.06, 'pct', 'higherme', 'low', 'Kitchen-heavy format; placed above the restaurant ratio. Judgment.'],
    ['benchmark.other_opex_pct', '', 0.05, 0.03, 0.08, 'pct', 'other', 'low', 'Repairs, supplies, software, packaging.'],
    ['benchmark.maintenance_capex_pct', '', 0.025, 0.015, 0.04, 'pct', 'mmcg', 'low', 'ESTIMATE, JUDGMENT. Cash reserve, not a P&L expense.'],
    ['benchmark.turns', 'lunch', 3.5, 2.5, 4.0, 'factor', 'toast_turns', 'low', 'US fast casual 3-4 turns per meal period. Takeaway counts as covers.'],
    ['benchmark.turns', 'dinner', 3.0, 2.0, 4.0, 'factor', 'toast_turns', 'low', 'US fast casual 3-4 turns per meal period; evening kept slightly lower (judgment).'],
    ['benchmark.cruise_occupancy', 'lunch', 0.45, 0.30, 0.60, 'pct', 'judgment', 'low', 'JUDGMENT. To review by Arnaud.'],
    ['benchmark.cruise_occupancy', 'dinner', 0.40, 0.25, 0.55, 'pct', 'judgment', 'low', 'JUDGMENT. To review by Arnaud.'],
    ['benchmark.ramp_months', '', 6, 4, 9, 'months', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.ramp_start_factor', '', 0.65, 0.5, 0.8, 'factor', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.occupancy_growth_y3', '', 0.05, 0, 0.08, 'pct', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['operating.revenue_pct', 'laundry', 0.001, 0.0005, 0.003, 'pct', 'judgment', 'low', 'ESTIMATE, JUDGMENT. Aprons and cloths only.'],
  ],
  bar_lounge: [
    ['benchmark.food_cost_pct', '', 0.30, 0.28, 0.35, 'pct', 'xenia', 'low', 'Restaurant ranges applied to a bar menu (small plates). Judgment.'],
    ['benchmark.beverage_cost_pct', '', 0.22, 0.18, 0.28, 'pct', 'backbar', 'medium', 'Total beverage cost 18-24%; the high end allows for Moroccan alcohol taxes.'],
    ['benchmark.beverage_share', 'lunch', 0.50, 0.35, 0.65, 'pct', 'judgment', 'low', 'JUDGMENT. Daytime service (beach club, terrace).'],
    ['benchmark.beverage_share', 'dinner', 0.75, 0.60, 0.80, 'pct', 'sbdc', 'low', 'US bars: alcohol about 77% of sales, food and soft drinks about 10%.'],
    ['benchmark.payroll_pct', '', 0.30, 0.25, 0.35, 'pct', 'restolabs', 'medium', 'Check band only. Bar / beverage-heavy 25-35%.'],
    ['benchmark.marketing_pct', '', 0.05, 0.03, 0.08, 'pct', 'judgment', 'low', 'JUDGMENT. Events, DJs and promotion weigh more than in a restaurant.'],
    ['benchmark.utilities_pct', '', 0.04, 0.03, 0.06, 'pct', 'higherme', 'low', 'Late hours, sound and lighting; placed above the restaurant ratio. Judgment.'],
    ['benchmark.other_opex_pct', '', 0.06, 0.04, 0.09, 'pct', 'other', 'low', 'Repairs, supplies, software, glass breakage. Judgment.'],
    ['benchmark.maintenance_capex_pct', '', 0.03, 0.02, 0.05, 'pct', 'mmcg', 'low', 'ESTIMATE, JUDGMENT. Heavier wear of sound, lighting and terrace furniture.'],
    ['benchmark.turns', 'lunch', 1.0, 0.8, 1.3, 'factor', 'judgment', 'low', 'JUDGMENT. Long daytime stays.'],
    ['benchmark.turns', 'dinner', 1.5, 1.0, 2.0, 'factor', 'judgment', 'low', 'JUDGMENT. Guests come and go through the evening.'],
    ['benchmark.cruise_occupancy', 'lunch', 0.45, 0.30, 0.60, 'pct', 'judgment', 'low', 'JUDGMENT. To review by Arnaud.'],
    ['benchmark.cruise_occupancy', 'dinner', 0.60, 0.45, 0.75, 'pct', 'judgment', 'low', 'JUDGMENT. Weekend peaks, quieter weeknights. To review by Arnaud.'],
    ['benchmark.ramp_months', '', 6, 4, 9, 'months', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.ramp_start_factor', '', 0.65, 0.5, 0.8, 'factor', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['benchmark.occupancy_growth_y3', '', 0.05, 0, 0.08, 'pct', 'judgment', 'low', 'JUDGMENT, same as the bistro decision. To review by Arnaud.'],
    ['operating.revenue_pct', 'laundry', 0.003, 0.002, 0.006, 'pct', 'judgment', 'low', 'ESTIMATE, JUDGMENT.'],
  ],
};

const R = (b, l, h) => ({ low: l, base: b, high: h });
const COMMON = { absence_factor: R(1.12, 1.1, 1.15), overtime_tolerance: 0.1 };
const STAFF = {
  restaurant: { version: 'sm-3r', ...COMMON,
    service_hours: { lunch: R(5, 4.5, 6), dinner: R(6.5, 6, 7.5), default: R(6, 5, 7) },
    fixed: [{ role: 'chef', count: 1, covers: ['cook'], note: 'One head chef per venue; works the line (covers cook hours)' },
      { role: 'manager', count: 1, covers: ['server'], founder_replaces: true, note: 'One floor manager per venue; covers one floor position' }],
    on_duty: [{ role: 'server', seats_per: R(16, 13, 20) }, { role: 'cook', seats_per: R(22, 18, 28), prep_hours_per_day: R(3, 2, 4) },
      { role: 'commis', count: 1, min_seats: 40, prep_hours_per_day: R(2, 1.5, 3) }, { role: 'kitchen_porter', count: 1, prep_hours_per_day: R(1, 0.5, 1.5) },
      { role: 'bartender', count: 1, alcohol_only: true }, { role: 'cleaner', hours_per_open_day: R(4, 3, 6) }],
    growth: { step: 0.5, roles: ['server', 'cook', 'commis', 'kitchen_porter', 'bartender'], from_year: 3, elasticity: R(1, 0.7, 1), note: 'Hours of covers-driven roles follow covers from year 2 to year 3; rounded to half-time posts' } },
  cafe_brunch: { version: 'sm-3c', ...COMMON,
    service_hours: { breakfast: R(4, 3.5, 5), lunch: R(4.5, 4, 5.5), dinner: R(4.5, 4, 5.5), default: R(5, 4, 6) },
    fixed: [{ role: 'manager', count: 1, covers: ['server'], founder_replaces: true, note: 'One manager per venue; works the floor or the counter' }],
    on_duty: [{ role: 'barista', brain_role: 'bartender', seats_per: R(50, 40, 60), note: 'Salary looked up as bartender' },
      { role: 'server', seats_per: R(30, 25, 35) }, { role: 'cook', seats_per: R(50, 40, 60), prep_hours_per_day: R(2, 1.5, 3) },
      { role: 'kitchen_porter', count: 1, min_seats: 30, prep_hours_per_day: R(1, 0.5, 1) }, { role: 'cleaner', hours_per_open_day: R(3, 2, 4) }],
    growth: { step: 0.5, roles: ['barista', 'server', 'cook', 'kitchen_porter'], from_year: 3, elasticity: R(1, 0.7, 1), note: 'Hours of covers-driven roles follow covers from year 2 to year 3; rounded to half-time posts' } },
  fast_casual: { version: 'sm-3f', ...COMMON,
    service_hours: { lunch: R(4.5, 4, 5.5), dinner: R(5, 4.5, 6), default: R(5, 4.5, 6) },
    fixed: [{ role: 'chef', count: 1, covers: ['cook'], note: 'One kitchen lead per venue; works the line' },
      { role: 'manager', count: 1, covers: ['counter'], founder_replaces: true, note: 'One shift manager per venue; covers one counter position' }],
    on_duty: [{ role: 'counter', brain_role: 'server', seats_per: R(40, 30, 50), note: 'Counter and floor; salary looked up as server' },
      { role: 'cook', seats_per: R(40, 30, 50), prep_hours_per_day: R(3, 2, 4) }, { role: 'commis', count: 1, min_seats: 40, prep_hours_per_day: R(2, 1, 2) },
      { role: 'kitchen_porter', count: 1, prep_hours_per_day: R(1, 0.5, 1.5) }, { role: 'cleaner', hours_per_open_day: R(4, 3, 5) }],
    growth: { step: 0.5, roles: ['counter', 'cook', 'commis', 'kitchen_porter'], from_year: 3, elasticity: R(1, 0.7, 1), note: 'Hours of covers-driven roles follow covers from year 2 to year 3; rounded to half-time posts' } },
  bar_lounge: { version: 'sm-3b', ...COMMON,
    service_hours: { lunch: R(6, 5, 7), dinner: R(7, 6, 8), default: R(7, 6, 8) },
    fixed: [{ role: 'chef', count: 1, covers: ['cook'], note: 'One kitchen lead per venue; works the line' },
      { role: 'manager', count: 1, covers: ['server'], founder_replaces: true, note: 'One floor manager per venue; covers one floor position' }],
    on_duty: [{ role: 'bartender', seats_per: R(25, 20, 35) }, { role: 'server', seats_per: R(20, 15, 25) },
      { role: 'cook', seats_per: R(40, 30, 50), prep_hours_per_day: R(2, 1, 3) }, { role: 'kitchen_porter', count: 1, prep_hours_per_day: R(1, 0.5, 1) },
      { role: 'cleaner', hours_per_open_day: R(4, 3, 6) }],
    growth: { step: 0.5, roles: ['bartender', 'server', 'cook', 'kitchen_porter'], from_year: 3, elasticity: R(1, 0.7, 1), note: 'Hours of covers-driven roles follow covers from year 2 to year 3; rounded to half-time posts' } },
};

const L = (key, label, category, per, b, l, h, note, extra = {}) => ({ key, label, category, per, base: b, low: l, high: h, note, ...extra });
const PRE = (mk, chef) => ({ key: 'preopening', per: 'preopening', label: 'Frais de pré-ouverture / Pre-opening costs', category: 'preopening',
  works_months: R(3, 2, 4), payroll_months: R(1, 1, 1.5), launch_marketing: mk, chef_extra_months: chef });
const COMMON_LINES = (ofContingency) => [
  L('architect', "Honoraires d'architecte / Architect and design fees", 'fitout', 'pct_of', 0.1, 0.07, 0.15, 'Judgment', { of: ['fitout'] }),
  L('setup_legal', 'Création, notaire, bail / Company set-up, notary, lease', 'preopening', 'lump', 40000, 20000, 70000, 'Judgment'),
];
const CONT = (of) => L('contingency', 'Imprévus / Contingency', 'contingency', 'pct_of', 0.1, 0.05, 0.15, 'A Moroccan works guide recommends 15%', { of });
const CAPEX = {
  restaurant: { version: 'cm-1r', m2_per_seat: R(3.4, 3, 4), lines: [
    L('fitout', 'Travaux et aménagement / Works and fit-out', 'fitout', 'm2', 3000, 2500, 4500, 'Same Moroccan anchor as the bistro method (one consultancy blog figure for a 200 m² food unit); fine dining sits at the high end'),
    L('kitchen_equipment', 'Équipement de cuisine / Kitchen equipment', 'equipment', 'seat', 7000, 5000, 10000, 'French range for a traditional restaurant, scaled; no Moroccan source'),
    L('furniture', 'Mobilier, décoration, éclairage / Furniture, decor, lighting', 'furniture', 'seat', 3000, 2000, 5000, 'French range scaled to local manufacture; judgment'),
    L('bar', 'Équipement de bar / Bar equipment', 'equipment', 'lump', 100000, 60000, 150000, 'Judgment', { alcohol_only: true }),
    L('tableware', 'Arts de la table / Tableware, glassware, linen', 'equipment', 'seat', 1200, 800, 1800, 'Judgment'),
    L('it', 'Informatique et encaissement / IT, payments, sound, cameras', 'it', 'lump', 50000, 30000, 80000, 'Judgment'),
    ...COMMON_LINES(),
    L('initial_stock', 'Stock initial / Opening stock', 'initial_stock', 'seat', 1000, 700, 1500, 'No Moroccan wholesale prices found; judgment', { alcohol_extra_per_seat: R(1500, 1000, 2500) }),
    PRE(R(40000, 20000, 80000), R(1, 0.5, 2)),
    CONT(['fitout', 'architect', 'kitchen_equipment', 'furniture', 'bar', 'tableware']) ] },
  cafe_brunch: { version: 'cm-1c', m2_per_seat: R(2.6, 2.2, 3.2), lines: [
    L('fitout', 'Travaux et aménagement / Works and fit-out', 'fitout', 'm2', 2800, 2200, 4000, 'Bistro anchor lowered for a lighter kitchen; judgment'),
    L('coffee_equipment', 'Machine à café, moulins, vitrines / Espresso machine, grinders, display', 'equipment', 'lump', 100000, 60000, 160000, 'Judgment'),
    L('kitchen_equipment', 'Équipement de cuisine / Kitchen equipment', 'equipment', 'seat', 4500, 3000, 6500, 'Bistro rate scaled down for a brunch kitchen; judgment'),
    L('furniture', 'Mobilier, décoration, éclairage / Furniture, decor, lighting', 'furniture', 'seat', 2500, 1500, 4000, 'Judgment'),
    L('tableware', 'Vaisselle, tasses, verres / Tableware, cups, glassware', 'equipment', 'seat', 600, 400, 900, 'Judgment'),
    L('it', 'Informatique et encaissement / IT, payments, sound, cameras', 'it', 'lump', 40000, 25000, 60000, 'Judgment'),
    ...COMMON_LINES(),
    L('initial_stock', 'Stock initial / Opening stock', 'initial_stock', 'seat', 500, 300, 800, 'Judgment', { alcohol_extra_per_seat: R(1000, 700, 1500) }),
    PRE(R(30000, 15000, 60000), R(0.5, 0, 1)),
    CONT(['fitout', 'architect', 'coffee_equipment', 'kitchen_equipment', 'furniture', 'tableware']) ] },
  fast_casual: { version: 'cm-1f', m2_per_seat: R(2.2, 1.8, 2.8), lines: [
    L('fitout', 'Travaux et aménagement / Works and fit-out', 'fitout', 'm2', 3200, 2500, 4500, 'Bistro anchor raised for extraction and a production kitchen; judgment'),
    L('kitchen_equipment', 'Équipement de cuisine / Kitchen equipment', 'equipment', 'seat', 6000, 4000, 9000, 'Judgment'),
    L('furniture', 'Mobilier, décoration, éclairage / Furniture, decor, lighting', 'furniture', 'seat', 1500, 1000, 2500, 'Judgment'),
    L('tableware', 'Petit matériel et emballages / Smallwares and packaging', 'equipment', 'seat', 400, 200, 700, 'Judgment'),
    L('it', 'Caisse, bornes, livraison / POS, kiosks, delivery integration', 'it', 'lump', 60000, 40000, 90000, 'Judgment'),
    ...COMMON_LINES(),
    L('initial_stock', 'Stock initial / Opening stock', 'initial_stock', 'seat', 500, 300, 800, 'Judgment'),
    PRE(R(50000, 30000, 90000), R(0.5, 0, 1)),
    CONT(['fitout', 'architect', 'kitchen_equipment', 'furniture', 'tableware']) ] },
  bar_lounge: { version: 'cm-1b', m2_per_seat: R(2.6, 2.2, 3.2), lines: [
    L('fitout', 'Travaux, acoustique, éclairage / Works, acoustics, lighting', 'fitout', 'm2', 3800, 3000, 5500, 'Bistro anchor raised for sound, lighting and acoustic work; judgment'),
    L('bar', 'Équipement de bar / Bar equipment', 'equipment', 'lump', 180000, 120000, 280000, 'Judgment'),
    L('kitchen_equipment', 'Équipement de cuisine / Kitchen equipment', 'equipment', 'seat', 3000, 2000, 4500, 'Small-plates kitchen; judgment'),
    L('furniture', 'Mobilier, décoration, éclairage / Furniture, decor, lighting', 'furniture', 'seat', 3500, 2500, 5500, 'Judgment'),
    L('tableware', 'Verrerie et arts de la table / Glassware and tableware', 'equipment', 'seat', 900, 600, 1400, 'Judgment'),
    L('it', 'Son, informatique, encaissement / Sound system, IT, payments', 'it', 'lump', 100000, 60000, 160000, 'Judgment'),
    ...COMMON_LINES(),
    L('initial_stock', 'Stock initial / Opening stock', 'initial_stock', 'seat', 800, 500, 1200, 'Judgment', { alcohol_extra_per_seat: R(2500, 1500, 3500) }),
    PRE(R(70000, 40000, 120000), R(0.5, 0, 1)),
    CONT(['fitout', 'architect', 'bar', 'kitchen_equipment', 'furniture', 'tableware']) ] },
};
CAPEX.restaurant.lines.find((l) => l.key === 'architect').of = ['fitout'];

const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const rows = [];
const reviewKeys = new Set(['benchmark.cruise_occupancy', 'benchmark.ramp_months', 'benchmark.ramp_start_factor', 'benchmark.occupancy_growth_y3', 'benchmark.staffing_model', 'benchmark.capex_model']);
for (const [fmt, list] of Object.entries(F)) {
  for (const [key, qual, b, lo, hi, unit, src, conf, note] of list) {
    const [sn, su, sp] = S[src];
    rows.push(`(${q(key)}, null, ${q(fmt)}, ${q(qual)}, ${b}, ${lo}, ${hi}, null, ${q(unit)}, null, ${q(sn)}, ${q(su)}, ${sp ? q(sp) + '::date' : 'null'}, ${q(conf)}, ${q(note)})`);
  }
  rows.push(`('benchmark.staffing_model', null, ${q(fmt)}, '', null, null, null, ${j(STAFF[fmt])}, 'json', null, ${q('Za3fran judgment, 28 Oct 2026: adapted from the bistro method sm-3 for this format (positions per seat, service hours, legal week)')}, null, null, 'low', ${q('ESTIMATE, JUDGMENT. New method for the Validator v2 format families; to review by Arnaud.')})`);
  rows.push(`('benchmark.capex_model', (select id from brain_markets where country_code = 'MA' and city is null), null, ${q(fmt)}, null, null, null, ${j(CAPEX[fmt])}, 'json', 'MAD', ${q('Za3fran judgment, 28 Oct 2026: bistro method cm-1 adapted for this format (French ranges scaled, one Moroccan consultancy blog for fit-out). Secondary and foreign sources; no Moroccan benchmark found.')}, null, null, 'low', ${q('ESTIMATE, JUDGMENT. Rates in MAD excl. VAT. Replace with founder quotes or the Installation & Equipment tool when available.')})`);
}

const sql = `-- 20261028b_brain_format_families.sql — Validator v2 (val-2.0.0): Brain format families beside bistro_wine_bar.
-- restaurant (casual, fine dining, hotel F&B), cafe_brunch, fast_casual (fast casual, food hall), bar_lounge (bar, rooftop, beach club).
-- Generated by tests/tools/build-format-families.js. Every value is an estimate, status 'researched', with its source or a JUDGMENT note.
-- New methods and operator-judgment values go to Arnaud's review queue (reason 'method_change'); they never block a report.

begin;

with v (parameter_key, market_id, format_key, qualifier, value_num, low, high, value_json, unit, currency, source_name, source_url, source_published_at, confidence, review_note) as (values
${rows.join(',\n')}
), ins as (
  insert into brain_parameter_values (parameter_key, market_id, format_key, qualifier, value_num, low, high, value_json, unit, currency,
    source_class, status, source_name, source_url, source_published_at, confidence, researched_by, review_note)
  select parameter_key, market_id, format_key, qualifier, value_num, low, high, value_json, unit, currency,
    'estimate', 'researched', source_name, source_url, source_published_at, confidence, 'claude', review_note
  from v
  where not exists (select 1 from brain_parameter_values x where x.parameter_key = v.parameter_key and x.status in ('researched','verified')
    and coalesce(x.format_key, '') = coalesce(v.format_key, '') and x.qualifier = v.qualifier and x.market_id is not distinct from v.market_id)
  returning id, parameter_key
)
insert into brain_review_queue (value_id, parameter_key, reason, detail)
select id, parameter_key, 'method_change', '{"why":"New Validator v2 format family (28 Oct 2026); operator judgment to review"}'::jsonb
from ins where parameter_key in (${[...reviewKeys].map(q).join(', ')})
on conflict do nothing;

commit;
`;
if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, '../../supabase/migrations/20261028b_brain_format_families.sql'), sql);
  console.log('rows', rows.length);
}

/** The same values as Brain rows, for tests (fixture shape of brain_values_effective). */
function asBrainRows(marketId) {
  const out = [];
  let n = 0;
  for (const [fmt, list] of Object.entries(F)) {
    for (const [key, qual, b, lo, hi, unit, src, conf] of list) {
      out.push({ id: `ff-${++n}`, parameter_key: key, market_id: null, format_key: fmt, qualifier: qual, value_num: b, low: lo, high: hi, value_json: null,
        unit, currency: null, source_class: 'estimate', effective_source_class: 'estimate', status: 'researched', effective_status: 'researched',
        source_name: S[src][0], source_url: S[src][1], confidence: conf, observed_at: '2026-10-28' });
    }
    out.push({ id: `ff-${++n}`, parameter_key: 'benchmark.staffing_model', market_id: null, format_key: fmt, qualifier: '', value_num: null, low: null, high: null,
      value_json: STAFF[fmt], unit: 'json', currency: null, source_class: 'estimate', effective_source_class: 'estimate', status: 'researched', effective_status: 'researched', confidence: 'low', observed_at: '2026-10-28' });
    out.push({ id: `ff-${++n}`, parameter_key: 'benchmark.capex_model', market_id: marketId, format_key: null, qualifier: fmt, value_num: null, low: null, high: null,
      value_json: CAPEX[fmt], unit: 'json', currency: 'MAD', source_class: 'estimate', effective_source_class: 'estimate', status: 'researched', effective_status: 'researched', confidence: 'low', observed_at: '2026-10-28' });
  }
  return out;
}
module.exports = { F, STAFF, CAPEX, asBrainRows };
