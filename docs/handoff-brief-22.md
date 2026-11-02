# ZA3FRAN — HANDOFF BRIEF #22

**Task of the next chat:** Phase B — Concept Studio, concept catalogue (K3): research the 11 priority-3 formats, then prepare the detailed Studio method with Arnaud.
**Recommended model:** Sonnet for the research and storage; Opus-tier when the detailed Studio method is designed.

## 1. Where we are (2 Nov 2026)
- **Nothing changed on the site.** Three Brain data migrations were pushed to `main` (`97cf588`, `71d786d`, `fb9767b`) plus this brief's docs commit. Live = GitHub HEAD was verified on `97cf588` (deployment READY). The two later commits only add SQL files in `supabase/` (ignored by Vercel) — check live = HEAD at the start of the next chat.
- **Start-up checks done:** live = HEAD (`283534d` at start), `node --test` 197/197, no comment from Arnaud in `brain_review_queue`.
- **Concept catalogue: 18 of 29 formats researched** (status `researched`), every priority-1 and priority-2 format:
  - Lot 1 (`20261102_concept_lot1.sql`): café de spécialité (27 lines, 6 examples), boulangerie-pâtisserie-café (22, 3), bistro-brasserie (22, 5), comptoir japonais / sushi (20, 7), bar à cocktails (19, 5). Summary: `claude/catalogue-concepts-lot1.md`.
  - Lot 2a (`20261102b_concept_lot2a.sql`): table marocaine contemporaine (17, 4), trattoria-pizzeria napolitaine (16, 5), libanais-méditerranéen (11, 2), café-resto / brunch (15, 2), burger (15, 3).
  - Lot 2b (`20261102c_concept_lot2b.sql`): grill, poissons et fruits de mer, tapas ibériques, salon de thé-pâtisserie, sandwich et shawarma premium, rooftop / lounge, dark kitchen (67 lines, 8 examples in total).
- **Method kept:** every line has a source and a date or is flagged as a deduction; undated or old sources say so in their name; other-country sources carry their ISO code (`EU` for pan-European data); a failure or adjustment case is recorded when one was found (Planta, Goiko, Mola Pizza, Ninina, Paris brasseries…).
- **Arnaud's review list** created and kept up to date: `claude/a-verifier-arnaud.md`.
- **Half-done:** nothing.

## 2. Decisions taken
1. Arnaud (2 Nov): keep building; he reviews later. Claude keeps a list of what to verify, reread or supply — `claude/a-verifier-arnaud.md`, updated at every lot. (Instructions, Phase B.)
2. Alcohol-licence procedure for Casablanca: left as a gap — only old press found; needs an official document or a professional (list item A2).
3. Lebanese, tapas and shawarma-premium sheets stored even though thin; their gaps say so.

## 3. Tasks for the next chat, in order
1. Start-up checks: live = HEAD; `node --test tests/*.test.js`; `brain_review_queue` comments; read `claude/a-verifier-arnaud.md` for anything Arnaud answered (and act on `/brain` items he sent: menu photos, notes).
2. Catalogue lot 3: the 11 priority-3 formats in two batches (crêperie, glacier-gelato, jus et bowls, poulet, tacos et street food; bowls / poke, food hall, bar de quartier, beach club, supper club, traiteur). Beach club and rooftop carry the Aïn Diab maritime public-domain flag. Same method; migration files `20261103…`.
3. Update `claude/a-verifier-arnaud.md` after each batch.
4. Then the detailed Studio method with Arnaud (Opus-tier): how modules M1–M8 use the district cards, the census, the density and the catalogue; deliverable and price. Only then code.
5. End with Handoff Brief #23 and the full updated instructions.

## 4. Permanent rules added (already in the instructions)
- Arnaud's review list `claude/a-verifier-arnaud.md`, updated at every lot; it never blocks the work.

## 5. Open cleanup (not blocking)
- No dated menu price for any catalogue format in Casablanca; no Moroccan failure case for any format.
- Bar closure during Ramadan rests on a 2015 source; dark-kitchen adoption figures (40 % / 60 %) from a secondary source.
- The OSM summaries do not count bakeries (`shop=bakery`) — add them to the query for the next district.
- TelQuel (third-wave coffee, 18 Sep 2025; Glovo dark stores, 2 Mar 2026) and Tendance Hôtellerie pages are unreadable by our fetch tools.
- Everything carried from Brief #21 (Sidi Belyout mapping, Mahaly's hidden districts, Marrakech/Rabat « covered » wording, OSM only for Maârif and Gauthier, Médias24 pages unreadable) and the instructions' open cleanup.

## 6. Links
- Project docs: `claude/a-verifier-arnaud.md`, `claude/catalogue-concepts-lot1.md`, `claude/catalogue-concepts-structure.md`, `claude/concept-studio-profils-parcours.md`, `claude/fiches-quartiers-pilote.md`.
- Migrations: `supabase/migrations/20261102_concept_lot1.sql`, `20261102b_concept_lot2a.sql`, `20261102c_concept_lot2b.sql`.
- Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); test projects `E3T9HZ4A`, `T6YW78V8`.

## 7. Updated instructions
Full text: `claude/project-instructions-2026-11-02-b22.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #22 (claude/handoff-brief-22.md). Pushes sur main autorisés. »
