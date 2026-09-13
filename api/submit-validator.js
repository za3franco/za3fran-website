// api/submit-validator.js
// 1. Saves submission to Supabase
// 2. Creates Stripe checkout session (Validator only OR Validator+BP bundle)
// 3. Returns checkout URL to the frontend
//
// v2 fix: the Supabase save is now BLOCKING. Previously this used a bare
// fetch() and never checked response.ok, so a failed insert (e.g. a column
// mismatch, or Supabase being briefly unreachable) was silently swallowed
// and the code proceeded straight to Stripe checkout anyway — letting a
// customer pay for a report that could never be generated, since nothing
// was ever saved to build it from. Now: if the save fails, checkout is
// never created, and the person sees a clear error instead of paying for
// nothing.

import Stripe from 'stripe';
import { getPriceId, normalizeCurrency } from '../lib/currency.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  const data = req.body;

  if (!data || !data.email || !data.concept_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const currency = normalizeCurrency(data.currency || 'EUR');
  // purchaseType: 'validator' (default), 'bundle' (Validator + BP),
  // 'bundle_menu' (Validator + Menu Engineer), or 'bundle_full' (all three)
  const VALID_PURCHASE_TYPES = ['validator', 'bundle', 'bundle_menu', 'bundle_full'];
  const purchaseType = VALID_PURCHASE_TYPES.includes(data.purchase_type) ? data.purchase_type : 'validator';

  // ── STEP 1: Save to Supabase — now blocking ──
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[submit-validator] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.');
    return res.status(500).json({ error: 'Server configuration error. Please contact hello@za3fran.io.' });
  }

  try {
    const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/validator_submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        // Contact
        name:            data.name,
        email:           data.email,
        country:         data.country,
        role:            data.role,
        // Concept
        concept_name:    data.concept_name,
        concept_type:    data.type,
        cuisine:         data.cuisine,
        description:     data.description,
        differentiation: data.differentiation,
        // Location
        city:            data.city,
        neighbourhood:   data.neighbourhood,
        audience:        data.audience,
        // Financials
        budget:          data.budget,
        ticket:          data.ticket,
        covers:          data.covers,
        seats:           data.seats,
        opening_hours:   data.opening_hours,
        // Competition
        competitors:     data.competitors,
        market_gap:      data.market_gap,
        // Context
        stage:           data.stage,
        timeline:        data.timeline,
        additional:      data.additional,
        // Meta
        currency:        currency,
        language:        data.language,
        purchase_type:   purchaseType,   // ← stored so webhook knows what was bought
        status:          'pending_payment',
        submitted_at:    data.submitted_at || new Date().toISOString(),
      }),
    });

    if (!supabaseResponse.ok) {
      const errorBody = await supabaseResponse.text();
      console.error('[submit-validator] Supabase save FAILED:', supabaseResponse.status, errorBody);
      return res.status(500).json({
        error: 'We could not save your submission. Please try again — if this keeps happening, contact hello@za3fran.io.',
      });
    }
  } catch (supabaseErr) {
    console.error('[submit-validator] Supabase save error (network/exception):', supabaseErr);
    return res.status(500).json({
      error: 'We could not save your submission. Please try again — if this keeps happening, contact hello@za3fran.io.',
    });
  }

  // ── STEP 2: Create Stripe checkout session ──
  // Only reached if the Supabase save above actually succeeded.
  try {
    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://za3fran.io';

    // Resolve correct price ID from lib/currency.js
    // 'validator' → Validator only · 'bundle' → Validator + BP
    // 'bundle_menu' → Validator + Menu Engineer · 'bundle_full' → all three
    const priceId = getPriceId(purchaseType, currency);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: data.email,
      metadata: {
        submitter_name: data.name,
        concept_name:   data.concept_name,
        city:           data.city,
        currency:       currency,
        language:       data.language || 'en',
        purchase_type:  purchaseType,  // ← webhook reads this to decide whether to chain BP
      },
      success_url: `${baseUrl}/validator/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/validator`,
      locale: data.language === 'fr' ? 'fr' : 'en',
    });

    return res.status(200).json({ checkoutUrl: session.url });

  } catch (stripeErr) {
    console.error('[submit-validator] Stripe session error:', stripeErr);
    return res.status(500).json({ error: 'Payment session creation failed' });
  }
}
