# Assumption resolver — ar-1.5.0

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

## ar-1.5.0 (9 Oct 2026) — automatic estimates, no manual step
Decision (Arnaud, 9 Oct 2026): nobody at Za3fran prepares estimates by hand; the founder never waits.
- `intake.estimate = { roster?, investment? }` (set by the form when the founder picks "Za3fran estimates…")
  and `intake.founder = { works, monthly_gross? }`.
- No roster lines + `estimate.roster` → `lib/estimates.js estimateRoster()` with the Brain method
  `benchmark.staffing_model` (format) and `labour.legal_hours_week`: fixed roles per venue (chef, manager or
  the founder), on-duty positions per service (servers and cooks per seats, one commis from 40 seats, one
  porter, one bartender when alcohol is served); people = ceil(weekly hours ÷ legal week − 0.2), less the hours
  of fixed roles that cover a station. Lines carry `source: 'estimate'`, `count_low/high` and a note.
- No investment lines + `estimate.investment` → `estimateInvestment()` with `benchmark.capex_model`
  (market, qualifier = format, currency checked): fit-out per m² (surface from seats × m² per seat when not
  given), equipment / furniture / tableware / opening stock per seat, lump sums, architect and contingency
  as a % of base amounts (ranges never compound), pre-opening = payroll months × payroll incl. charges +
  extra chef month + works months × rent + launch marketing. Amounts rounded to 1,000.
- `result.estimated` returns the lines (form preview and take-over). Appendix rows `labour.roster.method`
  and `investment.method` point at the Brain method rows. Founder lines always win.
- Missing method → blocking gap ("No Za3fran staffing / investment method …"), never a guess.
- Methods stored 9 Oct 2026 as estimates (judgment, low confidence), one `method_change` review item each;
  nothing waits for that review. Canaille founder-given figures unchanged.

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
Nothing on the method. Depreciation lives by category (`DEPRECIATION_YEARS`) were approved by Arnaud on 8 Oct 2026, together with the first recommended list (15 Brain values now verified).

## ar-1.4.0 (9 Oct 2026) — funding sizing in code
`intake.sizing = { founder_share | founder_amount, loan_cap?, reserve_step?, founder_label?, partner_label?, founder_target_share? }`
replaces the scratch script, so a plan is reproducible from the intake alone (`sizeFunding`, pure):
- **Cash reserve:** smallest multiple of `reserve_step` (default 10,000) that keeps the engine's cash plan at or
  above zero in the **base and conservative** scenarios. The search repeats because a larger reserve means a larger
  loan and more interest. A founder `cash_reserve` investment line is kept as given (`reserve_from_founder`).
- **Founder** = `founder_amount`, or `founder_share` × total uses rounded to 1,000.
- **Loan** = the rest up to `loan_cap` (a number; default or `'guarantee'` = Brain `finance.guarantee_cap`).
  Rate and term still come from `intake.loan` or the Brain (programme first).
- **Partner** = what is left, at face value. `result.sizing.price_factor_for_target` is the issue price that
  would keep the founder at `founder_target_share` (default 51%).
- Blocking gaps: a rule *and* amounts (shareholders, equity or loan amount) together; a rule without founder
  share or amount; a reserve search that does not converge.
- `intake.shareholders[].price_factor` passes through to fe-1.4.0 when funding is given as amounts.
- Canaille (fixture of 8 Oct): reserve 320,000 · uses 2,230,000 · founder 446,000 (43.3%) · partner 584,000 ·
  loan 1,200,000 · DSCR 1.76 / 3.28 / 3.34 — identical to the approved scratch run (`tests/funding-sizing.test.js`).

## ar-1.4.1 (9 Oct 2026)
- A verified Brain value is not re-queued as `impact_over_5pct` (approval covers it); it still reaches the queue
  for `founder_evidence` and `out_of_range`. Found on the Canaille re-snapshot: food cost, chef salary, marketing
  and other opex would otherwise reopen on every run. Figures unchanged.
- Canaille fixture re-snapshotted from the live Brain on 9 Oct (`tests/fixtures/canaille-live-2026-10-09.js`): the
  15 verified values arrive as `za3fran_verified`; every number the resolver reads is unchanged from 8 Oct.
