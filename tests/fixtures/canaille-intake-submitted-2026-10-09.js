/* Canaille BP intake as submitted by Arnaud on the live site, 9 Oct 2026 14:33 UTC
 * (bp_intakes.intake, status 'submitted', resolver ar-1.5.0). Funding given as amounts:
 * founder 400,000, investor 600,000, loan 1,500,000 with 12 months interest-only.
 * Used by tests/bp-writer.test.js and the v14 dev runs. Combine with the 9 Oct Brain snapshot
 * (canaille-live-2026-10-09.js) plus the estimate methods (estimate-models-2026-10-09.js).
 */
'use strict';
module.exports = {
  ui: { lang: 'en', roster_mode: 'founder', funding_mode: 'amounts', founder_works: true, founder_salary: 20000, investment_mode: 'founder' },
  loan: { amount: 1500000, grace_months: 12 },
  format: 'bistro_wine_bar',
  roster: [
    { note: 'Founder works in the business', role: 'founder', count: 1, brain_role: 'manager', monthly_gross: 20000 },
    { note: 'One head chef per venue; works the line (covers cook hours)', role: 'chef', count: 1, source: 'estimate', count_low: 1, count_high: 1 },
    { role: 'server', count: 4 },
    { role: 'cook', count: 3 },
    { note: '1 on duty × 51 h open per week, on a 44-hour legal week', role: 'commis', count: 1, source: 'estimate', count_low: 1, count_high: 2 },
    { note: '1 on duty × 51 h open per week, on a 44-hour legal week', role: 'kitchen_porter', count: 1, source: 'estimate', count_low: 1, count_high: 2 },
    { role: 'bartender', count: 2 },
  ],
  alcohol: true,
  founder: { works: true, monthly_gross: 20000 },
  opening: '2027-10',
  ramadan: 'closed',
  district: 'Gauthier',
  services: [
    { id: 'lunch', days: [1, 2, 3, 4, 5], ticket: 350 },
    { id: 'dinner', days: [3, 4, 5, 6], ticket: 650 },
  ],
  investment: [
    { key: 'travaux_et_amenagement_works_and_fit_out_1', low: 500000, high: 900000, label: 'Travaux et aménagement / Works and fit-out', amount: 800000, category: 'fitout' },
    { key: 'equipement_de_cuisine_kitchen_equipment_2', low: 250000, high: 500000, label: 'Équipement de cuisine / Kitchen equipment', amount: 450000, category: 'equipment' },
    { key: 'mobilier_decoration_eclairage_furniture_decor_lighting_3', low: 100000, high: 250000, label: 'Mobilier, décoration, éclairage / Furniture, decor, lighting', amount: 200000, category: 'furniture' },
    { key: 'equipement_de_bar_bar_equipment_4', low: 80000, high: 180000, label: 'Équipement de bar / Bar equipment', amount: 150000, category: 'equipment' },
    { key: 'arts_de_la_table_tableware_glassware_linen_5', low: 40000, high: 90000, label: 'Arts de la table / Tableware, glassware, linen', amount: 70000, category: 'equipment' },
    { key: 'informatique_et_encaissement_it_payments_sound_cameras_6', low: 30000, high: 80000, label: 'Informatique et encaissement / IT, payments, sound, cameras', amount: 60000, category: 'it' },
    { key: 'honoraires_d_architecte_architect_and_design_fees_7', low: 42000, high: 90000, label: "Honoraires d'architecte / Architect and design fees", amount: 60000, category: 'fitout' },
    { key: 'creation_notaire_bail_company_set_up_notary_lease_8', low: 20000, high: 70000, note: 'Judgment', label: 'Création, notaire, bail / Company set-up, notary, lease', amount: 40000, source: 'estimate', category: 'preopening', source_name: 'Za3fran estimate (Brain method cm-1, 2026-10-09)' },
    { key: 'stock_initial_opening_stock_9', low: 100000, high: 220000, label: 'Stock initial / Opening stock', amount: 180000, category: 'initial_stock' },
    { key: 'frais_de_pre_ouverture_pre_opening_costs_10', low: 154000, high: 394000, note: '1 month of payroll before opening (80,857 per month incl. charges), chef 1 month earlier, 3 months of rent during works, launch marketing 40,000', label: 'Frais de pré-ouverture / Pre-opening costs', amount: 225000, source: 'estimate', category: 'preopening', source_name: 'Za3fran estimate (Brain method cm-1, 2026-10-09)' },
    { key: 'imprevus_contingency_11', low: 67000, high: 201000, note: '10% (range 5–15%) of works and fit-out, architect and design fees, kitchen equipment, furniture, decor, lighting, bar equipment, tableware, glassware, linen. A Moroccan works guide recommends 15%', label: 'Imprévus / Contingency', amount: 134000, source: 'estimate', category: 'contingency', source_name: 'Za3fran estimate (Brain method cm-1, 2026-10-09)' },
  ],
  surface_m2: 200,
  new_company: true,
  rent_monthly: 30000,
  shareholders: [{ label: 'Founder', amount: 400000 }, { label: 'Shareholder investor', amount: 600000 }],
  covers_source: 'benchmark',
  supplier_days: 0,
  rent_free_months: 3,
};
