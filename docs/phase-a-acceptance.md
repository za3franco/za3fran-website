# Phase A acceptance — Canaille business plan (30 Oct 2026)

**Reference run:** `bp_v14_canaille_13` (generator bp-v14.2, engine fe-1.5.0 + resolver ar-1.9.0, writer bpw-2.3.3, facts bpf-1.2.0, render bpr-2.0.0).
Viewer: `https://www.za3fran.io/api/report-bp-viewer?id=bp_v14_canaille_13&code=ESATZMB2` (preparation report: `&doc=founder`).
Designed files: `/api/bp-docs?id=bp_v14_canaille_13&code=ESATZMB2&doc=plan|summary|deck|deck-pptx|workbook` (all served, 200).

**Funding decided by Arnaud (30 Oct):** the 20,000 MAD reserve gap after gross salaries is closed by the founder's own contribution (400,000 → 420,000 MAD). Sources 3,239,000 = uses 3,239,000 (founder 420,000 · partner 1,319,000 · loan 1,500,000); reserve 460,000 MAD = 3.0 months of fixed costs.

## Scores against the expert review (start: financial reliability 3/10, writing 4/10, presentability 3/10)

| Axis | Before (v13) | Now (run 13) | Why |
|---|---|---|---|
| Financial reliability | 3/10 | **8/10** | Every figure comes from the engine; one figure per item across cover, summary, tables, deck and workbook; investment table, sources = uses, payroll (team table × 12 = P&L), EBITDA before depreciation, interest line, 7-year loan schedule, DSCR defined, 24-month cash plan, three scenarios, break-even. Left: payroll rules from secondary sources (to check on a real payslip), some cost lines are Za3fran estimates presented as the founder's budget (the preparation report says to get quotes), no balance sheet (Business Plan Pro), payback beyond 3 years not shown. |
| Writing | 4/10 | **7/10** | French only, bank voice, explains causes; no invented names, no Validator score or labels, no upsell. Left: model variance — each run can produce one or two clumsy sentences (run 13: an attribution « que le fondateur qualifie lui-même… », the year-2 rent rise attributed to Ramadan instead of the rent-free months of year 1, capitalised « Fondateur »). 13 failure types are now caught in code (see below). |
| Presentability | 3/10 | **8/10** | Designed plan PDF, one-page summary, 10-slide deck (PDF + PowerPoint), Excel workbook with live formulas, all from the run snapshot; viewer with toolbar and downloads. Left: the preparation report quotes the founder's original risk answers verbatim (some in English, one with a stale 450 MAD ticket). |

## Expert-review checklist — status

| Item from the v13 review | Status |
|---|---|
| Revenue / EBITDA differ between cover, summary and section 10 | Fixed: single engine figure everywhere |
| Investment "high" column does not add up (2,070,000 vs 1,670,000) | Fixed: lines sum to the subtotal; ranges only in the preparation report |
| Payroll 65,813/month vs 1,877,040/year | Fixed: team table × 12 = P&L payroll (1,257,564 vs 1,257,552, rounding) |
| "EBITDA" is EBIT; no interest line | Fixed: EBE before depreciation; interest line from the loan schedule |
| Labour cost per cover "131 MAD" (meaningless ratio) | Removed |
| Invented names (law firms, job sites, suppliers, "MGallery") | Fixed: names only from the founder's inputs or the allowed list (OMPIC, Coravin) |
| Cover score "74 VIABLE", Accepté/Contesté labels, upsell box | Fixed: none in any bank-facing file |
| English words in the French | Fixed: language lint; « corporate » remains as accepted business French |

## What the acceptance runs found, and the checks added (writer bpw-2.2.0 → 2.3.3)

| Run | Fault in the bank plan | Check now in code |
|---|---|---|
| 9 | QA failed twice on « cinquante et soixante références » (founder's description) | Rewrite says how to drop a quantity (bpw-2.2.0); French elisions fixed in code |
| 9 | « 50 références » ({places} used as a wine count) | A count placeholder keeps its own noun |
| 9 | « accès à avec service d'alcool » | Preposition clash once filled |
| 9 | « des 6 mois premiers mois » | Doubled unit once filled |
| 9 | « comparé au 463 MAD » | No article before an amount or rate |
| 9 | « les valeurs 1,3 et 1,3 » | Same figure twice once filled |
| 9 (and approved run 7) | « sa part diminue à 5,63 % » (rent share rises) | A trend verb must match the figures it links |
| 10 | « tombe à 5,63 % », « implanté au Gauthier » | More trend verbs; no article before a place name |
| 11 | « le DSCR reste positif », « du janvier – février 2028 » | DSCR "positif" refused (threshold is one); no article before a date |
| 12 | « implanté au Gauthier » written out; « selon sa propre formulation » | Place name checked once filled; founder-quotation wording refused |
| 13 | Preparation report: fixed lines labelled « montant mensuel » while the figures are yearly | Label fixed (bpf-1.2.1); figures were right |

## Left for later (not blocking)
- Writer: attributions to the founder (« qualifie lui-même ») and causal slips (rent share in year 2) are not caught by rules; a second, independent read of the bank plan by a separate model call could be added if they recur.
- Preparation report: founder risk answers quoted verbatim, including English text and a stale 450 MAD ticket (from the original Validator answers); consider showing only answers newer than the last concept-record change, or translating.
- Preparation report HTML is frozen at generation: run 13 still shows the old « montant mensuel » label; any new run shows « montant annuel ».
