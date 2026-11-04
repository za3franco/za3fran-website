# ZA3FRAN — HANDOFF BRIEF #23

**Task of the next chat:** Phase B — Concept Studio: design the detailed Studio method with Arnaud (how modules M1–M8 use the district cards, the census, the OpenStreetMap density and the concept catalogue; deliverable and price). No code before the method is validated.
**Recommended model:** Opus-tier (prompt and method design, highest-stakes reasoning).

## 1. Where we are (4 Nov 2026)
- **Nothing changed on the site.** Two Brain data migrations were pushed to `main` — lot 3a `ab9de07`, lot 3b `f056f47` — plus this brief's docs commit. They only add SQL files under `supabase/` (ignored by Vercel). Lot 3a's deployment was verified READY on `ab9de07`; lot 3b's deployment was still BUILDING when last checked: **check live = GitHub HEAD at the start of the next chat.**
- **Start-up checks done:** live = HEAD (`07c7ceb` at start), `node --test` 197/197, no comment from Arnaud in `brain_review_queue`, no new `/brain` item.
- **Concept catalogue K3: all 29 formats researched** (status `researched`).
  - Lot 3a (`supabase/migrations/20261103_concept_lot3a.sql`): crêperie (9 lines, 1 example), glacier-gelato (11, 3), jus et bowls (10, 2), poulet (10, 2), tacos et street food (11, 2).
  - Lot 3b (`supabase/migrations/20261103b_concept_lot3b.sql`): bowls / poke (8, 0), food hall (8, 1), bar de quartier (9, 2), beach club (10, 1), supper club (10, 2), traiteur (8, 1).
  - Method kept: every line has a source and a date or is flagged as a deduction; undated or old sources say so in their name (G-Ice 2007, tacos 2019, caterers 2020, Carré Eden Sept 2024); other-country sources carry their ISO code (`FR`); franchisors' figures are marked non-transposable.
  - **Beach club = regulatory flag and the only Moroccan failure case of the whole catalogue:** Tahiti Beach Club (Aïn Diab) closed since 29 Feb 2024 (tax seizure, maritime concession not renewed); wali of Casablanca-Settat banned the commercial use of Casablanca's beaches for summer 2026 and froze tenders (22 Apr 2026); Aïn Diab demolitions (21 Mar 2026); seven private beaches threatened at Dar Bouazza (24 Feb 2024). The Studio must say plainly that this format carries very high regulatory risk.
  - Thin sheets (said in their gaps): libanais, tapas, shawarma premium, crêperie, bowls / poke, food hall, traiteur.
- **Arnaud's review list** updated: `claude/a-verifier-arnaud.md` (new items A7 beach-club concessions, A8 caterers and food halls he knows; B6–B7 lots to reread).
- **Tooling lesson:** a `git push` from the sandbox answered 403 until the repo was added with the repo tool, access `push` (an existing clone with local commits can then be pushed as is). Written into the instructions.
- **Half-done:** nothing.

## 2. Decisions taken
1. All 29 catalogue formats stored as *researched* (Arnaud, 4 Nov: « oui continue »); field validation stays decided later. (Instructions, Phase B.)
2. Beach club stored with its regulatory flag and flagged « format à très fort risque » in its gaps. (Instructions, Phase B.)
3. Poké stored without a dedicated Casablanca example rather than inventing one; the Newrest corporate restaurant serves as the traiteur example only.
4. Arnaud asked for the brief and the instructions now, and a fresh chat for the Studio method (Arnaud, 4 Nov).

## 3. Tasks for the next chat, in order
1. Start-up checks: live = HEAD; `node --test tests/*.test.js`; `brain_review_queue` comments; read `claude/a-verifier-arnaud.md` for anything Arnaud answered (and act on `/brain` items he sent: menu photos, notes).
2. Read the working material: `claude/concept-studio-profils-parcours.md` (7 profiles, 8 modules), `claude/catalogue-concepts-structure.md`, `claude/fiches-quartiers-pilote.md`, `claude/catalogue-concepts-lot1.md`, master strategy v1.6 Sections 3.19 and 16, and a query of the Brain tables (`brain_district_notes`, `brain_venues`, `brain_district_density`, `brain_concept_formats`, `brain_concept_lines`, `brain_concept_examples`).
3. With Arnaud, design the detailed Studio method (Opus-tier): for each module M1–M8, which Brain tables it reads, what it asks the founder, what it proposes and challenges, what it refuses to say (no score, no invented venue, no invented figure); how the entry questions route the 7 profiles; how engine orders of magnitude (M7) are produced; the concept record fields the Studio pre-fills for the Validator (every estimate « to confirm »); how thin sheets and the beach-club flag are presented; the regulatory and licence caveats.
4. Decide the deliverable (concept book PDF?), the price and the Studio's model assignments (cost per run, cheapest first). Only then plan the build (own chat).
5. Update `claude/a-verifier-arnaud.md` if the method exposes new gaps.
6. End with Handoff Brief #24 and the full updated instructions.

## 4. Permanent rules added
- Pushing needs the repo added with access `push` (see Principle 2). No other new rule: the catalogue method rules were already in the instructions.

## 5. Open cleanup (not blocking)
- No dated menu price for any catalogue format in Casablanca; one Moroccan failure case only (the beach club).
- Bar closure during Ramadan rests on a 2015 source; dark-kitchen adoption figures (40 % / 60 %) from a secondary source.
- The OSM summaries do not count bakeries (`shop=bakery`) — add them to the query for the next district; OSM exists only for Maârif and Gauthier.
- TelQuel, Médias24 (Marché central conversion 2019, Maârif plan), Tendance Hôtellerie and ac-franchise pages are unreadable by our fetch tools.
- Mila Supper Club's district differs between sources (Maârif / Oasis); Ruby's price comes from a booking site.
- Everything carried from Brief #22 and Brief #21 (Sidi Belyout mapping, Mahaly's hidden districts, Marrakech/Rabat « covered » wording) and the instructions' open cleanup.

## 6. Links
- Project docs: `claude/a-verifier-arnaud.md`, `claude/catalogue-concepts-lot1.md`, `claude/catalogue-concepts-structure.md`, `claude/concept-studio-profils-parcours.md`, `claude/fiches-quartiers-pilote.md`, `claude/fiches-quartiers-avancement.md`, `za3fran-master-strategy-v1_6.pdf`.
- Migrations: `supabase/migrations/20261103_concept_lot3a.sql`, `20261103b_concept_lot3b.sql` (and `20261102`, `20261102b`, `20261102c`).
- Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); test projects `E3T9HZ4A`, `T6YW78V8`.

## 7. Updated instructions
Full text: `claude/project-instructions-2026-11-04.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #23 (claude/handoff-brief-23.md). Pushes sur main autorisés. »
