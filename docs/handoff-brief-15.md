# ZA3FRAN — HANDOFF BRIEF #15

**Next chat:** three small items (founder salary entered net, workshop team → BP intake, risk-impact calibration in the writer), then Phase A step 7 — Brain Inbox.
**Recommended model:** Opus-tier for the salary rules (Brain research + calculation) and the Brain Inbox design; Sonnet for copy.

---

## 1. Where we are (29 Oct 2026)

**Live commit:** see the last commit of this chat (code + this brief), verified READY on www.za3fran.io and equal to GitHub HEAD.

### Shipped and live today
- **Paid end-to-end test passed** (100 % promo code `ZA3FRANTEST`):
  - *Validator only* — Test Café Maarif (`E3T9HZ4A`): payment → webhook → concept record → report val-2.0.2 first attempt, 132 s (≈ €0.45) → 47 FRAGILE → email → viewer → PDF 17 pages.
  - *Validator + BP bundle* — Test Bistrot Gauthier (`T6YW78V8`): 45 FRAGILE → readiness review + concept workshop → re-assessments → **85 STRONG**, review cleared → BP intake pre-filled → plan `bp_1793277512804_rs82ng` **started automatically** at submit and completed (designed files OK, summary = 1 page).
- **Fixes found by the test:**
  - Dropdowns empty on every form: bilingual hide rules now `:not(option)` on all pages (`tests/site-bilingual.test.js`).
  - Validator-only checkout failed (no `STRIPE_PRICE_VALIDATOR_*` env vars) and standalone BP would have thrown: `getLineItem()` uses the env price or an inline price (`tests/currency.test.js`).
  - Success page showed the customer's previous project (Canaille): `checkout-status` now resolves the session's own project (submission_id / accessCode / projectId in Stripe metadata); polls 5 min with a "your code appears here when ready" notice.
  - Delivery email: direct viewer link (the `/report/:id` rewrite 404s); BP offer in the paid currency; numbered steps report → review → figures.
  - Form field alignment (subgrid).
- **Country of the project** on the Validator form: amounts in its currency, market from it; payment stays in the visitor's currency; Ramadan asked only where it applies (MA, DZ, TN, EG, SN, NG, AE, SA, Other).
- **Pricing coherence:** savings recomputed (USD bundles $119, full journey €198 / MAD 1,980 / $208, BP standalone "Validator client rate", Menu loyalty $60, Menu page in the paid currency); `lib/currency.js` bundle display = Stripe €599 / MAD 5,990 / $649 (`tests/pricing.test.js`).
- **Readiness review made a visible step:** dashboard card (points left / cleared), BP shown "After the review", intake banner with link, emails and success page, Validator viewer toolbar + closing call to action (online only).
- **Required review points by verdict** (`requiredItemKeys`): STRONG none; VIABLE high alerts + most serious risk; FRAGILE high alerts + three most serious risks; HIGH_RISK all; optional points folded, never block; auto-clearance when nothing is required (`refreshClearance`).
- **Concept workshop** (readiness review step 1, cw-1.0.0, `/api/concept-workshop`, `lib/concept-workshop.js`): founder adjusts the structured figures, team and texts; instant recalculation by the Validator's code; provisional score anchored on the last report; computed funding need shown under the budget; resolved alerts marked; save = new `concept_records` version (source `readiness_review`); re-assessment runs on it with the list of changes; reports store `meta.record_version`.
- **val-2.0.3:** capacity alert names the busiest service (covers, occupancy); repayment alert states the annual repayment (not the loan) and handles negative cover. Re-run on Canaille: `rpt_v2_canaille_8`, 64 VIABLE, no repair.
- Amended opening hours now change the service days; neutral placeholders on decision forms.
- **BP side:** `lib/bp-trigger.js` starts the plan when review cleared + figures submitted (either order); `loadEffectiveConcept` overlaid by the latest workshop record (intake header and plan show the current figures); a first intake starts on the reference occupancy when the founder's covers exceed it; email/phone fields styled; comparables column "Menu checked in".
- **Website:** the Validator is presented as guidance to viability (review + 5 re-assessments) on validator, pricing, index and platform pages.
- Preview rows `rpt_v2_canaille_1`…`_6` deleted; three orphan `pending_payment` submissions deleted.

