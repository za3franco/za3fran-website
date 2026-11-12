# ZA3FRAN — HANDOFF BRIEF #30 (draft, 12 nov. 2026)

**Next task:** Concept Studio **lot 1** (selection and figures in code on 8 fictitious profiles) once Arnaud has filled the ranges. **Model:** Opus-tier for lot 1 design, Sonnet for code.

## Where we are (12 Nov 2026)
Live (commit 52448c5, deployed after bf11d0c): 
- D9 consent box (Validator, BP intake, privacy line; `benchmark_consent_at` on submissions and projects; migration `20261111b`). To test by Arnaud, then verify in Supabase.
- `/brain` **Fourchettes** tab (12 formats, ticket per service, seats, surface → `concept.ticket/seats/surface_m2` as estimates; migration `20261111c`; `lib/brain-ranges.js`). No values filled yet. Sourced references shown per format (Le Pain Quotidien Maroc, May 2025, added for café-resto/brunch).
- `/brain` fixes: an « added » fact can be validated later (button Valider; API accepts verify on status `added`); no jump to top after an action (`openItem(id, true)`); facts without parameter labelled « connaissance seule ».
- **Traits and archetypes** (migration `20261112`, applied): `brain_concept_traits` (278 traits, 29 formats; 2 tied to non-inferred lines, rest deduced) and `brain_district_archetypes` (17 links, 12 districts; Sidi Belyout unclassified). Review block « Traits des formats et types de quartier » at the bottom of the Review tab (Valider per format / district; non blocking).
- `claude/a-verifier-arnaud.md` updated (A9 = 12 formats first, A13 D9 test, B1, B9, C4, benchmark note).
- Tests: 233 pass.

## Decisions
1. Claude does not pre-fill ranges without a dated source (public data found 12 Nov: hotel menus, aggregators, Top-N lists only). Arnaud supplies judgment ranges or dated menu photos via `/brain`.
2. Traits are stored as `researched`, each tied to a catalogue line or flagged `inference`; Arnaud's review never blocks.

## Tasks next chat
1. Arnaud: fill the 12 formats in `/brain#ranges`; test D9 box; review traits/archetypes. Claude then checks rows in `brain_parameter_values` and `benchmark_consent_at`.
2. Lot 1: `lib/studio-route.js`, `studio-select.js`, `studio-figures.js` on 8 fictitious profiles (build plan `docs/concept-studio-plan-construction.md`).
3. Fix before lot 4: webhook-validator project/record duplicate handling (see instructions).

## Open cleanup
Benchmark item `5d3b4248…`: 28 facts still proposed; 44 unmapped. « Barèmes fiscaux » view not located in code — ask Arnaud. A commit trailer (503af87) carries a placeholder session id (harmless).

## Instructions
The complete updated Project instructions are to be produced at the end of this chat (version of 12 Nov 2026), with these additions merged: lot 0 state above, tables `brain_concept_traits` / `brain_district_archetypes`, Fourchettes tab, D9 live, Brain app fixes.
