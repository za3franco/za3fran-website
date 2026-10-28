// ============================================================
// /api/generate-validator.js — Concept Validator v2 (val-2.0.0): generate or re-run one report row.
// GET ?id=<validator_reports.id>&code=<project access code>
//
// The row must exist with no report_html yet (status in report_json.meta: pending, qa_failed or error).
// Uses: a preview report for a project (submission_id null: never the project's live report, so the
// Concept Readiness Review and the dashboard are untouched), and the recovery path for a paid report
// whose generation failed (the webhook writes the row first, then generates).
// Atomic claim on generation_claim (only one invocation proceeds; a claim older than maxDuration can be
// taken over). maxDuration 800 (vercel.json); the undici dispatcher is raised to just under it; no
// AbortController on model calls.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { Agent, setGlobalDispatcher } from 'undici';
import P from '../lib/validator-pipeline.js';
import { generateValidatorV2, isV2Record, notifyZa3fran, qaNotice, MAX_DURATION_MS } from '../lib/validator-v2-run.js';

setGlobalDispatcher(new Agent({ headersTimeout: 760_000, bodyTimeout: 760_000 }));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { withRetry } = P;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const id = String(req.query.id || '');
  const code = String(req.query.code || '').toUpperCase().trim();
  if (!id || !code) return res.status(400).json({ error: 'id_and_code_required' });

  const rowRes = await withRetry(() => supabase.from('validator_reports').select('id, submission_id, access_code, report_html, report_json, generation_claim').eq('id', id).maybeSingle());
  if (rowRes.error) return res.status(502).json({ error: 'lookup_failed' });
  const row = rowRes.data;
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (code !== String(row.access_code || '').toUpperCase()) return res.status(403).json({ error: 'bad_code' });
  if (row.report_html) return res.status(200).json({ ready: true });

  const meta = (row.report_json && row.report_json.meta) || {};
  const started = meta.generation_started_at ? Date.parse(meta.generation_started_at) : 0;
  if (meta.status === 'generating' && started && Date.now() - started < MAX_DURATION_MS + 30_000) return res.status(200).json({ status: 'generating' });

  const projRes = await withRetry(() => supabase.from('za3fran_projects').select('id, concept_name, language, currency, access_code, validator_submission_id').eq('access_code', code).maybeSingle());
  if (projRes.error || !projRes.data) return res.status(404).json({ error: 'project_not_found' });
  const project = projRes.data;

  // Claim
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const claimMeta = Object.assign({}, meta, { status: 'generating', generation_started_at: new Date().toISOString(), error: null });
  let claim = supabase.from('validator_reports').update({ report_json: { meta: claimMeta }, generation_claim: token }).eq('id', id).is('report_html', null);
  claim = row.generation_claim == null ? claim.is('generation_claim', null) : claim.eq('generation_claim', row.generation_claim);
  const claimed = await claim.select('id');
  if (claimed.error) return res.status(502).json({ error: 'claim_failed' });
  if (!claimed.data || !claimed.data.length) return res.status(200).json({ status: 'generating' });
  const setMeta = (patch) => withRetry(() => supabase.from('validator_reports').update({ report_json: { meta: Object.assign({}, claimMeta, patch) } }).eq('id', id));

  try {
    const { record, record_version } = await P.loadRecord(supabase, project);
    if (!isV2Record(record)) { await setMeta({ status: 'error', error: 'record_not_v2' }); return res.status(409).json({ error: 'record_not_v2' }); }
    const r = await generateValidatorV2(supabase, record, { meta: { project_id: project.id, record_version, preview: !row.submission_id } });
    console.log('[generate-validator]', id, r.ok ? 'ok' : 'qa_failed', JSON.stringify(r.audit));
    if (!r.ok) {
      await setMeta({ status: 'qa_failed', qa: { errors: (r.errors || []).slice(0, 60) }, audit: r.audit });
      await notifyZa3fran(`Validator v2 blocked by quality checks — ${project.concept_name || id}`, qaNotice(project.concept_name || id, r.errors));
      return res.status(500).json({ error: 'qa_failed' });
    }
    const json = r.json;
    json.meta = Object.assign({}, json.meta, { generation_started_at: claimMeta.generation_started_at });
    const save = await withRetry(() => supabase.from('validator_reports').update({ report_html: r.html, report_json: json, generation_claim: null }).eq('id', id).eq('generation_claim', token).select('id'));
    if (save.error || !save.data || !save.data.length) { console.error('[generate-validator] save failed', save.error && save.error.message); return res.status(500).json({ error: 'save_failed' }); }
    return res.status(200).json({ ready: true, score: json.overall.score, verdict: json.overall.verdict, audit: r.audit });
  } catch (err) {
    console.error('[generate-validator] failed', id, err && err.stack || err);
    await setMeta({ status: 'error', error: String(err && err.message || err).slice(0, 400) });
    return res.status(500).json({ error: 'generation_failed' });
  }
}
