# ZA3FRAN — HANDOFF BRIEF #26

**Task of the next chat:** launch execution (LinkedIn posts, target list and scripts, quote template, tracking), then the Concept Studio build plan in its own chat.
**Recommended model:** Sonnet for posts, scripts and page edits; Opus-tier for the Studio build plan.

## 1. Where we are (7 Nov 2026)
- Live = GitHub HEAD = `bfffa59` (Vercel READY, checked). `node --test tests/*.test.js`: 209 pass.
- **Launch plan v1 done** (`claude/plan-lancement-maroc.md`): message « Teste ton concept avant d'investir », two channels (LinkedIn + WhatsApp/DM to about 30 targets), full prices, Accompagnement concept about €1,000 sur devis, threshold decided in advance: **≥15 paid Validators (≥5 bundles) + ≥3 accompaniments in 90 days** (about €7,500, about 27,000 MAD/month).
- **Scorecard → Validator carry-over and funnel events live** (`881412f`): `za3fran_prefill` in localStorage (30 days, cleared on review screen), same device only; events `scorecard_started/step/completed`, `validator_opened`, `validator_form_started`; stale e-mail link fixed; `tests/scorecard-prefill.test.js`.
- Founder text: « plus de 20 ans » (`bfffa59`).
- Social tool: none for 30 days (LinkedIn native scheduler), review at day 30. Windsor.ai = reporting only; Metricool free plan has no LinkedIn.

## 2. Decisions taken
1. Full prices, no launch discount (Arnaud).
2. Accompagnement concept anchor about €1,000; Za3fran Consulting is a SARL domiciled in Morocco.
3. Viability threshold as above; day 0 to be set.
4. No social tool for 30 days.
5. Wording: « plus de 20 ans », nothing about start age.

## 3. Tasks for the next chat, in order
1. Start-up checks: live = HEAD; `node --test`; `brain_review_queue` (46 open) and `/brain` (2 regulatory-watch items « ready »); `claude/a-verifier-arnaud.md`; « Fourchettes par format ».
2. Arnaud's own actions: ask the accountant (IS, VAT on euro sales to non-Moroccan clients, Stripe repatriation, salary vs dividends); reread « Comment ça marche », the founder text and « Why trust us » on his phone.
3. Launch execution: 8 LinkedIn posts for 4 weeks (Arnaud approves each); about 30 targets and message scripts; accompaniment quote template; fix day 0 and a simple tracking view (Supabase paid Validators + Brevo Scorecards + GA4); social tool review at day 30.
4. Small builds: Zahir Guest box on `/etablissements` when ready; Menu Engineer regeneration wording; Marrakech/Rabat « covered » wording; hi-res founder photo; English share image.
5. Studio build plan (Opus-tier chat): D8 menu watch, D9 founders' benchmarks, light Phase C.

## 4. Permanent rules added
None new beyond item 11 of the instructions (launch plan, carry-over, no-tool decision).

## 5. Open cleanup
- Accompaniment time: 3 projects ≈ half of 60 h available in 90 days.
- Carry-over is same-device only.
- Everything carried from Briefs #21–#25.

## 6. Links
- Launch plan: `claude/plan-lancement-maroc.md`; audit https://claude.ai/artifact/MVYDhANrd3CtwftniDuG4h
- Example: `rpt_v2_exemple_1` / `bp_exemple_1`, code `DEMOFG26`; Canaille `ESATZMB2`.

## 7. Updated instructions
`claude/project-instructions-2026-11-07-b26.md` / `docs/project-instructions.md`, also in the chat.

**Opening message:** « Reprends à partir du Handoff Brief #26 (claude/handoff-brief-26.md). Pushes sur main autorisés. »
