# Financial engine — method fe-1.3.0

`lib/financial-engine.js` · tests: `node --test tests/*.test.js` · status: **built, not yet wired to any tool**

## Contract
`computePlan(inputs)` → one scenario, plain numbers. `runScenarios(inputs)` → base / conservative / optimistic /
stress. Inputs may contain range nodes `{base, low, high, fav}`. **fe-1.2.0 (approved by Arnaud, 8 Oct 2026):**
conservative and optimistic move each **revenue-side** range (services, ramp, calendar, price growth) **halfway**
to its unfavourable / favourable end; cost-side ranges stay at base and are tested by the single-factor shocks.
**Stress** takes every range at its unfavourable end at once (shown as a stress test, never as a forecast).
plus a ticket × covers sensitivity grid and single-factor shocks. `checkClaimedCovers()` tests a founder's
"covers per day" against seats and hours. No I/O, no model calls, deterministic. All money in whole units;
every total is the sum of the rounded lines shown; covers are whole guests and revenue is computed from them.

## Method
- **Capacity:** covers per service = seats × turns × occupancy × ramp × seasonality × dated factor, on the real
  weekday count of each calendar month. Occupancy is capped at 100%; a cap triggers a critical flag.
- **Lunch and dinner are separate services** with their own days, turns, occupancy, ticket and beverage share.
- **Ticket** is the guest price; revenue is excl. VAT (separate VAT for food and beverage).
- **P&L chain:** revenue − COGS = gross margin; − payroll − rent − opex = EBITDA; − depreciation = EBIT;
  − interest = profit before tax; − corporate tax (brackets, minimum tax, loss carry-forward) = net result.
- **Payroll** from one roster (count × gross × (1 + extra months/12) × (1 + employer charges)), so the staffing
  section and the P&L cannot disagree. `annual_total` exists only to replay old plans.
- **Shareholders** (fe-1.3.0, `funding.shareholders [{label, amount}]`): equity = their sum; share of capital at
  face value (amount / equity). No share premium, dividends or exit modelled.
- **Loans:** monthly annuity, optional interest-only grace; schedule closes exactly to zero.
- **DSCR** = (EBITDA − corporate tax − maintenance capex reserve) / (interest + principal), per operating year.
- **Maintenance capex reserve** (fe-1.1.0, `maintenance_capex.pct_of_revenue`, optional `start_month`): cash set
  aside each month to renew equipment. Not a P&L expense (depreciation already charges wear); it reduces the cash
  plan, the DSCR, cash break-even and payback.
- **Minimum tax** (fe-1.1.0): `tax.minimum_tax_exempt_months` exempts the first N months of trading (Morocco: 36
  for a new company); a year straddling the end is taxed on its post-exemption revenue only.
- **Cash plan:** pre-opening month (funding in, investment out; cash reserve stays in the bank) + 24 months;
  tax paid after a lag; supplier credit days.
- **Break-even:** operating (EBIT = 0) and cash (debt service covered), in revenue/month, covers/open day, occupancy.
- **Payback** on cumulative after-tax EBITDA, net of the capex reserve, vs total investment.

## Simplifications (state them in every plan)
Operating years run 12 months from opening; VAT cash timing not modelled; capex excl. recoverable VAT; one
annual tax payment. Opex lines may be charged on revenue, on beverage revenue (`pct_of_beverage_revenue`, fe-1.2.0) or as fixed amounts.

## Red-flag rules (approved by Arnaud, 3 Oct 2026)
cruise occupancy > 85% per service (critical ≥ 95%) · capacity cap hit · funding gap (base critical, high case
warning) · cash < 0 in 24 months · EBITDA margin > 22% or < 8% (from year 2) · payroll outside 20–38% · rent > 12%
· prime cost > 65% · DSCR < 1.0 / < 1.25 critical, < 1.5 warning · payback < 2 years · loan without interest.

## Canaille v13 replay (tests/fixtures/canaille-v13-replay.js)
The plan's own stated assumptions, run through the engine. Arithmetic errors found in v13: two Y1 revenues
(8,910,000 vs 7,509,600); Q1 and Q4 mis-multiplied; investment high column 2,070,000 shown as 1,670,000;
"EBITDA" was EBIT; no interest on a 1.1M loan; "~10% tax" text vs ~30% applied; payroll 790k vs 1,877,040;
labour cost per cover from a meaningless ratio. Assumption errors the engine now flags: 94–100% seat occupancy
at every service including weekday lunches; one 450 MAD ticket for lunch and dinner; 450 treated as excl. VAT;
year-3 covers (87/day) physically impossible at one turn; payback under one year.

## Canaille live run, 8 Oct 2026 (tests/fixtures/canaille-live-2026-10-08.js, fe-1.2.0 + ar-1.2.0)
Live Brain snapshot + Arnaud's intake + Za3fran estimates (roster, investment). Opening 2027-10, closed in Ramadan,
rent 30,000/month, Brain occupancy (Arnaud chose it over the concept's 100 covers/day), Moroccan cost lines,
20% equity on total uses, cash reserve sized to the conservative scenario's lowest cash point. No grace period:
uses 2,400,000 (cash reserve 490,000), loan 1,920,000; base year 2: 41 covers/day, revenue 4.46M, EBITDA 21.5%,
DSCR 2.08 (year 1: 1.13); conservative year 2: 32 covers/day, EBITDA 13.1%, DSCR 1.04. A 12-month principal grace
cuts the reserve to 280,000 (uses 2,190,000) and lifts base year-1 DSCR to 3.03. All invariants hold in every scenario.

**Funding update, 8 Oct 2026 evening (fe-1.3.0 + ar-1.3.0):** founder brings 20% of total uses, bank loan capped at
the 1.2M state-guarantee ceiling, a partner takes shares at face value for the rest; cash reserve re-sized.
Standard bank rate 7.5%: uses 2,230,000 (reserve 320,000), founder 446,000 (43.3%), partner 584,000 (56.7%);
base DSCR 1.76 / 3.28 / 3.34; conservative year-2 DSCR 1.66. Intelaka 2% (rate unconfirmed for 2026): uses
2,210,000, base DSCR 2.05 / 3.88 / 3.96.
