// ============================================================
// /api/submit-business-plan.js
// Handles Business Plan Essentials checkout initiation.
// User arrives from Validator report upsell CTA with their access code.
// Creates Stripe checkout session and returns the URL.
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getPriceId, getDisplayPrice, normalizeCurrency } from '../lib/currency.js';

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessCode, currency: rawCurrency, language } = req.body;

    if (!accessCode) {
      return res.status(400).json({ error: 'Access code is required.' });
    }

    const currency = normalizeCurrency(rawCurrency || 'EUR');
    const lang     = ['en', 'fr'].includes(language) ? language : 'en';

    // ── Look up the Validator report by access code ──────────
    const { data: report, error: reportError } = await supabase
      .from('validator_reports')
      .select('id, submission_id, report_json, access_code')
      .eq('access_code', accessCode.toUpperCase().trim())
      .single();

    if (reportError || !report) {
      return res.status(404).json({
        error: lang === 'fr'
          ? 'Code d\'accès invalide. Vérifiez votre email de livraison du rapport Validator.'
          : 'Invalid access code. Check your Validator report delivery email.'
      });
    }

    if (!report.report_json) {
      return res.status(422).json({
        error: lang === 'fr'
          ? 'Ce rapport ne contient pas encore les données structurées nécessaires. Contactez hello@za3fran.io.'
          : 'This report does not yet have the structured data required. Contact hello@za3fran.io.'
      });
    }

    // ── Get the submitter's email for Stripe ─────────────────
    const { data: submission } = await supabase
      .from('validator_submissions')
      .select('email, name, concept_name')
      .eq('id', report.submission_id)
      .single();

    const conceptName = submission?.concept_name || 'Your Concept';
    const customerEmail = submission?.email;
    const customerName  = submission?.name;

    // ── Get Stripe price ID ───────────────────────────────────
    const priceId = getPriceId('essentials', currency);
    if (!priceId) {
      return res.status(500).json({
        error: `Stripe price not configured for ${currency}. Contact hello@za3fran.io.`
      });
    }

    // ── Create Stripe checkout session ───────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      customer_email: customerEmail,
      metadata: {
        type:         'business_plan_essentials',
        reportId:     report.id,
        submissionId: report.submission_id,
        accessCode:   accessCode.toUpperCase().trim(),
        currency,
        language:     lang,
        conceptName,
        customerName: customerName || '',
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io'}/business-plan?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.SITE_URL || 'https://www.za3fran.io'}/business-plan`,
    });

    return res.status(200).json({ checkoutUrl: session.url });

  } catch (err) {
    console.error('[submit-business-plan] Error:', err);
    return res.status(500).json({ error: 'Server error. Please try again or contact hello@za3fran.io.' });
  }
}
