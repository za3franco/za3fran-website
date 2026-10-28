# ZA3FRAN — HANDOFF BRIEF #13
## Next chat: Phase A, step 6 — Validator rebuild on the engine and the Brain (shared concept-record schema)

**Model for the next chat:** Opus-tier for the design of the Validator method and report prompts (high-stakes reasoning); Sonnet for the code once the design is agreed.

---

## Where we are (28 Oct 2026)

**Live and verified:** production deployment `dpl_7BFNLpATRBDJomvrWnaTCtMTtYen` = commit **`80d9910`** = GitHub HEAD
(checked with the Vercel tool, state READY, aliases za3fran.io / www.za3fran.io). Docs-only commit(s) for this brief follow it.
`node --test tests/*.test.js`: **131 passing** (8 new in `tests/bp-designed.test.js`).
Engine **fe-1.5.0** · resolver **ar-1.7.0** · estimates **est-1.2.0** · intake **bpi-1.4.0** · generator **bp-v14.2** ·
writer **bpw-2.1.0** · facts **bpf-1.2.0** · render bpr-2.0.0 · founder report bprep-1.2.0 · places pl-1.2.0 ·
design **bpd-1.0.0** · plan PDF **bppdf-1.0.0** · summary **bptz-1.0.0** · deck **bpdk-1.0.0** · workbook **bpwb-1.0.0** ·
Chrome helper bpch-1.0.0. Brain staffing method sm-3.

### Shipped in this chat (Phase A, step 5 — designed deliverables)
- **Design signed off by Arnaud** (28 Oct, after samples of the plan PDF, deck and summary). One fix requested and done:
  a page holding only two lines (plan page 3→4) → **fit pass** in `renderPlanPdfFitted` (re-renders a section tighter,
  levels 1 then 2, when its last page would be nearly empty; widows/orphans 3). Canaille plan: 17 → 15 pages.
- **Plan PDF** (`lib/bp-plan-pdf.js`, headless Chrome): cover, contents with real page numbers, 9 sections + annexes,
  running header/footer; fonts and logo embedded (`lib/bp-assets.js`, built by `tests/tools/build-bp-assets.js`).
- **One-page summary** (`lib/bp-teaser.js`), **10-slide deck** (`lib/bp-deck.js`: one slide model → PDF copy and editable
  PowerPoint through `pptxgenjs`), **Excel workbook** (`lib/bp-workbook.js`, ExcelJS, 9 sheets: Summary, Assumptions, Team,
  Funding, Loan, Monthly, Income statement, Cash plan, Scenarios). Workbook formulas: totals and shares, team cost and
  headcount by year (`from_year` aware), loan schedule (amount, rate, grace drive every line), annual income statement
  (sums of the monthly sheet), debt service, DSCR, cash plan, 4 checks. **Recalculated in LibreOffice and compared with
  the engine: revenue, gross margin, EBITDA, interest, net result, debt service, DSCR and every month of the cash plan match.**
- **Snapshot per run:** table `bp_run_snapshots` (migration `20261028_bp_run_snapshots.sql`, applied; RLS on, no policies),
  written by `generate-bp.js` (bp-v14.2). **Endpoint** `api/bp-docs.js` (`?doc=plan|summary|deck|deck-pptx|workbook`).
  **Download buttons** in the BP viewer toolbar and on `project.html` (through `api/project-status.js` `files`).
- **Intake bpi-1.4.0:** optional contact fields (name, e-mail, phone) printed on the summary and the last slide.
- **Fixes found by looking at the English render:** thousands separators and amount parsing in the deck (EN).

### Tested
- Unit tests 131/131 (deck: 10 slides, elements inside the slide, no leftover placeholder; bank voice; PPTX = zip with
  10 slides; workbook formulas, `from_year`; LibreOffice recalculation vs engine; Chrome: plan ≤ 18 pages, sections ≤ 3 pages,
  contents numbered, summary = 1 page, deck = 10 pages).
- **Live acceptance run `bp_v14_canaille_8`** (Canaille, created and generated from the chat, ~€0.45): complete on the first
  attempt in 71 s, generator bp-v14.2, snapshot saved (facts 62 KB, engine 149 KB). All five files fetched live through the
  Vercel tool, status 200: plan PDF 623,389 bytes in 6.9 s, summary PDF 184,920, deck PDF 279,363, PowerPoint 737,891,
  workbook 35,317 (valid signatures `%PDF` / `PK`; sizes match the local renders). Runtime logs show no error.
- **Not looked at as images:** the live-rendered files themselves (the same code was reviewed visually locally, FR and EN).
  Arnaud has not yet opened them on his phone. Not tested live: the intake contact fields in the browser (code paths only),
  the dashboard buttons, the viewer toolbar buttons (both read `output_json.generator` ≥ bp-v14.2; run 8 qualifies).

