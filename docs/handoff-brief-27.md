# ZA3FRAN — HANDOFF BRIEF #27

**Task of the next chat (Project Za3fran Digital):** technical side of the launch — `social_posts` queue and n8n workflow, simple tracking view, small site builds; then the Studio build plan in its own Opus-tier chat. **Communication now lives in the new Project « Za3fran Com ».**
**Recommended model:** Sonnet for the queue, workflow and site edits; Opus-tier for the Studio build plan.

## 1. Where we are (7 Nov 2026)
- No code changed in this chat. Live site = last code commit `bfffa59` (docs-only commits since). Nothing pushed except docs (this brief, instructions, Com kit).
- **Launch strategy v2 done** (`claude/strategie-lancement-v2.md`): the v1 posts were rejected as product-selling; new angle « le service à blanc », need-driven, four rubrics, channels re-evaluated (LinkedIn, prescribers, direct messages, Instagram/Facebook secondary). Threshold and 5 h/week cap unchanged.
- **8 posts drafted** (`claude/posts-linkedin-s1-s4-v2.md`), all « à valider ». Arnaud said « Ok avec les postes » — ambiguous; per-post validation to be confirmed in the Com Project.
- **First two visuals built and sent** (post 1 Tuesday « Service à blanc », post 2 Thursday « 70 couverts », labelled fictif): `docs/com/` in the repo and the Com kit.
- **n8n:** Arnaud has n8n at `https://za3fran-n8n.onrender.com` on the Render free tier, kept awake by an UptimeRobot monitor (up 1 month 28 days). Version and data persistence unknown. Design of the approval-gated queue written in the instructions (Principle 1, social media bullet). Not built.
- **Project split decided:** Za3fran Com (communication) separate from Za3fran Digital (product, code, data).

## 2. Decisions taken
1. Angle « service à blanc »; posts serve a need (operator's look before signing), not a product (strategy v2).
2. Tone: tutoiement, chef's voice, a figure first, no AI/startup jargon.
3. Four rubrics: Dossier Maison Figue, Le chiffre de Casa, La question de l'opérateur, Vu de la cuisine; offers at most 1 post in 4.
4. Prescribers and direct messages added as channels (about 1 h a week each).
5. Automation = Supabase `social_posts` + n8n polling workflow; Arnaud's validation stays the only trigger; week 1 by hand; Instagram/Facebook later.
6. Proposed day 0: Tuesday 10 Nov 2026, 8:30 (to be confirmed by Arnaud).
7. Communication work moves to the Project « Za3fran Com »; this Project does the technical side only.

## 3. Tasks for the next chat (Digital), in order
1. Start-up checks: live = HEAD; `node --test tests/*.test.js`; `/brain` items; `claude/a-verifier-arnaud.md`.
2. Ask Arnaud: n8n version (Settings → About) and whether workflows survive a Render restart (external DB?). If they do not, decide before building (free external Postgres such as Supabase, or accept re-import).
3. `social_posts` migration (RLS on, no policies, file in `supabase/migrations/`; tell Arnaud to click « Approve »), then the importable n8n workflow JSON and a step-by-step guide to create the LinkedIn developer app (and the Meta app later). LinkedIn token lasts 60 days.
4. Simple tracking view (paid Validators, Scorecards, GA4 funnel) once day 0 is confirmed.
5. Small builds: Zahir Guest box on `/etablissements`; Menu Engineer regeneration wording; Marrakech/Rabat « covered » wording; hi-res founder photo; English share image.
6. Studio build plan in its own Opus-tier chat (D8, D9, light Phase C).

## 4. Tasks in the Com Project
Confirm validated posts and day 0; collect Arnaud's real anecdotes; visuals for the other six posts; ~30 targets and scripts (incl. prescribers); accompaniment quote template; weekly indicators; day-30 review.
Arnaud's own: accountant questions (IS, VAT on euro sales to non-Moroccan clients, Stripe repatriation, salary vs dividends); reread « Comment ça marche », founder text, « Why trust us ».

## 5. Permanent rules added
Scope split between Digital and Com Projects; the automation design and the two checks before building; launch strategy v2 (item 11 of the instructions). All written into the instructions text.

## 6. Open cleanup
- n8n version and persistence unknown; no LinkedIn developer app yet.
- « Service à blanc » to test on Moroccan restaurateurs (fallbacks: « répétition générale », « service d'essai »).
- `claude/plan-lancement-maroc.md` is superseded for message and posts.
- Maison Figue post visuals are static (regenerate if the example changes).
- Everything carried from Briefs #21–#26.

## 7. Links
- Strategy `claude/strategie-lancement-v2.md`; posts `claude/posts-linkedin-s1-s4-v2.md`; Com kit `docs/com/` (instructions, authorised figures, render script, two visuals).
- Example `rpt_v2_exemple_1` / `bp_exemple_1`, code `DEMOFG26`; Canaille `ESATZMB2`.

## 8. Updated instructions
`claude/project-instructions-2026-11-07-b27.md` / `docs/project-instructions.md`.

**Opening message:** « Reprends à partir du Handoff Brief #27 (claude/handoff-brief-27.md). Pushes sur main autorisés. »
