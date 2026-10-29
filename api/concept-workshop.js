// ============================================================
// /api/concept-workshop.js — Concept workshop (readiness review, step 1)
//
// GET  /api/concept-workshop?code=XXXXXXXX
//   → { editable, preview, report, workshop, regeneration, lang, currency }
// POST /api/concept-workshop  { code, action: 'preview' | 'save', patch }
//   preview: recalculates what the Validator's code computes from the patched figures
//            (score, verdict, key figures, financial alerts) — no model call, nothing stored
//   save:    stores the patched record as a new concept_records version (source 'workshop');
//            the readiness review then shows a re-assessment to run ("Update my report")
//
// The figures come from the financial engine only (lib/concept-workshop.js → lib/validator-v2.js).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import P from '../lib/validator-pipeline.js';
import WS from '../lib/concept-workshop.js';
import CR from '../lib/concept-record.js';
import FMT from '../lib/formats.js';
import { workshopInfo } from '../lib/crr-review.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { maxDuration: 30 };

// Market chain and Brain context change rarely: kept a few minutes per function instance.
const MARKET_CACHE = new Map();
const CACHE_MS = 5 * 60 * 1000;
async function marketFor(record) {
  const key = [record.project_country || record.currency, record.city, record.neighbourhood, FMT.familyFor(record.concept_type, record.format_family)].join('|').toLowerCase();
  const hit = MARKET_CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await P.loadMarket(supabase, record);
  MARKET_CACHE.set(key, { at: Date.now(), value });
  return value;
}

async function load(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!c) return { error: [400, 'missing_code'] };
  const { data: project } = await P.withRetry(() => supabase.from('za3fran_projects')
    .select('id, concept_name, language, currency, validator_submission_id, crr_status, regeneration_count, regeneration_limit, reassessment_status')
    .eq('access_code', c).maybeSingle());
  if (!project) return { error: [404, 'project_not_found'] };
  const [{ record, record_version }, recRes, repRes] = await Promise.all([
    P.loadRecord(supabase, project),
    P.withRetry(() => supabase.from('concept_records').select('version, created_at, data').eq('project_id', project.id).order('version', { ascending: false }).limit(1)),
    project.validator_submission_id
      ? P.withRetry(() => supabase.from('validator_reports').select('id, version, report_json').eq('submission_id', project.validator_submission_id).order('created_at', { ascending: false }).limit(1))
      : Promise.resolve({ data: [] }),
  ]);
  if (!Array.isArray(record.services) || !record.services.length) return { error: [409, 'workshop_not_available'] };
  const report = (repRes.data || [])[0] || null;
  const latestRecord = (recRes.data || [])[0] || null;
  return { code: c, project, record, record_version, report, latestRecord };
}

function today() { return new Date().toISOString().slice(0, 10); }

/**
 * The record the latest report was assessed on: its concept_records version (report meta.record_version, else 1)
 * with the readiness-review amendments made between that version and the next one (same rule as loadRecord).
 */
async function assessedRecord(ctx) {
  const rj = (ctx.report && ctx.report.report_json) || {};
  const v = Number(rj.meta && rj.meta.record_version) || 1;
  if (ctx.latestRecord && ctx.latestRecord.version === v) return ctx.record;
  const [rows, ams] = await Promise.all([
    P.withRetry(() => supabase.from('concept_records').select('version, created_at, data').eq('project_id', ctx.project.id).in('version', [v, v + 1])),
    P.withRetry(() => supabase.from('crr_amendments').select('field_key, amended_value, amendment_status, amended_at').eq('project_id', ctx.project.id).eq('amendment_status', 'active')),
  ]);
  const row = (rows.data || []).find((r) => r.version === v), next = (rows.data || []).find((r) => r.version === v + 1);
  if (!row) return ctx.record;
  const from = Date.parse(row.created_at), to = next ? Date.parse(next.created_at) : Infinity;
  const rec = CR.applyAmendments(row.data, (ams.data || []).filter((a) => { const t = Date.parse(a.amended_at); return t > from && t < to; }));
  if (!rec.language) rec.language = ctx.record.language;
  if (!rec.currency) rec.currency = ctx.record.currency;
  return rec;
}

