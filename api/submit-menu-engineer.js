// ============================================================
// /api/submit-menu-engineer.js
// Handles Menu Engineer checkout initiation.
// User arrives from menu-engineer.html having already verified
// their access code client-side via /api/verify-menu-access.
// This endpoint RE-VERIFIES server-side (never trusts client-sent
// price_tier/currency — those are recomputed from the DB) and
// stores the intake (currently just optional customer notes) in
// a pending menu_engineer_runs row before creating the checkout
// session.
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getPriceId, normalizeCurrency } from '../lib/currency.js';

const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TENANT_ID = 'za3fran';

function generateRunId() {
  return `me_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      access_code,
      email,
      language: requestedLanguage,
      additional_notes,
    } = req.body || {};

    if (!access_code) {
      return res.status(400).json({ error: 'Access code is required.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }

    const code = access_code.toUpperCase().trim();

    // ── Re-verify access code server-side (never trust client price_tier) ──
    const { data: report, error: reportError } = await supabase
      .from('validator_reports')
      .select('id, submission_id, report_html')
      .eq('access_code', code)
      .eq('tenant_id', TENANT_ID)
      .maybeSingle();

    if (reportError || !report) {
      return res.status(404).json({ error: 'Invalid access code. Please check your email and try again.' });
    }
    if (!report.report_html) {
      return res.status(409).json({ error: 'Your Validator report is still being generated. Please try again shortly.' });
    }

    const { data: submission, error: subError } = await supabase
      .from('validator_submissions')
      .select('id, concept_name, currency, language')
      .eq('id', report.submission_id)
      .maybeSingle();

    if (subError || !submission) {
      console.error('[submit-menu-engineer] submission lookup failed', subError);
      return res.status(500).json({ error: 'Server error. Please try again or contact hello@za3fran.io.' });
    }

    const { data: project, error: projError } = await supabase
      .from('za3fran_projects')
      .select('id, currency, language, concept_name')
      .eq('validator_submission_id', submission.id)
      .eq('tenant_id', TENANT_ID)
      .maybeSingle();

    if (projError || !project) {
      console.error('[submit-menu-engineer] project lookup failed', projError);
      return res.status(500).json({
        error: 'We found your report but couldn\u2019t link it to a project. Please contact hello@za3fran.io.'
      });
    }

    // ── Recompute price tier server-side — client value is ignored ──
    const { data: bpRuns, error: bpError } = await supabase
      .from('business_plan_essentials_runs')
      .select('id')
      .eq('project_id', project.id)
      .not('output_html', 'is', null)
      .limit(1);

    if (bpError) {
      console.error('[submit-menu-engineer] BP loyalty check failed (non-fatal)', bpError);
    }

    const priceTier = (bpRuns && bpRuns.length > 0) ? 'loyalty' : 'standard';
    const priceTierKey = priceTier === 'loyalty' ? 'menu_loyalty' : 'menu';

    // ── Canonical currency comes from the project, not the client ──
    const currency = normalizeCurrency(project.currency || submission.currency || 'EUR');

    // Language IS a genuine user preference — honour their form selection
    // if valid, else fall back.
    const language = ['en', 'fr'].includes(requestedLanguage)
      ? requestedLanguage
      : (project.language || submission.language || 'en');

    const conceptName = submission.concept_name || project.concept_name || 'Your Concept';

    const priceId = getPriceId(priceTierKey, currency);
    if (!priceId) {
      return res.status(500).json({
        error: `Stripe price not configured for ${priceTierKey} / ${currency}. Contact hello@za3fran.io.`
      });
    }

    // ── Store intake in Supabase ──
    const runId = generateRunId();

    const { error: insertError } = await supabase.from('menu_engineer_runs').insert({
      id: runId,
      project_id: project.id,
      currency,
      language,
      status: 'pending_payment',
      output_json: {
        status: 'pending_payment',
        validator_report_id: report.id,
        submission_id: submission.id,
        price_tier: priceTier,
        intake: {
          additional_notes: additional_notes || null,
        },
      },
    });

    if (insertError) {
      console.error('[submit-menu-engineer] failed to save intake', insertError);
      return res.status(500).json({ error: 'Server error. Please try again or contact hello@za3fran.io.' });
    }

    // ── Create Stripe checkout session ──
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://za3fran.io';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      metadata: {
        type: 'menu_engineer',
        intakeId: runId,
        projectId: project.id,
        validatorAccessCode: code,
        currency,
        language,
        priceTier,
        conceptName,
      },
      success_url: `${baseUrl}/menu-engineer?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/menu-engineer`,
      locale: language === 'fr' ? 'fr' : 'en',
    });

    return res.status(200).json({ checkoutUrl: session.url });

  } catch (err) {
    console.error('[submit-menu-engineer] Error:', err);
    return res.status(500).json({ error: 'Server error. Please try again or contact hello@za3fran.io.' });
  }
}
