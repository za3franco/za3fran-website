# Business Plan Essentials v14 — as built (9 Oct 2026)

`api/generate-bp.js` (bp-v14.0) · libs `bp-facts.js` (bpf-1.0.0), `bp-writer.js` (bpw-1.0.0), `bp-checks.js` (bpc-1.0.0),
`bp-render.js` (bpr-1.0.0) · tests `tests/bp-writer.test.js` · strategy v1.6 §10–17.

## Pipeline
1. CRR gate (unchanged from v13). 2. `bp_intakes` must be `submitted`, else run status `awaiting_intake` (viewer links to
`/bp-intake?code=…`). 3. Resolver on the live Brain (market chain from currency; format from the intake); blocking gaps →
`blocked_intake`. 4. Engine scenarios; invariants must hold. 5. `persistResolution()` freezes `project_assumptions` for the
run id and adds review items (never blocking). 6. Facts → Sonnet writing (5 parallel groups) → checks, up to 2 rewrites per
group; still failing → `qa_failed` (not delivered, info email to hello@za3fran.io, retry button for the founder).
7. Fixed template → `output_html`; audit in `output_json.inputs`, text in `output_json.text`.

Triggers: POST `{bpRunId}` from the viewer; GET `?id=…&code=…` (same access code). Atomic claim on
`business_plan_essentials_runs.generation_claim` (migration `20261009c`). A `generating` run older than maxDuration (600 s)
can be restarted.

## Rules enforced in code
- The model writes no digit: every figure is a `{placeholder}` from `bp-facts.js` (engine output formatted once). Only
  exceptions: "Za3fran" and the plan-year labels "année 1/2/3".
- Checks: unknown placeholder; digit or % outside placeholders; numbers in words above three; invented thresholds
  ("trois points"); unit or letter written right after a placeholder (a figure used in another sense) except a count
  followed by its noun; English words in French (and the reverse); unfinished sentences; markdown; banned vocabulary
  (score, Validator, verdict, review, AI, upsell, Accepted/Contested…); proper names not in the founder's inputs or the
  generic list; always-wrong French forms; repeated phrases once figures are filled; mandatory citations per section.
- Mandatory points decided in code: grace period explained (year-1 DSCR is not repayment capacity); conservative cash
  shortfall with the reserve that covers it and when it occurs (trading month, not calendar year); low point tied to
  Ramadan when it is; conservative DSCR < 1; guarantee ceiling exceeded; founder minority and the indicative 51% issue
  price; Za3fran-estimated investment; licence not included; covers from format references.
- Risks: one severity per risk, set in code (probability × impact; engine findings for financial risks). Mitigation from
  the founder's own words only (Validator mitigation text is never sent: it invented banks and "confirmed" a supplier).
  Contested founder statements become "assumptions to confirm" with a verification step. Validator financial alerts are
  superseded by the engine; accepted alerts' founder words are attached to the matching risk.
- Founder figures inside the founder's words (e.g. licence 200–800k MAD) are offered as labelled placeholders; figures next
  to "budget" or "ticket (moyen) à" are dropped (superseded by the financing plan and the intake tickets).

## Canaille runs (9 Oct 2026)
`bp_v14_canaille_1` (first pass, revealed false positives and two figure misuses), `bp_v14_canaille_2`, `bp_v14_canaille_3`
(passed at the first rewrite in every group, 111 s, ~€0.45). Base: uses 2,429,000 MAD, sources 2,500,000, loan 1,500,000
(7.5%, 84 months, 12 months interest-only, 300,000 above the 1.2M guarantee ceiling); year-2 revenue 5,529,674, EBITDA
1,126,424 (20.4%), DSCR 4.55 / 2.74 / 2.81. Conservative: cash low −167,019 in Feb 2028 (month 5, Ramadan closure),
DSCR −0.46 / 1.31 / 1.34; extra reserve 170,000 would cover it.

## Open
- Arnaud's read-through against the expert-review checklist; then link `/bp-intake` from the dashboard and the purchase flow.
- Designed PDF template, deck, teaser, workbook (step 5) consume the same facts and text.
- Regenerate after an intake change (the confirmation email says "the plan updates"): not built yet.
