# ZA3FRAN — HANDOFF BRIEF #21

**Task of the next chat:** Phase B — Concept Studio, knowledge foundation: concept catalogue (K3), research lot 1.
**Recommended model:** Sonnet for the research and the storage; Opus-tier when the detailed Studio method is designed (after the catalogue).

## 1. Where we are (1 Nov 2026)
- **Nothing new shipped to the site.** Live commit = GitHub HEAD: `3236cd1` (deployment READY, checked at the end of the chat); this brief's commit is docs only. `node --test`: 197/197 at the start of the chat (no code changed).
- **Start-up checks done:** live = HEAD, tests 197/197, `brain_review_queue`: no comment from Arnaud (the two `rejected` rows are system closures).
- **Brain, stored this chat (all *researched*; migrations in `supabase/migrations/`, RLS on, no policies):**
  - **Rents:** Mahaly October 2026 written through `brain_add_value()` — Anfa 173, Californie 167, Bourgogne 145, Gauthier 150, Maârif 140 (September rows superseded); added Aïn Diab 174, Sidi Maârouf 134, Casa Finance City 211, Sidi Belyout 175 (Mahaly's own label, **not** mapped to Centre-ville). 10 live rent rows. (`20261030a`)
  - **District cards (K1):** tables `brain_district_notes` and `brain_venues` (`20261030b`); 13 districts' cards = 88 sourced lines, 13 census venues (`20261030c`). 14 district markets under Casablanca (the 13 + Sidi Belyout).
  - **Density (K2):** `brain_district_density` with the OpenStreetMap summaries of Maârif and Gauthier (`20261101`).
  - **Concept catalogue (K3):** `brain_concept_formats` (29 formats), `brain_concept_lines`, `brain_concept_examples` (`20261101b`); **pilot sheet wine bar** stored: 28 lines, 6 examples (`20261101c`). 1 of 29 formats researched.
- **OpenStreetMap test done (Arnaud, from his phone):** `overpass-api.de` still resets the sandbox connection, so Arnaud ran `overpass-turbo.eu` links and pasted the CSV. Verdict: **usable for density and mix of types, not as a census.** Maârif 131 venues (58 restaurants, 39 cafés, 23 fast-food, 5 bars, 6 ice-cream); Gauthier 115 (56, 37, 13, 9, 0); 23 shared. 90 % / 86 % named, 29 % / 34 % with a cuisine. Press openings found: 1 of 5 (Braise present; Monsieur Moutarde, L'Octave, Mila, Casa Galicia absent); no wine-oriented venue seen.
- **Docs saved in the Project:** `claude/catalogue-concepts-structure.md` (structure + wine-bar pilot sheet), this brief, the updated instructions.
- **Half-done:** nothing blocking. The catalogue is 1/29 researched.

## 2. Decisions taken
1. OpenStreetMap = density and mix of types only; stored as counts per district (`brain_district_density`), never per-venue rows (no date per venue). (Instructions, Research and data rules.)
2. For sources the sandbox cannot reach: Claude builds a link, Arnaud opens it on his phone and pastes the text; one query per district. (Instructions, Principle 1 stack.)
3. K3 structure validated by Arnaud: unit = format of concept (29), 13-block sheet, 3 tables, five district archetypes A–E, example markets Morocco → Southern Europe and Paris → Gulf. (`claude/catalogue-concepts-structure.md`; Instructions, Phase B.)
4. The wine-bar pilot sheet has the right level of detail; the rest goes by batches. (same doc)
5. Priority-1 formats for the first lots: bar à vin (done), bistro-brasserie, café de spécialité, boulangerie-pâtisserie-café, comptoir japonais, bar à cocktails.
6. Catalogue source rules: dated or flagged, other-country examples marked and never setting a Casablanca figure, no business-plan-template blogs or generated lists, one failure case per format when it exists, numbers from the engine's family methods. (Instructions, Research and data rules.)
7. Sidi Belyout kept under Mahaly's own name until the centre-ville mapping is confirmed.

## 3. Tasks for the next chat, in order
1. **Start-up checks:** live commit = HEAD; `node --test tests/*.test.js`; `brain_review_queue` rows `rejected` with a note from Arnaud.
2. **Catalogue lot 1:** the five other priority-1 formats (bistro-brasserie de quartier, café de spécialité, boulangerie-pâtisserie-café, comptoir japonais / sushi, bar à cocktails), same method as the wine-bar sheet (`claude/catalogue-concepts-structure.md` §3 and §6): 3–5 dated examples under about 24 months, **Moroccan and Southern-European examples first** (the pilot has none from Morocco), at least one failure or adjustment case, presence in Casablanca from the census, density summaries and district notes, regulatory flags, gaps. Store through a migration file in `supabase/migrations/` and the same SQL run from the chat; set the format `researched`. No new table: Arnaud's approval is not needed for data inserts, but tell him if a migration window will open.
3. **Fill the pilot's gaps where research allows:** a Moroccan wine-bar example in operation for more than a year; dated menus for Braise and Monsieur Moutarde (ask Arnaud for menu photos through `/brain`, with their date).
4. **Lot 2:** the priority-2 formats, in batches of about five; priority 3 after.
5. **Alcohol-licence procedure entry for Casablanca** (open cleanup; the wine-bar and cocktail sheets point to it).
6. **OpenStreetMap for other districts, one by one,** only when a sheet or the Studio needs it (Arnaud's phone, CSV paste).
7. Then design the **detailed Studio method** with Arnaud (Opus-tier), and only then code.
8. End with Handoff Brief #22 and the full updated instructions.

## 4. Permanent rules added (already in the instructions)
- OpenStreetMap density rule (counts only, with limits and attribution, never for a niche's competitors).
- Concept catalogue source rules (see decision 6).
- Method for sources the sandbox cannot reach (decision 2).
- Concept Studio knowledge tables listed in the architecture facts (RLS on, no policies, check constraints on source and the 18-month census rule).

## 5. Open cleanup (not blocking)
- Mahaly's 10 hidden districts unread (Racine, CIL, Palmier, Oasis may be among them); Sidi Belyout ↔ Centre-ville to confirm.
- OSM density only for Maârif and Gauthier (approximate centres, 650 m circles overlapping by 23 venues); on turbo the CSV `::id` and `::lat`/`::lon` columns come back empty.
- Marrakech and Rabat have no city-level Brain value while the site says « covered » — Arnaud to decide (raised in #20, not answered).
- Maârif development plan (Médias24, 27 Oct 2026) and Marché central works (Médias24, 2026) unread: pages unreadable by our tools.
- Aïn Diab maritime public-domain enforcement (Hespress, 21 Mar 2026) → regulatory flag for beach club / rooftop sheets.
- All earlier items carry over (instructions, « Open cleanup »).

## 6. Links
- Project docs: `claude/catalogue-concepts-structure.md`, `claude/concept-studio-profils-parcours.md`, `claude/fiches-quartiers-pilote.md`, `claude/fiches-quartiers-avancement.md`.
- Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); test projects `E3T9HZ4A`, `T6YW78V8`.
- Mahaly rents: https://mahaly.ma/prix-immobilier-commercial-casablanca/
- Wine-bar pilot sources: Hespress 15 Oct 2026 (Braise), The Drinks Business 27 Nov 2025 (Hong Kong wine bars), SevenFifty Daily (undated).

## 7. Updated instructions
Full text: `claude/project-instructions-2026-11-01-b21.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #21 (claude/handoff-brief-21.md). Pushes sur main autorisés. »
