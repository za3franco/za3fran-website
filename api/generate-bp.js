// ============================================================
// /api/generate-bp.js  (v14 — Phase A: intake + resolver + engine + checked writing)
// maxDuration: 600 in vercel.json.
//
// Pipeline (strategy v1.6 §10–17):
//  1. Concept Readiness Review gate (unchanged from v13): project cleared, concept assessed,
//     every live item decided (lib/crr-downstream.js).
//  2. BP intake: bp_intakes row with status 'submitted'. Without it the run waits in
//     'awaiting_intake' and the viewer links to /bp-intake.
//  3. Assumption resolver (lib/assumption-resolver.js) on the live Brain for the project's market
//     chain and format; a blocking gap sets 'blocked_intake'.
//  4. Financial engine (lib/financial-engine.js): base / conservative / optimistic / stress,
//     sensitivity. Every number in the plan comes from here (Brain rule 1).
//  5. persistResolution(): the appendix is frozen in project_assumptions for this run and new
//     review items reach brain_review_queue (never blocking a founder).
//  6. Facts (lib/bp-facts.js) -> Sonnet writing in parallel, French-native prompts, bank framing
//     (lib/bp-writer.js) -> automated checks (lib/bp-checks.js) with up to two rewrites per group.
//     A group that still fails sets 'qa_failed': the plan is not delivered (strategy §15).
//  7. Fixed template (lib/bp-render.js) -> output_html. Audit trail in output_json.inputs.
//
// Triggers: POST { bpRunId } (viewer page), or GET ?id=…&code=… (same access code as the viewer;
// lets Za3fran start a run from a link). A run stuck in 'generating' longer than the function's
// maxDuration can be restarted; otherwise concurrent calls return 'generating'.
//
// v12 rule kept: no AbortController on model calls; the undici dispatcher raises Node's own fetch
// timeout to just under maxDuration.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { Agent, setGlobalDispatcher } from 'undici';
import { loadDownstreamContext, loadLiveReport, assertGeneratable, DownstreamError } from '../lib/crr-downstream.js';
import { describeValue } from '../lib/crr-concept.js';
import { getModel } from '../lib/claude-config.js';
import R from '../lib/assumption-resolver.js';
import E from '../lib/financial-engine.js';
import I from '../lib/bp-intake.js';
import BF from '../lib/bp-facts.js';
import W from '../lib/bp-writer.js';
import RN from '../lib/bp-render.js';

const GENERATOR_VERSION = 'bp-v14.0';
const MAX_DURATION_MS = 600_000;
const WRITE_BUDGET_MS = 420_000;            // no rewrite starts after this point
const COUNTRY_BY_CURRENCY = { MAD: 'MA' };  // markets built so far (strategy: others on demand)
const MODEL = getModel('essentials');       // CLAUDE_MODEL_ESSENTIALS, default Sonnet (decision 12)

setGlobalDispatcher(new Agent({ headersTimeout: 580_000, bodyTimeout: 580_000 }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { last = await fn(); } catch (e) { last = { error: e }; }
    if (!last.error) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1300 * (i + 1)));
  }
  return last;
}

async function setRunStatus(runId, meta, patch) {
  const r = await withRetry(() => supabase.from('business_plan_essentials_runs')
    .update({ output_json: Object.assign({}, meta, patch) }).eq('id', runId));
  if (r.error) console.error('[bp] status write failed', runId, r.error.message || r.error);
  return r;
}

async function callModel(system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Anthropic API ' + r.status + ': ' + ((data.error && data.error.message) || JSON.stringify(data).slice(0, 200)));
  const block = (data.content || []).find((b) => b.type === 'text');   // never content[0]: a thinking block may come first
  if (!block || !block.text) throw new Error('Anthropic API returned no text');
  return { text: block.text, usage: data.usage || {} };
}

async function notifyZa3fran(subject, html) {
  if (!process.env.BREVO_API_KEY) return;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({ sender: { name: 'Za3fran', email: 'hello@za3fran.io' }, to: [{ email: 'hello@za3fran.io', name: 'Za3fran' }], subject, htmlContent: html }),
    });
    if (!r.ok) console.error('[bp] notice email failed', r.status);
  } catch (e) { console.error('[bp] notice email failed', e.message); }
}

