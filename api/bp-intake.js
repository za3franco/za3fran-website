// ============================================================
// /api/bp-intake.js — Business Plan intake (Phase A, task 4)
//
// GET  /api/bp-intake?code=XXXXXXXX
//      -> project + effective concept + Brain hints + saved intake/preview
// POST /api/bp-intake  { code, action: 'save' | 'preview' | 'submit', intake: <form payload> }
//      save    : validates and stores a draft
//      preview : stores the draft, runs the assumption resolver + financial engine on the live
//                Brain and returns what the plan will show (lib/bp-intake.js previewSummary)
//      submit  : as preview; status 'submitted' when nothing blocks, 'awaiting_estimates' when the
//                founder asked Za3fran for roster / investment estimates, 422 otherwise
//
// Numbers shown to the founder come from lib/financial-engine.js only (Brain rule 1).
// Access: the project's unified access code. Brute-force lockout 5 attempts / 30 min per IP
// (in-memory, same as the viewers).
// Not linked from the dashboard until the rebuilt Business Plan ships (website rule).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import R from '../lib/assumption-resolver.js';
import E from '../lib/financial-engine.js';
import I from '../lib/bp-intake.js';
import { loadEffectiveConcept } from '../lib/crr-concept.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const attempts = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const COUNTRY_BY_CURRENCY = { MAD: 'MA' };   // markets built so far (strategy: others on demand)

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (!last.error) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1300));
  }
  return last;
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

async function findProject(req, res, code) {
  const ip = clientIp(req);
  const t = attempts[ip] || { n: 0, lockedAt: null };
  if (t.lockedAt && Date.now() - t.lockedAt < LOCKOUT_MS) { res.status(429).json({ error: 'locked' }); return null; }
  if (!/^[A-Z0-9]{6,12}$/.test(code)) { res.status(400).json({ error: 'missing_code' }); return null; }
  const p = await withRetry(() => supabase.from('za3fran_projects')
    .select('id, concept_name, currency, language, crr_status, validator_submission_id').eq('access_code', code).maybeSingle());
  if (p.error) { res.status(502).json({ error: 'lookup_failed' }); return null; }
  if (!p.data) {
    t.n += 1; if (t.n >= MAX_ATTEMPTS) t.lockedAt = Date.now(); attempts[ip] = t;
    res.status(404).json({ error: 'not_found' }); return null;
  }
  attempts[ip] = { n: 0, lockedAt: null };
  const bp = await withRetry(() => supabase.from('business_plan_essentials_runs').select('id').eq('project_id', p.data.id).limit(1));
  if (bp.error) { res.status(502).json({ error: 'lookup_failed' }); return null; }
  if (!(bp.data || []).length) { res.status(403).json({ error: 'not_purchased' }); return null; }
  return p.data;
}

