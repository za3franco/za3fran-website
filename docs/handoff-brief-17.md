# ZA3FRAN — HANDOFF BRIEF #17

**Next chat:** Phase A closure: (1) the **Phase A acceptance run**: Canaille's business plan on the current engine (ar-1.9.0), scored against the expert-review checklist; (2) the **Phase A website release** (master strategy v1.6, Section 18).
**Recommended model:** Opus-tier for the acceptance review (financial reliability, writing, presentability); Sonnet for the page copy.

---

## 1. Where we are (30 Oct 2026)

**Live commit:** the last commit of this chat (this brief), verified READY on www.za3fran.io and equal to GitHub HEAD. Code commits of the chat: `cb52f28` (Brain Inbox), `d4042f3` + `ef60b31` (review cards, session), `cb69729` + `496a2fa` (monthly maintenance).

### Shipped and live: Phase A step 7, the Brain Inbox (bi-1.0.0)
- **App `/brain`**: installable on the home screen (manifest, service worker, Android share target), bilingual, phone-first. Screens: Ajouter, À revoir, item card, Rechercher. Arnaud's personal code never expires; the device stays signed in (cookie renewed at every opening for one year). Lockout 5 attempts / 30 min, persistent (`brain_auth_attempts`).
- **Capture**: note / link / photo / PDF / text file → private bucket `brain-inbox` (signed upload, 25 MB per file).
- **Extraction**: Haiku → Sonnet for photos, PDFs and retries; figures copied, never computed; each fact matched to a Brain parameter or kept as knowledge; employer and guest documents reduced to their identification; menu prices stored and the photo deleted after review; cron every 15 minutes retries waiting items.
- **Review**: « Ajouter » (researched) / « Ajouter et valider » (verified, Arnaud) through `brain_add_value()` (supersedes the previous live row; creates a missing city/district; regulatory values added unvalidated join the review list).
- **Review list**: one **readable card per format** (occupancy, ramp-up, year 3, team, investment) validated in one tap; « Quelque chose cloche » sends a comment to Claude.
- **Monthly maintenance** (`api/brain-watch.js`, 1st of each month 06:17 UTC): refresh-due and random-audit queues, plus a **regulatory watch** (Sonnet + web search) that drops each sourced change into the inbox, ready to validate.
- **E-mail capture** (brain@za3fran.io) built but **not switched on**: Arnaud prefers the app.

### Tested and how
- `node --test tests/*.test.js`: **194 pass** (new `tests/brain-inbox.test.js`: access, lockout, sender check, fact checks, rights, menu staleness, value payloads, extraction flow on an in-memory database, photo sweep, regulatory watch).
- `brain_add_value()` tested in a rolled-back transaction (supersede, new market).
- Headless Chrome on `/brain` with a mocked API: every screen, no JS error, no horizontal overflow; review cards rendered with real method data.
- **Live by Arnaud (29–30 Oct): the app works** (« it's perfect »).
- **Regulatory watch, live manual run (30 Oct):** 15 values checked against the CGI 2026, DGI notes 733 and 737, decree 2.25.983 (BO 7469), law 49-16 and ONSSA sources — **no change found**; 12 web searches, about 98,000 input tokens, about €0.40.

## 2. Decisions taken
1. Brain Inbox in the app only; e-mail capture built but not switched on (Arnaud, 30 Oct). Recorded in the instructions, Phase A step 7.
2. Personal code without expiry; the device session renews at every opening, one year (Arnaud, 30 Oct). Same place.
3. « Ajouter » = researched, « Ajouter et valider » = verified (Arnaud, 29 Oct). Same place.
4. Accepted senders if e-mail is ever switched on: arnaudhebrard@gmail.com, hello@za3fran.io. Same place.
5. Claude classifies items itself; tags are optional. Same place.
6. Methods are amended by Claude in a chat (with a Canaille re-run), never edited in the app; simple figures are amended by Arnaud through the app. Same place.
7. Monthly, not weekly: refresh-due, random audit and the regulatory watch (Arnaud, 30 Oct). Same place, and Brain rule 8.
8. Two founder-evidence review items from test projects closed (not market evidence). Recorded in `brain_review_queue.note`.

## 3. Tasks for the next chat, in order
0. Start-up checks (live commit = HEAD; `node --test`). Read Arnaud's review-list results: any `brain_review_queue` row with status `rejected` and a note from Arnaud is a correction to make first (method JSON → new value row, Canaille re-run).
1. **Canaille reserve decision** (blocking the acceptance run): the 3-month reserve exceeds the decided funding by 20,000 MAD since gross salaries (ar-1.9.0). Ask Arnaud: add funding or accept the risk.
2. **Phase A acceptance run**: new Canaille plan run on the current engine; read the bank plan, the preparation report and the designed files against the expert-review checklist (financial reliability 3/10, writing 4/10, presentability 3/10 at the start); score each axis and list what is left.
3. **Phase A website release** (Section 18): platform, pricing, validator, business-plan, project dashboard (journey, Essentials as a dossier, intake explained, "Assumptions & sources" and market coverage shown before purchase, stage and next step on the dashboard); a new page on how Za3fran sources and verifies data; index hero "Where are you starting from?" with the Concept Studio door opening a waitlist. Only what is live (website rule).
4. Handoff; then Phase B (Concept Studio, Casablanca first) gets its own chat.

## 4. Permanent rules added (merged into the instructions)
- Brain Inbox section (Phase A step 7): access, capture, extraction, review semantics, readable review cards, methods amended only in a chat, monthly maintenance and regulatory watch, one current value per entry (a future change is added when it takes effect).
- Brain rule 8: the random audit is monthly.
- Stack: `postal-mime`, `sharp` (free); Claude web search for the watch (about €0.40 a month).

## 5. Open cleanup (not blocking)
New: knowledge-only facts are not yet read by any tool (consultant agent, Phase D); a Brain value has no "applies from" date; one source per inbox item; the e-mail sender check trusts the From address (if e-mail is switched on); the watch's first scheduled run is 1 Dec 2026; `memory` settings in `vercel.json` are ignored on Active CPU billing (harmless warning).
Carried: Canaille reserve shortfall and no BP run on ar-1.9.0; payback beyond 3 years not shown; payroll rules to check against a real payslip; sommelier salary basis; BP writer without the elision fix; recovery link not yet used on a real failure; a saved intake does not pick up a later workshop team; and the rest of the instructions' « Open cleanup » list.

## 6. Arnaud's review list
5 format cards (restaurant, bistrot/bar à vin, café/brunch, fast casual, bar/lounge) and the legal working week (44 h), reviewed by Arnaud in the app when he has time. The payroll rules show as verified.

## 7. Links
- App: `https://www.za3fran.io/brain` (code given to Arnaud in the chat).
- Design note: `docs/brain-inbox-design.md` (Project docs: `claude/brain-inbox-design.md`). Email Worker (not in use): `docs/cloudflare-brain-email-worker.js`.
- Regulatory watch, manual run: `https://www.za3fran.io/api/brain-watch?token=<CRON_SECRET>&only=watch` (Vercel tool).
- Canaille: `https://www.za3fran.io/api/report-viewer?id=rpt_v2_canaille_9&code=ESATZMB2`; BP intake `https://www.za3fran.io/bp-intake?code=ESATZMB2`.
- Strategy: master strategy v1.6, Sections 17 (Phase A) and 18 (website release plan).

## 8. Project instructions
Full text: `claude/project-instructions-2026-10-30.md` (Project docs) and `docs/project-instructions.md` (repo), given to Arnaud in the chat.
