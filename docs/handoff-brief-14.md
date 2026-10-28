# ZA3FRAN — HANDOFF BRIEF #14

**Next chat:** live end-to-end purchase test of the Validator v2 form (Arnaud pays once with a Stripe test or a real card, then refunds), the fixes that come out of it, then Phase A step 7 (Brain Inbox).
**Recommended model:** Opus-tier for the purchase-flow test and any pipeline fix; Sonnet for website copy.

---

## 1. Where we are (28 Oct 2026)

**Live commit:** code `2e0d43c` (verified READY on www.za3fran.io, equal to GitHub HEAD), followed by a docs-only commit with this brief (also verified).

### Shipped and live
- **Concept Validator v2** (Phase A step 6) — generator `val-2.0.2`, writer `vw-1.0.6`, render `vr-1.0.0`, concept record `cr-1.0.0`, engine `fe-1.5.0`, resolver `ar-1.8.0`, estimates `est-1.3.0`, formats `fmt-1.0.0`. Method: `docs/validator-method-v2.md` (Project doc `claude/validator-method-v2.md`).
  - Form `validator.html`: services (breakfast / lunch / dinner) with days, ticket and covers each; seats, surface, rent offer, alcohol and licence cost, Ramadan choice, opening month, exact budget and own funds, founder works in the venue, report language, format family when "other", three competitor fields.
  - **Concept record** (table `concept_records`, RLS on, no policies): written by the webhook from the form, read by the Validator, the readiness review (v2 branch in `lib/crr-reassess.js`) and the BP intake (pre-fill when no intake is saved).
  - **Figures from the engine only**; score out of 100, section scores and verdict computed in code; financial alerts worded in code; Sonnet writes the text in 4 parallel groups (French-native prompts, JSON, placeholders); automated checks; up to 3 rewrites; last-resort repairs that add nothing (drop a failing action line, split a paragraph with too many figures); otherwise `qa_failed` and an email to hello@za3fran.io.
  - Fixed template → `validator_reports.report_html`; `report_json` keeps the v1 shape so the readiness review works; **PDF** through `api/validator-pdf.js` (same code, lockout); viewer `api/report-viewer.js` (v2 toolbar, PDF link, "being prepared" page).
  - `api/generate-validator.js` (GET `?id&code`, atomic `generation_claim`) for previews and manual recovery.
