// ============================================================
// /api/crr-review-status.js  — Concept Readiness Review v1.5
// GET /api/crr-review-status?code=XXXXXXXX
//
// Returns everything the review page renders: items with linked
// fields and decisions, the effective concept (original answers +
// amendments), re-assessment state and the clearing rule result.
// Read-only apart from on-demand risk field tagging (cached).
// Replaces /api/crr-status.js once the v1.5 review page ships.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { loadReviewContext, buildReviewState, ReviewError } from '../lib/crr-review.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const ctx = await loadReviewContext(supabase, req.query.code, { tag: true });
    return res.status(200).json(buildReviewState(ctx));
  } catch (err) {
    if (err instanceof ReviewError) return res.status(err.status).json({ error: err.code, detail: err.detail || null });
    console.error('[crr-review-status] unexpected error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
