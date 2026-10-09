/* Canaille fixture, 9 Oct 2026 — live Brain re-snapshot (resolver ar-1.4.0, engine fe-1.4.0).
 *
 * Pulled from brain_values_effective on 9 Oct 2026 for the Gauthier -> Casablanca -> Morocco chain and
 * the bistro_wine_bar format. Every numeric row the resolver reads is IDENTICAL to the 8 Oct snapshot
 * (canaille-live-2026-10-08.js) except the 15 values Arnaud verified on the evening of 8 Oct, which now
 * arrive as status 'verified' / class 'za3fran_verified'. This file applies exactly that delta, so the
 * 8 Oct file stays the dated record of what the Brain held before verification.
 *
 * Live rows not carried (the resolver does not read them): benchmark.payroll_pct,
 * labour.legal_hours_week, labour.minimum_wage_monthly, and the text rows finance.collateral_practice,
 * regulation.food_safety.
 *
 * Concept, intake (incl. intake.sizing) and market chain: unchanged from 8 Oct.
 */
'use strict';

const base = require('./canaille-live-2026-10-08.js');

/** Verified by Arnaud, 8 Oct 2026 (brain_review_queue: 15 items approved). value id -> parameter. */
const VERIFIED = {
  'bdb2b9bf-4e99-4faf-86fc-961997c76e69': 'tax.corporate_brackets',        // 20% flat
  '839d53f9-9b42-4912-b1ed-e41f99067838': 'tax.vat_food_service',          // 10%
  '3f9b2588-6463-447f-81db-729f0f46ac5c': 'tax.vat_alcohol',               // 10% (accountant check still advised)
  '6aaf1190-5362-488c-bab5-235d9d565d95': 'tax.minimum_tax_pct',           // 0.25%
  'edac661b-9979-4f2f-b09a-3d67dd267360': 'tax.minimum_tax_exempt_months', // 36
  'f87933dc-3bdb-4a2f-b2dd-65118f900da1': 'tax.loss_carryforward_years',   // 4
  '2fa4d23b-fa5d-4298-9732-9aa36007561a': 'labour.employer_charges_pct',   // 21.09%
  '71f31a55-6ac4-48ad-8313-a4a2925f8281': 'labour.extra_months',           // 0
  '1face0a2-f6c9-4d6f-84d2-9d667f9f625e': 'property.rent_escalation',      // 10% / 3 years
  '86d824cd-1540-4a6a-a095-ba7f52c6bdfb': 'tax.drinks_outlet_pct',         // 10% Casablanca
  '313d47b9-db13-41ec-94a9-01a6dfc168e8': 'tax.communal_services_pct',     // 10.5%
  'c654f77a-5579-48e0-ba3a-50e8b5ad0c91': 'benchmark.food_cost_pct',       // 30%
  'd5a4f11d-2580-4c62-ae8e-e29cfacb7bf3': 'labour.salary_monthly/chef',    // 12,000
  '99e597f1-ceff-42f4-a727-ddc9b294fea7': 'benchmark.marketing_pct',       // 4%
  '064646ea-da40-46e4-8a7f-1e4bc58cc90e': 'benchmark.other_opex_pct',      // 5%
};

const values = base.values.map((v) => (VERIFIED[v.id]
  ? { ...v, effective_source_class: 'za3fran_verified', status: 'verified', effective_status: 'verified' }
  : { ...v }));

module.exports = { ...base, values, VERIFIED, snapshot_date: '2026-10-09' };
