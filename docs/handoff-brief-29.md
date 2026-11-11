# ZA3FRAN — HANDOFF BRIEF #29

**Task of the next chat (Project Za3fran Digital):** Concept Studio **lot 0 — data foundations**, starting with the D9 consent box, which must be live before the launch of Tuesday 17 Nov 2026.
**Recommended model:** Sonnet for the consent box and the ranges page; Opus-tier for deriving the structured format traits and district archetypes from the catalogue.

## 1. Where we are (11 Nov 2026)

- **Start-up checks of Brief #28 done:** live commit = GitHub HEAD; `node --test tests/*.test.js` 224 pass (after `npm install` in a fresh clone; 9 failures before it came only from missing packages); `offline_sales` already created (RLS on, empty), so the « Ventes hors site » form saves; **`/pilotage` confirmed by Arnaud on his phone with real data** (0 MAD, 8 test purchases excluded, target 27,000 MAD shown).
- **Concept Studio build plan written and decided:** `claude/concept-studio-plan-construction.md` v1.1, copy in `docs/` (commits `5857ca3`, `698dbbd`; docs only, nothing served changed; deployment of `698dbbd` was building at hand-off — check it is READY).
- Nothing half-done in code.

## 2. Decisions taken (all in the plan, §9, and in the instructions, item 10)

1. The 6 entry questions and the routing are free (no model call); payment before the first written card (Arnaud, 11 Nov).
2. « Location only » €99, upgrade to the full Studio for the difference, €150 (Arnaud, 11 Nov).
3. D9 consent box live **before the 17 Nov launch**, on the Validator and the BP intake, plus a privacy-policy line FR/EN (Arnaud, 11 Nov).
4. Ranges page rebuilt for the phone; Arnaud fills the 12 most common formats first (Arnaud, 11 Nov).
5. The internal Studio is Arnaud's copilot for his paid « Accompagnements concept » from lot 3 (Arnaud, 11 Nov).
6. Still open: D9 minimum number of projects (proposal 5; founder benchmark preferred from 10) — decided at lot 7.

## 3. Tasks for the next chat, in order

1. **D9 consent box** (before 17 Nov): unticked checkbox on `validator.html` and `bp-intake.html` (bilingual sibling spans), text « J'accepte que mes chiffres, anonymisés et agrégés avec ceux d'au moins plusieurs autres projets, servent de repère » (final wording to show Arnaud); stored on the project (`za3fran_projects.benchmark_consent_at`, migration with Arnaud's « Approve »; the Validator path stores it through the submission and the webhooks, Stripe and YouCan); one line in `privacy.html` FR/EN; tests (presence on both forms, stored when ticked, nothing stored when unticked); headless render FR/EN phone and desktop; push, live = HEAD.
2. **« Fourchettes par format » page rebuilt for the phone** (same artifact URL and `db` collection, or a new one if the format changes): 12 most common formats first, Claude's sourced references shown next to each field, one format per screen, ≈ 20 minutes in all. Then the import function into the Brain (`concept.ticket` per service, `concept.seats`, `concept.surface_m2`, `format_key` = slug, class *estimate*, through `brain_add_value()`).
3. **Structured format traits** (`brain_concept_traits`) derived from the 380 catalogue lines, each trait tied to its line or flagged `inference`; **district archetypes** (`brain_district_archetypes`) for the 13 districts. Stored *researched*; shown in `/brain` for Arnaud's review (never blocking).
4. Update `claude/a-verifier-arnaud.md` (A9 now « 12 formats first »; new review items: traits, archetypes).

## 4. Com Project / Arnaud

Unchanged from Brief #28: posts on Metricool, targets and scripts, quote template, day-30 review. Arnaud: YouCan daily-limit answer; accountant questions; reread « Comment ça marche », founder text, « Why trust us »; four anecdotes; larger photo; **fill the ranges page once rebuilt**.

## 5. Permanent rules added

The Studio never calls `assess()` or `finalize()` (no score, no verdict); cards already written for the same extract are reused; consent box unticked by default — all written into the instructions (item 10).

## 6. Open cleanup

New: `api/webhook-validator.js` inserts the concept record as version 1 and silently ignores a duplicate — once the Studio creates the project first, the Validator's confirmed form would be dropped (fix in lot 4, with a test). Everything from Briefs #21–#28 carried (see the instructions, open cleanup).

## 7. Links

Plan `claude/concept-studio-plan-construction.md`; method `claude/concept-studio-methode.md`; profiles `claude/concept-studio-profils-parcours.md`; review list `claude/a-verifier-arnaud.md`; ranges page https://claude.ai/artifact/2CgJbyGZmo3qHPAAZGP9gy; `/pilotage`; Canaille `ESATZMB2`; example `DEMOFG26`.

## 8. Updated instructions

`claude/project-instructions-2026-11-11-b29.md` / `docs/project-instructions.md`.

**Opening message:** « Reprends à partir du Handoff Brief #29 (claude/handoff-brief-29.md). Pushes sur main autorisés. »
