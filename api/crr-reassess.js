// ============================================================
// /api/crr-reassess.js — Concept Readiness Review re-assessment
// POST /api/crr-reassess   Body: { code }
//
// Regenerates the Validator report on the amended concept + the
// operator's decisions (master strategy §3.18). Validates, claims
// atomically, answers 202 immediately and runs in the background
// (3–6 minutes). The review page polls /api/crr-review-status,
// whose `reassessment.status` goes running → idle (or error).
//
// Errors: 409 nothing_to_reassess | reassessment_running,
//         402 regeneration_limit_reached, 404 project/report not found.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { Agent, setGlobalDispatcher } from 'undici';
import { claimReassessment, runReassessment } from '../lib/crr-reassess.js';
import { ReviewError } from '../lib/crr-review.js';

// Long single Claude call (32k tokens, non-streaming): raise Node's own
// fetch timeout (300s default) to just under this function's 800s
// maxDuration (vercel.json). Never a manual AbortController timeout.
setGlobalDispatcher(new Agent({ headersTimeout: 750_000, bodyTimeout: 750_000 }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'invalid_json' }); }

  let ctx;
  try {
    ctx = await claimReassessment(supabase, body.code);
  } catch (err) {
    if (err instanceof ReviewError) return res.status(err.status).json({ error: err.code, detail: err.detail || null });
    console.error('[crr-reassess] claim failed:', err);
    return res.status(500).json({ error: 'server_error' });
  }

  waitUntil(runReassessment(supabase, ctx));
  return res.status(202).json({ status: 'running' });
}
