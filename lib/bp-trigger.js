// ============================================================
// /lib/bp-trigger.js
// Starts the business plan generation as soon as both conditions hold:
// the readiness review is cleared AND the founder's figures are submitted.
// Called when the review is cleared (api/crr-review-decide.js) and when
// figures are submitted (api/bp-intake.js), so the founder never has to
// open the plan link just to start it.
//
// Fire-and-forget: GET /api/generate-bp (which claims the run atomically,
// so a viewer opening at the same time cannot start a second generation).
// The request is given a few seconds to reach the function; generate-bp
// keeps running on its own after this caller lets go.
// ============================================================

import { waitUntil } from '@vercel/functions';
import { refreshClearance } from './crr-review.js';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';

/** Returns { triggered, reason, run_id }. Never throws. */
export async function triggerBpIfReady(supabase, projectId, opts = {}) {
  try {
    const { data: project } = await supabase.from('za3fran_projects')
      .select('id, access_code, crr_status').eq('id', projectId).maybeSingle();
    if (!project || !project.access_code) return { triggered: false, reason: 'no_project' };
    if (project.crr_status !== 'cleared' && opts.refresh !== false) {
      const st = await refreshClearance(supabase, project.access_code);
      if (st) project.crr_status = st.project.crr_status;
    }
    if (project.crr_status !== 'cleared') return { triggered: false, reason: 'review_pending' };

    const { data: intake } = await supabase.from('bp_intakes').select('status').eq('project_id', projectId).maybeSingle();
    if (!intake || intake.status !== 'submitted') return { triggered: false, reason: 'figures_pending' };

    const { data: runs } = await supabase.from('business_plan_essentials_runs')
      .select('id, output_html, output_json, generation_claim').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(1);
    const run = (runs || [])[0];
    if (!run) return { triggered: false, reason: 'no_run' };
    if (run.output_html) return { triggered: false, reason: 'already_generated', run_id: run.id };
    const st = run.output_json && run.output_json.status;
    if (st === 'generating' || st === 'qa_failed') return { triggered: false, reason: st, run_id: run.id };

    const url = `${BASE_URL}/api/generate-bp?id=${encodeURIComponent(run.id)}&code=${encodeURIComponent(project.access_code)}`;
    const p = fetch(url, { signal: AbortSignal.timeout(8000) })
      .then((r) => console.log(`[bp-trigger] ${run.id}: generate-bp answered ${r.status}`))
      .catch((e) => console.log(`[bp-trigger] ${run.id}: request handed over (${e.name})`));
    try { waitUntil(p); } catch (_) { await p; }
    console.log(`[bp-trigger] generation started for ${run.id}`);
    return { triggered: true, reason: 'started', run_id: run.id };
  } catch (e) {
    console.error('[bp-trigger] failed (non-fatal):', e && e.message);
    return { triggered: false, reason: 'error' };
  }
}
