# ZA3FRAN — HANDOFF BRIEF #12
## Next chat: Phase A, step 5 — designed deliverables (plan PDF, 10-slide deck, one-page teaser, Excel workbook)

**Model for the next chat:** Sonnet for the templates and the workbook; Opus-tier for the deck narrative if needed.

---

## Where we are (28 Oct 2026)

**Live and verified:** production commit `0deb1a5` = GitHub HEAD (checked with the Vercel tool after every push).
`node --test tests/*.test.js`: **123 passing**. Engine **fe-1.5.0** · resolver **ar-1.7.0** · estimates **est-1.2.0** ·
intake bpi-1.3.0 · generator bp-v14.1 · writer **bpw-2.1.0** · facts **bpf-1.2.0** · checks bpc · render bpr-2.x ·
founder report **bprep-1.2.0** · places **pl-1.2.0**. Brain staffing method **sm-3** live.

The Business Plan Essentials v14.1 pipeline, the two-document rule (bank plan + private preparation report) and the
figures-first flow are as described in Brief #11 and unchanged.

### Shipped in this chat (27–28 Oct)
- **0b — test runs deleted:** `bp_crrtest_canaille_v13`, `bp_v14_canaille_1…4` and their 318 frozen
  `project_assumptions` rows. Kept: original BP `bp_1789307375351_wm43e7`, `bp_v14_canaille_5`, `_6`.
