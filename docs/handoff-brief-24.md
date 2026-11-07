# ZA3FRAN — HANDOFF BRIEF #24

**Task of the next chat:** rebuild the website from the customer-journey audit of 7 Nov 2026 (doc « Audit parcours client za3fran.io »): new product homepage, page « Pour les établissements », pricing with 3 offers, the ten inaccurate phrases corrected, Open Graph tags, default language from the browser, the « Accompagnement concept » page (sur devis), and the « what you receive » examples on a fictitious project. Then, in later chats: the Morocco launch plan, then the Concept Studio build plan.
**Recommended model:** Sonnet for the build (complete files, tests, render checks); Opus-tier if Arnaud wants the homepage copy and structure reasoned in depth.

## 1. Where we are (7 Nov 2026)
- **Nothing changed on the live site in this chat.** Live = GitHub HEAD `b17dcbf` (Brief #23 docs commit), verified READY at the start (4 Nov); `node --test` 197/197. This brief's docs commit is the only push of the chat (only `docs/`, ignored by Vercel); its deployment is checked live = HEAD at the end of the chat.
- **Start-up checks (4 Nov):** no comment from Arnaud in `brain_review_queue` (the 2 rows with a note are closed test-project rows of 30 Oct); no new `/brain` item since 1 Nov.
- **Concept Studio method — validated by Arnaud (4 Nov)**, `claude/concept-studio-methode.md` v0.3: guardrails, session in cards, routing of the 7 profiles, modules M1–M8 in detail, thin sheets and beach-club flag, models and cost, price (Studio €249, Location only €99, Studio + Validator €349). Decisions D1–D9.
- **Ticket and size per format:** the Brain has none. Artifact **« Fourchettes par format »** (https://claude.ai/artifact/2CgJbyGZmo3qHPAAZGP9gy, `db` collection `fourchettes`) for Arnaud to fill; Claude's research pre-filled 5 formats with sourced references and left notes on 4 more (5 Nov). Not imported into the Brain.
- **Research finding (5 Nov):** Casablanca venues rarely publish menus with prices; the press almost never gives prices, seats or surfaces; fast-food prices live on delivery platforms. Perplexity Pro test (burger): 1 usable menu out of ~30 links.
- **Strategic decision (7 Nov): launch in Morocco now with the live chain** (option A), Studio sold first as « Accompagnement concept » done by Arnaud, sur devis; France later on a real signal. Arnaud confirmed no contract clause prevents the activity.
- **Website audit done (7 Nov)**: doc https://claude.ai/artifact/MVYDhANrd3CtwftniDuG4h (verdict, journey, findings by page, ten inaccurate phrases, proposed structure with a diagram, action plan, Arnaud's five decisions). Screens and page texts were rendered from the repo in French, desktop and phone.
- **Half-done:** the Glovo mark-up measurement (Glovo McDonald's prices observed; in-restaurant side missing; pastrama.ma and mcdonalds.ma not opened — permission prompts unanswered).

## 2. Decisions taken
1. Studio method D1–D6: 7-step deepening kept; D2 (c) Arnaud's ranges per format as « Za3fran estimate », replaced by dated menus; session in cards; beach club never proposed spontaneously; concept book PDF, Studio €249 / Location €99 / Studio + Validator €349; outside Casablanca the Studio says so (method §8).
2. D7 menus seen on TripAdvisor or Google accepted as signal (manual, dated) (method §9; instructions, research rules).
3. D8 automated menu watch and D9 founders' figures as benchmarks, to build with the Studio (method §9).
4. Delivery-platform mark-up to be measured manually on a few venues; platform prices may then become a corrected signal (instructions, research rules).
5. Published studies accepted as published sources, with date and country; a light Phase C added to the menu watch (instructions, research rules).
6. Perplexity Pro = Arnaud's manual tool, not a pipeline; answers checked in a chat before storage (instructions, stack).
7. Launch in Morocco now with the live chain; Accompagnement concept sur devis; France later on a real signal (instructions, item 11).
8. Homepage = product page; page « Pour les établissements » with Conseil, Client mystère, Design by need; Zahir Guest box and link when the app is ready (audit, decisions; instructions, item 11).
9. Examples built on a fictitious project; « Fondé en 2015 » kept; default language from the browser (audit, decisions).
10. Social connector not chosen yet; Claude drafts and schedules, Arnaud approves each post (instructions, stack).

## 3. Tasks for the next chat, in order
1. Start-up checks: live = HEAD; `node --test tests/*.test.js`; `brain_review_queue` comments; new `/brain` items; read the « Fourchettes par format » page for anything Arnaud filled (`ArtifactData` list on `fourchettes`) and `claude/a-verifier-arnaud.md`.
2. Read the audit doc (`read` with the Claude Docs tools on https://claude.ai/artifact/MVYDhANrd3CtwftniDuG4h) and check for Arnaud's comments.
3. Correct the ten inaccurate phrases (audit table; instructions, website rule) on index, platform, pricing, validator, scorecard.
4. Open Graph tags (title, description, image) on every public page; a share image in the brand.
5. Default language from the browser on every page (keep the saved choice and the toggle; extend `tests/site-bilingual.test.js`).
6. New homepage (order in the instructions, item 11) and the page « Pour les établissements » (Conseil, Client mystère, Design; contact; Zahir Guest box later). Platform page merged into « Comment ça marche » (or redirected), footers updated (Privacy link kept everywhere).
7. Pricing with 3 offers on top and add-ons in « Déjà client ? »; remove Financial Builder's card and Business Plan Pro's price; keep `tests/pricing.test.js` green.
8. Page « Accompagnement concept » (sur devis, WhatsApp and e-mail), linked from the « Pas encore d'idée claire » door; the Studio waitlist kept as a « bientôt » line.
9. A fictitious example project: generate a Validator report and a business plan on it (engine + writer, preview rows like Canaille), then show an extract on the homepage and the Validator and business-plan pages, labelled « projet d'exemple ».
10. Validator page: proof before the form (what you receive, example, « environ 15 minutes »).
11. Render every changed page in FR and EN, desktop and phone, no JS errors; push; live = HEAD.
12. End with Handoff Brief #25 and the full updated instructions. Next chat after that: the Morocco launch plan (channels, message, launch offer, social connector, viability threshold, salary-replacement calculation).

## 4. Permanent rules added
- Research rules: menus seen on TripAdvisor or Google as signal; delivery-platform mark-up measured manually; published studies as published sources (date, country; consultancy summaries secondary).
- Website rule: the audit's accuracy rules (no badge or claim without data, no price or date for unbuilt tools, Menu Engineer = two deliverables, Scorecard wording, « in a few minutes », sample scores matching v2, Open Graph on every public page).
- Social posts: Claude drafts and schedules; Arnaud approves each post before it is published.

## 5. Open cleanup (not blocking)
- « Fourchettes par format » not yet imported into the Brain; A9 and A10 (rents of Centre-ville, CIL, Oasis, Palmier, Racine) in `claude/a-verifier-arnaud.md`.
- Glovo mark-up: in-restaurant prices missing (ask Arnaud to paste mcdonalds.ma / pastrama.ma in a message, or to send dated menu-board photos).
- Pastrama's menu (burgers 115–129 DH, formulas 89 DH per Perplexity) unverified.
- Menu Engineer €49 extra regeneration: price in `lib/currency.js`, purchase path unconfirmed.
- Scorecard does not pre-fill the Validator; funnel events partly in place (cta clicks, scorecard completed, form submitted, begin checkout, purchase confirmed).
- Home page image uses an absolute `https://www.za3fran.io/assets/africa.png` URL.
- Everything carried from Briefs #21–#23 and the instructions' open cleanup.

## 6. Links
- Audit: https://claude.ai/artifact/MVYDhANrd3CtwftniDuG4h
- Fourchettes par format: https://claude.ai/artifact/2CgJbyGZmo3qHPAAZGP9gy (collection `fourchettes`)
- Project docs: `claude/concept-studio-methode.md` (v0.3), `claude/a-verifier-arnaud.md`, `claude/concept-studio-profils-parcours.md`, `claude/catalogue-concepts-structure.md`, `za3fran-master-strategy-v1_6.pdf`.
- Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); test projects `E3T9HZ4A`, `T6YW78V8`.

## 7. Updated instructions
Full text: `claude/project-instructions-2026-11-07.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #24 (claude/handoff-brief-24.md). Pushes sur main autorisés. »
