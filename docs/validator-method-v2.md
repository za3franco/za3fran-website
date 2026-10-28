# Concept Validator v2 — method (approved by Arnaud, 28 Oct 2026)

Phase A, step 6. Master strategy v1.6, sections 3.2 and 16. Generator version `val-2.0.2`, writer `vw-1.0.5`.

## Why
The v1 Validator let the model write every number. On Canaille it stated about 742,500 MAD of monthly revenue and 175,000 MAD of monthly result; the engine, on the cleared plan (run `bp_v14_canaille_8`), gives about 484,000 MAD of monthly revenue and about 55,000 MAD of monthly net result in year 2. Revenue was overstated by about half and the result about threefold.

## Decisions (Arnaud, 28 Oct 2026: « ok tout »)
- **A.** About six questions are added to the Validator form so the engine can run: services (lunch / dinner / breakfast) with open days, a ticket and covers per service; surface or rent offer; alcohol yes/no; Ramadan choice; target opening month; exact budget and own funds (the bracket is kept as a fallback for old submissions).
- **B.** The score stays out of 100 with the four verdicts (Strong / Viable / Fragile / High risk), computed by fixed rules (below), never chosen by the model.
- **C.** No obligation to name suppliers or contacts. Proper names only from the founder, from cited sources, or from the Brain's list of institutions.
- **D.** Online report with a PDF download; no workbook or deck for the Validator.
- **E.** Report language chosen on the form (FR / EN), not guessed.
- **Formats (28 Oct, told to Arnaud):** four new Brain format families (restaurant, café / brunch, fast casual, bar / lounge) beside bistro / wine bar. Dark kitchen: no engine figures (the engine is seat-based); the financial section is marked "not computed for this format". "Other": the founder picks the closest family.

## Flow
form (`validator.html`) → `submit-validator.js` saves the submission and the **concept record** → Stripe (€199, bundles unchanged) → `webhook-validator.js` claims the submission → `lib/validator-v2.js`:
1. Concept record → resolver (`resolveAssumptions`, Za3fran estimates for team and investment, never blocking for the Validator) → `runScenarios` (base / conservative / optimistic).
2. Financial score, alerts and capacity check computed in code.
3. Sonnet writes the sections in parallel (French-native prompts, JSON out, numbers as placeholders filled in code), then `lib/bp-checks.js` style checks (numbers, language); up to three rewrites on failure. Last resort (writer vw-1.0.3+), adding nothing to the report: an action line still failing is dropped (each list keeps at least one action), and a paragraph with too many figures is split at a sentence boundary; analysis wording, scores and risks are never repaired. Repairs are recorded in `meta.audit.pruned`. Checks added after the Canaille runs (vw-1.0.4/1.0.5): a count placeholder keeps its own noun ({places} places, never « {places} références »); no article right before an amount or rate in French; no count of services or turns (each service is described by its days). Otherwise the report is not delivered (`qa_failed`, notice to hello@za3fran.io).
4. Rubric scores from the model (0–4 per criterion) are added up in code; verdict in code.
5. Fixed HTML template (site colours, Cormorant Garamond / DM Sans) → `validator_reports.report_html`; `report_json` built in code (same shape as v1 so the Concept Readiness Review keeps working); PDF from the same HTML through headless Chrome.

Never blocked: a gap in the inputs or the Brain is shown in the report ("not computed", "Za3fran estimate"), never invented.

## Score (out of 100)
| Section | Weight | How |
|---|---|---|
| 1 Concept & positioning | 15% | rubric, 5 criteria × 0–4 (model), sum in code |
| 2 Market fit | 20% | rubric, 5 criteria × 0–4; Brain market facts given to the model |
| 3 Competition | 15% | rubric, 5 criteria × 0–4; competitors from the founder (Places suggestions on the form) |
| 4 Financial viability | 30% | computed from the engine (below) |
| 5 Execution readiness | 10% | computed: funding cover, timeline vs stage, share of founder figures |
| 6 Risk exposure | 10% | computed: 100 − 12 per high alert − 6 per medium alert − the three most serious risks (high impact: 15 / 10 / 5 by likelihood; medium impact: 7 / 5 / 2), floor 0 (val-2.0.1) |

**Financial viability (0–100):** capacity (claimed covers vs seats × turns, 15); break-even occupancy vs the format's cruise occupancy, year 2 (25); EBITDA margin year 2 base (15); minimum DSCR, conservative case (15; no loan = full marks); budget vs total uses (15); conservative cash never negative (15).

**Verdict:** 80–100 Strong, 60–79 Viable, 40–59 Fragile, 0–39 High risk. A financial score under 40 caps the verdict at Fragile. Dark kitchen: section 4 is not scored and its weight is spread pro rata.

## Alerts and risks (Concept Readiness Review)
- Financial alerts come from engine and resolver flags, worded in code (FR/EN), each pre-tagged with the questionnaire fields it affects (`fields_source: 'code'`).
- Risks (3–5) are written by the model from a fixed category list, each with probability, impact and the fields it affects (validated against the field list).
- `report_json.sections.s4_financial.alerts` and `s6_risks.risks` keep their v1 shape; `itemKey()` identity unchanged.

## Concept record
Table `concept_records` (one live version per project; RLS on, no policies): the v1 questionnaire fields plus the new structured fields. Written by the Validator form, amended by the readiness review (amendments overlay as today; an amended `ticket` or `covers` scales the per-service figures in proportion), read by the Business Plan intake to pre-fill (nothing typed twice). Canaille's record is built from its effective concept.

## Acceptance
Unit tests (`tests/validator-v2.test.js`); Canaille re-run compared side by side with the v1 report; report looked at as images (FR and EN); bundle path and readiness review checked on Canaille.
