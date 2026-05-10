// api/submit-validator.js
// 1. Saves submission to Supabase (feedback loop)
// 2. Creates Stripe checkout session
// 3. Returns checkout URL to the frontend

import Stripe from 'stripe';

// ── PRICE MAP: currency code → Stripe price ID ──
const PRICE_IDS = {
  EUR: 'price_1TVTjYIqDwcwTTU9267YFO9X', // €199
  USD: 'price_1TVTkjIqDwcwTTU9bfCkrJUM', // $219
  MAD: 'price_1TVTmLIqDwcwTTU9UVNjCmDu', // MAD 1990
};

const PRICE_FALLBACK = 'price_1TVTjYIqDwcwTTU9267YFO9X'; // EUR fallback

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

  // ── STEP 1: Save to Supabase ──
  try {
    const supabaseUrl  = process.env.SUPABASE_URL;        // ← set in Vercel env vars
    const supabaseKey  = process.env.SUPABASE_SERVICE_KEY; // ← set in Vercel env vars

    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/validator_submissions`, {
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
          audience:        data.audience,   // array — stored as jsonb
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
          currency:        data.currency,
          language:        data.language,
          status:          'pending_payment', // updated to 'paid' by webhook
          submitted_at:    data.submitted_at || new Date().toISOString(),
        }),
      });
    }
  } catch (supabaseErr) {
    // Log but don't block — payment can still proceed
    console.error('Supabase save error:', supabaseErr);
  }

  // ── STEP 2: Create Stripe checkout session ──
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // ← set in Vercel env vars

    const currency  = data.currency || 'EUR';
    const priceId   = PRICE_IDS[currency] || PRICE_FALLBACK;
    const baseUrl   = process.env.NEXT_PUBLIC_BASE_URL || 'https://za3fran.io';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: data.email,
      metadata: {
        // Pass key fields so the webhook can identify the submission
        submitter_name:  data.name,
        concept_name:    data.concept_name,
        city:            data.city,
        currency:        currency,
        language:        data.language || 'en',
        // Full submission stored in Supabase — use email as lookup key
      },
      success_url: `${baseUrl}/validator/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/validator`,
      locale: data.language === 'fr' ? 'fr' : 'en',
    });

    return res.status(200).json({ checkoutUrl: session.url });

  } catch (stripeErr) {
    console.error('Stripe session error:', stripeErr);
    return res.status(500).json({ error: 'Payment session creation failed' });
  }
}
