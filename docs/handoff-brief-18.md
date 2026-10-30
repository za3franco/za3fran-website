# ZA3FRAN — HANDOFF BRIEF #18

**Next chat:** the **Phase A website release** (master strategy v1.6, Section 18): the public pages describe what Phase A now delivers, nothing beyond it.
**Recommended model:** Sonnet (page copy and HTML); Opus only if a claim needs a judgment call on what is really live.

---

## 1. Where we are (30 Oct 2026)

**Live commit:** the last commit of this chat (this brief), verified READY on www.za3fran.io and equal to GitHub HEAD. Code commits of the chat: `1f5ed1e` (writer bpw-2.2.0), `e17a518` (bpw-2.3.0), `f7c2aa2` (bpw-2.3.1), `d4d08a3` (bpw-2.3.2), `08b1837` (bpw-2.3.3), `c1edcdd` (facts bpf-1.2.1), `c4d3bb7` (acceptance record).

### Phase A acceptance — done
- **Canaille funding decided:** the 20,000 MAD reserve gap after gross salaries is closed by the founder's own contribution (400,000 → 420,000 MAD; `bp_intakes` updated). Sources 3,239,000 = uses 3,239,000; reserve 460,000 MAD (3 months of fixed costs).
- **Reference run `bp_v14_canaille_13`** (bp-v14.2, fe-1.5.0 + ar-1.9.0, bpw-2.3.3): **financial reliability 8/10, writing 7/10, presentability 8/10** against the expert review (was 3/4/3). Every item of the expert checklist is fixed. Record: `docs/phase-a-acceptance.md` (Project: `claude/phase-a-acceptance.md`).
- **Runs 9 to 12** were acceptance iterations. Each found writing faults in the bank plan, now refused in code (bpw-2.2.0 → 2.3.3):
  - the seats count used as a wine count;
  - « accès à avec service d'alcool », « 6 mois premiers mois », « 1,3 et 1,3 »;
  - « au 463 MAD », « au Gauthier », « du janvier – février 2028 »;
  - a rent share said to fall while it rises — **also present in the approved run-7 text**;
  - « DSCR positif »;
  - founder-quotation wording.
  - The French elision fix is now shared with the Validator. A failed rewrite on a number in words now says how to drop the quantity.
- **Preparation report:** the fixed operating lines (insurance, accounting, security, telecoms) were labelled « montant mensuel » while the Brain figures are yearly. The label is fixed (bpf-1.2.1); the figures were always right.

### Tested and how
- `node --test tests/*.test.js`: **197 pass**. New tests:
  - each fault caught;
  - correct uses pass;
  - the approved Canaille text trips only on its real rent error;
  - the yearly label is checked.
- Live: runs 9 to 13 generated through `/api/generate-bp` (about €0.45 each). Bank plan and preparation report read in full. All five designed files served (200, `%PDF` / `PK`).

## 2. Decisions taken
1. Canaille's reserve gap closed by the founder's contribution, 420,000 MAD (Arnaud, 30 Oct). Instructions, Test project.
2. Run 13 is the Phase A acceptance reference (8/7/8). Instructions, Phase A step 8; `docs/phase-a-acceptance.md`.
3. Every fault found in a delivered plan becomes a code check, tested both ways on the approved Canaille text. Instructions, Brain rule 11.
4. Acceptance iterations stop when the remaining faults are stylistic, rather than chasing model variance. `docs/phase-a-acceptance.md`, "Left for later".

## 3. Tasks for the next chat, in order
0. Start-up checks: live commit = HEAD; `node --test`; read `brain_review_queue` rows `rejected` with a note from Arnaud (none at the end of this chat).
1. **Phase A website release** (Section 18) — only what is live:
   - **Pages to update:** platform, pricing, validator, business-plan, and the project dashboard.
   - **What they must explain:** the journey; Essentials as a dossier (plan PDF, one-page summary, presentation PDF and PowerPoint, Excel workbook); the intake; the preparation report with "Assumptions & sources"; market coverage (Morocco: Casablanca, Marrakech, Rabat; other markets built on demand, the gap flagged, never gated), shown before purchase; the stage and next step on the dashboard.
   - **New page:** how Za3fran sources and verifies data (four source classes, the Brain, Arnaud's review, nothing shown as verified without it).
   - **Index hero:** "Where are you starting from?", with the Concept Studio door opening a waitlist.
   - **Wording:** no page counts, no "investor-ready", no "real market data".
   - Keep `tests/pricing.test.js` and `tests/site-bilingual.test.js` green.
2. Handoff; then Phase B (Concept Studio, Casablanca first) gets its own chat.

## 4. Permanent rules added (merged into the instructions)
- Brain rule 11: the business-plan writer's checks (bpw-2.3.3) are listed. Every new fault becomes a check tested on the approved Canaille text.
- Acceptance procedure: a manually inserted plan run must carry the project's `currency` and `language` (the columns default to EUR / en, which blocks a Moroccan project with `no_market_profile`).

## 5. Open cleanup (not blocking)
**New:**
- `api/generate-bp.js` takes the market from `run.currency`, not from the concept record's `project_country`.
- The preparation report quotes the founder's original risk answers verbatim (some in English, one with a stale 450 MAD ticket).
- Writer slips no rule catches: an attribution to the founder, the year-2 rent rise attributed to Ramadan. Consider an independent second read if they recur.
- `founder_report_html` is frozen at generation (run 13 keeps the old label).

**Resolved:**
- Canaille reserve gap.
- BP writer elision fix.

**Carried:**
- Payback beyond 3 years not shown.
- Payroll rules to check on a real payslip.
- Sommelier salary basis.
- And the rest of the instructions' « Open cleanup » list.

## 6. Links
- Bank plan (reference): `https://www.za3fran.io/api/report-bp-viewer?id=bp_v14_canaille_13&code=ESATZMB2`; preparation report `&doc=founder`.
- Designed files: `https://www.za3fran.io/api/bp-docs?id=bp_v14_canaille_13&code=ESATZMB2&doc=plan|summary|deck|deck-pptx|workbook`.
- Validator reference: `https://www.za3fran.io/api/report-viewer?id=rpt_v2_canaille_9&code=ESATZMB2`.
- Acceptance record: `docs/phase-a-acceptance.md`.
- Strategy: master strategy v1.6, Section 18 (website and customer journey).

## 7. Project instructions
Full text: `claude/project-instructions-2026-10-30-b18.md` (Project docs) and `docs/project-instructions.md` (repo), given to Arnaud in the chat.

Opening message for the next chat: « Reprends à partir du Handoff Brief #18 (claude/handoff-brief-18.md). Pushes sur main autorisés. »
