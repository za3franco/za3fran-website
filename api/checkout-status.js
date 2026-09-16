// ============================================================
// /api/checkout-status.js
// Lightweight, read-only lookup used by success.html to resolve a
// Stripe checkout session into (a) which tool/bundle was purchased
// and (b) the project's unified access code, once it exists.
//
// Tool-agnostic by design: because of the unified project access
// architecture (Workstream 1), every tool and every bundle resolves
// to exactly one za3fran_projects row with one access_code. This
// endpoint never needs to know which specific *_runs table to check —
// it just needs the customer's email (from the Stripe session) to find
// their most recent project.
//
// Two-speed response:
//  - purchase_type comes straight from the Stripe session's own
//    metadata — always available instantly, no DB round-trip needed.
//  - access_code requires the relevant webhook to have run first
//    (webhook-validator.js, webhook-business-plan.js, or the Menu
//    Engineer equivalent). For Validator purchases specifically, that
//    webhook generates the full report inline before the project is
//    even created, so this can legitimately stay null for minutes.
//    success.html polls this endpoint and handles that gracefully —
//    this endpoint just reports what's true right now, once, per call.
//
// GET /api/checkout-status?session_id=cs_xxx
// → { purchase_type, currency, language, concept_name, ready, access_code, dashboard_url }
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = (req.query.session_id || '').toString().trim();
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id is required' });
  }

  // ── Step 1: Retrieve the Stripe session — always fast, always available ──
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error('[checkout-status] Stripe session retrieve failed:', err.message);
    return res.status(404).json({ error: 'Session not found' });
  }

  const meta = session.metadata || {};
  const customerEmail = session.customer_details?.email || session.customer_email || meta.customerEmail;

  // Different submit-*.js files use slightly different metadata keys for
  // "what was purchased" — normalize here so the frontend only ever sees
  // one consistent field.
  //   submit-validator.js       → metadata.purchase_type ('validator' | 'bundle' | 'bundle_menu' | 'bundle_full')
  //   submit-business-plan.js   → metadata.type ('business_plan_essentials')
  //   submit-menu-engineer.js   → metadata.type ('menu_engineer')
  const purchaseType = meta.purchase_type || meta.type || 'unknown';

  const responseBase = {
    purchase_type: purchaseType,
    currency:      meta.currency || 'EUR',
    language:      meta.language || 'en',
    concept_name:  meta.conceptName || meta.concept_name || null,
  };

  if (!customerEmail) {
    // Shouldn't happen in practice (Stripe requires an email for these
    // checkout sessions), but fail soft rather than 500 — the frontend
    // still has purchase_type to work with.
    return res.status(200).json({ ...responseBase, ready: false, access_code: null, dashboard_url: null });
  }

  // ── Step 2: Look up the customer's most recent project ────────────
  // Tool-agnostic: whichever tool/bundle they bought, there's one user →
  // one (most recent) project → one access_code.
  try {
    const { data: user } = await supabase
      .from('za3fran_users')
      .select('id')
      .eq('email', customerEmail)
      .maybeSingle();

    if (!user) {
      return res.status(200).json({ ...responseBase, ready: false, access_code: null, dashboard_url: null });
    }

    const { data: project } = await supabase
      .from('za3fran_projects')
      .select('access_code, concept_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const accessCode = project?.access_code || null;

    return res.status(200).json({
      ...responseBase,
      concept_name: responseBase.concept_name || project?.concept_name || null,
      ready: !!accessCode,
      access_code: accessCode,
      dashboard_url: accessCode ? `${BASE_URL}/project.html?code=${encodeURIComponent(accessCode)}` : null,
    });

  } catch (err) {
    console.error('[checkout-status] Supabase lookup failed (non-fatal):', err.message);
    // Fail soft — purchase_type is still useful to the frontend even if
    // the access-code lookup hiccups.
    return res.status(200).json({ ...responseBase, ready: false, access_code: null, dashboard_url: null });
  }
}
