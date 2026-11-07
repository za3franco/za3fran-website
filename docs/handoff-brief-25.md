# ZA3FRAN — HANDOFF BRIEF #25

**Task of the next chat:** the Morocco launch plan (channels, message, launch offer, social connector, viability threshold decided in advance, monthly sales needed to replace a salary). After that: the Concept Studio build plan (Opus-tier chat).
**Recommended model:** Opus-tier for the launch plan (strategy and message choices); Sonnet for any page change that follows.

## 1. Where we are (7 Nov 2026)
- **Website rebuild from the customer-journey audit: done and live.** Commits `97ac796` (rebuild), `d57c0a6` (founder card), `98e2077` (founder photo), `1d9b90a` (example project, Validator proof, nav and footers); the docs commit of this brief follows. Live commit checked equal to GitHub HEAD at each step (see §6 for the last check). `node --test tests/*.test.js`: 203 pass (6 new tests in `tests/site-journey.test.js`). Headless render of 11 pages × FR/EN × desktop/phone: no JS error, no horizontal scroll (two overflows found and fixed: accompagnement-concept steps, business-plan compact footer).
- **What changed:** product homepage; `/etablissements` (Conseil, Client mystère, Design); `/accompagnement-concept` (sur devis); platform page rewritten as « Comment ça marche »; pricing with three offers on top and « Déjà client ? »; Validator page with proof before the form; Open Graph, canonical and Twitter tags on 11 pages with `assets/og-share.png`; browser-language default; ten inaccurate phrases corrected; founder card with photo and a draft text; nav and footers renamed « How it works ».
- **Example project « Maison Figue » (fictitious)** generated with the live tools: Validator `rpt_v2_exemple_1` = 64 VIABLE (first run 59 FRAGILE because the budget was too low for the engine's funding need; own funds raised to 1,150,000 and budget to 1,950,000), plan `bp_exemple_1` (funding need 2,360,000 MAD, equity 2,010,000, loan 350,000; the prudent-case cash reserve of about 1.04 M MAD forced the equity up). Project `34f1133a-e810-481f-8ec3-3d4ea6f8e8d7`, code `DEMOFG26`, submission `5d4c1b8e-7a2f-4c0e-9a31-2f6e8b9d0c11`. All review points decided with fictional rationales so the plan could be generated. Cost about €0.9 for the two generations plus one extra Validator run.
- **Not done:** Scorecard → Validator pre-fill, funnel events at each step, Zahir Guest box on `/etablissements`, rebuilt « Comment ça marche » not yet reread by Arnaud, founder text and « Why trust us » block are Claude's draft.

## 2. Decisions taken
1. Example = a new fictitious project (Arnaud chose it over Canaille, 7 Nov); labelled « Projet d'exemple (fictif) »; the two tools' figures are never shown side by side as one project (instructions, item 11).
2. Homepage founder card: Arnaud's LinkedIn photo, Claude wrote the text, employer not named (Arnaud, 7 Nov).
3. « Recommended to start » is the only badge (bundle on pricing); no popularity or best-value claim.
4. Free regeneration and the €49 regeneration are not promised anywhere until a real path exists.
5. Nav and footers use « How it works / Comment ça marche » for `/platform`.

## 3. Tasks for the next chat, in order
1. Start-up checks: live = HEAD; `node --test`; `brain_review_queue` comments; new `/brain` items (2 regulatory-watch items « ready » since 1 Nov); `claude/a-verifier-arnaud.md`; the « Fourchettes par format » page.
2. Read the example and the new pages as a visitor in FR on a phone with Arnaud's feedback; fix wording he does not like (founder text, « Why trust us »).
3. Launch plan: audience and channels in Morocco (LinkedIn, Instagram, WhatsApp communities, F&B networks, hospitality schools, banks' SME desks), the message (« testé avant d'investir »), a launch offer if any, the social connector choice (Metricool / Typefully / Windsor, cheapest first; Arnaud approves each post), the viability threshold decided in advance (X Validators and Y accompaniments in 90 days), and the monthly sales needed to replace Arnaud's salary.
4. Then: Scorecard → Validator pre-fill and funnel events; Zahir Guest box when the app is ready.
5. Then: the Studio build plan (Opus-tier), including D8, D9 and the light Phase C.

## 4. Permanent rules added
- Browser-language default; share tags on every public page; `tests/site-journey.test.js` guards phrases, tags, language, footers, homepage structure and pricing (instructions: branding standard, website rule).
- Example rule: examples are on Maison Figue, labelled, never mixing the two tools' numbers; do not delete the project.

## 5. Open cleanup (not blocking)
- Founder photo is 200 px at source; share image is French only.
- Menu Engineer: delivery e-mail (`api/webhook-menu-engineer.js`) still says « 1 free regeneration »; `menu_regen` price in `lib/currency.js`.
- Marrakech / Rabat « covered » wording; C1 from the audit.
- Example inconsistency between Validator funding sizing and plan funding (explained under the cards).
- A commit trailer of `d57c0a6` has a mistyped session id (harmless).
- Everything carried from Briefs #21–#24 and the instructions' open cleanup.

## 6. Links
- Audit: https://claude.ai/artifact/MVYDhANrd3CtwftniDuG4h
- Example viewers: `/api/report-viewer?id=rpt_v2_exemple_1&code=DEMOFG26`, `/api/report-bp-viewer?id=bp_exemple_1&code=DEMOFG26`
- Canaille `3c16eff6-5084-4761-a525-a4b6b912c73d` (`ESATZMB2`); test projects `E3T9HZ4A`, `T6YW78V8`.

## 7. Updated instructions
Full text: `claude/project-instructions-2026-11-07-b25.md` / `docs/project-instructions.md`, also given in the chat.

**Opening message for the next chat:** « Reprends à partir du Handoff Brief #25 (claude/handoff-brief-25.md). Pushes sur main autorisés. »