- **Brain:** four new format families (restaurant, café/brunch, fast casual, bar/lounge) beside bistro/wine bar — 79 rows, all *estimate/researched*; **31 new items in `brain_review_queue`** (reason `method_change`: cruise occupancy, ramp, growth, staffing and capex models per family).
- **Website:** business-plan, pricing and platform pages name the designed files (plan PDF, one-page summary, presentation PDF and PowerPoint, Excel workbook), no page counts. Every "20-page" Validator claim removed (index, pricing, platform, success). Pricing FAQ on figures rewritten (computed from the founder's inputs; Za3fran estimates shown as such in the private report). BP page hero rewritten (it still described v1: "no additional forms", "benchmark estimates", "pre-opening timeline") and the page now remembers the language choice.
- **Live form bug fixed:** the audience pills were hidden in both languages, which made the Validator form impossible to submit. Only test submissions existed (Canaille, Zoco).

### Tested and how
- `node --test tests/*.test.js`: **146 pass** (new: `tests/validator-v2.test.js`, mock model fixture).
- **Canaille acceptance runs** (preview rows, no submission, code `ESATZMB2`):
  - `rpt_v2_canaille_1` (val-2.0.0): 59 FRAGILE — an old readiness-review amendment overrode the budget (fixed: only amendments newer than the record apply) and risk exposure scored 0 (formula softened, val-2.0.1).
  - `_2`, `_3`: `qa_failed` on one word each (a number in words; 7 figures in a paragraph) → writer vw-1.0.2/1.0.3 (three rewrites, repairs).
  - `_4`: 64 VIABLE — the text showed « Coravin sur 50 références » (seats used as wine references) and « le 5 811 567 MAD qui en résulte » → vw-1.0.4 (count placeholders keep their noun, no article before an amount).
  - `_5`: 66 VIABLE, 101 s, about 34k input / 15k output tokens (≈ €0.30) — showed « deux services en déjeuner » (invented) and read the budget gap as spare money → val-2.0.2 / vw-1.0.5; `_6` (65 VIABLE) still had « une cinquantaine de références » (invented) → vw-1.0.6.
  - **`_7` (val-2.0.2 / vw-1.0.6): 65 VIABLE, 110 s, about 41k input / 17k output tokens (≈ €0.38), no repair needed; text read in full, no defect found. Reference run.** PDF live: 200, 17 pages, 470 KB.
  - Section scores of `_7`: concept 85, market 70, competition 45 (no competitor named), financial 63, maturity 95, risk exposure 30. Alerts: capacity (high), debt cover in the conservative case (high), licence not priced (medium).
- **Comparison with the v1 report** (Canaille): v1 stated about 742,500 MAD of monthly revenue and 175,000 MAD of monthly result, written by the model. v2: year-2 revenue 5,811,567 MAD ex-VAT (≈ 484,000 a month — identical to the cleared business plan `bp_v14_canaille_8`), EBITDA 1,205,482 MAD (20.7%), break-even 28 covers a day against 40 expected, need 2,480,000 MAD, loan 761,000 MAD, conservative-case debt cover 0.85.
- Live PDF checked: 200, `application/pdf`, `%PDF`, about 474 KB.

### Half-done / not tested
- **No paid end-to-end test of the v2 form** (Stripe → webhook → concept record → report → email). Highest priority.
- Readiness-review screens do not yet show or amend the new structured fields (services, rent, licence…); the v2 re-assessment path is wired but untested live.

## 2. Decisions taken
1. Validator v2 method A–E approved (Arnaud « Ok tout »): ~6 new questions; score /100, 4 verdicts, in code; no obligation to name suppliers; online report + PDF only; report language chosen on the form — `docs/validator-method-v2.md`.
2. Four new Brain format families; dark kitchen = financial section "not computed"; "other" = founder picks the nearest family — same doc, "Formats".
3. Validator base case = format benchmark occupancy; the founder's covers are tested against the room (capacity alert), not used as the forecast unless lower — same doc, "Flow".
4. Only readiness-review amendments newer than the concept record apply (val-2.0.1).
5. Risk exposure = 100 − 12 per high alert − 6 per medium alert − the three most serious risks (val-2.0.1).
6. Last-resort repairs may drop an action line or split a paragraph, never change analysis, scores or risks (vw-1.0.3).
7. Designed BP files approved by Arnaud (« j'ai tout revu c'est bon »).

## 3. Tasks for the next chat, in order
0. Start-up checks (live commit = HEAD; `node --test`); ask Arnaud what he thought of `rpt_v2_canaille_7` and its PDF.
1. **Paid end-to-end test of the v2 form** with Arnaud: fill `/validator` for a throwaway concept, pay, then check Supabase (`validator_submissions.concept_v2`, `concept_records`, `validator_reports`), Vercel logs, the email, the viewer and the PDF; refund in Stripe. Also test a bundle path (`bundle_bp`) to the BP intake pre-fill.
2. Recovery path for a paid v2 submission at `report_error`: re-run via `api/generate-validator` and send the delivery email (today: manual).
3. Readiness review: show/amend the structured fields; test the v2 re-assessment live on Canaille.
4. Phase A step 7 — Brain Inbox.

## 4. Permanent rules added (merged into the instructions)
- Concept record is the single concept source for new tools (`concept_records`, `lib/concept-record.js`); new fields go there first.
- Validator figures, scores and verdicts are computed in code (`lib/validator-v2.js`); the model writes text with placeholders; checks in `lib/validator-writer.js`; a method change is re-run on Canaille through `api/generate-validator.js` before release.
- Writing checks now also enforce: count placeholders keep their own noun; no article before an amount (FR); no invented count of services or turns; no approximate number in words.

## 5. Open cleanup (not blocking)
- Places suggestions on the Validator form deferred (needs abuse protection: the form is public, before payment).
- Every writing group often needs 2 attempts (cost ≈ €0.30–0.45 per report); watch and tighten prompts.
- The model states general Moroccan licensing practice (Commune, Préfecture, Wilaya; "long and uncertain"): acceptable as advice, but not sourced — a Brain entry on alcohol-licence procedure (Casablanca) would let the text cite it.
- Old Canaille preview rows `rpt_v2_canaille_1`…`_6` can be deleted once Arnaud has seen `_7`.
- Carried from #13: Menu Engineer still reads `concept_snapshot` (switch to the concept record/effective concept); `api/crr-status.js`, `api/crr-decide.js`, `api/bp-pdf.js` deletable; completion email for re-assessment; `validator_submissions.report_id` mismatch on Canaille; viewer screen consistency; RLS on older tables; Zoco (`ZA3FTEST`) fixture values; weekly cron for Brain refresh/audit; in-memory intake lockout; `node_modules` blob in git history; Canaille BP runs 5–7 have no snapshot; `/bp-report/:id` rewrite 404s.

## 6. Arnaud's review queue
31 new `method_change` items (the four new format families). None blocks a founder; approve or correct when convenient.

## 7. Links
- Canaille (project `3c16eff6-5084-4761-a525-a4b6b912c73d`, code `ESATZMB2`).
- Validator v2 reference report: `https://www.za3fran.io/api/report-viewer?id=rpt_v2_canaille_7&code=ESATZMB2` · PDF: `https://www.za3fran.io/api/validator-pdf?id=rpt_v2_canaille_7&code=ESATZMB2`
- Previous runs `_4`…`_6` show the defects fixed by vw-1.0.4 to 1.0.6.
- BP reference: `bp_v14_canaille_8`.
- Method doc: `docs/validator-method-v2.md`.

## 8. Project instructions
Full text: `claude/project-instructions-2026-10-28-b14.md` (Project docs) and `docs/project-instructions.md` (repo), given to Arnaud in the chat.