---

## Decisions taken
1. Design of the plan PDF, deck and summary approved (Arnaud, 28 Oct).
2. **"Établi avec Za3fran" stays on the cover** of the designed documents — a deliberate exception to the no-Za3fran rule (Arnaud: it adds credibility). Recorded in the instructions (Bank-facing rules).
3. Founder contact fields added to the intake (yes).
4. Deck text = extracts of the checked plan text (no extra model call, no extra cost) (approved).
5. New table `bp_run_snapshots` approved and applied.
6. **Deck as both PDF and PowerPoint kept** (the PDF embeds the fonts and is the file to send; the PowerPoint is the editable copy and needs the two fonts installed). Arnaud asked the question; he was told why and did not object. The dashboard shows the PDF, the PowerPoint link is in the viewer toolbar. Reconsider if he prefers one button.

## Tasks for the next chat, in order
0. Start-up checks: `add_repo` (push), clone, live commit = HEAD, tests (expect 131). Ask Arnaud whether he opened the
   five files of `bp_v14_canaille_8` on his phone and what he thinks (open the dashboard
   https://www.za3fran.io/project.html?code=ESATZMB2 and the viewer toolbar).
1. **Validator rebuild (step 6)** on the engine and the Brain: design the method first (Opus-tier), shared concept-record
   schema, French-native prompts, number-matching and language checks, bank-style framing where relevant; keep the €199
   product and the bundle paths working (`submit-validator.js`, `webhook-validator.js`); re-run on Canaille and compare.
2. **Website update for the live release** (website rule): Business Plan wording on business-plan, pricing, platform may now
   say the plan comes with a PDF, a one-page summary, a presentation (PDF and PowerPoint) and an Excel workbook — no page counts.
3. Brain Inbox (step 7), later.

## Permanent rules added (merged into `docs/project-instructions.md` / `claude/project-instructions-2026-10-28-b13.md`)
- Designed documents (plan PDF, summary, deck, workbook): model never writes layout; read the **run snapshot**; fit pass;
  `tests/bp-designed.test.js` must stay green for any template change; fonts embedded in server-rendered documents.
- Cover attribution exception to the bank-facing rule.
- Founder contact fields; live checks of binary files through the Vercel tool (www form, saved text file, signature/length).
- Website rule updated: the BP pages may now name the five designed files.

## Open cleanup (not blocking)
- `api/bp-pdf.js` (old proof) is superseded by `api/bp-docs.js`; delete when convenient.
- Runs `bp_v14_canaille_5…7` and older have no snapshot → `api/bp-docs` answers 409; the toolbar and dashboard hide the buttons for them. Regenerate to get files.
- The intake's empty contact is stored as empty strings in the snapshot (harmless; the templates treat it as absent).
- Workbook: changing the loan term does not add or remove schedule rows (rows are generated for the term at generation); the monthly operating sheet is values from the engine (by design).
- Carried: purge `node_modules` blob from git history (optional); Google Places key was pasted in a chat (low risk); founder quotes in the preparation report shown as typed; Menu Engineer on Canaille "generating", still reads `concept_snapshot`; intake lockout in-memory; resolver gap messages partly technical; `/bp-report/:id` rewrite 404s; `api/crr-status.js`, `api/crr-decide.js` unused; re-assessment completion email; `report_error` no recovery path; RLS on older tables; Zoco fixture; weekly Vercel cron for Brain refresh/audit; Stripe test-mode purchase emails and success page not tested live.

## Links and IDs
- Reference run for designed files: `bp_v14_canaille_8` — plan https://www.za3fran.io/api/report-bp-viewer?id=bp_v14_canaille_8&code=ESATZMB2 ;
  files `https://www.za3fran.io/api/bp-docs?id=bp_v14_canaille_8&code=ESATZMB2&doc=plan` (also `summary`, `deck`, `deck-pptx`, `workbook`)
- Dashboard: https://www.za3fran.io/project.html?code=ESATZMB2 · Intake: https://www.za3fran.io/bp-intake?code=ESATZMB2
- Dev tools: `node tests/tools/render-samples.js <dir> [plan|teaser|deck]`; `node tests/tools/check-workbook.js <dir>` (needs LibreOffice)
- Canaille project `3c16eff6-5084-4761-a525-a4b6b912c73d`, code `ESATZMB2` · Supabase `njuojjvregxtwyxznhjf` · Vercel `prj_q3hHSEqTDG2tuaRXeOuKWTqjjLxy` / `team_mCxAzBP02S8BF3JQddNa47eQ`
- Complete project instructions: `claude/project-instructions-2026-10-28-b13.md` = `docs/project-instructions.md`
- Opening message for the next chat: « Reprends à partir du Handoff Brief #13 (claude/handoff-brief-13.md). Pushes sur main autorisés. »
