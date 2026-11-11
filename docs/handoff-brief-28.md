# ZA3FRAN — HANDOFF BRIEF #28

**Task of the next chat (Project Za3fran Digital):** the Concept Studio build plan (D8 menu watch, D9 founders' own figures, light Phase C included), from `claude/concept-studio-methode.md` v0.3 — after the launch of Tuesday 17 Nov 2026 has started.
**Recommended model:** Opus-tier for the build plan; Sonnet for any small site or dashboard fix that comes up first.

## 1. Where we are (11 Nov 2026)
Live commit `04d72b3` (verified equal to GitHub HEAD on Vercel), plus this docs commit. `node --test tests/*.test.js`: 224 pass.

**This chat started as a detour** (Arnaud, 9 Nov): Stripe cannot charge most Moroccan domestic cards in dirhams. Launch moved to **Tuesday 17 Nov 2026**.

- **Payments in MAD through YouCan Pay — live.** `lib/youcanpay.js` (ycp-1.0.0), `lib/payments.js` (pay-1.1.0), `lib/payment-fulfil.js` (pf-1.0.0), `api/webhook-youcanpay.js`, table `payments`. Validator and bundles, business plan, Menu Engineer: MAD → YouCan Pay's page; EUR/USD → Stripe. Return page and signed webhook both confirm (transaction re-read from YouCan's API, atomic claim). Stripe webhooks now export their fulfilment (`processReport`, `fulfilBusinessPlan`, `fulfilMenuEngineer`), Stripe behaviour unchanged. Pages say « paiement sécurisé par carte bancaire »; privacy names YouCan Pay.
  - Tested: sandbox 10 Nov (1,990 MAD, report delivered); live 11 Nov (10 MAD test price, Arnaud's Moroccan card; return and webhook both received; one delivery). Test rows deleted at Arnaud's request.
  - YouCan account: Za3fran Consulting SARL, verified 11 Nov; payment settings (success/error URL, allowed hosts) and webhook set; live key in Vercel; test price off (`YOUCANPAY_TEST_AMOUNT_MAD=0`). Setup note: `docs/youcanpay.md`.
- **MAD only for Morocco:** `api/currency.js` `MAD_COUNTRIES = ['MA']`; Algeria, Tunisia, Libya, Egypt, Mauritania → EUR on Stripe.
- **Sales dashboard `/pilotage` — live** (private, same code as `/brain`): live revenue (Stripe, YouCan Pay, manual sales), periods, charts, products, channels, month target, launch threshold from 17 Nov, funnel, unpaid forms to follow up, Zahir Guest subscriptions, tests excluded. `lib/dashboard.js` db-1.0.0, `api/dashboard.js`, `tests/dashboard.test.js`. Rendered with sample data on phone and desktop (no horizontal scroll, no JS error). Env `DASHBOARD_TEST_EMAILS`, `DASHBOARD_LAUNCH_DATE=2026-11-17` set.
  - **Half-done:** table `offline_sales` (manual sales form) — migration file written (`supabase/migrations/20261111_offline_sales.sql`); applying it needs Arnaud's approval in the chat. Until then the dashboard works but the « Ventes hors site » form cannot save.
- **Site corrections — live:** Zahir Guest box in the Client mystère panel of `/etablissements` (zahirguest.com, 14-day trial; FR/EN links); Menu Engineer delivery e-mail no longer promises a free regeneration; market coverage reworded on index, pricing, business-plan, validator, methodology (Marrakech and Rabat: rent asked); `?paiement=echec` banner on validator, business-plan, menu-engineer.

## 2. Decisions taken
1. MAD payments through YouCan Pay; Stripe for EUR/USD (Arnaud, 10 Nov) — instructions, Principle 1.
2. No bank transfer option (it would block sales) (Arnaud, 10 Nov).
3. One provider per country, no choice at checkout; Maghreb/Egypt in EUR on Stripe (Arnaud, 10 Nov) — `api/currency.js`.
4. Launch moved to Tuesday 17 Nov 2026 = day 1 of the 90-day window (Arnaud, 10 Nov) — `DASHBOARD_LAUNCH_DATE`.
5. Posts are scheduled and published with Metricool in the Com Project; `social_posts` + n8n dropped (Arnaud, 11 Nov) — instructions, scope and Principle 1.
6. Sales dashboard on za3fran.io, private, live (Arnaud, 11 Nov) — `/pilotage`.
7. Marrakech/Rabat coverage wording nuanced (C1 of `claude/a-verifier-arnaud.md` closed).
8. English share image dropped (one URL = one image; audience French-speaking first).

## 3. Tasks for the next chat, in order
1. Start-up checks: live = HEAD; tests; `/pilotage` opens with real data (ask Arnaud for a screenshot or read Vercel logs of `/api/dashboard`).
2. If not done here: apply the `offline_sales` migration (Arnaud clicks « Approve »).
3. When YouCan answers on the daily limit: nothing to change in code; if the limit stays at 5,000 MAD, decide with Arnaud (packs at 5,990 / 8,490 MAD refused meanwhile).
4. Studio build plan (Opus-tier): modules M1–M8, data selection in code, model calls, D8 menu watch, D9 benchmarks with consent, light Phase C, cost per session, tests, release steps.
5. Hi-res founder photo when Arnaud sends one (`assets/arnaud.jpg`).

## 4. Com Project / Arnaud
Posts on Metricool; targets and scripts; quote template; day-30 review. Arnaud: YouCan daily limit; accountant questions (now also: YouCan Pay revenue on the SARL account, Stripe repatriation); reread « Comment ça marche », founder text, « Why trust us »; four anecdotes; larger photo.

## 5. Permanent rules added
YouCan Pay checkout and confirmation rule (engineering, Checkout); dashboard must read every revenue source and keep tests excluded, personal e-mails only in env; coverage wording; Menu Engineer regeneration never mentioned; Metricool scope. All written into the instructions text.

## 6. Open cleanup
YouCan daily limit 5,000 MAD; 30 % held 28 days; YouCan refunds not read by the dashboard; no sweeper for a YouCan payment left pending if both return and webhook fail; YouCan account-level error URL has no `?paiement=echec`; dashboard: GA4 not pulled in, fees not deducted, Scorecards = Brevo list, accompaniments only when entered by hand; low-resolution founder photo; everything carried from Briefs #21–#27 (see instructions, open cleanup).

## 7. Links
`docs/youcanpay.md`; `/pilotage`; `claude/a-verifier-arnaud.md`; Studio method `claude/concept-studio-methode.md`; example `DEMOFG26`; Canaille `ESATZMB2`.

## 8. Updated instructions
`claude/project-instructions-2026-11-11.md` / `docs/project-instructions.md`.

**Opening message:** « Reprends à partir du Handoff Brief #28 (claude/handoff-brief-28.md). Pushes sur main autorisés. »
