// =============================================================
// /api/webhook-validator.js
// Za3fran Concept Validator — Stripe Webhook Handler
//
// Flow (Validator only):
// 1. Receive checkout.session.completed from Stripe
// 2. Verify Stripe signature
// 3. Look up submission in Supabase by email
// 4. Generate report HTML via Claude API
// 5. Extract report_json via Haiku
// 6. Create/upsert za3fran_user + za3fran_project records
// 7. Resolve the project's unified access code (mint on first
//    purchase, reuse on every purchase after) — see /lib/project-access.js
// 8. Store report HTML + report_json in validator_reports, tagged
//    with that same unified code
// 9. Update submission: status → 'paid', set report_id
// 10. Send delivery email via Brevo, including a link to the
//     unified project dashboard (/project.html)
//
// Additional flow (Bundle variants):
// 11a. purchase_type 'bundle' or 'bundle_full' → create pending BP run
//      record in business_plan_essentials_runs, tagged with the SAME
//      unified access code — not a separately minted one
// 11b. purchase_type 'bundle_menu' or 'bundle_full' → create pending
//      Menu Engineer run record in menu_engineer_runs (ready for
//      on-demand generation — no separate intake form was filled
//      since the customer bought via the bundle CTA, so intake
//      notes are empty and can be filled in via regeneration later),
//      also tagged with the SAME unified access code
// 12. Send single combined delivery email with all purchased report
//     links plus the dashboard link
//
// v3.1 fix: the Validator-only upsell section in the delivery email
// previously showed the Business Plan add-on price as "€499 (was
// €599)". €599 was never a real charged price for the standalone BP
// add-on — it was an inflated anchor number that was never live (see
// Workstream 2 pricing correction). Worse, €599 is now the REAL price
// of the Validator+BP bundle, a different product — reusing it here as
// a fake "was" price would actively mislead a customer who later sees
// the genuine €599 bundle elsewhere. Fixed to state the real €499 rate
// plainly, with no fabricated "was" price.
// =============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { Agent, setGlobalDispatcher } from 'undici';
import { getModel } from '../lib/claude-config.js';
import { getDisplayPrice, normalizeCurrency } from '../lib/currency.js';
import { getOrCreateProjectAccessCode } from '../lib/project-access.js';
import { ensureTagged } from '../lib/crr-tagging.js';
import { SYSTEM_PROMPT, buildReportPrompt, extractReportJson } from '../lib/validator-generate.js';
import CR from '../lib/concept-record.js';
import { generateValidatorV2, isV2Record, notifyZa3fran, qaNotice } from '../lib/validator-v2-run.js';

// ── Raise Node's default fetch timeout ──────────────────────────
// Node's built-in fetch (undici) times out waiting for a response after
// 300s by default — independent of, and shorter than, Vercel's own
// maxDuration for this function (800s, see vercel.json). A single
// 32,000-token Claude generation can legitimately take longer than 300s
// to return anything at all (Anthropic's non-streaming endpoint sends
// nothing until the full response is ready), so without this the fetch
// to Anthropic gets killed by Node itself well before Vercel's own
// timeout would ever fire. This raises that ceiling to just under the
// function's maxDuration, leaving headroom for the rest of the work
// (JSON extraction, Supabase writes, email send) to still complete.
setGlobalDispatcher(new Agent({
  headersTimeout: 750_000,
  bodyTimeout: 750_000,
}));

// ── Clients ──────────────────────────────────────────────────
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Vercel config ─────────────────────────────────────────────
export const config = {
  api: { bodyParser: false },
};

