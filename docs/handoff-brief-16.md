# ZA3FRAN — HANDOFF BRIEF #16

**Next chat:** Phase A step 7 — the Brain Inbox (email capture brain@za3fran.io, private installable mobile web app, extraction, review queue, search).
**Recommended model:** Opus-tier for the design and the extraction prompts; Sonnet for the page copy.

---

## 1. Where we are (29 Oct 2026, evening)

**Live commit:** the last commit of this chat (code + this brief), verified READY on www.za3fran.io and equal to GitHub HEAD. Code commits of the chat: `ff47d1a`, `a3af8a1`, `b769cd4`, `db40f8d`, `c1536a3`.

### Shipped and live
- **Founder salary entered net** (intake bpi-1.6.0): net / gross choice on the salary field, live line « Brut retenu dans le plan : … », the server converts again on save and notes it on the founder's roster line. `lib/payroll.js` (pr-1.0.0). Brain entry `labour.payroll_rules` (MA, 2026) — *researched*, regulatory item in Arnaud's review queue; migration `supabase/migrations/20261029_brain_payroll_rules_ma.sql`. Hand check: 10,000 MAD gross = 8,903.64 net.
- **Market salaries are net → converted to gross** (resolver **ar-1.9.0**, Arnaud's decision of 29 Oct): Brain salary rows carry `value_json.basis` (net: bartender, chef, commis, cook, kitchen porter, manager, server, sommelier; gross: cleaner). Migration `20261029b_brain_salaries_net_basis.sql`. Uplift: +7 % below 6,000 MAD, manager +14.5 %, chef +21 %.
- **Workshop team → BP intake:** a first intake whose concept record holds the founder's own team starts in « Je liste l'équipe » with those headcounts (salaries empty = market salary), with a hint line.
- **Validator writer vw-1.1.0:** impact scale defined per level, LOW allowed, at most one CRITICAL and at most half HIGH or above (rewrite, then last-resort demotion of the lowest-ranked risks); always-wrong French elisions corrected in code before the checks. Audit `generator` label now follows `VALIDATOR_VERSION` (was a stale `val-2.0.2`).
- **Recovery of a paid report at `report_error`:** one-click link in the failure notice — `GET /api/webhook-validator?recover=<Stripe session id>` (Stripe check: paid; submission must be at `report_error`; atomic claim; usual generation + delivery email).

### Tested and how
- `node --test tests/*.test.js`: **180 pass** (new: `payroll.test.js`, `net-salaries.test.js`, prefill-team, impact-spread and elision tests in `validator-v2.test.js`).
- Headless Chrome on the intake page (mocked API): net/gross switch, conversion line, no JS error.
- Live: intake GET on the bistrot returns the payroll rules; recovery link answers 400 on a bad id, 409 « Not recoverable » on the Café Maarif session (created before the `submission_id` metadata), 409 « Nothing to do » on the bistrot session (status paid).
- **Canaille re-run** `rpt_v2_canaille_9` (val-2.0.3, vw-1.1.0, ar-1.9.0): complete, no repair, **66 VIABLE** (was 64). Payroll 101,406 → 111,436 MAD/month; EBITDA Y2 1,205,482 → 1,083,310; uses 2,480,000 → 2,523,000; payback now beyond the 3-year horizon (not shown). Risks: 1 CRITICAL (alcohol licence), 1 HIGH, 3 MEDIUM (was 1 / 3 / 1). A first attempt went `qa_failed` on « de une » (fixed by vw-1.1.0).
- Arnaud read plan `bp_1793277512804_rs82ng` (bistrot): no remarks.

### Half-done / not tested
- The recovery link has not yet relaunched a real failed report (none exists); the relaunch path reuses `processReport` with a status parameter.
- No BP run on ar-1.9.0 yet. Canaille's BP intake (fixture) now needs a decision: the 3-month reserve target exceeds the decided funding by 20,000 MAD.

## 2. Decisions taken
1. Market salaries from job boards are net; the engine uses gross, converted with the Brain's payroll rules — instructions, Financial method rules; resolver ar-1.9.0.
2. Payroll conversion assumptions: salaried status, no dependents (prudent) — `lib/payroll.js`.
3. Cleaner salary stays gross (anchored on the SMIG); sommelier treated net (basis unknown, prudent) — migration 20261029b.
4. Risk impacts: defined scale, at most one CRITICAL, at most half HIGH+ — instructions, Brain rule 11; vw-1.1.0.
5. Recovery of a failed paid report by a Stripe-verified link in the failure notice — instructions, Known architecture facts.
6. Brain Inbox: brain@za3fran.io via a Cloudflare Email Worker — instructions, Phase A step 7.
7. Brain Inbox access: personal code once per device, remembered 30 days — same place.
8. Brain Inbox files: private Supabase Storage bucket; menu photos deleted after price extraction — same place.

## 3. Tasks for the next chat, in order
0. Start-up checks (live commit = HEAD; `node --test`).
1. **Brain Inbox — design note** for Arnaud (one page, French): flow email → Worker → endpoint → item; app screens (capture, queue, item, search); extraction output; tables. Arnaud asked for a plain explanation of how it works (given in short at the end of this chat).
2. Tables (RLS on, no policies): `brain_inbox_items` (source email/app, raw text, file refs, status, extraction JSON, tags, rights note, contributor, dates), linked to `brain_review_queue` / `brain_parameter_values` on approval; Storage bucket `brain-inbox` (private).
3. Endpoints: `api/brain-inbox.js` (capture from the app and from the Worker — Worker authenticated by a shared secret Claude sets in Vercel and in the Worker), extraction job (Haiku-class → Sonnet when needed), review actions (approve / edit / reject), search.
4. Cloudflare Email Worker code + step-by-step guide for Arnaud (Email Routing → route brain@ to the Worker).
5. App page `brain.html` (installable: manifest + icon + service worker for the home screen), bilingual, personal-code gate, phone-first.
6. Tests, live end-to-end test with Arnaud (one email, one photo, one link), handoff.

## 4. Permanent rules added (merged into the instructions)
- Salaries are gross in the engine; Brain salary rows state their basis; net converted with `labour.payroll_rules`.
- Validator writer: elisions fixed in code; risk impact scale and spread rule.
- Recovery link for paid reports at `report_error`.
- Brain Inbox decisions (address, access, storage).

## 5. Open cleanup (not blocking)
New: Canaille reserve shortfall after ar-1.9.0 and no BP run on ar-1.9.0 yet; payback beyond 3 years not shown; `labour.payroll_rules` to verify (payslip or accountant); sommelier basis; BP writer without the elision fix; recovery link not yet used on a real failure; a saved intake does not pick up a later workshop team. Carried: see the instructions' « Open cleanup » list.

## 6. Arnaud's review queue
31 `method_change` items + new: `labour.payroll_rules` (regulatory), and the bistrot run's items (rent above benchmark, legal hours).

## 7. Links
- Canaille reference report: `https://www.za3fran.io/api/report-viewer?id=rpt_v2_canaille_9&code=ESATZMB2` (previous: `rpt_v2_canaille_8`).
- Bistrot: `https://www.za3fran.io/project.html?code=T6YW78V8` · intake `https://www.za3fran.io/bp-intake?code=T6YW78V8`.
- Strategy: master strategy v1.6, Section 13 « Brain Inbox: the capture app (Phase A) ».

## 8. Project instructions
Full text: `claude/project-instructions-2026-10-29-b16.md` (Project docs) and `docs/project-instructions.md` (repo), given to Arnaud in the chat.
