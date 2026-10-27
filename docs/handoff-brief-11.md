# ZA3FRAN — HANDOFF BRIEF #11
## Next chat: Phase A, step 5 — designed deliverables (plan PDF, 10-slide deck, one-page teaser, Excel workbook)

**Model for the next chat:** Sonnet for the templates and the workbook; Opus-tier for the deck narrative if needed.

---

## Where we are (27 Oct 2026)

**Live and verified:** production commit `8e27550` = GitHub HEAD (checked with the Vercel tool after every push).
`node --test tests/*.test.js`: **118 passing**. Engine fe-1.4.0 · resolver ar-1.6.0 · estimates est-1.1.0 · intake bpi-1.3.0 ·
generator bp-v14.1 · writer bpw-2.x · checks bpc · render bpr-2.x · founder report bprep-1.1.0.

**Arnaud approved the v14.1 bank plan on 27 Oct 2026 ("c'est très bien, on peut continuer").**

### Business Plan Essentials v14 / v14.1 — as built
- Pipeline: CRR gate → submitted BP intake (else `awaiting_intake`) → resolver on the live Brain (blocking gaps →
  `blocked_intake`) → engine scenarios → appendix frozen in `project_assumptions` → facts → Sonnet writing (5 parallel
  groups) → automated checks with up to 2 rewrites (still failing → `qa_failed`, not delivered, info email) → fixed
  template. Atomic claim on `business_plan_essentials_runs.generation_claim`. ~45–120 s, ~€0.45 per plan.
- **Two documents** (Arnaud, 9 Oct): the **bank plan** is the founder's own, affirmative document (project voice, no doubt,
  estimate, quote, Za3fran or "porteur de projet" wording — enforced by the checks; risks with measures, no levels; no stress
  test; no source/range columns; 3-year scenarios with chart). The **preparation report** (`?doc=founder`, private) holds
  the consulting: decisions and their logic, points of attention with levels and advice, what to prepare before the bank,
  full scenarios incl. stress test and sensitivities, every assumption with source and range, limits.