### Tested and how
- `node --test tests/*.test.js`: **167 pass** (new: site-bilingual, currency, pricing, project-country, bp-trigger, review-rules, concept-workshop).
- Headless-browser checks of every changed page (options visible, alignment desktop/mobile, success page waiting state, dashboard card, workshop UI driven against a local server running the real engine on the Canaille fixture).
- Live: Vercel logs and Supabase rows for both purchases, the workshop GET on Canaille and the bistrot, the BP auto-trigger (`[bp-trigger] generation started`), bp-docs summary 200 / 1 page.

### Half-done / not tested
- Workshop save + re-assessment ran live only on Arnaud's bistrot (works: versions 2–3, report v4 85 STRONG). Not run on Canaille (its main report is v1; re-assessing it would replace the v1 comparison report).
- The new pre-fill on the reference occupancy is live but not yet seen by a founder (only first intakes get it).

## 2. Decisions taken
1. Promo code `ZA3FRANTEST` (100 %) for every live purchase test — no refunds needed.
2. Bundle Validator + BP = €599 / MAD 5,990 / $649 (Stripe is the truth); savings = real difference vs buying one after another — `tests/pricing.test.js`.
3. Country of the project decides amounts, currency and market; payment currency = visitor's — `docs/validator-method-v2.md`, "Country of the project".
4. Ramadan question only where it applies — same section.
5. Required review points by verdict (STRONG none … HIGH_RISK all) — instructions, engineering rules.
6. The readiness review stays limited to **5 included re-assessments** (Arnaud: part of the price, forces careful work) — instructions, Principle 1 exception.
7. The Validator is sold as assessment **and** guidance to viability — website rule.
8. Readiness review rebuilt as concept workshop (live figures) → required points → update report — instructions, CRR.
9. BP intake starts on the Validator's base (reference occupancy when the founder's covers exceed it) — instructions, engineering rules.
10. Plan starts automatically once review cleared and figures submitted — `lib/bp-trigger.js`.

## 3. Tasks for the next chat, in order
0. Start-up checks (live commit = HEAD; `node --test`); ask Arnaud for his read of plan `bp_1793277512804_rs82ng` (bistrot) and its files.
1. **Founder salary entered net:** research and source Moroccan payroll deductions (CNSS employee share and ceiling, AMO, IR scale and professional expenses allowance, 2026) as Brain entries (*researched*, provenance), then net → gross in code in the BP intake (show both).
2. **Workshop team → BP intake:** when the record has a founder team (`record.team`), pre-fill the intake roster with it (source founder) instead of the estimate.
3. **Risk impact calibration:** the writer labels almost every risk HIGH/CRITICAL; tighten the prompt (at most one CRITICAL, distribution guidance) and re-run Canaille.
4. Recovery path for a paid v2 submission at `report_error` (re-run + delivery email).
5. Phase A step 7 — Brain Inbox.

## 4. Permanent rules added (merged into the instructions)
- Bilingual hide rules use `:not(option)`.
- Never limit the founder — exception: 5 included re-assessments.
- Concept record versioned by the readiness review (source `readiness_review`, `meta.record_version`).
- Required review points by verdict; auto-clearance.
- BP base = Validator base (reference occupancy pre-fill).
- Checkout via `getLineItem()`; checkout-status by session metadata.
- Market and currency follow the project's country.
- Website: Validator = assessment + guidance; savings are real differences.

## 5. Open cleanup (not blocking)
See the instructions' "Open cleanup" list (Project reference). New today: BP "number of new plans included" message vs the never-limit rule; `STRIPE_PRICE_VALIDATOR_*` env vars never created (inline price used); Canaille's main report still v1.

## 6. Arnaud's review queue
31 `method_change` items (four format families) — unchanged.

## 7. Links
- Bistrot (bundle test): dashboard `https://www.za3fran.io/project.html?code=T6YW78V8` · review `https://www.za3fran.io/readiness-review.html?code=T6YW78V8` · plan `https://www.za3fran.io/api/report-bp-viewer?id=bp_1793277512804_rs82ng&code=T6YW78V8`
- Café Maarif (Validator only): `https://www.za3fran.io/project.html?code=E3T9HZ4A`
- Canaille reference: `rpt_v2_canaille_8` — `https://www.za3fran.io/api/report-viewer?id=rpt_v2_canaille_8&code=ESATZMB2`
- Method doc: `docs/validator-method-v2.md`.

## 8. Project instructions
Full text: `claude/project-instructions-2026-10-29.md` (Project docs) and `docs/project-instructions.md` (repo), given to Arnaud in the chat.
