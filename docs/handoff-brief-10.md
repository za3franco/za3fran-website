# ZA3FRAN — HANDOFF BRIEF #10
## Next chat: Phase A, step 4 — wire intake + resolver + engine into `generate-bp.js` (v14), then Sonnet writing with number and language checks

**Model for the next chat:** Opus-tier (generation pipeline design and French prompt engineering for bank framing).

---

## Where we are (9 Oct 2026, afternoon)

**Live and verified:** production commit `8c19909a824bd8178bb878207f958b752df5c67d` = GitHub HEAD (checked with the Vercel tool after each push; the docs commit carrying this brief follows it). `node --test tests/*.test.js`: **99 passing**. Engine **`fe-1.4.0`** (unchanged), resolver **`ar-1.5.0`**, estimates **`est-1.1.0`**, intake **`bpi-1.2.2`**. Engine and resolver are still not used by `generate-bp.js`; the live Business Plan is unchanged (v13).

**Deployment:** Claude pushes to `main` from the chat (Arnaud allowed free pushes in this chat; ask again in a new chat). The sandbox cannot reach za3fran.io: GET checks use `mcp__Vercel__web_fetch_vercel_url` on the deployment URL; POST paths are verified from Supabase rows after Arnaud tests.

### Shipped this chat (3 pushes + 2 Brain migrations)
- **No manual step anywhere (Arnaud's decision).** "Za3fran estimates the team / the investment" now builds the lines at once from the Brain. `awaiting_estimates` is retired (constraint still allows it for old rows); submit → `submitted`.
  - `lib/estimates.js` (pure): `estimateRoster()` — fixed roles (chef, manager or founder), on-duty positions per service, prep hours per open day, roles limited to some services, roles sized in hours per open day, absence factor; people = ceil(hours × absence ÷ legal week − tolerance). `estimateInvestment()` — per m² (surface from seats × m²/seat when missing), per seat, lump sums, percentages of base amounts (ranges never compound), pre-opening = payroll months + extra chef month + works months × rent + launch marketing. Lines `source: 'estimate'`, range, note.
  - Brain methods: `benchmark.staffing_model` **sm-2** (format; supersedes sm-1) and `benchmark.capex_model` **cm-1** (Morocco, qualifier = format, MAD). New salaries: `sommelier` 6,500 (5,000–9,000), `cleaner` 3,500 (3,423–4,000). All estimates, low confidence; one `method_change` review item each, never blocking. Migrations `supabase/migrations/20261009_brain_estimate_models.sql`, `20261009b_staffing_model_sm2.sql` (both applied).
  - Resolver ar-1.5.0: `intake.estimate = { roster?, investment? }`, `intake.founder = { works, monthly_gross? }`; `result.estimated`; appendix rows `labour.roster.method`, `investment.method`; missing method = blocking gap. Founder lines always win.
- **sm-2 after Arnaud's review:** sm-1 put Canaille payroll at ~18% of revenue. sm-2 adds sommelier (dinner, alcohol), cleaner (4 h/open day), kitchen prep (cook 3 h, commis 2 h, porter 1 h), absence factor 1.12 (18 days leave + 10–11 public holidays + sickness), one server per 18 seats. **Canaille: 16 people, payroll 25%, EBITDA 16.5% of year-2 revenue.** Test guard: an estimated team must keep year-2 payroll in 20–38% and EBITDA in 8–22%.
- **Intake form bpi-1.2.x:** estimated team / investment shown under "Check my figures" with totals; "Adjust the team / the investment" copies lines into the tables (copper border = still an estimate; editing a line makes it a founder figure). Preview now has subtotals: "What needs financing" (categories → investment subtotal → deposit → cash reserve → total) and "How it is financed" (shareholders → equity → loan with rate/term → total). Lowest cash point explained in words; DSCR defined. Mobile row labels, "Name of the role" only for "Other", wider dropdowns, market salary as placeholder. Roles `sommelier`, `cleaner` added. Form language stored in `intake.ui.lang`.
- **Emails (`lib/emails.js`):** founder confirmation in the form language (headline figures, which parts Za3fran estimated, links, access code) and information copy to hello@za3fran.io marked "No action needed". **Both received by Arnaud (9 Oct).**

### Tested
- Unit tests (99), headless Chrome mobile 390 px and desktop against a local mock running the real libs: no JS errors; check → adjust → edit → submit works; emails rendered and checked.
- Arnaud on the live site: estimates, submit and both emails OK. Canaille's `bp_intakes` row migrated (estimate + founder keys added, status reset to draft for his test).

### Open with Arnaud
- **Dropdown readability on his phone:** looks right in Chrome (white on navy). Waiting for a screenshot of an open dropdown + phone/browser model.
- Pastry cook / host / assistant manager not in the team method (founder covers the floor). Arnaud to say if a Casablanca wine bistro of 50 seats needs them.

### Findings for the plan text
- Prudent case year-1 DSCR can be < 1 with a sized reserve (cash never negative): the plan must say so plainly (risk / mitigation / monitoring).
- With a 12-month interest-only period, year-1 DSCR is very high (7.44 for Canaille's live answers): the text must explain the grace period, not present it as strength.
- No licence cost in the investment estimate (no official fee; warning shown); the plan states it in limits.

---

## Decisions taken (9 Oct 2026, this chat)
1. **No manual step:** when a founder asks for an estimate, the Brain builds it immediately; Arnaud's review list never blocks a founder (instructions, "Financial method rules"; `docs/assumption-resolver.md` ar-1.5.0).
2. **Brain estimates must land inside the normal bands** (payroll 20–38%, EBITDA 8–22% of year-2 revenue); enforced by a test (`tests/estimates.test.js`).
3. Team method sm-2 includes sommelier (alcohol, dinner), cleaner, kitchen prep and leave/holiday cover (`docs/assumption-resolver.md`).
4. Founder confirmation email in the language used on the form; Za3fran gets an information copy, "No action needed" (`docs/bp-intake-requirements.md`, bpi-1.2.0).
5. Preview shows subtotals for uses and sources and explains the lowest cash point in words (bpi-1.2.1).

---

## Tasks for the next chat, in order
0. **Start-up checks:** `add_repo` (push), clone, live commit = GitHub HEAD, tests (expect 99). Ask Arnaud whether pushes are free in that chat.
1. **Wire `generate-bp.js` (v14) to the intake:** load `bp_intakes` (status `submitted`), effective concept, market chain, Brain; `resolveAssumptions` → `runScenarios` → `persistResolution` (freeze `project_assumptions` for the run, push new review items). Refuse with a clear status if the intake is missing / blocked (e.g. `awaiting_intake`; dashboard + BP viewer show a link to `/bp-intake`). Keep the CRR gate and the undici dispatcher; no AbortController.
2. **Sonnet writing, French-native, bank framing** (master strategy v1.6 §10–17): engine figures as data, text only; parallel section calls; no Validator score, no upsell; risks as risk / mitigation / monitoring; "assumptions to confirm"; estimates named as Za3fran estimates with their range; address the prudent DSCR, the grace period and the licence limit.
3. **Automated checks before delivery:** every number in the text matches the engine; language lint (English words in FR, missing articles, unfinished sentences); one ticket per service, one opening date, one severity per risk; proper names only from inputs or cited sources.
4. Run end to end on Canaille (new run id; keep `bp_crrtest_canaille_v13`), compare with the expert-review checklist, then link `/bp-intake` from the dashboard and the BP purchase flow (success page + purchase email) — website updated with the release. The confirmation email already promises the plan, so this link must ship with step 1–3.
5. Templates (plan PDF, deck, teaser, workbook) follow (Arnaud signs off the design once).
6. Still open for Arnaud's accountant or bank: drinks-outlet tax base; VAT on on-site alcohol; Intelaka 2026 rate, deferral and eligibility of an alcohol-licensed restaurant; leave and public-holiday figures behind the absence factor.

---

## Permanent rules to add to the Project instructions
Applied in `docs/project-instructions.md` and the Project doc `claude/project-instructions-2026-10-09.md` (paste it into the Project instructions field):
- No manual step: Za3fran estimates inside an intake are built by the Brain at once; nothing waits for Arnaud.
- Add: **Brain estimates must land inside the normal bands** (payroll 20–38%, EBITDA 8–22% of year-2 revenue); a method change that breaks this fails the tests.

---

## Open cleanup (not blocking)
New this chat:
- Taken-over investment labels stay bilingual in one string ("Travaux et aménagement / Works and fit-out"); the plan renderer should pick the project language.
- Estimated headcount ranges (`count_low/high`) are recorded in the appendix but do not feed scenarios (engine uses the base count).
- Information email to hello@za3fran.io can be switched off if Arnaud prefers.
- Capex method cm-1 rests on French ranges and one Moroccan blog; replace with the Installation & Equipment tool or quotes when available.
Carried from Brief #9:
- Intake lockout in-memory per instance; resolver gap messages English/technical (form maps the main ones); not yet supported in the intake: single-line cost quotes, food/beverage cost overrides, rent escalation clause, more than lunch/dinner, turns per service; concept type "other" has no automatic benchmark family.
- Investment lines not covered by the impact analysis; possible double counting (staff meals vs food cost; accounting vs other-opex %); Ramadan 2030 window not re-checked; `review_note` mixes notes and stamps; payback null over 36 months → text says "beyond year 3".
- Weekly Vercel cron for `brain_enqueue_refresh_due()` / `brain_enqueue_random_audit()`.
- Menu Engineer: unsourced supplier output; Canaille run shows `pending_generation` although complete; still reads `concept_snapshot`.
- `/bp-report/:id` rewrite 404s; `api/crr-status.js` and `api/crr-decide.js` unused; re-assessment completion email; `validator_submissions.report_id` mismatch on Canaille; `report_error` has no recovery path; RLS disabled on older tables; Zoco (`ZA3FTEST`) fixture values; viewer consistency (BP vs Menu).
- Website claims: soften "investor-ready" (6 pages); check Menu Engineer supplier output before keeping "Supplier & sourcing recommendations".
- Delete `bp_crrtest_canaille_v13` once the rebuilt BP passes the gate.

---

## Links and IDs
- Repo: https://github.com/za3franco/za3fran-website · live commit `8c19909` (+ this docs commit)
- Engine `lib/financial-engine.js` (fe-1.4.0) · Resolver `lib/assumption-resolver.js` (ar-1.5.0) · Estimates `lib/estimates.js` (est-1.1.0) · Intake `lib/bp-intake.js` (bpi-1.2.2), `api/bp-intake.js`, `bp-intake.html` · Emails `lib/emails.js`
- Docs: `docs/financial-engine.md`, `docs/assumption-resolver.md` (ar-1.5.0, sm-2), `docs/bp-intake-requirements.md` (As built bpi-1.2.0), `docs/project-instructions.md`
- Tests: `tests/estimates.test.js`, `tests/emails.test.js`, `tests/bp-intake.test.js`, `tests/canaille-regression.test.js`, plus engine / resolver / funding tests
- Fixtures: `tests/fixtures/canaille-live-2026-10-09.js` (current), `estimate-models-2026-10-09.js` (sm-2, cm-1, legal week, sommelier / cleaner salaries; `withEstimateMethods()`), `canaille-live-2026-10-08.js`, `canaille-v13-replay.js`, `resolver-brain-test.js`
- Brain rows: staffing sm-2 (status researched; supersedes `60ac8eca-a20e-4a14-bf56-4a92a134d21d`), capex cm-1 `bd89e1e9-fd43-4642-9f56-29f1cbf8ee71`, legal week `61a696af-58f1-40a8-8092-834664c90c6f`
- Supabase `njuojjvregxtwyxznhjf` · `bp_intakes`, `brain_parameters`, `brain_parameter_values`, view `brain_values_effective`, `brain_review_queue`, `project_assumptions`, `business_plan_essentials_runs`, `za3fran_users` (founder email via `za3fran_projects.user_id`)
- Vercel project `prj_q3hHSEqTDG2tuaRXeOuKWTqjjLxy`, team `team_mCxAzBP02S8BF3JQddNa47eQ`
- Markets: Morocco `6e6218db-0e40-4fc9-9528-30465935d145` · Casablanca `746b3105-984f-448f-a886-db4d725e31bc` · Gauthier `258db599-2e4c-43ea-8fda-9e27ebc6514d` · Marrakech `5f5463a1-3ae2-4b8b-a321-b51434edae45` · Rabat `e77cf7f2-ef2c-41ca-8ad2-7f25eb118649`
- Canaille project `3c16eff6-5084-4761-a525-a4b6b912c73d`, access code `ESATZMB2`
- Intake page: https://www.za3fran.io/bp-intake?code=ESATZMB2
- Test BP run `bp_crrtest_canaille_v13`: https://www.za3fran.io/api/report-bp-viewer?id=bp_crrtest_canaille_v13&code=ESATZMB2
- Strategy reference: Master Strategy v1.6, Sections 10–17.

To start the next chat, paste this brief as the first message in a new chat in this Project.