- **Decided before generation** (intake bpi-1.3.0): alcohol licence cost (required when alcohol is served); cash reserve =
  larger of the prudent-case need and N months of fixed costs (3/4/6), always an explicit line, sources = uses, a shortfall
  blocks unless the founder accepts the risk; capital at face value or with a share premium keeping the founder at 51%;
  comparable venues (Google Places suggestions hidden until `GOOGLE_PLACES_API_KEY` is set — needs Arnaud's OK on cost).
- Brain (verified by Arnaud): bistro_wine_bar ramp 6 months from 65%, dinner cruise 70%, +5 pts occupancy in year 3.
- Numbers: the model writes no digit; every figure is a placeholder filled from the engine. Dense paragraphs are split in
  code at sentence boundaries (≤ 6 figures per paragraph).

### Shipped in this chat after Arnaud's approval (27 Oct)
- Founder report bprep-1.1.0: French risk titles (from the bank-plan risks), "Vous / Votre chiffre" instead of
  "porteur de projet", advice-style to-do list, one competition line, missing label fixed.
- **Release of the figures-first flow:** purchase emails (BP alone and bundles) lead to "Renseigner mes chiffres";
  success page has the same button; dashboard (`project.html`) is now bilingual and shows the BP card as
  "Vos chiffres d'abord" / "Prêt à générer" / "Prêt" with links to the plan, the preparation report and the figures;
  `api/project-status` v2 takes the latest run per tool (several runs used to break the lookup) and the intake status.
- Intake: after submit, a button to generate / see the plan. **Resubmitting figures after a plan exists opens a new plan
  run** (max 5 per project; the previous plan keeps its link).
- Site pages updated with the release: business-plan, pricing, platform describe what v14 delivers (no page counts,
  no pre-opening timeline or menu strategy, no "investor-ready").

### Tested
- Unit tests 118; headless Chrome on the dashboard (390 px and desktop, both states, no JS errors, no horizontal scroll).
- Live: Canaille runs `bp_v14_canaille_5` and `_6` complete (checks passed, 81 assumptions frozen, no doubt wording in the
  bank plan, French titles in the preparation report); `/api/project-status?code=ESATZMB2` returns the new BP card data.
- Not tested live (needs a real payment): the new purchase emails and the success-page button. Check on the next real or
  test purchase (Stripe test mode).

---

## Decisions taken
1. Two documents per plan: bank plan (founder's voice, affirmative) + private preparation report (Arnaud, 9 Oct).
2. Points that would cast doubt are settled in the intake before generation, or kept in the preparation report (9 Oct).
3. Cash reserve: larger of prudent-case need and N months of fixed costs, always a line (ar-1.6.0).
4. Bistro/wine-bar occupancy and ramp values above, verified by Arnaud (migration 20261009d).
5. v14.1 bank plan approved by Arnaud (27 Oct); figures-first flow released to customers the same day.
6. New figures after a plan → new plan run, max 5 per project.

## Tasks for the next chat, in order
0. Start-up checks: add_repo (push), clone, live commit = HEAD, tests (expect 118). Ask whether pushes are free.
1. **Templates (step 5)**: designed A4 plan PDF rendered server-side (`api/bp-pdf.js` proof exists), 10-slide deck
   (PowerPoint + PDF, free library), one-page teaser, Excel workbook (ExcelJS, live formulas, assumptions tab). All read the
   same facts and text already stored per run (`output_json.text`; facts are rebuilt from the frozen run inputs).
   Arnaud signs off the design once.
2. Validator rebuild on the engine and the Brain (step 6); shared concept-record schema.
3. Brain Inbox (step 7).

## Permanent rules to add to the Project instructions
- **Bank-facing deliverables are the founder's own documents**: project voice, no expression of doubt, estimate, quote,
  Za3fran or "porteur de projet"; every caveat, level, source and piece of advice goes to the private preparation report.
- **A point that weakens a bank document is settled before generation** (intake decision) rather than disclosed in it.

## Open cleanup (not blocking)
- Canaille preparation report flags "EBITDA margin above format references" and "payroll outside usual ratios" in year 3
  (team does not grow with covers): consider staffing growth in year 3 in the estimate method.
- Founder quotes in the preparation report are shown as typed (some in English) — fine, but could be translated.
- `GOOGLE_PLACES_API_KEY`: Arnaud to confirm cost before enabling suggestions.
- Delete the test runs `bp_crrtest_canaille_v13` and `bp_v14_canaille_1…4` (the gate is now passed) — ask Arnaud first.
- Menu Engineer on Canaille still shows "generating" (`pending_generation` known issue); Menu Engineer still reads
  `concept_snapshot`.
- Carried from Brief #10: intake lockout in-memory; resolver gap messages partly technical; `/bp-report/:id` rewrite 404s;
  `api/crr-status.js`, `api/crr-decide.js` unused; re-assessment completion email; `report_error` no recovery path; RLS on
  older tables; Zoco fixture; weekly Vercel cron for Brain refresh/audit.

## Links and IDs
- Bank plan: https://www.za3fran.io/api/report-bp-viewer?id=bp_v14_canaille_6&code=ESATZMB2
- Preparation report: same link + `&doc=founder`
- Dashboard: https://www.za3fran.io/project.html?code=ESATZMB2 · Intake: https://www.za3fran.io/bp-intake?code=ESATZMB2
- Docs: `docs/business-plan-v14.md`, `docs/assumption-resolver.md`, `docs/financial-engine.md`, `docs/bp-intake-requirements.md`
- Canaille project `3c16eff6-5084-4761-a525-a4b6b912c73d`, code `ESATZMB2` · Supabase `njuojjvregxtwyxznhjf` ·
  Vercel `prj_q3hHSEqTDG2tuaRXeOuKWTqjjLxy` / `team_mCxAzBP02S8BF3JQddNa47eQ`
