// ============================================================
// /api/generate-bp.js  (v13 — Concept Readiness Review downstream inputs)
// Single streaming pass. Per-section content sized to fill A4 pages
// at ~85% density. maxDuration: 450 in vercel.json.
//
// v13 changes:
//  - Concept data now comes from the EFFECTIVE concept (original answers
//    + active CRR amendments) via lib/crr-downstream.js — never from the
//    report's concept_snapshot, never as a raw answer code. The revised
//    budget is the plan's funding envelope / ask.
//  - The operator's recorded decision per risk/alert (decision_type,
//    rationale, pre-conditions, linked plan changes), keyed by itemKey()
//    and limited to ACTIVE decisions on items in the live report, replaces
//    the v1.3 "[Operator note: mitigation_text]" merge (which matched on
//    title hashes and no longer received the operator's text at all).
//  - Refuses (409, run marked blocked_crr) if the concept changed after the
//    latest Validator assessment, or if a live item has no valid decision.
//  - ONE prompt template for both languages (the French branch had become
//    a Zoco-specific fixture: tagines/bowls menu, ghost kitchen, fixed six
//    risks). Headings are given in the output language; the body is
//    written in the project language and all mixed-language source text is
//    translated.
//  - Model is env-driven (CLAUDE_MODEL_ESSENTIALS), default Haiku 4.5 per
//    master strategy §4.2. Not via getModel(): its fallback is Sonnet.
//  - Cover uses canonical #0a0e18 (retired #0a0a0a removed).
//
// v12 (kept): no manual AbortController timeout; undici dispatcher raises
// Node's own 300s fetch timeout to just under maxDuration.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { Agent, setGlobalDispatcher } from 'undici';
import {
  loadDownstreamContext, loadLiveReport, assertGeneratable, DownstreamError,
  formatConceptBlock, formatRegisterBlock, formatPreconditionsBlock, fundingEnvelope,
} from '../lib/crr-downstream.js';

const HAIKU = 'claude-haiku-4-5-20251001';
const MODEL = process.env.CLAUDE_MODEL_ESSENTIALS || HAIKU;

setGlobalDispatcher(new Agent({
  headersTimeout: 420_000,
  bodyTimeout: 420_000,
}));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setRunStatus(bpRunId, meta, patch) {
  return supabase.from('business_plan_essentials_runs')
    .update({ output_json: Object.assign({}, meta, patch) }).eq('id', bpRunId);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var bpRunId = (req.body || {}).bpRunId;
  if (!bpRunId) return res.status(400).json({ error: 'bpRunId required' });

  var runRes = await supabase.from('business_plan_essentials_runs')
    .select('id, project_id, output_html, output_json, currency, language').eq('id', bpRunId).single();
  if (runRes.error || !runRes.data) return res.status(404).json({ error: 'Not found' });

  var run = runRes.data;
  if (run.output_html) return res.status(200).json({ ready: true });

  var meta = run.output_json || {};
  if (meta.status === 'generating') return res.status(200).json({ status: 'generating' });

  // ── Concept Readiness Review gate (§3.18, decision #11) ────────────
  if (!run.project_id) return res.status(422).json({ error: 'missing_project_id' });
  var projRes = await supabase.from('za3fran_projects')
    .select('id, crr_status, validator_submission_id, crr_disclaimer_accepted_at').eq('id', run.project_id).single();
  if (projRes.error || !projRes.data) return res.status(404).json({ error: 'project_not_found' });
  var project = projRes.data;
  if (project.crr_status !== 'cleared') {
    await setRunStatus(bpRunId, meta, { status: 'blocked_crr' });
    return res.status(409).json({
      error: 'crr_not_cleared',
      message: 'This project has unresolved Concept Readiness Review items. Complete the review before generating a Business Plan.'
    });
  }

  await setRunStatus(bpRunId, meta, { status: 'generating' });

  var currency = run.currency || 'EUR';
  var language = run.language || 'fr';

  // ── Downstream inputs: effective concept + live report + decisions ──
  var dctx;
  try {
    var report = await loadLiveReport(supabase, project);
    if (meta.validator_report_id && meta.validator_report_id !== report.id) {
      console.warn('[bp] run.validator_report_id ' + meta.validator_report_id + ' != live report ' + report.id + ' — using live report');
    }
    dctx = await loadDownstreamContext(supabase, project, { currency: currency, report: report });
    assertGeneratable(dctx);
  } catch (err) {
    if (err instanceof DownstreamError && err.status === 409) {
      await setRunStatus(bpRunId, meta, { status: 'blocked_crr', blocked_reason: err.code });
      return res.status(409).json({ error: err.code, detail: err.detail });
    }
    console.error('[bp] Input load failed: ' + (err.code || '') + ' ' + err.message + (err.detail ? ' ' + JSON.stringify(err.detail) : ''));
    await setRunStatus(bpRunId, meta, { status: 'error', error: 'input_load_failed: ' + (err.code || err.message) });
    return res.status(err.status || 500).json({ error: err.code || err.message });
  }

  var ctx = buildCtx(dctx, currency, language);
  var prompt = buildPrompt(ctx);

  console.log('[bp] Streaming generation for ' + bpRunId + ' (model ' + MODEL + ', report v' + dctx.report.version
    + ', ' + dctx.register.length + ' register items, prompt ' + prompt.length + ' chars)');

  var html = '';
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
      body: JSON.stringify({ model: MODEL, max_tokens: 32000, stream: true, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!r.ok) { var e = await r.json(); throw new Error('API ' + r.status + ': ' + JSON.stringify((e.error||{}).message||'')); }

    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (!ln.startsWith('data: ')) continue;
        var raw = ln.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try { var ev = JSON.parse(raw); if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') html += ev.delta.text; } catch(e) {}
      }
    }
    console.log('[bp] Stream done: ' + html.length + ' chars');

  } catch(err) {
    console.error('[bp] Error: ' + err.message);
    await setRunStatus(bpRunId, meta, { status: 'error', error: err.message });
    return res.status(500).json({ error: err.message });
  }

  html = html.trim().replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();

  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    await setRunStatus(bpRunId, meta, { status: 'error', error: 'Invalid HTML' });
    return res.status(500).json({ error: 'Invalid HTML: ' + html.substring(0,80) });
  }

  // Audit trail: exactly which inputs this plan was built on.
  var inputs = {
    report_id: dctx.report.id,
    report_version: dctx.report.version,
    amendment_signature: dctx.signature,
    decisions: dctx.register.map(function (it) { return { key: it.risk_key, type: it.decision && it.decision.type }; }),
    model: MODEL,
    generated_at: new Date().toISOString(),
  };

  var saved = await supabase.from('business_plan_essentials_runs')
    .update({ output_html: html, output_json: Object.assign({}, meta, { status: 'complete', blocked_reason: null, inputs: inputs }) }).eq('id', bpRunId);
  if (saved.error) return res.status(500).json({ error: 'Save failed' });

  console.log('[bp] Saved. Done.');
  return res.status(200).json({ ready: true });
}

