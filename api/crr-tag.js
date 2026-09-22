// ============================================================
// /api/crr-tag.js
// GET /api/crr-tag?code=XXXXXXXX
//
// Ensures the project's latest Validator report has per-risk field
// tagging (§3.18), running it on demand if missing, and returns the
// mapping. Idempotent and cheap (one small utility-model call, only
// the first time). Gated by the project's unified access code.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { ensureTagged, summarizeTags } from '../lib/crr-tagging.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { maxDuration: 60 };

async function withRetry(fn, attempts = 3, delayMs = 1300) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (!last.error) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return last;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'missing_code' });

  const { data: project, error: pErr } = await withRetry(() =>
    supabase.from('za3fran_projects')
      .select('id, concept_name, validator_submission_id')
      .eq('access_code', code).maybeSingle()
  );
  if (pErr) return res.status(502).json({ error: 'upstream_lookup_failed' });
  if (!project || !project.validator_submission_id) return res.status(404).json({ error: 'project_not_found' });

  const { data: reports, error: rErr } = await withRetry(() =>
    supabase.from('validator_reports')
      .select('id, version')
      .eq('submission_id', project.validator_submission_id)
      .order('created_at', { ascending: false })
      .limit(1)
  );
  if (rErr) return res.status(502).json({ error: 'upstream_lookup_failed' });
  if (!reports || !reports.length) return res.status(404).json({ error: 'report_not_found' });

  try {
    const reportJson = await ensureTagged(supabase, reports[0].id);
    return res.status(200).json({
      concept_name: project.concept_name,
      report_id: reports[0].id,
      version: reports[0].version,
      tagged_at: (reportJson.meta && reportJson.meta.fields_tagged_at) || null,
      items: summarizeTags(reportJson),
    });
  } catch (err) {
    console.error('[crr-tag] tagging failed:', err.message);
    return res.status(502).json({ error: 'tagging_failed', detail: err.message });
  }
}