async function brainHints(market) {
  const ids = market.chain.map((m) => m.id);
  const [rent, cap, rate, ram] = await Promise.all([
    ids.length ? supabase.from('brain_values_effective').select('market_id').eq('parameter_key', 'property.rent_m2_month').in('market_id', ids) : { data: [] },
    supabase.from('brain_values_effective').select('value_num').eq('parameter_key', 'finance.guarantee_cap').in('market_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).limit(1),
    supabase.from('brain_values_effective').select('qualifier').eq('parameter_key', 'finance.sme_lending_rate').neq('qualifier', '').in('market_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('brain_values_effective').select('id').eq('parameter_key', 'calendar.ramadan_windows').in('market_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).limit(1),
  ]);
  const cityIds = market.chain.filter((m) => m.level !== 'country').map((m) => m.id);
  return {
    market_levels: market.chain.map((m) => m.level),
    rent_benchmark: (rent.data || []).some((r) => cityIds.includes(r.market_id)),
    guarantee_cap: (cap.data || [])[0]?.value_num ?? null,
    loan_programmes: [...new Set((rate.data || []).map((r) => r.qualifier))],
    ramadan: (ram.data || []).length > 0,   // the Ramadan question is asked only where the Brain has the dates
  };
}

async function marketFor(project, concept, intake) {
  const country = COUNTRY_BY_CURRENCY[String(project.currency || '').toUpperCase()];
  if (!country) return null;
  const m = await R.findMarketChain(supabase, { countryCode: country, city: concept.city, district: concept.district });
  if (!m.chain.length) return null;
  return { currency: m.currency || project.currency, chain: m.chain };
}

/** Tell Za3fran a founder submitted (and whether estimates are needed). Never blocks the answer. */
async function notifyZa3fran(project, code, status, summary) {
  if (!process.env.BREVO_API_KEY) return;
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = `https://www.za3fran.io/bp-intake?code=${encodeURIComponent(code)}`;
  const what = status === 'awaiting_estimates'
    ? 'The founder asked Za3fran to prepare estimates (team and/or investment). Prepare them, then review with the founder before generation.'
    : 'Inputs complete. Ready for generation once the rebuilt Business Plan is live.';
  const fig = summary && summary.uses ? `<p>Total to finance: ${esc(summary.uses.total)} ${esc(summary.currency)} · loan ${esc(summary.sources.loans)} · DSCR ${esc(summary.years.map((y) => y.dscr).join(' / '))}</p>` : '';
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'Za3fran', email: 'hello@za3fran.io' },
        to: [{ email: 'hello@za3fran.io', name: 'Za3fran' }],
        subject: `BP inputs submitted — ${project.concept_name || code} (${status === 'awaiting_estimates' ? 'estimates needed' : 'complete'})`,
        htmlContent: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p><b>${esc(project.concept_name || '')}</b> — access code ${esc(code)}</p><p>${what}</p>${fig}<p><a href="${link}">Open the inputs</a></p></div>`,
      }),
    });
  } catch (e) { console.error('[bp-intake] notify failed', e.message); }
}

async function runPreview(project, eff, intake) {
  const concept = I.resolverConcept(eff.values, intake);
  const format = I.formatFor(eff.values.concept_type, intake);
  const market = await marketFor(project, concept, intake);
  const extraGaps = [];
  if (!market) extraGaps.push({ path: 'market', severity: 'blocking', message: 'No Za3fran market profile for this country yet' });
  if (!format) extraGaps.push({ path: 'format', severity: 'blocking', message: 'No Za3fran benchmarks for this venue type yet' });
  if (extraGaps.length) {
    return { summary: I.previewSummary({ method_version: null, status: 'blocked', gaps: extraGaps, flags: [], assumptions: [] }, null), resolverVersion: R.RESOLVER_VERSION };
  }
  const brain = await R.loadBrainContext(supabase, { market, format });
  const result = R.resolveAssumptions({ concept, intake, market, format, brain, options: { analyseImpact: false } });
  const sc = result.status === 'ready' ? E.runScenarios(result.inputs) : null;
  return { summary: I.previewSummary(result, sc), resolverVersion: R.RESOLVER_VERSION };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const code = String(req.query.code || '').toUpperCase().trim();
      const project = await findProject(req, res, code);
      if (!project) return;
      const eff = await loadEffectiveConcept(supabase, project);
      const saved = await withRetry(() => supabase.from('bp_intakes').select('intake, status, preview, updated_at, submitted_at').eq('project_id', project.id).maybeSingle());
      const v = eff.values || {};
      const intake = saved.data?.intake || {};
      const market = await marketFor(project, I.resolverConcept(v, intake), intake);
      return res.status(200).json({
        project: { concept_name: project.concept_name, currency: project.currency, language: project.language, crr_status: project.crr_status },
        concept: { seats: v.seats ?? null, ticket: v.ticket ?? null, covers: v.covers ?? null, city: v.city ?? null, neighbourhood: v.neighbourhood ?? null, concept_type: v.concept_type ?? null },
        format_default: I.formatFor(v.concept_type, {}),
        brain: market ? await brainHints(market) : { market_levels: [], rent_benchmark: false, guarantee_cap: null, loan_programmes: [], ramadan: false },
        saved: saved.data ? { intake: saved.data.intake, status: saved.data.status, preview: saved.data.preview, updated_at: saved.data.updated_at, submitted_at: saved.data.submitted_at } : null,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = ['save', 'preview', 'submit'].includes(body.action) ? body.action : null;
    if (!action) return res.status(400).json({ error: 'bad_action' });
    const project = await findProject(req, res, String(body.code || '').toUpperCase().trim());
    if (!project) return;

    const { intake, errors } = I.normalizeIntake(body.intake);
    if (errors.length) return res.status(422).json({ error: 'invalid_input', errors });

    const row = { project_id: project.id, intake, status: 'draft', updated_at: new Date().toISOString() };
    let summary = null, resolverVersion = null;
    if (action !== 'save') {
      const eff = await loadEffectiveConcept(supabase, project);
      ({ summary, resolverVersion } = await runPreview(project, eff, intake));
      row.preview = summary; row.resolver_version = resolverVersion;
    }
    if (action === 'submit') {
      const est = I.estimatesRequested(intake);
      const otherBlocking = (summary.blocking || []).filter((g) =>
        !(est.roster && g.path === 'labour.roster') && !(est.investment && g.path === 'investment'));
      if (otherBlocking.length) {
        await withRetry(() => supabase.from('bp_intakes').upsert(row, { onConflict: 'project_id' }));
        return res.status(422).json({ error: 'incomplete', preview: summary });
      }
      row.status = est.roster || est.investment ? 'awaiting_estimates' : 'submitted';
      row.submitted_at = new Date().toISOString();
    }
    const up = await withRetry(() => supabase.from('bp_intakes').upsert(row, { onConflict: 'project_id' }));
    if (up.error) { console.error('[bp-intake] save failed', up.error.message); return res.status(502).json({ error: 'save_failed' }); }
    if (action === 'submit') await notifyZa3fran(project, String(body.code || '').toUpperCase().trim(), row.status, summary);
    return res.status(200).json({ ok: true, status: row.status, preview: summary });
  } catch (e) {
    console.error('[bp-intake] error', e && e.stack || e);
    return res.status(500).json({ error: 'server_error' });
  }
}