// ─────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────

export function buildCtx(d, currency, language) {
  var rj   = d.report.json || {};
  var ov   = rj.overall || {};
  var sec  = rj.sections || {};
  var fin  = sec.s4_financial || {};
  var be   = fin.breakeven || {};
  var sc   = fin.scenarios || {};
  var cv   = d.conceptValues || {};
  var sym  = currency === 'MAD' ? 'MAD' : (currency === 'USD' ? '$' : '\u20ac');
  var isFr = language === 'fr';
  var num  = function (n) { return (n || n === 0) && !isNaN(Number(n)) ? Number(n).toLocaleString('en-US') : 'n/a'; };
  var scl  = function (s) {
    return s ? s.covers_day + ' covers/day, monthly revenue ' + num(s.monthly_revenue) + ' ' + currency + ', monthly result ' + num(s.monthly_result) + ' ' + currency : 'n/a';
  };
  var clip = function (s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; };
  var recs = ((sec.s5_strategy && sec.s5_strategy.recommendations) || [])
    .map(function (r, i) { return (i + 1) + '. ' + clip(r.title, 160) + (r.body ? ' — ' + clip(r.body, 260) : ''); })
    .join('\n') || 'n/a';
  var breakdown = (Array.isArray(rj.score_breakdown) ? rj.score_breakdown : [])
    .map(function (b) { return b.label + ': ' + b.score + '/100 (weight ' + Math.round((b.weight || 0) * 100) + '%)'; })
    .join('; ') || 'n/a';

  return {
    d: d, rj: rj, ov: ov, be: be, sc: sc, sym: sym, cur: currency, isFr: isFr, num: num, scl: scl,
    name: String(cv.concept_name || '').trim() || 'Concept',
    city: String(cv.city || '').trim(),
    score: ov.score != null ? ov.score : 'n/a',
    verdict: d.verdict || 'n/a',
    prevScore: d.report.previous_score,
    funding: fundingEnvelope(d),
    recs: recs,
    breakdown: breakdown,
    market: clip(sec.s2_market && sec.s2_market.narrative, 600) || 'n/a',
    compet: clip(sec.s3_competitive && sec.s3_competitive.narrative, 500) || 'n/a',
    summary: clip(ov.executive_summary, 700) || 'n/a',
    today: new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

// ─────────────────────────────────────────────────────────────
// PROMPT — one template, headings localised, body in project language
// ─────────────────────────────────────────────────────────────

export function buildPrompt(c) {
  var fr  = c.isFr;
  var H   = function (en, frText) { return '"' + (fr ? frText : en) + '"'; };
  var sym = c.sym;
  var cur = c.cur;
  var d   = c.d;
  var nR  = d.risks.length;
  var nA  = d.alerts.length;
  var LANG = fr ? 'FRENCH' : 'ENGLISH';
  var F = c.funding;

  // --- DATA ---
  var fundingLine = F.exact
    ? F.text + '. THIS is the plan\'s funding envelope: the total investment the founder plans to raise and commit. Every funding figure in the plan (2d, 10A gap line, 10E financing TOTAL) uses exactly this amount.'
    : F.text + '. No exact figure was given: use the midpoint of this range as the reference envelope and say plainly that it is an indicative range.';

  var data = [
    '=== CONCEPT (current plan, including the founder\'s revisions) ===',
    formatConceptBlock(d),
    '',
    '=== FUNDING ENVELOPE ===',
    'Investment budget: ' + fundingLine + (F.revised ? ' (Revised by the founder during concept review; present it as THE plan, not as a revision history.)' : ''),
    '',
    '=== VALIDATOR ASSESSMENT (latest) ===',
    'Score: ' + c.score + '/100 — verdict ' + c.verdict + (c.prevScore != null ? ' (previous assessment before the founder\'s latest revisions: ' + c.prevScore + '/100)' : ''),
    'Score breakdown: ' + c.breakdown,
    'Executive summary: ' + c.summary,
    'Break-even: monthly revenue ' + c.num(c.be.monthly_revenue) + ' ' + cur + ' = ' + (c.be.daily_covers || 'n/a') + ' covers/day',
    'Scenarios — conservative: ' + c.scl(c.sc.conservative) + ' | base: ' + c.scl(c.sc.base) + ' | optimistic: ' + c.scl(c.sc.optimistic),
    'Market analysis: ' + c.market,
    'Competitive analysis: ' + c.compet,
    'Strategic recommendations:\n' + c.recs,
    '',
    '=== RISK & ALERT REGISTER (Validator findings + the founder\'s recorded position on each) ===',
    formatRegisterBlock(d),
    '',
    '=== CONDITIONS PRECEDENT SET BY THE FOUNDER ===',
    formatPreconditionsBlock(d),
    '',
    'CURRENCY: ' + cur + ' (symbol ' + sym + ')   DATE: ' + c.today,
  ].join('\n');

  // --- RULES: founder's positions, honesty, language ---
  var rules = [
    '=== HOW TO USE THE FOUNDER\'S POSITIONS (non-negotiable) ===',
    '1. ACCEPTED RISK: present it as an OPEN risk, never as resolved. State the founder\'s rationale fairly, then give a concrete, measurable MONITORING TRIGGER (threshold + date or milestone + response). If the founder\'s own words state a figure, cap, deadline or fallback, use it as the trigger; otherwise propose one and label it as proposed.',
    '2. PLAN CHANGED: present it as mitigated BY the revision shown under "Plan changes" (state the new value), then state any residual risk in one line.',
    '3. FACTS CONTESTED: present the founder\'s evidence as the founder\'s statement, explicitly NOT independently verified (e.g. "' + (fr ? 'selon le porteur de projet, non vérifié de façon indépendante' : 'per the founder, not independently verified') + '"), and add the one VALIDATION STEP that would confirm it before funds are committed. Never turn a founder statement into an established fact.',
    '4. CONDITIONS PRECEDENT (and concrete commitments stated in the founder\'s own words: caps, due diligence, trademark filing, recruitment timing, etc.) are go/no-go steps: they lead the action plan in Section 13, in a logical sequence.',
    '5. Where the founder\'s words give figures (licence cost cap, prices, timings), use them instead of generic benchmarks and mark the source as the founder in table notes.',
    '6. Financial alerts are treated in Section 10F (not in the Section 12 risk table).',
    d.fragile
      ? '7. VERDICT IS ' + c.verdict + '. The founder chose to proceed with open risks. Say so plainly in Section 2(e), in the Section 4 verdict paragraph and in the Section 12 introduction. No softening, no reframing as a strength.'
      : '7. Verdict ' + c.verdict + ': present it factually; accepted risks remain open risks regardless of the verdict.',
    '8. Never mention internal tooling or process words: no "Concept Readiness Review", "CRR", "amendment", "decision type", "register", "risk key", "report version", "re-assessment", "operator". Refer to "' + (fr ? 'le porteur de projet' : 'the founder') + '".',
    '9. Never invent named businesses, institutions, prices, quotes, licences or legal facts. Use a proper name only if it appears in the data above; otherwise describe the archetype (e.g. "established French bistro, central district").',
    '10. Ground every concept description in the founder\'s own description and differentiation text. If the establishment type is "Other", the description defines the format.',
    '11. The CONCEPT and FUNDING ENVELOPE above are current and prevail. If the founder\'s own words or the Validator text cite an older figure that conflicts with them (e.g. a previous budget amount), never repeat the outdated figure — use the current one.',
    '',
    '=== OUTPUT LANGUAGE (non-negotiable) ===',
    'Write the ENTIRE document in ' + LANG + ': every heading, table header, row label, note and footer. The data above mixes English and French (Validator analysis and the founder\'s words may be in either language). Translate all of it into ' + LANG + '. Never quote a sentence in another language and never mix languages within a sentence or cell. Keep proper nouns unchanged (business, brand, product, place and institution names).',
    fr
      ? 'French formatting: correct accents everywhere, numbers with non-breaking spaces as thousands separators (1 700 000 MAD), decimal comma.'
      : 'English formatting: comma thousands separators (1,700,000 MAD).',
    'Use the exact headings given in quotes below.',
  ].join('\n');

  // --- PAGE BUDGETS ---
  var budgets = [
    'A4 PAGE BUDGETS PER SECTION (STRICT — total target 18-21 pages, ~85% density per page):',
    '- Section 1 (Cover): 1 fixed page.',
    '- Section 2 (Investor Brief): 2 pages.',
    '- Section 3 (Table of Contents): 1 page.',
    '- Section 4 (Executive Summary): 1 page STRICT (~290-320 words).',
    '- Section 5 (Concept & Positioning): 1 page STRICT (~290-320 words).',
    '- Section 6 (Market & Audience): 1 page (~200 words + personas table).',
    '- Section 7 (Competitive Landscape): 2 pages (table p1, differentiation cards p2).',
    '- Section 8 (Menu Strategy): 1 page.',
    '- Section 9 (Operations & Staffing): 1 compact page.',
    '- Section 10 (Financial Projections): 3 pages, plus the compact 10F alerts table.',
    '- Section 11 (Marketing & Pre-Opening): 1 compact page.',
    '- Section 12 (Risk Analysis): 2 pages.',
    '- Section 13 (Recommendations): 1 page.',
    '- Section 14 (Appendices): 2 pages (scores + methodology p1, glossary p2).',
    'Each section fills at least 80% of its budget. Tables: respect the exact row counts specified.',
  ].join('\n');

  // --- SECTIONS ---
  var sections = [

    '1. COVER PAGE [exact CSS class "cover-section"]: <section class="cover-section"> full-page, #0a0e18 background, centered flex. Elements IN EXACT ORDER:\n'
    +'(1) <h1>' + c.name + '</h1> very large (white Cormorant Garamond 5-6rem, letter-spacing -2px).\n'
    +'(2) <p class="subtitle"> in TOTAL UPPERCASE with " \u00b7 " separators: format \u00b7 cuisine \u00b7 city, written in ' + LANG + ' and taken from the concept data (short words, max ~6 words total). Copper #C9862A, 1.3rem, letter-spacing 1px, margin-bottom 3rem.\n'
    +'(3) <div class="badge-score"> copper circle 130x130px (border 3px solid #C9862A, border-radius 50%, flex column center, padding 0.5rem) containing IN ORDER: <div class="score-number">' + c.score + '</div> (Cormorant 2.8rem copper); <div class="score-status">' + String(c.verdict).toUpperCase() + '</div> (DM Sans 0.85rem copper, letter-spacing 1.5px); <div class="score-label">/ 100</div> (DM Sans 0.75rem copper, margin-top 0.2rem).\n'
    +'(4) <div class="cover-footer"> (class "cover-footer" ONLY; margin-top 3rem, color #999, text-align center, font-size 0.95rem) containing <p>' + (fr ? 'Pr\u00e9par\u00e9 par Za3fran Digital' : 'Prepared by Za3fran Digital') + '</p> and <p>' + c.today + '</p>.',

    '2. INVESTOR BRIEF [2 pages — standalone section]: BEFORE h2, <div class="section-number">Section 2</div>. h2 ' + H('Investor Brief', 'Brief Investisseur') + '.\n'
    +'(a) h3 ' + H('Concept Sheet', 'Fiche Concept') + ' + 8-row table [' + (fr ? 'Param\u00e8tre|Valeur' : 'Parameter|Value') + ']: concept, format, cuisine, city (+ neighbourhood if given), seats, average ticket, opening hours, development stage — values from the concept data.\n'
    +'(b) h3 ' + H('Market Opportunity', 'Opportunit\u00e9 de March\u00e9') + ' + 1 dense paragraph 80-100 words.\n'
    +'(c) h3 ' + H('Value Proposition', 'Proposition de Valeur') + ' + <ul> of 4 bullets (15-20 words each).\n'
    +'(d) h3 ' + H('Financial Summary', 'Synth\u00e8se Financi\u00e8re') + ' + 11-row table [' + (fr ? 'Indicateur|Valeur' : 'Metric|Value') + ']: funding envelope (the FUNDING ENVELOPE above), benchmark investment estimate (10A total range), gap vs envelope %, monthly break-even, Y1 revenue, Y1 EBITDA (% revenue), Y2 revenue, Y2 EBITDA, Y3 revenue, Y3 EBITDA, estimated payback.\n'
    +'(e) h3 ' + H('Top 3 Risks', 'Top 3 Risques') + ' + 3-row table [' + (fr ? 'Risque|Niveau|Position du porteur de projet' : 'Risk|Level|Founder\'s position') + '] for the 3 most serious RISKS in the register. Position column: one line — open risk accepted (with trigger) / mitigated by plan revision / contested by the founder (not independently verified).' + (d.fragile ? ' Above the table, one sentence stating the verdict and that the founder proceeds with open risks.' : ''),

    '3. TABLE OF CONTENTS [1 page]: BEFORE h2, <div class="section-number">Section 3</div>. h2 ' + H('Table of Contents', 'Table des Mati\u00e8res') + '. Numbered <ol> of 13 entries (sections 2 to 14), each "Section title — 8-12 word description", titles identical to the h2 headings.',

    '4. EXECUTIVE SUMMARY [1 page STRICT]: BEFORE h2, <div class="section-number">Section 4</div>. h2 ' + H('Executive Summary', 'R\u00e9sum\u00e9 Ex\u00e9cutif') + '. FOUR sub-sections, each h3 + 70-80 word paragraph:\n'
    +'h3 ' + H('Market & Opportunity', 'March\u00e9 & Opportunit\u00e9') + '; h3 ' + H('Concept & Positioning', 'Concept & Positionnement') + '; h3 ' + H('Business Model', 'Mod\u00e8le \u00c9conomique') + ' (funding envelope, Y1 revenue, EBITDA %, break-even, payback); h3 ' + H('Verdict & Recommendation', 'Verdict & Recommandation') + ' (score ' + c.score + '/100, ' + c.verdict + ', the 3 key risks with the founder\'s position on each, and a recommendation conditioned on the conditions precedent).',

    '5. CONCEPT & POSITIONING [1 page STRICT]: BEFORE h2, <div class="section-number">Section 5</div>. h2 ' + H('Concept & Positioning', 'Concept & Positionnement') + '. FOUR sub-sections, each h3 + 70-80 word paragraph: h3 ' + H('Vision', 'Vision') + '; h3 ' + H('Brand Identity', 'Identit\u00e9 de Marque') + '; h3 ' + H('Value Proposition', 'Proposition de Valeur') + '; h3 ' + H('Customer Experience', 'Exp\u00e9rience Client') + '. Built from the founder\'s description and differentiation.',

    '6. MARKET ANALYSIS & AUDIENCE [1 page]: BEFORE h2, <div class="section-number">Section 6</div>. h2 ' + H('Market Analysis & Audience', 'Analyse de March\u00e9 & Audience') + '.\n'
    +'(a) 2 short paragraphs (100 words each): ' + (c.city || 'city') + ' context, target audience (from the concept data), demand signals.\n'
    +'(b) h3 ' + H('Customer Personas', 'Personas Client') + ' + 7-row table [Profile|Persona 1|Persona 2] (headers in ' + LANG + '): age, profession, area of residence, dining habits relevant to the opening hours, acceptable ticket, key sensitivities, information channels. Two distinct personas drawn from the target audience.',

    '7. COMPETITIVE LANDSCAPE [2 pages]: BEFORE h2, <div class="section-number">Section 7</div>. h2 ' + H('Competitive Landscape', 'Paysage Concurrentiel') + '.\n'
    +'(a) 6-row table [Player|Type|Ticket ' + sym + '|Same customer?|Strength|Weakness|Threat to ' + c.name + '] (headers in ' + LANG + '). Players relevant to THIS format and ticket: direct format peers, adjacent formats, substitutes, and one hypothetical new entrant. Named businesses only if named in the data; otherwise archetypes (rule 9).\n'
    +'(b) Whole differentiation block inside <div class="diff-block"> (never split): h3 ' + H('Concept Differentiation', 'Diff\u00e9renciation du Concept') + ' + 25-30 word lead-in THEN a 2x2 grid of 4 cards, each <div class="diff-card" style="border-left:4px solid #C9862A;background:#fff8f0;padding:1.25rem;border-radius:6px;margin:0.6rem"> with a large copper number (1-4) + bold axis title + 40-50 words comparing ' + c.name + ' with competitors. The 4 axes come from the founder\'s differentiation and market-gap text.',

    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE — 1 page]: BEFORE h2, <div class="section-number">Section 8</div>. h2 ' + H('Menu Strategy', 'Strat\u00e9gie Menu') + '.\n'
    +'(a) <div class="estimate-box"> with <h4>' + (fr ? 'Strat\u00e9gie Menu \u2014 Directionnel' : 'Menu Strategy \u2014 Directional') + '</h4> + 30-35 words (structure and price bands are benchmarks to refine with the chef; detailed costing and sourcing are covered by the Menu Engineer module).\n'
    +'(b) h3 ' + H('Estimated Menu Structure', 'Structure Menu Estim\u00e9e') + ' + 6-row table [Section|Items|Avg price ' + sym + '|Cost %|Notes] (headers in ' + LANG + '): 5 menu sections that fit THIS concept (include the beverage programme as its own section when beverages are central to the concept) + an AVERAGE/TOTAL row. Prices consistent with the average ticket. Notes <= 6 words.\n'
    +'(c) h3 ' + H('Signature Items', 'Produits Signature') + ' + 3 items as <ul>: bold name + 18-22 words (ingredients, technique, indicative price), true to the founder\'s cuisine description. No supplier section.\n'
    +'(d) h3 ' + H('Menu Engineering Preview (Directional)', 'Aper\u00e7u Menu Engineering (Directionnel)') + ' + 20-25 word lead-in THEN a COMPACT 4-row table [Category|Margin/popularity profile|Example items]: Stars, Plowhorses, Puzzles, Dogs.',

    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE — 1 COMPACT page]: BEFORE h2, <div class="section-number">Section 9</div>. h2 ' + H('Operational Model & Staffing', 'Mod\u00e8le Op\u00e9rationnel & Staffing') + '.\n'
    +'(a) <div class="estimate-box"> with <h4>' + (fr ? 'Staffing \u2014 Directionnel' : 'Staffing \u2014 Directional') + '</h4> + 40 words (benchmarked on similar formats in ' + (c.city || 'the city') + ', sized to the seats and opening hours).\n'
    +'(b) h3 ' + H('Staffing Structure', 'Structure des Effectifs') + ' + 8-row table [Position|FTE|Monthly salary ' + sym + '|Total ' + sym + '|Notes]: 5 positions that fit THIS format, then TOTAL GROSS, social charges (~35% unless local practice differs), TOTAL LOADED. Notes <= 6 words. No page break in this section.\n'
    +'(c) h3 ' + H('Productivity Ratios', 'Ratios de Productivit\u00e9') + ' + <ul> of 4 one-line bullets (<= 18 words).\n'
    +'(d) h3 ' + H('Top 3 Operational KPIs D+30', 'Top 3 KPIs Op\u00e9rationnels J+30') + ' + 3-row table [KPI|Target|Method] (Method <= 10 words).',

    '10. FINANCIAL PROJECTIONS [3 pages — CSS class "financial-section"]: BEFORE h2, <div class="section-number">Section 10</div>. h2 ' + H('Financial Projections', 'Projections Financi\u00e8res') + '. Italic 50-60 word sub-paragraph: directional estimates based on benchmarks for this format in ' + (c.city || 'the city') + ', the target ratios used, and that figures marked as the founder\'s come from the founder.\n'
    +'SIX sub-sections in this exact order. 10A-10E each in <div class="estimate-box"> with <h4>Title</h4> + 25-35 word description, THEN its table.\n\n'
    +'10A. ' + (fr ? 'BUDGET D\'INVESTISSEMENT' : 'STARTUP BUDGET') + ' — 12-row table [Item|Low ' + sym + '|High ' + sym + '|Notes]: fit-out, kitchen & bar equipment, furniture & decor, IT/POS, licences & permits (include any licence acquisition or transfer the register mentions, at the founder\'s figure when given), legal & advisory, working capital (3 months), pre-opening marketing, cash reserve (3 months min), contingency 8%, TOTAL, gap vs funding envelope (' + F.text.split(' (')[0] + '). If the benchmark TOTAL exceeds the envelope, show the gap as a negative figure and state in Notes what must give (scope, phasing or additional funding). Never resize the envelope.\n\n'
    +'10B. ' + (fr ? 'CHIFFRE D\'AFFAIRES PR\u00c9VISIONNEL' : 'REVENUE PROJECTIONS') + ' — TWO tables: (1) Y1 quarterly 5-row [Quarter|Covers/day|Trading days|Quarterly revenue ' + sym + '] (Q1 ramp-up to Q4 cruise, then Y1 TOTAL; trading days consistent with the opening hours; ticket and covers from the concept data); (2) 3-row multi-year recap [Year|Annual revenue ' + sym + '|Growth %|Avg covers/day], first column inside <span class="nw">...</span>.\n\n'
    +'10C. ' + (fr ? 'SENSIBILIT\u00c9 DU POINT MORT' : 'BREAK-EVEN SENSITIVITY') + ' — 4-row table [Scenario|Ticket -10%|Ticket base|Ticket +15%]: covers -20%, covers base, covers +30%. Each cell = monthly break-even ' + sym + '. One synthesis line below.\n\n'
    +'10D. ' + (fr ? 'COMPTE DE R\u00c9SULTAT 3 ANS' : '3-YEAR P&L') + ' — 12-row table [Line|Y1 ' + sym + '|Y1 %|Y2 ' + sym + '|Y2 %|Y3 ' + sym + '|Y3 %]: revenue, cost of goods sold (food & beverage — ratio suited to this concept\'s food/beverage mix), gross margin, payroll (consistent with Section 9), rent, energy, consumables, marketing, insurance & other, depreciation, EBITDA, net result.\n\n'
    +'10E. ' + (fr ? 'ROI & FINANCEMENT' : 'ROI & FUNDING') + ' — TWO tables: (1) 5-row ROI parameters [Parameter|Value]: investment retained, cumulative EBITDA Y1-Y3, payback (years), ROI Y3 %, annualised ROIC on Y3 EBITDA; (2) 3-row financing structure [Source|Amount ' + sym + '|%|Notes]: founder equity, bank debt (12-15 years, indicative rate), TOTAL = the funding envelope exactly. No "financing institutions" table (reserved for Business Plan Pro).\n\n'
    +'10F. h3 ' + H('Financial Alerts & Founder\'s Position', 'Alertes Financi\u00e8res & Position du Porteur de Projet') + ' + COMPACT ' + nA + '-row table [Alert|Severity|Founder\'s position|Treatment in this plan] (headers in ' + LANG + '), one row per FINANCIAL ALERT in the register (A1-A' + nA + '). Position and treatment follow rules 1-3, <= 14 words per cell. If there are no alerts, one sentence saying none were flagged.',

    '11. MARKETING & PRE-OPENING [DIRECTIONAL ESTIMATE — 1 COMPACT page]: BEFORE h2, <div class="section-number">Section 11</div>. h2 ' + H('Marketing & Pre-Opening', 'Marketing & Pr\u00e9-Ouverture') + '.\n'
    +'(a) <div class="estimate-box"> with <h4>' + (fr ? 'Marketing \u2014 Directionnel' : 'Marketing \u2014 Directional') + '</h4> + 35-45 words: pre-opening budget EQUAL to the 10A pre-opening marketing line, audience from the concept data.\n'
    +'(b) h3 ' + H('Pre-Opening Marketing Timeline', 'Calendrier Marketing Pr\u00e9-Ouverture') + ' + 4-row table [Period|Phase|Key actions (2-3 bullets <= 8 words)|Budget ' + sym + ']: D-90 to D-60, D-60 to D-30, D-30 to D-0, TOTAL (= the 10A line).\n'
    +'(c) h3 ' + H('Indicative Channel Mix (Y1)', 'Mix Canaux Indicatif (A1)') + ' + <ul> of 4 one-line bullets (<= 16 words, % of budget each), channels suited to this audience.\n'
    +'(d) h3 ' + H('Top 3 Marketing KPIs', 'Top 3 KPIs Marketing') + ' + 3-row table [KPI|Target D+30|Method] (Method <= 10 words).',

    '12. RISK ANALYSIS [2 pages]: BEFORE h2, <div class="section-number">Section 12</div>. h2 ' + H('Risk Analysis', 'Analyse des Risques') + '. Italic 25-35 word sub-paragraph: ' + nR + ' risks identified, 3 critical ones detailed below, score = probability x impact, financial alerts covered in Section 10F' + (d.fragile ? ', and the verdict with the fact that the founder proceeds with open risks' : '') + '.\n'
    +'(a) h3 ' + H('Risk Summary Table', 'Tableau R\u00e9capitulatif des Risques') + ' + COMPACT ' + nR + '-row table [Risk|Probability|Impact|Score /10|Founder\'s position] (headers in ' + LANG + '). ALL ' + nR + ' RISKS from the register (R1-R' + nR + '), no others, no invented risks. Probability/impact follow the Validator levels. Position column: 2-4 words (open — accepted / mitigated by revision / contested — unverified).\n'
    +'(b) h3 ' + H('Detail of 3 Critical Risks', 'D\u00e9tail des 3 Risques Critiques') + ' + EXACTLY 3 <div class="risk-block"> for the 3 highest-scored risks. Each VERY COMPACT (the summary table + block 1 fit on one page): <h4>' + (fr ? 'Risque' : 'Risk') + ' N: Title</h4> + bold line "Probability: X | Impact: Y | Score: Z/10" (in ' + LANG + ') + 25-30 word context (Validator view) + h5 ' + H('Founder\'s Position', 'Position du Porteur de Projet') + ' + 1-2 sentences per rules 1-3 + h5 ' + H('Mitigation & Monitoring', 'Mitigation & Suivi') + ' + <ol> of 3 actions (12-15 words each, grounded in the founder\'s own words where given) + one final line: for an accepted risk "' + (fr ? 'D\u00e9clencheur de suivi' : 'Monitoring trigger') + ':" (rule 1); for a mitigated risk "' + (fr ? 'Risque r\u00e9siduel' : 'Residual risk') + ':"; for a contested risk "' + (fr ? '\u00c9tape de validation' : 'Validation step') + ':" (rule 3). 12-18 words.\n'
    +'(c) h3 ' + H('Other Risks to Monitor', 'Autres Risques \u00e0 Surveiller') + ' + 1 paragraph (50-80 words) covering every remaining risk: founder\'s position + key action or trigger, 8-14 words each.',

    '13. RECOMMENDATIONS & NEXT STEPS [1 page]: BEFORE h2, <div class="section-number">Section 13</div>. h2 ' + H('Recommendations & Next Steps', 'Recommandations & Prochaines \u00c9tapes') + '.\n'
    +'(a) Intro paragraph 30-40 words: verdict ' + c.score + '/100 and the go/no-go logic of the steps below.\n'
    +'(b) h3 ' + H('Conditions Precedent & Priority Actions', 'Conditions Pr\u00e9alables & Actions Prioritaires') + ' + 6-row table [#|Action|Owner|Deliverable|Timing] (headers in ' + LANG + '). Order: first the CONDITIONS PRECEDENT, then concrete commitments stated in the founder\'s own words (rule 4), then the Validator\'s strategic recommendations. Mark go/no-go steps with "(Go/No-Go)". Timing relative to opening (e.g. M-6) or to funding.\n'
    +'(c) <div class="za3fran-box"> LIGHT AND PUNCHY with copper h3 ' + H('Za3fran Digital Services \u2014 Next Steps', 'Services Za3fran Digital \u2014 Prochaines \u00c9tapes') + ' + one hook line (max 20 words) consistent with the verdict + 3 services in an airy <ul>, one line each: bold name + 8-12 word benefit: (1) Menu Engineer, (2) Financial Builder, (3) Business Plan Pro. No prices. End with one contact line "hello@za3fran.io | WhatsApp +212 648 960 306".',

    '14. APPENDICES [2 pages]: BEFORE h2, <div class="section-number">Section 14</div>. h2 ' + H('Appendices', 'Annexes') + '.\n'
    +'(a) h3 ' + H('Validator Scores \u2014 Detail', 'Scores Validator \u2014 D\u00e9tail') + ' + table [Criterion|Score /100|Observation] with one row per criterion of the score breakdown above, then a final OVERALL row (' + c.score + '/100, ' + c.verdict + ')' + (c.prevScore != null ? '; below the table, one line noting the score moved from ' + c.prevScore + ' to ' + c.score + ' after the founder\'s revisions' : '') + '. Observation 8-12 words.\n'
    +'(b) h3 ' + H('Methodology Note', 'Note M\u00e9thodologique') + ' + <ol> of 3 bullets (20-25 words each): benchmarks used, base-scenario assumptions, and that figures and statements attributed to the founder are not independently verified.\n'
    +'(c) h3 ' + H('Glossary', 'Glossaire') + ' + 10-row table [Term|Definition 12-15 words]: the 10 terms a lender most needs for THIS concept.\n'
    +'(d) Minimal footer: <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid #e8e8e4; text-align: center; font-size: 0.85rem; color: #999;"> with 3 <p>: "' + c.name + ' \u2014 Business Plan Essentials", "' + (fr ? 'Pr\u00e9par\u00e9 par Za3fran Digital' : 'Prepared by Za3fran Digital') + ' | ' + c.today + '", "' + (fr ? 'Document confidentiel \u2014 Reproduction interdite sans autorisation \u00e9crite.' : 'Confidential \u2014 No reproduction without written permission.') + '"',

  ].join('\n\n');

  // --- PRINT CSS (unchanged from v12 except the cover colour) ---
  var printCSS = '@media print { @page { margin: 1cm; size: A4; } html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; } section { display: block !important; width: 100% !important; min-height: 0 !important; max-height: none !important; height: auto !important; padding: 0.5rem 0 !important; margin: 0 !important; page-break-before: always !important; break-before: page !important; page-break-inside: avoid !important; page-break-after: auto !important; break-inside: avoid !important; } section > p { page-break-inside: avoid !important; break-inside: avoid !important; } .cover-section { display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; min-height: 100vh !important; height: 100vh !important; page-break-before: avoid !important; page-break-after: always !important; break-after: page !important; padding: 3rem 2rem !important; background: #0a0e18 !important; color: white !important; } .financial-section { background: transparent !important; } .financial-section table td, .financial-section table th { padding: 0.4rem 0.55rem !important; font-size: 0.82rem !important; line-height: 1.3 !important; } .section-number { page-break-after: avoid !important; break-after: avoid !important; } section > *:nth-child(-n+4) { page-break-after: avoid !important; break-after: avoid !important; } table { page-break-inside: avoid !important; break-inside: avoid !important; margin: 1rem 0 !important; table-layout: auto !important; } td.num, th.num { white-space: nowrap !important; } .nw { white-space: nowrap !important; } thead { display: table-header-group !important; } tr { page-break-inside: avoid !important; break-inside: avoid !important; } h1, h2, h3, h4, h5 { page-break-after: avoid !important; break-after: avoid !important; } .estimate-box, .za3fran-box { page-break-inside: avoid !important; break-inside: avoid !important; margin: 1rem 0 !important; } .za3fran-box { margin-top: 2.5rem !important; } .diff-block { page-break-inside: avoid !important; break-inside: avoid !important; } .diff-card { page-break-inside: avoid !important; break-inside: avoid !important; } .risk-block { page-break-inside: avoid !important; break-inside: avoid !important; margin: 0.6rem 0 !important; } .estimate-box { page-break-after: avoid !important; break-after: avoid !important; } .estimate-box + table, .estimate-box + ul, .estimate-box + ol { page-break-before: avoid !important; break-before: avoid !important; } h3 + ul, h3 + ol, h3 + table, h4 + ul, h4 + ol, h4 + table, h4 + p { page-break-before: avoid !important; break-before: avoid !important; } ul, ol { page-break-inside: avoid !important; break-inside: avoid !important; } .page-break { display: block !important; height: 0 !important; page-break-after: always !important; break-after: page !important; } p { orphans: 3; widows: 3; } section > div[style*="border-top"] { margin-top: 1rem !important; padding-top: 0.5rem !important; page-break-before: avoid !important; break-before: avoid !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }';

  // --- DESIGN ---
  var design = 'HTML DESIGN: complete self-contained HTML document, <html lang="' + (fr ? 'fr' : 'en') + '">. Google Fonts: Cormorant Garamond (h1-h4) + DM Sans (body + tables). Colors: background #FAFAF7, text #1a1a1a, copper accent #C9862A, navy #0F1F3D, muted #999. '
    + 'STRICT CSS CLASS TAXONOMY: '
    + '(a) section 1 = <section class="cover-section"> with #0a0e18 background. '
    + '(b) section 10 = <section class="financial-section">. '
    + '(c) all other sections = <section>. '
    + '(d) BEFORE each h2 (except section 1), <div class="section-number">Section N</div> styled: font-size 0.75rem, color #C9862A, text-transform uppercase, letter-spacing 1.5px, margin-bottom 0.5rem. '
    + '(e) DIRECTIONAL ESTIMATE boxes = <div class="estimate-box"> with #fff8f0 background, 3px solid #C9862A left border, padding 1rem, containing <h4> + <p>. '
    + '(f) risk blocks section 12 = <div class="risk-block"> with white background, 4px solid #C9862A left border, padding 1rem 1.5rem. '
    + '(g) Za3fran box section 13 = <div class="za3fran-box"> with #0F1F3D background, white text, padding 1.5rem 2rem. '
    + 'Tables: 1px #e8e8e4 outer border, <thead> with #0F1F3D background white text, alternating rows #f9f9f7, cell padding 0.7rem 1rem. TABLE RULES (STRICT): every amount/number/percentage in <td class="num"> (never wraps). Any parenthetical inside a cell = <span class="nw">(text)</span>. Amounts with non-breaking-space thousand separators. First column may wrap onto 2 clean lines; amount columns wide enough for one line. '
    + 'Body max-width 860px, margin 0 auto, padding 0 2rem. No .section-content wrapper. '
    + printCSS
    + ' Impeccable, professional, premium investor-grade design.';

  var intro = 'You are a senior F&B expert for Morocco, the Maghreb and MENA, and an investor-grade business plan writer. Generate a COMPLETE BUSINESS PLAN ESSENTIALS in HTML, written in ' + LANG + ', for the concept below. ABSOLUTE PRIORITIES: (1) all 14 sections complete; (2) faithful to the data and to the founder\'s positions (rules below); (3) each section respects its page budget; (4) exact table row counts; (5) exact CSS classes (section-number, cover-section, financial-section, estimate-box, risk-block, za3fran-box); (6) ~85% density per page.';

  var closing = 'Return ONLY the complete HTML, written entirely in ' + LANG + '. Start with <!DOCTYPE html>. End with </html>. NO TRUNCATION. NO MARKDOWN AROUND IT. All 14 sections present and complete.';

  return intro
    + '\n\n' + budgets
    + '\n\n' + data
    + '\n\n' + rules
    + '\n\n=== 14 SECTIONS (EXACT STRUCTURE) ===\n' + sections
    + '\n\n' + design
    + '\n\n' + closing;
}
