/* Canaille — replay of the assumptions STATED in bp_crrtest_canaille_v13 (Section 10).
 * Purpose: compute what the plan's own assumptions really give, to separate
 * arithmetic errors (the model's) from assumption errors (inputs).
 * Values marked PLACEHOLDER are not in the plan and await the Morocco market profile.
 * Founder inputs (validator submission): 50 seats, ticket 450 MAD, 100 covers/day,
 * lunch Tue–Fri, dinner Wed–Sat. Amended budget 1,700,000 MAD (CRR).
 */
'use strict';
const LUNCH = [2, 3, 4, 5];   // Tue..Fri
const DINNER = [3, 4, 5, 6];  // Wed..Sat
// Plan's cruise: 75 covers/day over 5 open days = 375/week over 8 services = 46.875 per service -> 0.9375 of 50 seats.
// Plan's Y2 78/day -> 0.975. Plan's Y3 87/day -> 1.0875: physically impossible at 1 turn, capped at 1.0 here.
const OCC = [0.9375, 0.975, 1.0];

module.exports = {
  currency: 'MAD',
  opening: '2027-01',            // plan's Q1 = Jan–Mar
  horizon_months: 36,
  seats: 50,
  services: [
    { id: 'lunch', days: LUNCH, turns: 1, occupancy: OCC, ticket: 450, bev_share: 0 },
    { id: 'dinner', days: DINNER, turns: 1, occupancy: OCC, ticket: 450, bev_share: 0 },
  ],
  // Plan's quarterly covers/day: 45, 65, 75, 75 -> factors of cruise
  ramp: { curve: [0.6, 0.6, 0.6, 0.8667, 0.8667, 0.8667] },
  tax: {
    vat_food: 0, vat_beverage: 0,                 // plan treated 450 as revenue excl. VAT (unconfirmed)
    corporate_brackets: [{ upto: null, rate: 0.20 }], // PLACEHOLDER pending Morocco profile
    minimum_tax_pct_of_revenue: 0.0025,           // PLACEHOLDER pending Morocco profile
    payment_lag_months: 3,
  },
  growth: { price_pct: 0, cost_pct: 0, wage_pct: 0 },
  cogs: { food_pct: 0.30, beverage_pct: 0.30 },   // plan: 30% blended
  labour: { annual_total: 1877040 },              // plan P&L figure (Section 10D)
  rent: { monthly: 35000 },                       // plan: "estimé 35 k/mois"
  opex: [
    { key: 'energy', label: 'Énergie & fluides', pct_of_revenue: 0.024 },
    { key: 'consumables', label: 'Consommables', pct_of_revenue: 0.03 },
    { key: 'marketing', label: 'Marketing', pct_of_revenue: 0.02 },
    { key: 'insurance_other', label: 'Assurances & autres', pct_of_revenue: 0.03 },
  ],
  // Plan Section 10A, low/high as stated; amount = midpoint. Depreciation lives are PLACEHOLDERS (method, for review).
  investment: [
    { key: 'fitout', label: 'Aménagement & rénovation', category: 'fitout', low: 350000, amount: 400000, high: 450000, depreciation_years: 10 },
    { key: 'equipment', label: 'Équipement cuisine & bar', category: 'equipment', low: 280000, amount: 315000, high: 350000, depreciation_years: 5 },
    { key: 'furniture', label: 'Mobilier & décor', category: 'furniture', low: 120000, amount: 140000, high: 160000, depreciation_years: 5 },
    { key: 'it', label: 'IT & POS', category: 'it', low: 40000, amount: 50000, high: 60000, depreciation_years: 3 },
    { key: 'licences', label: 'Licences & permis', category: 'licence', low: 200000, amount: 275000, high: 350000, depreciation_years: 0 },
    { key: 'legal', label: 'Conseil juridique', category: 'preopening', low: 30000, amount: 40000, high: 50000, depreciation_years: 5 },
    { key: 'initial_stock', label: 'Stock initial & fournitures', category: 'initial_stock', low: 200000, amount: 225000, high: 250000, depreciation_years: 0 },
    { key: 'preopening_marketing', label: 'Marketing pré-ouverture', category: 'preopening', low: 40000, amount: 50000, high: 60000, depreciation_years: 5 },
    { key: 'cash_reserve', label: 'Réserve de trésorerie', category: 'cash_reserve', low: 150000, amount: 175000, high: 200000, depreciation_years: 0 },
    { key: 'contingency', label: 'Contingence', category: 'contingency', low: 120000, amount: 130000, high: 140000, depreciation_years: 10 },
  ],
  funding: {
    envelope: 1700000,
    equity: 600000,
    loans: [{ label: 'Emprunt bancaire', amount: 1100000, annual_rate: 0.07, term_months: 144, grace_months: 0 }], // plan: 12–15 y, 6.5–7.5 %
  },
  working_capital: { supplier_days: 0 },
};