const today = () => new Date().toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  let runId, code = null;
  if (req.method === 'POST') runId = (req.body || {}).bpRunId;
  else if (req.method === 'GET') { runId = req.query.id; code = String(req.query.code || '').toUpperCase().trim(); }
  else return res.status(405).json({ error: 'Method not allowed' });
  if (!runId) return res.status(400).json({ error: 'bpRunId required' });

  const runRes = await withRetry(() => supabase.from('business_plan_essentials_runs')
    .select('id, project_id, access_code, output_html, output_json, currency, language, generation_claim').eq('id', runId).maybeSingle());
  if (runRes.error) return res.status(502).json({ error: 'lookup_failed' });
  if (!runRes.data) return res.status(404).json({ error: 'Not found' });
  const run = runRes.data;
  if (req.method === 'GET' && (!code || code !== String(run.access_code || '').toUpperCase())) return res.status(403).json({ error: 'bad_code' });
  if (run.output_html) return res.status(200).json({ ready: true });

  const meta = run.output_json || {};
  const startedAt = meta.generation_started_at ? Date.parse(meta.generation_started_at) : 0;
  const stale = meta.status === 'generating' && (!startedAt || Date.now() - startedAt > MAX_DURATION_MS + 30_000);
  if (meta.status === 'generating' && !stale) return res.status(200).json({ status: 'generating' });

  // ── 1. Concept Readiness Review gate ────────────────────────────
  if (!run.project_id) return res.status(422).json({ error: 'missing_project_id' });
  const projRes = await withRetry(() => supabase.from('za3fran_projects')
    .select('id, user_id, concept_name, currency, language, access_code, crr_status, validator_submission_id, crr_disclaimer_accepted_at').eq('id', run.project_id).maybeSingle());
  if (projRes.error || !projRes.data) return res.status(404).json({ error: 'project_not_found' });
  const project = projRes.data;
  if (project.crr_status !== 'cleared') {
    await setRunStatus(runId, meta, { status: 'blocked_crr' });
    return res.status(409).json({ error: 'crr_not_cleared' });
  }

  // ── 2. BP intake ─────────────────────────────────────────────────
  const inRes = await withRetry(() => supabase.from('bp_intakes').select('intake, status, submitted_at, resolver_version').eq('project_id', project.id).maybeSingle());
  if (inRes.error) return res.status(502).json({ error: 'intake_lookup_failed' });
  if (!inRes.data || inRes.data.status !== 'submitted') {
    await setRunStatus(runId, meta, { status: 'awaiting_intake' });
    return res.status(409).json({ error: 'awaiting_intake', intake_url: `/bp-intake?code=${encodeURIComponent(project.access_code || run.access_code || '')}` });
  }
  const intakeRow = inRes.data;
  const intake = intakeRow.intake || {};

  // ── Claim the run (atomic compare-and-set on generation_claim: only one invocation proceeds) ──
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const claimMeta = Object.assign({}, meta, { status: 'generating', generation_started_at: new Date().toISOString(), generator: GENERATOR_VERSION, error: null, blocked_reason: null, qa: null });
  let claim = supabase.from('business_plan_essentials_runs').update({ output_json: claimMeta, generation_claim: token }).eq('id', runId).is('output_html', null);
  claim = run.generation_claim == null ? claim.is('generation_claim', null) : claim.eq('generation_claim', run.generation_claim);
  const claimed = await claim.select('id');
  if (claimed.error) { console.error('[bp] claim failed', claimed.error.message); return res.status(502).json({ error: 'claim_failed' }); }
  if (!claimed.data || !claimed.data.length) return res.status(200).json({ status: 'generating' });
  const fail = async (status, detail, http = 500) => {
    await setRunStatus(runId, claimMeta, Object.assign({ status }, detail));
    return res.status(http).json(Object.assign({ error: status }, detail));
  };

  try {
    // ── 1b. Downstream inputs (effective concept + decided register) ──
    const currency = (run.currency || project.currency || 'MAD').toUpperCase();
    const lang = (run.language || project.language) === 'en' ? 'en' : 'fr';
    let dctx;
    try {
      const report = await loadLiveReport(supabase, project);
      dctx = await loadDownstreamContext(supabase, project, { currency, report });
      assertGeneratable(dctx);
    } catch (err) {
      if (err instanceof DownstreamError && err.status === 409) return fail('blocked_crr', { blocked_reason: err.code }, 409);
      console.error('[bp] input load failed', err.code || '', err.message);
      return fail('error', { error: 'input_load_failed: ' + (err.code || err.message) });
    }
    const values = dctx.conceptValues || {};

    // ── 3. Resolver on the live Brain ─────────────────────────────
    const concept = I.resolverConcept(values, intake);
    const format = I.formatFor(values.concept_type, intake);
    const country = COUNTRY_BY_CURRENCY[currency];
    const chain = country ? await R.findMarketChain(supabase, { countryCode: country, city: concept.city, district: concept.district }) : { chain: [] };
    if (!chain.chain.length || !format) {
      return fail('blocked_intake', { blocked_reason: !chain.chain.length ? 'no_market_profile' : 'no_format_benchmark' }, 409);
    }
    const market = { currency: chain.currency || currency, chain: chain.chain };
    const brain = await R.loadBrainContext(supabase, { market, format });
    const result = R.resolveAssumptions({ concept, intake, market, format, brain });
    if (result.status !== 'ready') {
      const gaps = result.gaps.filter((g) => g.severity === 'blocking').map(({ path, message }) => ({ path, message }));
      console.warn('[bp] resolver blocked', runId, JSON.stringify(gaps));
      return fail('blocked_intake', { blocked_reason: 'intake_gaps', gaps }, 409);
    }

    // ── 4. Engine ──────────────────────────────────────────────────
    const sc = E.runScenarios(result.inputs);
    const broken = ['base', 'conservative', 'optimistic', 'stress'].filter((k) => !sc[k].checks.ok);
    if (broken.length) {
      console.error('[bp] engine invariants failed', broken, JSON.stringify(sc[broken[0]].checks.errors.slice(0, 5)));
      return fail('error', { error: 'engine_invariants_failed' });
    }

    // ── 5. Freeze the appendix for this run ───────────────────────
    let persisted = null;
    for (let i = 0; i < 3 && !persisted; i++) {
      try { persisted = await R.persistResolution(supabase, { projectId: project.id, runId }, result); }
      catch (e) { console.error('[bp] persistResolution attempt ' + (i + 1), e.message); if (i < 2) await new Promise((r) => setTimeout(r, 1500)); }
    }
    if (!persisted) return fail('error', { error: 'assumptions_freeze_failed' });

    // ── 6. Facts, writing, checks ─────────────────────────────────
    const conceptForFacts = Object.assign({}, values, { audience_text: describeValue('audience', values.audience, { lang }) });
    const facts = BF.buildFacts({ sc, res: result, concept: conceptForFacts, register: dctx.register, intake, lang, currency: market.currency, today: today() });
    console.log('[bp] ' + runId + ': ' + Object.keys(facts.F).length + ' facts, ' + facts.risks.length + ' risks, ' + facts.confirm.length + ' founder statements; model ' + MODEL);
    const written = await W.writePlan({ facts, callModel, deadline: t0 + WRITE_BUDGET_MS });
    console.log('[bp] writing ' + (written.ok ? 'passed' : 'FAILED') + ' attempts ' + JSON.stringify(written.attempts) + ' usage ' + JSON.stringify(written.usage) + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
    const audit = {
      generator: GENERATOR_VERSION, method_version: result.method_version, facts_version: facts.version, writer_version: written.version,
      model: MODEL, intake_submitted_at: intakeRow.submitted_at, report_id: dctx.report.id, report_version: dctx.report.version,
      amendment_signature: dctx.signature, assumptions_frozen: persisted.assumptions, review_items_added: persisted.review,
      attempts: written.attempts, usage: written.usage, seconds: Math.round((Date.now() - t0) / 1000),
      headline: { uses: facts.meta.uses_total, sources: facts.meta.sources_total, opening: facts.meta.opening,
        revenue_y2: sc.base.annual[1] && sc.base.annual[1].revenue, ebitda_y2: sc.base.annual[1] && sc.base.annual[1].ebitda,
        dscr: sc.base.annual.map((a) => a.dscr), dscr_conservative: sc.conservative.annual.map((a) => a.dscr), min_cash_conservative: sc.conservative.min_cash },
    };
    if (!written.ok) {
      console.error('[bp] quality checks failed', runId, JSON.stringify(written.errors.slice(0, 15)));
      await setRunStatus(runId, claimMeta, { status: 'qa_failed', error: 'quality_checks_failed', qa: { errors: written.errors.slice(0, 60), text: written.text }, inputs: audit });
      await notifyZa3fran(`Business plan blocked by quality checks — ${project.concept_name || runId}`,
        `<p>The business plan run <strong>${runId}</strong> (${project.concept_name || ''}) did not pass the automated checks after ${JSON.stringify(written.attempts)} attempts. It was not delivered.</p><p>First problems:</p><ul>${written.errors.slice(0, 10).map((e) => `<li>${String(e.where)} — ${String(e.code)}: ${String(e.detail).replace(/</g, '&lt;')}</li>`).join('')}</ul><p>The founder sees a "being finalised" page with a retry button.</p>`);
      return res.status(500).json({ error: 'qa_failed' });
    }

    // ── 7. Render and save ────────────────────────────────────────
    const html = RN.renderPlan({ facts, text: written.text });
    const done = Object.assign({}, claimMeta, { status: 'complete', error: null, blocked_reason: null, qa: null, inputs: Object.assign(audit, { generated_at: new Date().toISOString(), render_version: RN.RENDER_VERSION }), text: written.text });
    const saved = await withRetry(() => supabase.from('business_plan_essentials_runs').update({ output_html: html, output_json: done, model_used: MODEL }).eq('id', runId));
    if (saved.error) { console.error('[bp] save failed', saved.error.message || saved.error); return fail('error', { error: 'save_failed' }); }
    console.log('[bp] ' + runId + ' saved (' + html.length + ' chars) in ' + Math.round((Date.now() - t0) / 1000) + 's');
    return res.status(200).json({ ready: true });
  } catch (err) {
    console.error('[bp] generation error', runId, err && err.stack || err);
    return fail('error', { error: String(err && err.message || err).slice(0, 300) });
  }
}
