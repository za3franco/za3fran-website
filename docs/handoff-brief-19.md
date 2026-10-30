# ZA3FRAN — HANDOFF BRIEF #19

**Task of the next chat:** Phase B — Concept Studio (concept development + location shortlist, Casablanca first). Start with the method design, with Arnaud, before any code.
**Recommended model:** Opus-tier for the method design; Sonnet for the build.

## 1. Where we are (30 Oct 2026)
- **Phase A website release is live.** Commit `e5b9d6bed5eab336ba4df4f5650c8fc71f6e8901` on `main`, deployment `dpl_8YzRHh2FciQyNqHBZZvw35RxibHQ` READY, equal to GitHub HEAD.
- Shipped: new page `/methodology` (sources, Brain, market coverage, limits); platform `#start` doors + five-step flow; index hero « Where are you starting from? »; coverage notes on pricing, business-plan, validator; BP « Sources and coverage » block; dashboard stage tracker + single next step (`renderStageAndNext()` in project.html); Concept Studio waitlist checkbox (index, platform); methodology links in footers.
- Tested: `node --test` 197/197; headless render EN/FR desktop + phone, no JS errors; live checks of /methodology and /platform.
- Half-done: the dashboard next step was tested on mocked states only.

## 2. Decisions taken
1. The Concept Studio is shown only as « coming soon · Casablanca first », opening the waitlist; never sold.
2. Coverage wording is identical everywhere: Morocco (Casablanca, Marrakech, Rabat) covered today; other Moroccan cities on national values with the gap flagged; other countries on request — « tell us before you buy ». No « never blocked » promise for other countries (BP blocks on `no_market_profile`).
3. « Investor-grade » wording on coming-soon tools left untouched until those tools release.
4. `/methodology` served by `cleanUrls`, no rewrite.

## 3. Tasks for the next chat, in order
1. Start-up checks: live commit = HEAD; `node --test tests/*.test.js`; read `brain_review_queue` rows `rejected` with a note.
2. Ask Arnaud to open the dashboard of Canaille (`ESATZMB2`) and a test project (`E3T9HZ4A`, `T6YW78V8`) to confirm the next step shows correctly on real data.
3. Design the Concept Studio method with Arnaud (master strategy v1.6, Sections 3.19 and 16): guided concept development, location shortlist of 2–3 districts, Casablanca first; it writes the shared concept record (`concept_records`) the Validator reads.
4. Build in stages, tests first, no model-made numbers.
5. End with Handoff Brief #20 and the full updated instructions.

## 4. Permanent rules added
- Coverage is stated before purchase, in the same words, on pricing, business-plan, validator and `/methodology`.
- The Studio stays « coming soon » on the site until it is live.

## 5. Open cleanup (not blocking)
- « Investor-grade » / « investor package » on coming-soon tools (platform, pricing) — reword at release.
- Regulatory watch has not yet run on its own (first run 1 Dec 2026); `/methodology` says monthly upkeep — verify.
- Studio waitlist entries have no automation.
- All earlier items carry over (see instructions, « Open cleanup »).

## 6. Links
Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); reference runs `bp_v14_canaille_13`, `rpt_v2_canaille_9`; methodology https://www.za3fran.io/methodology.

## 7. Updated instructions
Full text: `claude/project-instructions-2026-10-30-b19.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #19 (claude/handoff-brief-19.md). Pushes sur main autorisés. »