- **0c — year-3 team growth (Arnaud's decision 7c):**
  - Engine fe-1.5.0: `labour.roster[].from_year` (default 1); payroll counts a line from that operating year;
    `payroll.headcount_by_year`. Rosters without `from_year` give identical figures.
  - Estimates est-1.2.0: `estimateGrowthHires()` — covers-driven roles (server, cook, commis, kitchen porter,
    bartender) grow by opening count × ((covers y3 / covers y2)^elasticity − 1), elasticity 1 (range 0.7–1), half-time
    steps, largest-remainder split. Fixed roles (chef, manager/founder, sommelier, cleaner) never grow.
  - Resolver ar-1.7.0: applies only when occupancy rises in year 3 (Brain `benchmark.occupancy_growth_y3`) and the
    staffing model has a `growth` rule; adds `from_year: 3` lines on top of the opening team whoever gave it; appendix
    rows `labour.hires_y3.<role>.count` (estimate) + `labour.hires_y3.method`. Founder roster with its own `from_year`
    lines wins; founder covers figure (no year-3 rise) → no hires. Opening and pre-opening payroll, reserve, staff
    meals unchanged.
  - Facts bpf-1.2.0 / writer bpw-2.1.0 / report bprep-1.2.0: team table = opening team; one sentence on year-3
    additions under the bank team table (no "estimate" or Za3fran wording); facts `renforts_a3`, `effectif_a3`;
    to-do item in the preparation report; the high-margin advice now explains operating leverage.
  - Brain: migration `20261027_staffing_model_sm3.sql` applied (sm-2 superseded, sm-3 `13356846-…` researched,
    `method_change` item open in `brain_review_queue` for Arnaud — never blocking).
  - **Canaille result (decided intake):** +0.5 server, +0.5 cook from year 3; year-3 payroll 18.9% → 19.9%, EBITDA
    24.4% → 23.3%; years 1–2, uses of funds and min cash unchanged. **The two year-3 flags remain, narrower** — the
    rest is operating leverage, not staffing. Arnaud accepted this (28 Oct: "ok merci très bien"). Not forced.
- **0a — Google Places live:** `GOOGLE_PLACES_API_KEY` set in Vercel (sensitive, production + preview). Arnaud's
  Google Cloud is on the free trial ($300 credit, quota 7,500/day cannot be lowered; no billing without a manual
  upgrade). **No limit for the founder** (Arnaud, 28 Oct). Cost framed in code: Google is called only on the button
  click, one call per district + format (results reused in the page), double clicks ignored; the plan generation never
  calls Google. Usage counted in `places_lookups` (migration `20261028_places_lookup_cap.sql`, RLS on, counters only)
  via `places_lookup_claim` with very high limits, never blocking. Tested live on Gauthier: 8 venues returned.
- **Repo hygiene:** a push accidentally committed `node_modules` (fixed in the next commit, `.gitignore` added; the
  64 MB chromium binary stays in git history — purge later only if needed). No `package-lock.json` in the repo:
  do not commit the one `npm install` creates in the sandbox.

### Tested
- Unit tests 123 (new `tests/staffing-growth.test.js`, fixture `tests/fixtures/estimate-models-2026-10-27.js`).
- Live: `/api/project-status?code=ESATZMB2` OK; `/api/bp-intake?nearby=1…` returns venues; form has no limit message.
- **Not run live yet:** a new Canaille plan on sm-3 (~€0.45). Do it at the start of the next chat (or when step 5
  needs fresh data) and check the year-3 sentence in the bank plan and the to-do line in the preparation report.
- Still not tested live (needs a payment): purchase emails and success-page button (Stripe test mode).

---

## Decisions taken
1. Two documents per plan: bank plan (founder's voice) + private preparation report (9 Oct).
2. Doubt-casting points are settled in the intake or kept in the preparation report (9 Oct).
3. Cash reserve rule, occupancy values, v14.1 approval, figures-first release: as in Brief #11.
4. Year-3 team growth with covers (27 Oct, brief #11 decision 7c) — method sm-3 / ar-1.7.0; residual year-3 margin flags
   accepted as operating leverage (28 Oct).
5. Test runs deleted (27 Oct, approved).
6. Google Places enabled (27 Oct) — **the founder is never limited; cost is framed in code** (28 Oct).

## Tasks for the next chat, in order
0. Start-up checks: add_repo (push), clone, live commit = HEAD, tests (expect 123). Ask whether pushes are free.
   Generate one Canaille plan on sm-3 and check it (see Tested).
1. **Templates (step 5):** designed A4 plan PDF rendered server-side (`api/bp-pdf.js` proof exists), 10-slide deck
   (PowerPoint + PDF, free library), one-page teaser, Excel workbook (ExcelJS, live formulas, assumptions tab). All
   read the same facts and text stored per run (`output_json.text`; facts rebuilt from the frozen run inputs). The
   workbook must handle `from_year` roster lines (year-3 hires). Arnaud signs off the design once.
2. Validator rebuild on the engine and the Brain (step 6); shared concept-record schema.
3. Brain Inbox (step 7).

## Permanent rules added (merged into the full instructions text: `claude/project-instructions-2026-10-28.md`)
- **Bank-facing deliverables are the founder's own documents** (project voice, no doubt, estimate, quote, Za3fran or
  "porteur de projet"); caveats, levels, sources and advice go to the private preparation report. *(from #11)*
- **A point that weakens a bank document is settled before generation** (intake decision). *(from #11)*
- **Never limit the founder on a usage-based feature** (lookups, suggestions, regenerations within the product's
  rules): frame the cost in code (call only on explicit action, reuse results, no background calls) and monitor usage;
  no founder-facing quota message. *(28 Oct)*
- **Never commit `node_modules` or a sandbox-generated `package-lock.json`;** check `git status` before every commit.
- **Every handoff ends with the complete Project instructions text**, ready to paste over the whole existing text (Arnaud, 28 Oct).

## Open cleanup (not blocking)
- Purge the `node_modules` blob from git history (optional; repo size only).
- Google Places key was pasted in a chat: low risk (server-side, restricted to Places); regenerate if Arnaud wants.
- Founder quotes in the preparation report shown as typed (some in English).
- Menu Engineer on Canaille still "generating" (`pending_generation`); Menu Engineer still reads `concept_snapshot`.
- Carried: intake lockout in-memory; resolver gap messages partly technical; `/bp-report/:id` rewrite 404s;
  `api/crr-status.js`, `api/crr-decide.js` unused; re-assessment completion email; `report_error` no recovery path;
  RLS on older tables; Zoco fixture; weekly Vercel cron for Brain refresh/audit.

## Links and IDs
- Bank plan: https://www.za3fran.io/api/report-bp-viewer?id=bp_v14_canaille_6&code=ESATZMB2 (preparation report: `&doc=founder`)
- Dashboard: https://www.za3fran.io/project.html?code=ESATZMB2 · Intake: https://www.za3fran.io/bp-intake?code=ESATZMB2
- Docs: `docs/business-plan-v14.md`, `docs/assumption-resolver.md` (ar-1.7.0 section), `docs/financial-engine.md`
  (fe-1.5.0 section), `docs/bp-intake-requirements.md`
- Brain sm-3 row `13356846-04af-4d57-9fd5-58b20eb06aea`; usage table `places_lookups`
- Canaille project `3c16eff6-5084-4761-a525-a4b6b912c73d`, code `ESATZMB2` · Supabase `njuojjvregxtwyxznhjf` ·
  Vercel `prj_q3hHSEqTDG2tuaRXeOuKWTqjjLxy` / `team_mCxAzBP02S8BF3JQddNa47eQ`
