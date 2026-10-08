# Assumption resolver — ar-1.3.0

`lib/assumption-resolver.js` · tests: `tests/assumption-resolver.test.js` (Brain data in `tests/fixtures/resolver-brain-test.js` is TEST DATA) · status: **built, not yet wired to any tool**

## Contract
`resolveAssumptions({ concept, intake, market, format, brain })` is pure. It returns `status` ('ready' | 'blocked'),
`inputs` (ranged, for `runScenarios()`; null when blocked), `assumptions` (appendix rows), `review` (queue rows),
`flags`, `gaps` and `impact`. Database helpers take the Supabase client from the caller: `findMarketChain()`,
`loadBrainContext()`, `persistResolution()` (writes `project_assumptions`, adds only review items not already open).

## Resolution
Founder figure (intake, then effective concept) → Za3fran verified → published → estimate. Within one class the most
specific market wins (district → city → country). A lapsed verification arrives as published (`brain_values_effective`).
A founder figure is a plain number; a Brain value is a range `{base, low, high, fav}` so it reaches the scenarios.
A founder figure outside the Brain's range is used, and raised as `founder_evidence` (never overwrites the profile).
A Brain value outside hard plausibility bounds is not used: `out_of_range` review item, and a blocking gap if required.

## Founder covers
Converted to occupancy per service with `checkClaimedCovers()` (equal split over the week's services). Capped at the
85% cruise rule in **every** scenario; the claim is kept in the flag and the appendix note. Without a founder figure,
occupancy comes from the format benchmark per service.

## Review queue (only the recommended list)
`regulatory` (unverified regulatory value used) · `impact_over_5pct` (moving that value alone to its unfavourable end
shifts total investment, or year-2 operating break-even in revenue or covers, by more than 5%) · `out_of_range` ·
`founder_evidence`. One open item per value and reason.

## Blocking gaps (plan cannot be generated)
Opening month, seats, services, roster, investment lines, rent (offer or surface), equity, and any required tax or
benchmark with no source. Roster and investment are founder-only until staffing and pre-opening benchmarks exist.

## ar-1.1.0 (8 Oct 2026)
- **Ramadan is a per-project choice**, required in the intake: `closed` (level 0; rent, payroll and fixed costs
  continue), `reduced` (Brain `calendar.ramadan_trading_level`, a range that reaches the scenarios) or `normal`.
  Month factor = 1 − share of the month inside `calendar.ramadan_windows` × (1 − level). Other dated events from
  the Brain still multiply. The per-city month maps are retired (superseded in Supabase).
- **Seasonality** stored as `{base, low, high}` arrays becomes per-month ranges (one impact leaf for the whole curve).
- **Rent escalation** reads `{escalation_pct, escalation_every_years}` (ar-1.0.0 silently dropped it).
- **Minimum-tax exemption** (`tax.minimum_tax_exempt_months`) unless `intake.new_company === false`.
- **Maintenance capex reserve** from `benchmark.maintenance_capex_pct` (or `intake.maintenance_capex_pct`).
- **Estimate labelling:** intake roster and investment lines may carry `source: 'estimate'` (+ `source_name`,
  `note`, ranges); the appendix then shows *Estimate*, never *Founder*. Roster lines may set `brain_role` for the
  salary lookup (e.g. a founder working the floor priced as `manager`). Roster headcounts are now recorded.
- **Funding envelope:** `intake.budget` overrides the concept budget.

## ar-1.2.0 (8 Oct 2026)
- **Moroccan cost lines** from the Brain, each skipped when the founder gives the same opex key: drinks-outlet tax
  (`tax.drinks_outlet_pct`, on beverage revenue; base disputed, see the Brain note), communal services tax
  (`tax.communal_services_pct` × rent), workplace-accident insurance (`labour.workplace_accident_pct`, added to
  employer charges), staff meals (`labour.staff_meal_cost` × headcount × open days), one fixed line per qualifier of
  `operating.fixed_annual` (accounting, music_rights, security, pest_control, telecom_bank) and one variable line per
  qualifier of `operating.revenue_pct` (laundry). Labels are bilingual (`LINE_LABELS`).
- **`intake.covers_source: 'benchmark'`**: the Brain occupancy is the base instead of the concept covers/day.

## ar-1.3.0 (8 Oct 2026)
- `intake.shareholders [{label, amount, source?, note?}]` sets equity (sum) and reaches the engine's shareholders.
- `intake.loan.programme` (e.g. `intelaka`): a programme-specific Brain rate or term wins over the standard value
  whatever its source class; without one, the standard value is used.
- `finance.guarantee_cap`: a loan above it raises `LOAN_ABOVE_GUARANTEE_CAP` (warning).

## Pending
Depreciation lives by category (`DEPRECIATION_YEARS`) are proposals awaiting Arnaud's review.