// ── Helper: read raw body ─────────────────────────────────────
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Main handler ──────────────────────────────────────────────
// ── Recovery of a paid report stuck at report_error (29 Oct 2026) ──
// GET /api/webhook-validator?recover=<Stripe checkout session id>. The link is in the failure notice sent to
// hello@za3fran.io. Safe without a secret: the session is fetched from Stripe (paid), its submission must be the
// one at report_error, and the claim is atomic (report_error -> processing), so a second click does nothing.
async function recover(req, res) {
  const sid = String(req.query.recover || '');
  const page = (title, body, code = 200) => res.status(code).setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="background:#0a0e18;color:#FAFAF7;font-family:system-ui,sans-serif;padding:32px;max-width:560px;margin:auto"><h2 style="color:#E7A63E">${title}</h2><p>${body}</p></body>`);
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return page('Invalid link', 'This recovery link is not valid.', 400);
  let session;
  try { session = await stripe.checkout.sessions.retrieve(sid); } catch (e) { return page('Not found', 'Stripe does not know this session.', 404); }
  if (session.payment_status !== 'paid') return page('Not paid', 'This Stripe session is not paid.', 409);
  const email = session.customer_details?.email || session.customer_email;
  const submissionId = session.metadata?.submission_id || null;
  if (!email || !submissionId) return page('Not recoverable', 'This session has no submission attached (older checkout): recover it by hand.', 409);
  const { data: sub } = await withRetry(() => supabase.from('validator_submissions').select('id, status, concept_name').eq('id', submissionId).limit(1));
  const row = sub && sub[0];
  if (!row) return page('Not found', 'No submission matches this session.', 404);
  if (row.status !== 'report_error') return page('Nothing to do', `This submission is at status <b>${row.status}</b>: only a report in error is relaunched.`, 409);
  console.log(`[recover] relaunching submission ${row.id} (${row.concept_name || ''}) from session ${sid}`);
  waitUntil(processReport(email, sid, session.metadata?.purchase_type || 'validator', row.id, { fromStatus: 'report_error' }));
  return page('Relaunched', `The report for <b>${String(row.concept_name || row.id).replace(/</g, '&lt;')}</b> is being generated again (about 3 minutes). The customer receives the usual delivery email when it is ready; if it fails again, a new notice reaches hello@za3fran.io.`);
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query && req.query.recover) return recover(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read raw body:', err);
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET_VALIDATOR
    );
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const customerEmail = session.customer_details?.email || session.customer_email;
  const purchaseType  = session.metadata?.purchase_type || 'validator';

  if (!customerEmail) {
    console.error('No email found in Stripe session:', session.id);
    return res.status(200).json({ received: true, error: 'No email in session' });
  }

  console.log(`Payment confirmed for: ${customerEmail}, type: ${purchaseType}, session: ${session.id}`);

  waitUntil(processReport(customerEmail, session.id, purchaseType, session.metadata?.submission_id || null));
  return res.status(200).json({ received: true });
}

// ── Helper: retry a Supabase call a few times before giving up ──
// Added after observing repeated transient 'Gateway Timeout' errors from
// Supabase's REST layer (PostgREST) in production — direct SQL against
// the same database succeeded instantly each time these hit, pointing to
// an intermittent network/gateway blip rather than a data or code issue.
// A single blip should not cost a customer their already-paid-for report.
async function withRetry(fn, attempts = 3, delayMs = 1500) {
  let lastResult;
  for (let i = 0; i < attempts; i++) {
    lastResult = await fn();
    if (!lastResult.error) return lastResult;
    console.error(`[withRetry] Attempt ${i + 1}/${attempts} failed:`, lastResult.error.message || lastResult.error);
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return lastResult;
}

// ── Async report processing ───────────────────────────────────
async function processReport(customerEmail, sessionId, purchaseType, submissionId = null, { fromStatus = 'pending_payment' } = {}) {
  console.log(`[processReport] Starting for: ${customerEmail}, type: ${purchaseType}`);

  // ── Step 1: Look up submission (with retry — see withRetry above) ──
  // The submission id travels in the Stripe session (submit-validator, since 29 Oct 2026);
  // older sessions fall back to the customer's latest pending submission.
  const { data: submissions, error: fetchError } = await withRetry(() => {
    let q = supabase.from('validator_submissions').select('*').eq('status', fromStatus);
    q = submissionId ? q.eq('id', submissionId) : q.eq('email', customerEmail);
    return q.order('created_at', { ascending: false }).limit(1);
  });

  if (fetchError || !submissions || submissions.length === 0) {
    console.error('No matching submission found for:', customerEmail, fetchError);
    return;
  }

  const submission = submissions[0];
  console.log(`Found submission: ${submission.id} for concept: ${submission.concept_name}`);

  // ── Atomic claim — prevents two overlapping webhook executions (e.g.
  // from a Stripe retry landing while a slow first attempt is still
  // running) from both processing the same submission and both sending
  // a report + email. The UPDATE's .eq('status','pending_payment')
  // condition means only ONE concurrent request can actually match and
  // update this row; Postgres guarantees that at the row level. Every
  // other concurrent request gets zero rows back and bails out here.
  const { data: claimed, error: claimError } = await supabase
    .from('validator_submissions')
    .update({ status: 'processing' })
    .eq('id', submission.id)
    .eq('status', fromStatus)
    .select('id');

  if (claimError || !claimed || claimed.length === 0) {
    console.log(`[processReport] Submission ${submission.id} already claimed by another run — skipping duplicate.`);
    return;
  }

  // ── Step 2 (v2, val-2.0.0): submissions from the v2 form carry concept_v2 ──
  // Figures from the financial engine, checked text, fixed template; report_json built in code.
  const v2Record = submission.concept_v2 ? CR.fromSubmission(submission) : null;
  const useV2 = !!(v2Record && isV2Record(v2Record));
  let reportHtml;
  let reportJson = null;
  if (useV2) {
    let r = null;
    for (let attempt = 1; attempt <= 2 && !(r && r.ok); attempt++) {
      try {
        r = await generateValidatorV2(supabase, v2Record, { meta: { submission_id: submission.id, purchase_type: purchaseType, record_version: 1 } });
        console.log(`[processReport] v2 attempt ${attempt}: ${r.ok ? 'ok' : 'qa_failed'} ${JSON.stringify(r.audit)}`);
      } catch (err) {
        console.error(`[processReport] v2 attempt ${attempt} failed:`, err && err.stack || err);
        r = { ok: false, errors: [{ where: 'pipeline', code: 'exception', detail: String(err && err.message || err) }] };
      }
    }
    if (!r || !r.ok) {
      await supabase.from('validator_submissions').update({ status: 'report_error' }).eq('id', submission.id);
      await notifyZa3fran(`Validator v2 report failed — ${submission.concept_name || submission.id} (paid)`,
        qaNotice(`${submission.concept_name || ''} (submission ${submission.id}, ${customerEmail})`, r && r.errors)
        + (sessionId ? `<p><a href="https://www.za3fran.io/api/webhook-validator?recover=${encodeURIComponent(sessionId)}">Relancer la génération et la livraison / Relaunch generation and delivery</a></p>` : ''));
      return;
    }
    reportHtml = r.html;
    reportJson = r.json;
  } else {
    // ── Step 2: Generate Validator report HTML via Claude ─────────
    const validatorModel = getModel('validator');

    try {
      console.log(`Calling Claude (${validatorModel}) for Validator report...`);
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: validatorModel,
          max_tokens: 32000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildReportPrompt(submission) }],
        }),
      });

      const anthropicData = await anthropicResponse.json();

      if (!anthropicResponse.ok) {
        throw new Error(`Anthropic API error: ${anthropicData.error?.message || JSON.stringify(anthropicData)}`);
      }

      // Find the text block by type — never assume content[0] (a thinking
      // block can precede it). See project rules, Principle 3.
      const reportTextBlock = (anthropicData.content || []).find(b => b.type === 'text');
      if (!reportTextBlock || !reportTextBlock.text) {
        throw new Error('Anthropic API returned empty content');
      }

      reportHtml = reportTextBlock.text.trim();

      if (!reportHtml.startsWith('<!DOCTYPE') && !reportHtml.startsWith('<html')) {
        throw new Error('Anthropic did not return valid HTML. Got: ' + reportHtml.substring(0, 200));
      }

      console.log(`Validator report HTML generated. Length: ${reportHtml.length} chars`);
    } catch (err) {
      console.error('Claude API Validator report generation failed:', err);
      await supabase
        .from('validator_submissions')
        .update({ status: 'report_error' })
        .eq('id', submission.id);
      return;
    }

    // ── Step 3: Extract report_json via Haiku (non-fatal) ─────────
    try {
      reportJson = await extractReportJson(reportHtml, submission);
      console.log('report_json extracted successfully.');
    } catch (err) {
      console.error('[Phase 4] report_json extraction failed (non-fatal):', err.message);
    }
  }

  // ── Step 4: Create/upsert user + project records ───────────────
  // (Moved ahead of report insert — we need projectId in hand before we
  // can resolve the project's unified access code in Step 5.)
  let userId    = null;
  let projectId = null;

  try {
    const { data: existingUser } = await supabase
      .from('za3fran_users')
      .select('id')
      .eq('email', customerEmail)
      .single();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser } = await supabase
        .from('za3fran_users')
        .insert({
          email:             customerEmail,
          name:              submission.name || '',
          default_currency:  submission.currency || 'EUR',
          default_language:  submission.language || 'en',
        })
        .select('id')
        .single();
      userId = newUser?.id || null;
    }

    if (userId) {
      const { data: existingProject } = await supabase
        .from('za3fran_projects')
        .select('id')
        .eq('validator_submission_id', submission.id)
        .single();

      if (existingProject) {
        projectId = existingProject.id;
      } else {
        const { data: newProject } = await supabase
          .from('za3fran_projects')
          .insert({
            user_id:                  userId,
            concept_name:             submission.concept_name || 'Untitled',
            validator_submission_id:  submission.id,
            // Project currency = currency of the project's amounts (project country), not the payment currency.
            currency:                 (v2Record && v2Record.currency) || submission.currency || 'EUR',
            language:                 submission.language || 'en',
          })
          .select('id')
          .single();
        projectId = newProject?.id || null;
      }
    }

    console.log(`User + project records created/verified for ${customerEmail}`);
  } catch (err) {
    console.error('User/project creation failed (non-fatal):', err.message);
  }

  // ── Step 5: Resolve the project's unified access code ──────────
  // First purchase on this project mints the code; every subsequent
  // purchase (BP, Menu, or another Validator run under the same project)
  // reuses this exact same code. This is now the ONLY access code the
  // customer ever needs, and the only one shown in delivery emails.
  const accessCode = await getOrCreateProjectAccessCode(supabase, projectId);

  // ── Step 5b (v2): the project's concept record, version 1 (read by the review and the BP intake) ──
  if (v2Record && projectId) {
    try {
      const { error: crErr } = await supabase.from('concept_records').insert({ project_id: projectId, version: 1, data: v2Record, source: 'validator_form', schema: CR.RECORD_VERSION });
      if (crErr && !/duplicate key/i.test(crErr.message || '')) console.error('[processReport] concept record insert failed (non-fatal):', crErr.message);
    } catch (err) { console.error('[processReport] concept record insert failed (non-fatal):', err.message); }
  }

  // ── Step 6: Save Validator report, tagged with the unified code ──
  const reportId = `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const { error: insertError } = await supabase
    .from('validator_reports')
    .insert({
      id:          reportId,
      submission_id: submission.id,
      report_html: reportHtml,
      report_json: reportJson,
      access_code: accessCode,
      created_at:  new Date().toISOString(),
    });

  if (insertError) {
    console.error('Failed to store Validator report in Supabase:', insertError);
    return;
  }

  console.log(`Validator report stored. ID: ${reportId}, Code: ${accessCode}`);

  // ── Step 7: Update submission status ──────────────────────────
  await supabase
    .from('validator_submissions')
    .update({ status: 'paid', report_id: reportId })
    .eq('id', submission.id);

  // ── Step 8a: If BP bundle — create pending BP run record ──────
  // Reuses the unified project accessCode — does NOT mint its own.
  let bpReportId   = null;
  let bpAccessCode = null;

  if (purchaseType === 'bundle' || purchaseType === 'bundle_full') {
    try {
      bpReportId   = `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      bpAccessCode = accessCode;

      await supabase.from('business_plan_essentials_runs').insert({
        id:          bpReportId,
        project_id:  projectId,
        output_html: null,
        access_code: bpAccessCode,
        currency:    (v2Record && v2Record.currency) || submission.currency || 'EUR',
        language:    submission.language || 'en',
        model_used:  getModel('essentials'),
        output_json: {
          validator_report_id: reportId,
          submission_id:       submission.id,
          status:              'pending',
        },
      });

      console.log(`[Bundle] BP pending record created: ${bpReportId} (shared code ${bpAccessCode})`);
    } catch (err) {
      console.error('[Bundle] BP record creation failed (non-fatal):', err.message);
      bpReportId   = null;
      bpAccessCode = null;
    }
  }

  // ── Step 8b: If Menu bundle — create pending Menu Engineer run ──
  // Reuses the unified project accessCode — does NOT mint its own.
  let menuReportId   = null;
  let menuAccessCode = null;

  if (purchaseType === 'bundle_menu' || purchaseType === 'bundle_full') {
    try {
      menuReportId   = `me_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      menuAccessCode = accessCode;

      await supabase.from('menu_engineer_runs').insert({
        id:          menuReportId,
        project_id:  projectId,
        output_html: null,
        output_xlsx_url: null,
        access_code: menuAccessCode,
        currency:    (v2Record && v2Record.currency) || submission.currency || 'EUR',
        language:    submission.language || 'en',
        status:      'pending_generation',
        model_used:  getModel('menuEngineer'),
        output_json: {
          status:               'pending_generation',
          validator_report_id:  reportId,
          submission_id:        submission.id,
          intake: {
            // No separate intake form was filled for a bundle purchase —
            // the customer can regenerate later with specific notes if needed.
            additional_notes: null,
          },
        },
      });

      console.log(`[Bundle] Menu Engineer pending record created: ${menuReportId} (shared code ${menuAccessCode})`);
    } catch (err) {
      console.error('[Bundle] Menu Engineer record creation failed (non-fatal):', err.message);
      menuReportId   = null;
      menuAccessCode = null;
    }
  }

  // ── Step 9: Send delivery email ───────────────────────────────
  const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';
  // Direct viewer link with the access code (the /report/:id rewrite 404s on Vercel).
  const reportUrl   = `${BASE_URL}/api/report-viewer?id=${encodeURIComponent(reportId)}&code=${encodeURIComponent(accessCode)}`;
  // Business Plan price in the currency the customer paid in ('MAD 4 990' / '€499' / '$549').
  const bpPriceEn   = getDisplayPrice('essentials_returning', normalizeCurrency(submission.currency || 'EUR'));
  const bpPriceFr   = bpPriceEn.replace(/^€\s*(.+)$/, '$1 €').replace(/^\$\s*(.+)$/, '$1 $').replace(/^MAD\s*(.+)$/, '$1 MAD');
  const dashboardUrl = `${BASE_URL}/project.html?code=${encodeURIComponent(accessCode)}`;
  const conceptName = submission.concept_name || 'your concept';
  const firstName   = submission.name ? submission.name.split(' ')[0] : 'there';
  const isFr        = submission.language === 'fr' ||
    (submission.description && /[àâäéèêëîïôöùûüçœæ]/i.test(submission.description));

  const hasBP   = (purchaseType === 'bundle' || purchaseType === 'bundle_full') && bpReportId;
  const hasMenu = (purchaseType === 'bundle_menu' || purchaseType === 'bundle_full') && menuReportId;
  const isBundle = hasBP || hasMenu;

  let bundleLabel_en = 'Concept Validator';
  let bundleLabel_fr = 'Concept Validator';
  if (hasBP && hasMenu) {
    bundleLabel_en = 'Validator + Business Plan + Menu Engineer';
    bundleLabel_fr = 'Validator + Business Plan + Menu Engineer';
  } else if (hasBP) {
    bundleLabel_en = 'Validator + Business Plan Essentials';
    bundleLabel_fr = 'Validator + Business Plan Essentials';
  } else if (hasMenu) {
    bundleLabel_en = 'Validator + Menu Engineer';
    bundleLabel_fr = 'Validator + Menu Engineer';
  }

  const emailSubject = isFr
    ? (isBundle
        ? `Vos livrables Za3fran sont prêts — ${conceptName}`
        : `Votre rapport Za3fran est prêt — ${conceptName}`)
    : (isBundle
        ? `Your Za3fran deliverables are ready — ${conceptName}`
        : `Your Za3fran report is ready — ${conceptName}`);

  // ── Dashboard section — NEW, additive. Points every customer at the
  //    unified project dashboard, regardless of how many tools they
  //    bought. Sits right under the main access code box. ────────────
  const dashboardSection_en = `
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${dashboardUrl}" style="display:inline-block;background:none;border:1px solid #C9862A;color:#C9862A;text-decoration:none;padding:12px 32px;font-size:13px;border-radius:2px;">Go to my project dashboard →</a>
  </div>
  <p style="color:#888880;font-size:13px;text-align:center;margin:0 0 32px;">Your dashboard lists every Za3fran tool for this project in one place — bookmark it.</p>`;

  const dashboardSection_fr = `
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${dashboardUrl}" style="display:inline-block;background:none;border:1px solid #C9862A;color:#C9862A;text-decoration:none;padding:12px 32px;font-size:13px;border-radius:2px;">Accéder à mon tableau de bord →</a>
  </div>
  <p style="color:#888880;font-size:13px;text-align:center;margin:0 0 32px;">Votre tableau de bord regroupe tous vos outils Za3fran pour ce projet — mettez-le en favori.</p>`;

  // ── BP section (bundle / bundle_full) ──────────────────────────
  // v14: the plan is built on the founder's own figures — the first step is the intake form.
  const bpUrl = bpReportId ? `${BASE_URL}/bp-intake?code=${encodeURIComponent(accessCode)}` : null;

  // Readiness review first (it can amend seats, ticket or covers that pre-fill the figures form).
  const reviewUrl = `${BASE_URL}/readiness-review.html?code=${encodeURIComponent(accessCode)}`;
  const bpSection_en = hasBP ? `
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">
  <p style="font-family:Georgia,serif;font-size:18px;color:#0F1F3D;margin:0 0 12px;">Your Business Plan Essentials — three steps</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#C9862A;color:#FAFAF7;font-size:12px;font-weight:700;">1</span></td><td style="color:#1a1a1a;line-height:1.65;padding:0 0 10px;font-size:14px;"><strong>Read your Validator report</strong> (link above).</td></tr><tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#C9862A;color:#FAFAF7;font-size:12px;font-weight:700;">2</span></td><td style="color:#1a1a1a;line-height:1.65;padding:0 0 10px;font-size:14px;"><strong>Complete your readiness review</strong> — about 10 minutes. For each point the Validator raised, change your concept, accept the risk or correct a fact. Your answers can change your seats, ticket or covers, which feed your figures.</td></tr><tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#C9862A;color:#FAFAF7;font-size:12px;font-weight:700;">3</span></td><td style="color:#1a1a1a;line-height:1.65;padding:0 0 10px;font-size:14px;"><strong>Enter your figures</strong> — about 15 minutes; Za3fran can estimate the team and the investment for you. Your plan (a business plan for your bank and a preparation report for you) is generated as soon as both steps are done.</td></tr></table>
  <div style="text-align:center;margin:0 0 24px;">
    <a href="${reviewUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:14px 30px;font-size:14px;font-weight:600;border-radius:2px;margin:0 6px 10px;">Complete my readiness review →</a><a href="${bpUrl}" style="display:inline-block;background:#0F1F3D;color:#C9862A;text-decoration:none;padding:14px 30px;font-size:14px;font-weight:600;border-radius:2px;margin:0 6px 10px;">Enter my figures →</a>
  </div>
  <p style="color:#888880;font-size:13px;margin:0 0 24px;">Same access code as above.</p>` : '';

  const bpSection_fr = hasBP ? `
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">
  <p style="font-family:Georgia,serif;font-size:18px;color:#0F1F3D;margin:0 0 12px;">Votre Business Plan Essentials — trois étapes</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#C9862A;color:#FAFAF7;font-size:12px;font-weight:700;">1</span></td><td style="color:#1a1a1a;line-height:1.65;padding:0 0 10px;font-size:14px;"><strong>Lisez votre rapport Validator</strong> (lien ci-dessus).</td></tr><tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#C9862A;color:#FAFAF7;font-size:12px;font-weight:700;">2</span></td><td style="color:#1a1a1a;line-height:1.65;padding:0 0 10px;font-size:14px;"><strong>Faites votre revue de préparation</strong> — environ 10 minutes. Pour chaque point relevé par le Validator : modifiez le concept, acceptez le risque ou corrigez un fait. Vos réponses peuvent changer vos places, votre ticket ou vos couverts, qui alimentent vos chiffres.</td></tr><tr><td style="vertical-align:top;padding:0 12px 10px 0;"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#C9862A;color:#FAFAF7;font-size:12px;font-weight:700;">3</span></td><td style="color:#1a1a1a;line-height:1.65;padding:0 0 10px;font-size:14px;"><strong>Renseignez vos chiffres</strong> — environ 15 minutes ; Za3fran peut estimer l'équipe et l'investissement pour vous. Votre plan (un business plan pour votre banque et un rapport de préparation pour vous) est généré dès que les deux étapes sont faites.</td></tr></table>
  <div style="text-align:center;margin:0 0 24px;">
    <a href="${reviewUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:14px 30px;font-size:14px;font-weight:600;border-radius:2px;margin:0 6px 10px;">Faire ma revue de préparation →</a><a href="${bpUrl}" style="display:inline-block;background:#0F1F3D;color:#C9862A;text-decoration:none;padding:14px 30px;font-size:14px;font-weight:600;border-radius:2px;margin:0 6px 10px;">Renseigner mes chiffres →</a>
  </div>
  <p style="color:#888880;font-size:13px;margin:0 0 24px;">Même code d'accès que ci-dessus.</p>` : '';

  // ── Menu Engineer section (bundle_menu / bundle_full) ───────────
  const menuUrl = menuReportId ? `${BASE_URL}/api/report-menu-viewer?id=${menuReportId}&access_code=${encodeURIComponent(accessCode)}` : null;

  const menuSection_en = hasMenu ? `
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">
  <p style="font-family:Georgia,serif;font-size:18px;color:#0F1F3D;margin:0 0 12px;">Your Menu Engineer</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Your Menu Engineer deliverables — a Strategy Report and Costing Workbook — are ready to generate. Click below to start (generation takes 3–7 minutes) — same access code as above.</p>
  <div style="text-align:center;margin:0 0 24px;">
    <a href="${menuUrl}" style="display:inline-block;background:#0F1F3D;color:#C9862A;text-decoration:none;padding:14px 36px;font-size:14px;font-weight:600;border-radius:2px;">Access my Menu Engineer →</a>
  </div>` : '';

  const menuSection_fr = hasMenu ? `
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">
  <p style="font-family:Georgia,serif;font-size:18px;color:#0F1F3D;margin:0 0 12px;">Votre Menu Engineer</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Vos livrables Menu Engineer — un rapport stratégique et un classeur de costing — sont prêts à générer. Cliquez ci-dessous pour démarrer (génération : 3–7 minutes) — même code d'accès que ci-dessus.</p>
  <div style="text-align:center;margin:0 0 24px;">
    <a href="${menuUrl}" style="display:inline-block;background:#0F1F3D;color:#C9862A;text-decoration:none;padding:14px 36px;font-size:14px;font-weight:600;border-radius:2px;">Accéder à mon Menu Engineer →</a>
  </div>` : '';

  // Upsell section for Validator-only buyers (BP standalone at the returning-client rate, in the paid currency)
  // v3.1: no fake "was €599" — €499 is simply stated as the real returning-client rate.
  const upsellSection_en = purchaseType === 'validator' ? `
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 12px;"><strong>Next step:</strong> Turn this report into a complete Business Plan with financial projections.</p>
  <p style="color:#888880;font-size:13px;line-height:1.7;margin:0 0 16px;">As a Za3fran client, your Business Plan Essentials is <strong style="color:#C9862A;">${bpPriceEn}</strong> — your exclusive returning-client rate.</p>
  <div style="text-align:center;margin:0 0 8px;">
    <a href="${BASE_URL}/business-plan?code=${accessCode}" style="display:inline-block;background:none;border:1px solid #C9862A;color:#C9862A;text-decoration:none;padding:12px 32px;font-size:13px;border-radius:2px;">Get my Business Plan — ${bpPriceEn} →</a>
  </div>` : '';

  const upsellSection_fr = purchaseType === 'validator' ? `
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 12px;"><strong>Prochaine étape :</strong> Transformez ce rapport en Business Plan complet avec projections financières.</p>
  <p style="color:#888880;font-size:13px;line-height:1.7;margin:0 0 16px;">En tant que client Za3fran, votre Business Plan Essentials est à <strong style="color:#C9862A;">${bpPriceFr}</strong> — tarif fidélité exclusif.</p>
  <div style="text-align:center;margin:0 0 8px;">
    <a href="${BASE_URL}/business-plan?code=${accessCode}" style="display:inline-block;background:none;border:1px solid #C9862A;color:#C9862A;text-decoration:none;padding:12px 32px;font-size:13px;border-radius:2px;">Obtenir mon Business Plan — ${bpPriceFr} →</a>
  </div>` : '';

  const emailHtml = isFr ? `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">
<div style="background:#0F1F3D;padding:40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">${bundleLabel_fr}</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Bonjour ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Votre rapport de validation pour <strong>${conceptName}</strong> est prêt.</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Cliquez ci-dessous et entrez votre code d'accès pour ouvrir votre rapport.</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">Accéder à mon rapport →</a>
  </div>
  <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
    <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Votre code d'accès Za3fran</p>
    <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${accessCode}</p>
  </div>
  ${dashboardSection_fr}
  <p style="color:#888880;font-size:13px;margin:0 0 8px;">Lien direct : <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>
  ${bpSection_fr}
  ${menuSection_fr}
  ${upsellSection_fr}
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:32px 0;">
  <p style="color:#888880;font-size:13px;margin:0;">Questions ? <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
</div>
<div style="background:#0F1F3D;padding:24px 40px;text-align:center;">
  <p style="color:#888880;font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:#C9862A;text-decoration:none;">za3fran.io</a></p>
</div></div></body></html>`
  : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">
<div style="background:#0F1F3D;padding:40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">${bundleLabel_en}</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Hi ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Your validation report for <strong>${conceptName}</strong> is ready.</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Click below and enter your access code to open your report.</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">View my report →</a>
  </div>
  <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
    <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Your Za3fran access code</p>
    <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${accessCode}</p>
  </div>
  ${dashboardSection_en}
  <p style="color:#888880;font-size:13px;margin:0 0 8px;">Direct link: <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>
  ${bpSection_en}
  ${menuSection_en}
  ${upsellSection_en}
  <hr style="border:none;border-top:1px solid #e8e8e4;margin:32px 0;">
  <p style="color:#888880;font-size:13px;margin:0;">Questions? <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
</div>
<div style="background:#0F1F3D;padding:24px 40px;text-align:center;">
  <p style="color:#888880;font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:#C9862A;text-decoration:none;">za3fran.io</a></p>
</div></div></body></html>`;

  try {
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender:      { name: 'Za3fran', email: 'hello@za3fran.io' },
        to:          [{ email: customerEmail, name: submission.name || customerEmail }],
        subject:     emailSubject,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoResponse.ok) {
      const brevoError = await brevoResponse.json();
      console.error('Brevo email failed:', brevoError);
    } else {
      console.log(`Delivery email sent to: ${customerEmail}`);
    }
  } catch (err) {
    console.error('Brevo email error:', err);
  }

  // ── Step 10: CRR per-risk field tagging (§3.18) — non-fatal ──
  // Runs after the delivery email so it never delays the customer.
  // If it fails, the Concept Readiness Review tags on demand instead.
  if (reportJson && !useV2) {
    try {
      await ensureTagged(supabase, reportId);
      console.log(`[CRR] Risk field tagging stored for ${reportId}`);
    } catch (err) {
      console.error('[CRR] Risk field tagging failed (non-fatal, will run on demand):', err.message);
    }
  }

  console.log(`[processReport] Complete. reportId: ${reportId}${hasBP ? `, bpReportId: ${bpReportId}` : ''}${hasMenu ? `, menuReportId: ${menuReportId}` : ''}`);
}