async function previewOf(ctx, record) {
  const { market, brain } = await marketFor(record);
  const rj = ctx.report && ctx.report.report_json;
  const run = (r) => WS.preview({ record: r, market, brain, reportJson: rj, today: today() });
  // Anchor: the figures the report was computed on; the provisional score moves from there.
  const current = ctx.currentPreview || (ctx.currentPreview = run(ctx.assessed || (ctx.assessed = await assessedRecord(ctx))));
  const next = run(record);
  return WS.anchor(current, next, rj && rj.overall ? { score: rj.overall.score, verdict: String(rj.overall.verdict || '').toUpperCase().replace('-', '_') } : null);
}

function stateOf(ctx, record, preview) {
  const rj = (ctx.report && ctx.report.report_json) || {};
  const used = ctx.project.regeneration_count || 0, limit = ctx.project.regeneration_limit ?? 5;
  return {
    lang: record.language === 'en' ? 'en' : 'fr',
    currency: record.currency || ctx.project.currency || 'MAD',
    editable: WS.editable(record),
    preview,
    report: ctx.report ? { id: ctx.report.id, version: ctx.report.version || 1, score: rj.overall ? rj.overall.score : null, verdict: rj.overall ? rj.overall.verdict : null } : null,
    workshop: workshopInfo({ latestRecord: ctx.latestRecord, report: ctx.report }),
    regeneration: { used, limit, remaining: Math.max(0, limit - used) },
    reassessment_running: ctx.project.reassessment_status === 'running',
    services: FMT.SERVICE_IDS.map((id) => ({ id, fr: FMT.SERVICE_LABELS[id].fr, en: FMT.SERVICE_LABELS[id].en })),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const ctx = await load(req.query.code);
      if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });
      return res.status(200).json(stateOf(ctx, ctx.record, await previewOf(ctx, ctx.record)));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { return res.status(400).json({ error: 'invalid_json' }); }
    const action = body.action === 'save' ? 'save' : 'preview';
    const ctx = await load(body.code);
    if (ctx.error) return res.status(ctx.error[0]).json({ error: ctx.error[1] });

    const { record, errors } = WS.applyPatch(ctx.record, body.patch || {});
    const preview = await previewOf(ctx, record);
    if (action === 'preview') return res.status(200).json({ errors, preview });

    if (errors.length) return res.status(422).json({ error: 'invalid_values', errors, preview });
    if (ctx.project.reassessment_status === 'running') return res.status(409).json({ error: 'reassessment_running' });
    const changes = WS.diffRecords(ctx.record, record, record.language === 'en' ? 'en' : 'fr');
    if (!changes.length) return res.status(200).json(Object.assign(stateOf(ctx, ctx.record, preview), { saved: false, changes }));

    const nextVersion = ((ctx.latestRecord && ctx.latestRecord.version) || 0) + 1;
    const data = Object.assign({}, record, { schema: CR.RECORD_VERSION });
    const ins = await P.withRetry(() => supabase.from('concept_records').insert({
      // source: the concept_records check constraint allows 'readiness_review' (the workshop is its step 1).
      project_id: ctx.project.id, version: nextVersion, data, source: 'readiness_review', schema: CR.RECORD_VERSION,
      note: changes.join(' | ').slice(0, 2000),
    }).select('version, created_at, data'));
    if (ins.error) {
      console.error('[concept-workshop] save failed', ins.error.code, ins.error.message || ins.error);
      // Two saves at once: the unique (project_id, version) index refused this one; the founder retries.
      if (ins.error.code === '23505') return res.status(409).json({ error: 'save_conflict' });
      return res.status(502).json({ error: 'save_failed' });
    }
    const saved = Object.assign({}, ctx, { latestRecord: (ins.data || [])[0], record });
    console.log(`[concept-workshop] ${ctx.code}: record v${nextVersion} saved (${changes.length} change(s))`);
    return res.status(200).json(Object.assign(stateOf(saved, record, preview), { saved: true, changes }));
  } catch (err) {
    console.error('[concept-workshop] unexpected error:', err && err.stack || err);
    return res.status(500).json({ error: 'server_error' });
  }
}
