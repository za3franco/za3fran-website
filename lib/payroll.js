// lib/payroll.js — employee payroll conversions (net <-> gross) from the Brain's payroll rules.
//
// PAYROLL_VERSION pr-1.0.0 (29 Oct 2026).
//
// The rules are a Brain value (`labour.payroll_rules`, one JSON per country, status researched until Arnaud
// approves it). This module only computes; it never holds a rate of its own (Brain rule 1 and 2).
//
// Rules shape (all amounts in the market currency):
//   {
//     year: 2026,
//     social: [{ key, rate, ceiling_monthly|null, deductible: true }],   // employee shares, on monthly gross
//     prof_expenses: { brackets: [{ up_to_annual_gross|null, rate, cap_annual|null }] },  // on annual gross
//     income_tax: { brackets: [{ up_to|null, rate, deduct }] },   // annual net taxable income
//     family: { per_dependent_annual, cap_annual }
//   }
//
// Assumptions stated wherever a converted figure is shown: salaried status (the founder is paid as an
// employee of the company), no dependents (prudent: the highest gross for a given net), no other
// deduction (complementary pension, loan interest, etc.).

const PAYROLL_VERSION = 'pr-1.0.0';

function round2(x) { return Math.round(x * 100) / 100; }

function validRules(rules) {
  return !!(rules && Array.isArray(rules.social) && rules.prof_expenses && Array.isArray(rules.prof_expenses.brackets)
    && rules.income_tax && Array.isArray(rules.income_tax.brackets) && rules.income_tax.brackets.length);
}

function annualIncomeTax(taxable, brackets) {
  if (taxable <= 0) return 0;
  const b = brackets.find((x) => x.up_to == null || taxable <= x.up_to) || brackets[brackets.length - 1];
  return Math.max(0, taxable * b.rate - (b.deduct || 0));
}

function profExpenses(annualGross, pe) {
  const b = pe.brackets.find((x) => x.up_to_annual_gross == null || annualGross <= x.up_to_annual_gross) || pe.brackets[pe.brackets.length - 1];
  const v = annualGross * b.rate;
  return b.cap_annual != null ? Math.min(v, b.cap_annual) : v;
}

/** Monthly gross -> detailed monthly net. dependents defaults to 0. */
function grossToNet(monthlyGross, rules, { dependents = 0 } = {}) {
  if (!validRules(rules)) throw new Error('payroll rules missing or malformed');
  const g = Math.max(0, Number(monthlyGross) || 0);
  const social = rules.social.map((s) => {
    const base = s.ceiling_monthly != null ? Math.min(g, s.ceiling_monthly) : g;
    return { key: s.key, amount: base * s.rate, deductible: s.deductible !== false };
  });
  const socialMonthly = social.reduce((a, s) => a + s.amount, 0);
  const socialDeductibleAnnual = social.filter((s) => s.deductible).reduce((a, s) => a + s.amount, 0) * 12;
  const annualGross = g * 12;
  const fp = profExpenses(annualGross, rules.prof_expenses);
  const taxable = Math.max(0, annualGross - fp - socialDeductibleAnnual);
  let tax = annualIncomeTax(taxable, rules.income_tax.brackets);
  if (rules.family && dependents > 0) tax = Math.max(0, tax - Math.min(dependents * rules.family.per_dependent_annual, rules.family.cap_annual));
  const taxMonthly = tax / 12;
  return {
    gross: round2(g),
    social: social.map((s) => ({ key: s.key, amount: round2(s.amount) })),
    social_total: round2(socialMonthly),
    prof_expenses_annual: round2(fp),
    taxable_annual: round2(taxable),
    income_tax: round2(taxMonthly),
    net: round2(g - socialMonthly - taxMonthly),
  };
}

/** Monthly net -> monthly gross (rounded up to the unit), by bisection: grossToNet is increasing in gross. */
function netToGross(monthlyNet, rules, opts = {}) {
  if (!validRules(rules)) throw new Error('payroll rules missing or malformed');
  const n = Math.max(0, Number(monthlyNet) || 0);
  if (n === 0) return { ...grossToNet(0, rules, opts), net_target: 0 };
  let lo = n, hi = n * 2.5;
  while (grossToNet(hi, rules, opts).net < n) hi *= 2;
  for (let i = 0; i < 80 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (grossToNet(mid, rules, opts).net < n) lo = mid; else hi = mid;
  }
  const gross = Math.ceil(hi - 1e-9);
  return { ...grossToNet(gross, rules, opts), net_target: n };
}

/** Loads the effective payroll rules for a market chain (country level). null when the Brain has none. */
async function loadPayrollRules(supabase, chainIds) {
  if (!chainIds || !chainIds.length) return null;
  const r = await supabase.from('brain_values_effective').select('value_json, status, source_name, source_published_at')
    .eq('parameter_key', 'labour.payroll_rules').in('market_id', chainIds).limit(1);
  const row = !r.error && r.data && r.data[0];
  if (!row || !validRules(row.value_json)) return null;
  return { ...row.value_json, status: row.status, source_name: row.source_name };
}

module.exports = { PAYROLL_VERSION, grossToNet, netToGross, loadPayrollRules, validRules };
