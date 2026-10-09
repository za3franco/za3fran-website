# ZA3FRAN — HANDOFF BRIEF #9
## Next chat: Phase A, step 4 — wire intake + resolver + engine into `generate-bp.js`, then Sonnet writing with number and language checks

**Model for the next chat:** Opus-tier (generation pipeline design and French prompt engineering for bank framing). Sonnet is fine for the email redesign (task 1).

---

## Where we are (9 Oct 2026, afternoon)

**Live and verified:** production commit `52084ea7cbfee6596dd5d24d945b55ac01325f01` = GitHub HEAD (checked with the Vercel tool after every push; the docs commit carrying this brief follows it). `node --test tests/*.test.js`: **86 passing**. Engine **`fe-1.4.0`**, resolver **`ar-1.4.1`**, intake **`bpi-1.1.0`**. Engine and resolver are still not used by `generate-bp.js`; the live Business Plan is unchanged (v13).

**Deployment:** Claude pushes to `main` from the chat (Arnaud allowed free pushes in this chat). The sandbox cannot reach za3fran.io: GET checks use `mcp__Vercel__web_fetch_vercel_url` on the deployment URL; POST paths are verified from Supabase rows after Arnaud tests.

### Shipped this chat (6 pushes)
- **ar-1.4.0 — funding sizing in code** (`intake.sizing = { founder_share | founder_amount, loan_cap | 'guarantee', reserve_step?, founder_target_share? }`, pure `sizeFunding()`): cash reserve = smallest 10,000 step keeping cash ≥ 0 in base AND conservative (search repeats because loan interest grows with the reserve); founder share or amount; loan to the cap (default Brain `finance.guarantee_cap`); partner fills at face value. `result.sizing` reports every figure plus `price_factor_for_target` (issue price that keeps the founder at 51%). Blocking gaps: rule + amounts together, no founder share/amount, no convergence. A founder `cash_reserve` line is kept as given.
- **fe-1.4.0 — optional share premium:** `shareholders[].price_factor` (issue price × face value, default 1); outputs nominal capital, share premium, share of capital; invariant equity = nominal + premium; `priceFactorForControl()`.
- **ar-1.4.1 — bug fix:** verified Brain values were re-queued as `impact_over_5pct` on every run (would refill Arnaud's review list). Verified values now reach the queue only for `founder_evidence` / `out_of_range`.
- **Canaille re-snapshot** `tests/fixtures/canaille-live-2026-10-09.js` (delta on the 8 Oct file: the 15 verified values arrive as `za3fran_verified`; every number unchanged) + **`tests/canaille-regression.test.js`** (headline figures, scenarios, funding, labels, review list, flags).
- **BP intake form** — `bp-intake.html` (`/bp-intake?code=…`), `api/bp-intake.js` (GET context; POST `save | preview | submit`; lockout 5/30 min per IP; requires a BP purchase), `lib/bp-intake.js` (pure validation + preview summary), table **`bp_intakes`** (one row per project; `draft | submitted | awaiting_estimates`; RLS on, no policies; migration `supabase/migrations/20261009_bp_intakes.sql`, applied). "Check my figures" runs resolver + engine on the live Brain and shows total to finance (incl. reserve), funding and shares, P&L lines, DSCR base and prudent, lowest cash, bilingual warnings. Submit sends a plain email to hello@za3fran.io (Brevo). **Not linked from the dashboard** (website rule).
- **bpi-1.1.0 (after Arnaud's test):** readable dropdowns (solid background, `color-scheme: dark`); "Agreed share of the company (%)" replaces the issue-price column (premium derived in code: holder paying least per share = face value; shares complete and summing to 100); Ramadan question only where the Brain holds Ramadan dates; "Za3fran prepares…" banner instead of "missing" when estimates are requested; green confirmation at the top on submit.

### Tested
- Canaille form payload → resolver → engine reproduces the approved plan exactly: uses 2,230,000 · reserve 320,000 · founder 446,000 (43.3%) · partner 584,000 · loan 1,200,000 · DSCR 1.76 / 3.28 / 3.34 · conservative year-2 1.66 · price factor for 51% = 1.3629.
- Headless Chrome (mobile 390 px and desktop) against a local mock API running the real resolver/engine: no JS errors; save, check, submit, reload-restore all work.
- **Arnaud on the live site (9 Oct):** GET, save, check and submit work; green confirmation shown; notification email received (content needs a professional design — task 1). His test answers are stored in Canaille's `bp_intakes` row (status `awaiting_estimates`; estimates requested for team and investment; amounts mode 400k / 600k; loan 1.2M, 12-month deferral; lunch Mon–Fri 350, dinner Wed–Sat 650; surface 200 m², 3 rent-free months).

### Finding for the plan text
- Prudent case **year-1 DSCR −0.35** for Canaille (opening year does not cover repayments; the sized reserve carries it, cash never negative). The rebuilt plan must address it plainly (risk / mitigation / monitoring), not hide it.

---

## Decisions taken (9 Oct 2026)
1. Funding and cash-reserve sizing live in the resolver, reproducible from the intake (ar-1.4.0; `docs/assumption-resolver.md`).
2. Founder control: **face value by default**; the plan states the issue price that would keep the founder at 51% (stated, never assumed); a founder can enter an agreed split and the premium is derived (fe-1.4.0, bpi-1.1.0; instructions "Financial method rules").
3. Verified Brain values are not re-queued for impact review (ar-1.4.1).
4. Intake asks district and **benchmark family** (only `bistro_wine_bar` exists; concept types `bistro` / `wine_bar` map to it; anything else is a blocking gap filled on demand) (`docs/bp-intake-requirements.md`, "As built").
5. Founder "works in the business" adds a founder roster line at the founder's salary, else the Brain manager salary.
6. Ramadan question shown only where the Brain has Ramadan dates for the market.
7. "Za3fran prepares an estimate" for team / investment: intake saved as `awaiting_estimates`, email to hello@za3fran.io; generation waits until Za3fran fills and reviews the estimates with the founder.
8. The intake page stays unlinked from the dashboard until the rebuilt plan ships.
9. Language: the site-wide saved choice (`za3fran_lang`) wins over the project language (standing rule); project language applies only when nothing is saved.

---

## Tasks for the next chat, in order
0. **Start-up checks:** add the repo (`add_repo`, push), clone, confirm live commit = GitHub HEAD, run tests (expect 86).
1. **Professional notification email** for intake submissions (branded HTML like the other Za3fran emails: concept, code, status, what Za3fran must do, headline figures, button to the inputs). Optionally a founder confirmation email (founder email from the project's purchase; check `za3fran_users` / the webhook pattern). Keep it in `api/bp-intake.js` or a small `lib/emails.js`.
2. **Estimates workflow for `awaiting_estimates`:** a way for Za3fran to write roster and investment estimate lines into an intake (labelled `source: 'estimate'`, range and note) — simplest first: a script/SQL helper run from the chat, then the founder reviews on the form. Canaille's 8 Oct estimate lines are in `tests/fixtures/canaille-live-2026-10-08.js`.
3. **Wire `generate-bp.js` (v14) to the intake:** load `bp_intakes` (status `submitted`), effective concept, market chain, Brain; `resolveAssumptions` → `runScenarios` → `persistResolution` (freeze `project_assumptions` for the run, push new review items). Refuse with a clear status if the intake is missing / blocked (new run status, e.g. `awaiting_intake`, and the dashboard + BP viewer show a link to `/bp-intake`). Keep the CRR gate and the undici dispatcher; no AbortController.
4. **Sonnet writing, French-native, bank framing** (master strategy v1.6 §10–17): the model gets engine figures as data and writes text only; parallel section calls; no Validator score, no upsell; risks as risk / mitigation / monitoring; "assumptions to confirm" for unverified founder statements; address the prudent year-1 DSCR.
5. **Automated checks before delivery:** every number in the text matches the engine (number extraction + tolerance on formatted values); language lint (English words in FR text, missing articles, unfinished sentences); one ticket per service, one opening date, one severity per risk; proper names only from inputs or cited sources.
6. Run end to end on Canaille (new run id, keep `bp_crrtest_canaille_v13` for comparison), compare with the expert-review checklist, then link `/bp-intake` from the dashboard and the BP purchase flow (success page + email) — website updated with the release.
7. Templates (plan PDF, deck, teaser, workbook) follow in the chat after (Arnaud signs off the design once).
8. Still open for Arnaud's accountant or bank: drinks-outlet tax base; VAT on on-site alcohol; Intelaka 2026 rate, deferral length, eligibility of an alcohol-licensed restaurant.

---

## Permanent rules to add to the Project instructions
Already applied in `docs/project-instructions.md` and the Project doc `claude/project-instructions-2026-10-09.md` (paste it into the Project instructions field):
- Phase A step 3 status: intake form built and live (not linked yet).
- `bp_intakes` added to the RLS-on / no-policies list.
- Shareholdings: face value unless a premium or an agreed split is supplied; the 51% issue price is stated, never assumed. Cash reserve and funding split sized in code from `intake.sizing`.
- Live checks: the sandbox cannot reach za3fran.io; GET via the Vercel tool, POST verified from Supabase rows and logs after Arnaud's test.

---

## Open cleanup (not blocking)
New this chat:
- Intake notification email is plain (task 1). No founder confirmation email yet.
- Intake lockout is in-memory per function instance (same weakness as the viewers and `bp-pdf.js`).
- Resolver gap messages are English and technical; the form maps the main ones to bilingual text, others fall back to the English message.
- Resolver/sizing labels are bilingual in one string ("Fondateur / Founder"); the plan renderer should pick the project language.
- Intake not yet supported: founder quotes for single cost lines (insurance, accounting…), food/beverage cost overrides, rent escalation clause, more than lunch/dinner services, turns per service.
- Concept type "other" (Canaille) has no automatic benchmark family; the founder picks it on the form.
Carried from Brief #8:
- Investment intake lines not covered by the impact analysis; possible double counting (staff meals vs food cost; accounting vs other-opex %); Ramadan 2030 window not re-checked; `review_note` mixes research notes and verification stamps; payback null over 36 months → text must say "beyond year 3".
- `brain_enqueue_refresh_due()` / `brain_enqueue_random_audit()` need a weekly Vercel cron.
- Menu Engineer: unsourced supplier output; a Canaille run shows `pending_generation` although complete; still reads `concept_snapshot`.
- `/bp-report/:id` rewrite 404s; `api/crr-status.js` and `api/crr-decide.js` unused; re-assessment completion email; `validator_submissions.report_id` mismatch on Canaille; `report_error` has no recovery path; RLS disabled on older tables; Zoco (`ZA3FTEST`) fixture values; viewer consistency (BP vs Menu generating/blocked screens).
- Website claims: soften "investor-ready" (6 pages); check Menu Engineer supplier output before keeping "Supplier & sourcing recommendations".
- Delete `bp_crrtest_canaille_v13` once the rebuilt BP passes the gate. Arnaud may delete `filtered_reviews_export.csv` from the project uploads.

---

## Links and IDs
- Repo: https://github.com/za3franco/za3fran-website · live commit `52084ea` (+ this docs commit)
- Engine `lib/financial-engine.js` (fe-1.4.0) · Resolver `lib/assumption-resolver.js` (ar-1.4.1, `sizeFunding`) · Intake `lib/bp-intake.js` (bpi-1.1.0), `api/bp-intake.js`, `bp-intake.html`
- Docs: `docs/financial-engine.md`, `docs/assumption-resolver.md`, `docs/bp-intake-requirements.md` (incl. "As built"), `docs/project-instructions.md`
- Tests: `tests/financial-engine.test.js`, `tests/assumption-resolver.test.js`, `tests/funding-sizing.test.js`, `tests/canaille-regression.test.js`, `tests/bp-intake.test.js`
- Fixtures: `tests/fixtures/canaille-live-2026-10-09.js` (current), `canaille-live-2026-10-08.js` (dated record + estimate lines), `canaille-v13-replay.js`, `resolver-brain-test.js`
- Supabase `njuojjvregxtwyxznhjf` · `bp_intakes`, `brain_parameters`, `brain_parameter_values`, view `brain_values_effective`, `brain_review_queue`, `project_assumptions`, `business_plan_essentials_runs`
- Vercel project `prj_q3hHSEqTDG2tuaRXeOuKWTqjjLxy`, team `team_mCxAzBP02S8BF3JQddNa47eQ`
- Markets: Morocco `6e6218db-0e40-4fc9-9528-30465935d145` · Casablanca `746b3105-984f-448f-a886-db4d725e31bc` · Gauthier `258db599-2e4c-43ea-8fda-9e27ebc6514d` · Marrakech `5f5463a1-3ae2-4b8b-a321-b51434edae45` · Rabat `e77cf7f2-ef2c-41ca-8ad2-7f25eb118649`
- Canaille project `3c16eff6-5084-4761-a525-a4b6b912c73d`, access code `ESATZMB2`, concept type `other`, neighbourhood blank in the concept (district Gauthier comes from the intake)
- Intake page: https://www.za3fran.io/bp-intake?code=ESATZMB2
- Test BP run `bp_crrtest_canaille_v13`: https://www.za3fran.io/api/report-bp-viewer?id=bp_crrtest_canaille_v13&code=ESATZMB2
- Strategy reference: Master Strategy v1.6, Sections 10–17.

To start the next chat, paste this brief as the first message in a new chat in this Project.
