# ZA3FRAN — HANDOFF BRIEF #20

**Task of the next chat:** Phase B — Concept Studio, knowledge foundation: OpenStreetMap density test, storage of the district cards and venue census in the Brain, then the concept catalogue.
**Recommended model:** Sonnet for the test, the schema and the research; Opus-tier when the detailed Studio method is designed.

## 1. Where we are (30 Oct 2026)
- **Nothing new shipped to the site in this chat.** Live commit = GitHub HEAD (checked at the start: `880b237`, deployment READY; this brief's commit is docs only — see the verification at the end of the chat). `node --test`: 197/197.
- **Dashboard next step confirmed on real data** by Arnaud (screenshots): Test Café Maarif → « Faire la revue »; Test Bistrot Gauthier and Canaille → « Rapport de préparation ». Closed.
- **Brain review queue:** no comment from Arnaud (the two `rejected` rows are system closures).
- **Concept Studio — design started:**
  - Profiles and journeys written and validated: `claude/concept-studio-profils-parcours.md` (v0.1).
  - District cards: pilot Maârif + Gauthier (`claude/fiches-quartiers-pilote.md`, format validated) and the other 10 districts v0 (`claude/fiches-quartiers-avancement.md`). Research only, **not stored in the Brain yet**.
- **OpenStreetMap test not done:** `overpass-api.de` refused, then (after Arnaud allowed it in claude.ai settings) connection reset in this chat. A temporary Vercel sandbox to reach it was refused by the session's safety check — not routed around.
- **Half-done:** storage of the district data (needs a migration); Mahaly rents of October 2026 not yet written to the Brain.

## 2. Decisions taken
1. The Studio serves founders from zero (no idea, no budget, no experience) up to a Validator-ready concept; Studio → Validator → Business Plan (instructions, Phase B item 10).
2. 7 profiles, 4 entry questions + role, 8 modules built once; a missing profile is added later as a new path (`claude/concept-studio-profils-parcours.md`).
3. The Studio recommends and challenges, never scores /100; the score stays with the Validator (same doc, §6).
4. Knowledge first, by research: district cards + venue landscape together, then the concept catalogue; field validation decided later (same doc, §7).
5. First wave of 12 districts (+ Casa Anfa/CFC) as a starting base (instructions, Phase B).
6. District card format validated (instructions, Phase B; `claude/fiches-quartiers-pilote.md`).
7. Venue census: dated source < 18 months; generated « Top » lists and undated aggregators excluded (instructions, Research and data rules).
8. Delivery platforms (Glovo…) = manual dated signal only, never a ticket source, never extracted (instructions, Research and data rules).
9. OpenStreetMap is the candidate free, storable source for density (instructions, Principle 1 stack).

## 3. Tasks for the next chat, in order
1. Start-up checks: live commit = HEAD; `node --test tests/*.test.js`; `brain_review_queue` rows `rejected` with a note from Arnaud.
2. **OpenStreetMap test** on Maârif and Gauthier (Overpass, radius ~600–700 m): count restaurants/cafés/bars/fast food, share with a name and a cuisine tag, compare with the 2026 openings found in the press (Monsieur Moutarde, Braise, L'Octave, Mila, Casa Galicia). Verdict to Arnaud: usable for density or not.
3. **Storage schema** (migration, Arnaud approves): district parameters (character, audiences, footfall drivers, signals, urban works, gaps — text/JSON with source per line) and a venue census table (`brain_venues`: name, district, format, price band, source, date, source class; RLS on, no policies; file in `supabase/migrations/`). Then store the 12 cards as *researched*.
4. **Rents:** write Mahaly October 2026 (supersede Anfa, Californie, Bourgogne; add Aïn Diab, Sidi Maârouf, Casa Finance City; Sidi Belyout after confirming it maps to the centre-ville; read Mahaly's 10 hidden districts for Racine, CIL, Palmier, Oasis).
5. Fill the obvious gaps of the cards where research allows (Racine, Palmier, CIL rents and character; Sidi Maârouf current jobs; Médias24 / LesEco articles if a readable copy exists).
6. **Concept catalogue (K3)**: structure, then research by format.
7. Then design the detailed Studio method with Arnaud (Opus-tier), and only then code.
8. End with Handoff Brief #21 and the full updated instructions.

## 4. Permanent rules added (already in the instructions)
- Venue census rule (dated source < 18 months; generated lists and undated aggregators excluded).
- Delivery platforms: signal only.
- Studio: recommends, never scores.
- OpenStreetMap noted as the candidate density source; blocked hosts are reported, never routed around.

## 5. Open cleanup (not blocking)
- Marrakech and Rabat have no city-level Brain value while the site says « covered » — Arnaud to decide (raised in this chat, not answered).
- Maârif development plan (Médias24, 27 Oct 2026) and Marché central works (Médias24, 2026) unread: pages unreadable by our tools.
- Aïn Diab: maritime public-domain enforcement (Hespress, 21 Mar 2026) — to become a check for seafront concepts.
- All earlier items carry over (instructions, « Open cleanup »); the « dashboard next step on mocked states only » item is closed.

## 6. Links
- Studio docs (Project): `claude/concept-studio-profils-parcours.md`, `claude/fiches-quartiers-pilote.md`, `claude/fiches-quartiers-avancement.md`.
- Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); test projects `E3T9HZ4A`, `T6YW78V8`.
- Mahaly rents: https://mahaly.ma/prix-immobilier-commercial-casablanca/

## 7. Updated instructions
Full text: `claude/project-instructions-2026-10-30-b20.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #20 (claude/handoff-brief-20.md). Pushes sur main autorisés. »
