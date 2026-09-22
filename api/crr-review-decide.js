// ============================================================
// /api/crr-review-decide.js  — Concept Readiness Review v1.5
// POST /api/crr-review-decide
// Body: {
//   code,
//   decisions:     [{ risk_key, decision_type: 'plan_changed'|'risk_accepted'|'facts_corrected',
//                     rationale, pre_conditions: [..], amendments: [{ field_key, value }] }],
//   other_changes: [{ field_key, value, reason }],
//   reverts:       [field_key],
//   disclaimer_acknowledged: true|false
// }
// Saves progress (partial saves allowed), then re-evaluates the
// clearing rule and flips crr_status / unblocks blocked runs.
// Returns the full review state (same shape as crr-review-status).
// Replaces /api/crr-decide.js once the v1.5 review page ships.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import {
  loadReviewContext, buildReviewState, applyReviewChanges, syncProjectClearance, ReviewError,
} from '../lib/crr-review.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'invalid_json' }); }

  try {
    const ctx = await loadReviewContext(supabase, body.code);
    const notices = await applyReviewChanges(supabase, ctx, body);

    // Re-read so the state reflects exactly what's stored now.
    const fresh = await loadReviewContext(supabase, body.code);
    const state = buildReviewState(fresh);
    const transition = await syncProjectClearance(supabase, fresh, state);
    if (transition === 'cleared')  { state.project.crr_status = 'cleared'; state.project.crr_cleared_at = new Date().toISOString(); }
    if (transition === 'reopened') { state.project.crr_status = 'pending'; state.project.crr_cleared_at = null; }

    return res.status(200).json(Object.assign(state, { saved: true, transition, notices }));
  } catch (err) {
    if (err instanceof ReviewError) return res.status(err.status).json({ error: err.code, detail: err.detail || null });
    console.error('[crr-review-decide] unexpected error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
