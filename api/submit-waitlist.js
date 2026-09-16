// ============================================================
// /api/submit-waitlist.js
// Saves a waitlist signup to Supabase (za3fran_waitlist table).
// Called from the waitlist modal's submitWL() function on
// index.html, platform.html, and pricing.html, ALONGSIDE the
// existing EmailJS calls (not replacing them) — EmailJS keeps
// sending the immediate admin notification + user confirmation
// email, this endpoint is what makes the list of interested
// people queryable later (CSV export, a future campaign, etc.)
// without having to dig through an inbox.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, country, role, tools, message, language } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }

    const { error } = await supabase.from('za3fran_waitlist').insert({
      name: name || null,
      email: email.trim().toLowerCase(),
      country: country || null,
      role: role || null,
      tools: Array.isArray(tools) ? tools : (tools ? [tools] : []),
      message: message || null,
      language: ['en', 'fr'].includes(language) ? language : 'en',
    });

    if (error) {
      console.error('[submit-waitlist] Supabase insert failed:', error);
      return res.status(500).json({ error: 'Could not save your submission. Please try again.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[submit-waitlist] Error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
