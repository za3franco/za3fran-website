// Morocco payroll rules 2026 — the same JSON as the Brain value labour.payroll_rules (market MA),
// inserted by supabase/migrations/20261029_brain_payroll_rules_ma.sql. Keep both in step.
module.exports = {
  year: 2026,
  country: 'MA',
  social: [
    { key: 'cnss_short_term', rate: 0.0052, ceiling_monthly: 6000, deductible: true },
    { key: 'cnss_long_term', rate: 0.0396, ceiling_monthly: 6000, deductible: true },
    { key: 'amo', rate: 0.0226, ceiling_monthly: null, deductible: true },
  ],
  prof_expenses: { brackets: [
    { up_to_annual_gross: 78000, rate: 0.35, cap_annual: null },
    { up_to_annual_gross: null, rate: 0.25, cap_annual: 35000 },
  ] },
  income_tax: { brackets: [
    { up_to: 40000, rate: 0, deduct: 0 },
    { up_to: 60000, rate: 0.10, deduct: 4000 },
    { up_to: 80000, rate: 0.20, deduct: 10000 },
    { up_to: 100000, rate: 0.30, deduct: 18000 },
    { up_to: 180000, rate: 0.34, deduct: 22000 },
    { up_to: null, rate: 0.37, deduct: 27400 },
  ] },
  family: { per_dependent_annual: 500, cap_annual: 3000 },
};
