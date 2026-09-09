// api/verify-menu-access.js
//
// Public, read-only endpoint. Takes a Validator access code, resolves the
// linked project, and returns the concept preview + correct price tier for
// Menu Engineer (standard vs loyalty). No writes happen here — this is a
// lookup only. Side-effecting work (creating the menu_engineer_runs row,
// resolving Stripe price IDs) happens in api/submit-menu-engineer.js.
//
// Uses the same Supabase service credentials as the existing BP Essentials
// and Validator endpoints (SUPABASE_URL / SUPABASE_SERVICE_KEY) — no
// new env vars needed here.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TENANT_ID = 'za3fran';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error_code: 'method_not_allowed', error: 'Method not allowed.' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const rawCode = (body.access_code || '').toString().trim().toUpperCase();

    if (!rawCode || rawCode.length < 6) {
      return res.status(400).json({
        error_code: 'invalid_code',
        error: 'Please enter your access code.'
      });
    }

    // 1. Look up the Validator report by access code
    const { data: report, error: reportErr } = await supabase
      .from('validator_reports')
      .select('id, submission_id, report_html')
      .eq('access_code', rawCode)
      .eq('tenant_id', TENANT_ID)
      .maybeSingle();

    if (reportErr) {
      console.error('verify-menu-access: validator_reports lookup failed', reportErr);
      return res.status(500).json({ error_code: 'server_error', error: 'Something went wrong — please try again.' });
    }

    if (!report) {
      return res.status(404).json({
        error_code: 'not_found',
        error: 'We couldn\u2019t find that access code. Please check your email and try again.'
      });
    }

    if (!report.report_html) {
      return res.status(409).json({
        error_code: 'report_pending',
        error: 'Your Validator report is still being generated. Please try again in a few minutes.'
      });
    }

    // 2. Pull concept data from the linked submission
    const { data: submission, error: subErr } = await supabase
      .from('validator_submissions')
      .select('id, concept_name, concept_type, cuisine, city, currency, language')
      .eq('id', report.submission_id)
      .maybeSingle();

    if (subErr || !submission) {
      console.error('verify-menu-access: validator_submissions lookup failed', subErr);
      return res.status(500).json({ error_code: 'server_error', error: 'Something went wrong — please try again.' });
    }

    // 3. Resolve the project (created during BP Essentials backfill / Validator flow)
    const { data: project, error: projErr } = await supabase
      .from('za3fran_projects')
      .select('id, currency, language, concept_name')
      .eq('validator_submission_id', submission.id)
      .eq('tenant_id', TENANT_ID)
      .maybeSingle();

    if (projErr) {
      console.error('verify-menu-access: za3fran_projects lookup failed', projErr);
      return res.status(500).json({ error_code: 'server_error', error: 'Something went wrong — please try again.' });
    }

    if (!project) {
      // Data integrity issue — every Validator submission should have a linked
      // project since the Phase 4 backfill. Don't silently create one here;
      // this is read-only. Surface a clear error so it gets flagged.
      console.error('verify-menu-access: no project found for submission', submission.id);
      return res.status(500).json({
        error_code: 'project_missing',
        error: 'We found your report but couldn\u2019t link it to a project. Please contact hello@za3fran.io.'
      });
    }

    // 4. Determine price tier — loyalty if a completed BP Essentials run exists for this project
    const { data: bpRuns, error: bpErr } = await supabase
      .from('business_plan_essentials_runs')
      .select('id')
      .eq('project_id', project.id)
      .not('output_html', 'is', null)
      .limit(1);

    if (bpErr) {
      console.error('verify-menu-access: business_plan_essentials_runs lookup failed', bpErr);
      // Non-fatal — default to standard pricing rather than blocking the user
    }

    const priceTier = (bpRuns && bpRuns.length > 0) ? 'loyalty' : 'standard';

    // 5. Build a short concept preview line
    const detailParts = [submission.concept_type, submission.cuisine, submission.city].filter(Boolean);
    const conceptDetail = detailParts.join(' \u00b7 ');

    const currency = project.currency || submission.currency || 'EUR';
    const language = project.language || submission.language || 'en';

    return res.status(200).json({
      project_id: project.id,
      concept_name: submission.concept_name || project.concept_name || '',
      concept_detail: conceptDetail,
      currency: currency,
      language: language,
      price_tier: priceTier
    });

  } catch (err) {
    console.error('verify-menu-access: unexpected error', err);
    return res.status(500).json({ error_code: 'server_error', error: 'Something went wrong — please try again.' });
  }
};
