# ZA3FRAN — HANDOFF BRIEF #8
## Next chat: Phase A, step 3 — cash-reserve sizing and funding in code, then the BP intake form

**Model for the next chat:** Opus-tier for the engine/resolver work and the intake form design; Sonnet for the ticket pilot (task 6).

---

## Where we are (8 Oct 2026, evening)

**Live and verified:** production commit `7d8671d7a0d9f674552448a27c94a20d9886f681` = GitHub HEAD (checked with the Vercel tool after every push). `node --test tests/*.test.js`: **57 passing**. Engine **`fe-1.3.0`**, resolver **`ar-1.3.0`**. Neither is wired to a live tool yet, so the site is unaffected.

**Deployment changed:** Claude now pushes to `main` directly from the chat (session repo access added with `add_repo`, access `push`). Arnaud allowed it on 8 Oct; ask him before each push unless he has said otherwise in that chat.

### Code shipped this chat (4 pushes)
- **fe-1.1.0** — minimum-tax exemption for the first N months (`tax.minimum_tax_exempt_months`); **maintenance capex reserve** (`maintenance_capex.pct_of_revenue`): cash only, never in the P&L; reduces cash plan, DSCR, cash break-even, payback.
- **fe-1.2.0** — **scenario method (approved by Arnaud):** conservative / optimistic move each *revenue-side* range (services, ramp, calendar, price growth) **halfway** to its bad / good end; cost-side ranges stay at base (tested by single-factor shocks). The old all-worst case is kept as **`stress`**. Opex can be charged on beverage revenue (`pct_of_beverage_revenue`).
- **fe-1.3.0** — `funding.shareholders [{label, amount}]`; share of capital at face value; invariant equity = sum.
- **ar-1.1.0** — **Ramadan is a required per-project choice** (`closed` / `reduced` / `normal`), month factors built from `calendar.ramadan_windows`; seasonality `{base, low, high}` reaches the scenarios; **rent-escalation bug fixed** (ar-1.0.0 read the wrong keys and silently dropped it); estimate labelling (`source: 'estimate'` on roster and investment lines, never shown as founder figures); `brain_role` for salary lookup; `intake.budget`.
- **ar-1.2.0** — Moroccan cost lines from the Brain (drinks-outlet tax on beverage revenue, communal services tax on rent, workplace-accident insurance added to employer charges, staff meals, fixed lines per qualifier of `operating.fixed_annual`, variable lines per qualifier of `operating.revenue_pct`), bilingual labels; `covers_source: 'benchmark'`.
- **ar-1.3.0** — `intake.shareholders`; `intake.loan.programme` (a programme-specific Brain rate/term wins over the standard one whatever its class); `LOAN_ABOVE_GUARANTEE_CAP` flag.
- Tests added for every change, including the **TTC convention** (ticket is the guest price; revenue = ticket / (1 + VAT)). Docs updated: `docs/financial-engine.md`, `docs/assumption-resolver.md`, new `docs/bp-intake-requirements.md`.
- New fixture **`tests/fixtures/canaille-live-2026-10-08.js`**: dated snapshot of the live Brain + Canaille intake (Arnaud's answers + labelled Za3fran estimates). It predates the evening verification, so its rows still say published/estimate.

### Brain (Supabase) this chat
**15 values VERIFIED by Arnaud (first verified entries):** corporate tax 20% flat · VAT food 10% · VAT on-site alcohol 10% (one source; accountant check still advised) · minimum tax 0.25% · minimum-tax exemption 36 months · loss carry-forward 4 years · employer charges 21.09% · mandatory bonuses 0 · rent revision cap 10%/3 years · drinks-outlet tax 10% (Casablanca, base supposed = drinks sales) · communal services tax 10.5% · food cost 30% · head chef salary 12,000 · marketing 4% · other opex 5%. Review queue: 15 items `approved`, 0 open.

**Added (all `researched`):** salaries kitchen porter 3,600 and bartender 4,500 · `calendar.ramadan_windows` 2027–2030 (2030 not re-checked) · `calendar.ramadan_trading_level` 0.65 (0.50–0.80, judgment) · `benchmark.maintenance_capex_pct` 2.5% (1.5–4%, judgment from the hotel FF&E convention) · `labour.workplace_accident_pct` 0.5% · `labour.staff_meal_cost` 20 MAD · `operating.fixed_annual`: accounting 50,000, music rights 6,500, security 18,000, pest control 6,000, telecom/bank 9,600 · `operating.revenue_pct` laundry 0.5% · `finance.guarantee_cap` 1.2M · `finance.sme_lending_rate` qualifier `intelaka` 2% (2021 terms, **not confirmed for 2026**) · `finance.loan_term_months` qualifier `intelaka` 84 (60–144).
**Superseded:** Casablanca seasonality (re-stored with ranges), both old Ramadan month maps.
**New parameters:** the above plus `tax.drinks_outlet_pct`, `tax.communal_services_pct`, `tax.minimum_tax_exempt_months`.

### Canaille re-run (fe-1.3.0 + ar-1.3.0, live Brain, standard bank rate)
Opening 2027-10 · **closed during Ramadan** · rent 30,000/month (working figure) · **Brain occupancy, not 100 covers/day** · district Gauthier **provisional** · roster and investment = **Za3fran estimates** (10 staff incl. founder on the floor at the manager salary; investment 1.91M base, 1.32–2.83M).
Funding: total uses **2,230,000** incl. cash reserve 320,000 · founder 446,000 (**43.3%**) · partner 584,000 (**56.7%**) · bank loan **1,200,000** at 7.5% over 7 years.
Base: year 2 = 41 covers/day, revenue 4.46M, EBITDA 21.5%, **DSCR 1.76 / 3.28 / 3.34** (years 1–3). Conservative year-2 DSCR 1.66; cash never negative in base or conservative. Intelaka 2% variant: DSCR 2.05 / 3.88 / 3.96.
Versus the v13 replay (9.15M revenue, DSCR 19): v13 treated 450 as excl. VAT and had no Ramadan, seasonality or ramp.

---

## Decisions taken (8 Oct 2026)
1. Ramadan open/closed is a per-project choice; Canaille **closes**. Recorded: resolver ar-1.1.0, intake requirements doc.
2. Canaille opening = October 2027; rent working figure 30,000 MAD/month.
3. Roster and investment lines researched by Za3fran and labelled *Estimate* until founder quotes or the future installation & equipment tool replace them.
4. Funding raised to cover the full need; founder 20% of total uses; **bank loan capped at the 1.2M guarantee ceiling; a partner takes shares at face value for the rest** (partner majority, 56.7%; a share premium of about 1.36× would keep the founder at 51% — not modelled).
5. Yearly capex provision = maintenance capex reserve, cash only, 2.5% of revenue.
6. Missing Moroccan costs added (taxes, accounting, staff meals, music rights, security, pest control, telecom/bank, laundry, accident insurance).
7. Canaille uses the Brain occupancy benchmark (more conservative than 100 covers/day).
8. **Scenario method:** revenue-side ranges halfway; costs at base; stress kept separately (fe-1.2.0).
9. Drinks-outlet tax base supposed to be drinks sales (to confirm).
10. No loan grace period modelled (no Moroccan source gives a usual deferral length).
11. Depreciation lives approved (fitout 10, equipment/furniture 5, IT 3, pre-opening 5 years; licence, stock, deposit, cash reserve 0).
12. First recommended list approved: 15 Brain values verified.

---

## Tasks for the next chat, in order
0. **Start-up checks:** clone, confirm live commit = GitHub HEAD, run tests (expect 57). Re-add the repo with `add_repo` (push) if the session lacks access.
1. **Cash reserve and funding sizing in code.** Today a scratch script sizes the cash reserve (rounded up so cash never goes negative in base and conservative) and the founder / loan cap / partner split. Move this into the resolver (or an engine helper) with tests, so a plan is reproducible from the intake alone. Intake: `founder_share` or founder amount, `loan_cap`, partner fills.
2. **Optional share premium** (`shareholders[].premium` or a valuation) if Arnaud wants founder control shown; otherwise state face value in limits.
3. **Re-snapshot the Canaille fixture** from the live Brain (verified classes) and add a regression test on its headline figures.
4. **BP intake form** (bilingual, from `docs/bp-intake-requirements.md`): Ramadan question, rent offer mandatory outside Casablanca, per-service TTC tickets, live capacity check, accept-estimates option for roster and investment, shareholders and loan programme with the guarantee ceiling.
5. **Wire the resolver + engine into `generate-bp.js`** behind the intake (persist with `persistResolution`), then Sonnet writing with number-matching and language checks; templates after.
6. **Ticket pilot (Sonnet):** Arnaud creates an Outscraper free account; targeted Casablanca exports; test website/Zenchef menu yield. Confirm any paid cost first.
7. Questions for Arnaud's accountant or bank (one call settles them): drinks-outlet tax base; VAT on on-site alcohol; Intelaka 2026 rate, deferral length and eligibility of an alcohol-licensed restaurant.

---

## Permanent rules to add to the Project instructions
- **Deploying:** Claude may push to `main` from the chat when Arnaud allows it (session needs repo push access via `add_repo`); Claude asks before each push unless Arnaud has said otherwise, and still verifies live commit = GitHub HEAD afterwards. The GitHub web upload remains the fallback.
- **Scenarios:** conservative/optimistic move revenue-side ranges halfway; cost risk is shown by single-factor shocks; the all-worst case is labelled a stress test, never a forecast.
- **Estimates supplied by Za3fran in an intake** carry `source: 'estimate'`, a range and a note, and are never shown as founder figures.
- **Ramadan:** every plan states the project's Ramadan choice; there is no silent default.

---

## Open cleanup (not blocking)
New this chat:
- Investment intake lines are not covered by the impact analysis (only Brain values are); their ranges are wide (fitout 425–765k).
- Possible double counting: staff meals vs food cost; accounting vs the 5% other-opex benchmark. Kept separate on purpose (conservative); revisit with real P&Ls.
- Ramadan 2030 window not re-checked; Moroccan moon sighting can shift dates by a day.
- `review_note` now mixes research notes, ranges and verification stamps; a dedicated `research_note` column would help.
- Payback is null over a 36-month horizon when not reached; the plan text must say "beyond year 3", not "none".
- Cash reserve and funding sizing live in a scratch script (task 1).
Carried from Brief #7:
- `brain_enqueue_refresh_due()` and `brain_enqueue_random_audit()` still need a weekly Vercel cron.
- Menu Engineer: unsourced supplier output; a Canaille run shows `pending_generation` although complete; still reads `concept_snapshot`.
- `bp-pdf.js` lockout counter is per function instance; `/bp-report/:id` rewrite 404s; `api/crr-status.js` and `api/crr-decide.js` unused.
- Re-assessment completion email; `validator_submissions.report_id` mismatch on Canaille; `report_error` has no recovery path; RLS disabled on older tables; Zoco (`ZA3FTEST`) fixture values.
- Viewer consistency (BP vs Menu generating/blocked screens). Delete `bp_crrtest_canaille_v13` once the rebuilt BP passes the gate.
- Arnaud may delete `filtered_reviews_export.csv` from the project uploads.

---

## Links and IDs
- Repo: https://github.com/za3franco/za3fran-website · live commit `7d8671d`
- Engine `lib/financial-engine.js` (fe-1.3.0) · Resolver `lib/assumption-resolver.js` (ar-1.3.0) · Docs `docs/financial-engine.md`, `docs/assumption-resolver.md`, `docs/bp-intake-requirements.md`
- Fixtures: `tests/fixtures/canaille-v13-replay.js`, `tests/fixtures/resolver-brain-test.js` (test data), `tests/fixtures/canaille-live-2026-10-08.js` (live snapshot)
- Supabase `njuojjvregxtwyxznhjf` · tables `brain_parameters`, `brain_parameter_values`, view `brain_values_effective`, `brain_review_queue`, `project_assumptions` · one live row per (parameter, market, format, qualifier): supersede before inserting a replacement
- Vercel project `prj_q3hHSEqTDG2tuaRXeOuKWTqjjLxy`, team `team_mCxAzBP02S8BF3JQddNa47eQ`
- Markets: Morocco `6e6218db-0e40-4fc9-9528-30465935d145` · Casablanca `746b3105-984f-448f-a886-db4d725e31bc` · Gauthier `258db599-2e4c-43ea-8fda-9e27ebc6514d` · Marrakech `5f5463a1-3ae2-4b8b-a321-b51434edae45` · Rabat `e77cf7f2-ef2c-41ca-8ad2-7f25eb118649`
- Canaille project `3c16eff6-5084-4761-a525-a4b6b912c73d`, access code `ESATZMB2`; founder inputs: 50 seats, ticket 450 MAD TTC, 100 covers/day (not used; benchmark chosen), lunch Tue–Fri, dinner Wed–Sat, CRR budget 1,700,000 (superseded by funding sizing)
- Test BP run `bp_crrtest_canaille_v13`: viewer https://www.za3fran.io/api/report-bp-viewer?id=bp_crrtest_canaille_v13&code=ESATZMB2
- Strategy reference: Master Strategy v1.6, Sections 10–17.

To start the next chat, paste this brief as the first message in a new chat in this Project.
