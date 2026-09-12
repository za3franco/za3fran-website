// ============================================================
// /api/webhook-menu-engineer.js  (v3 — unified project access code)
// Stripe webhook: payment confirmed → finalize pending intake row
// → send delivery email. Claude generation stays deferred to
// /api/generate-menu.js, triggered on-demand by the report viewer.
//
// v3 change: no longer mints its own access_code for the run.
// Instead resolves the project's single unified access_code via
// /lib/project-access.js — reusing the code from the customer's
// Validator purchase if the project already has one.
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getModel } from '../lib/claude-config.js';
import { getOrCreateProjectAccessCode } from '../lib/project-access.js';

const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody;
  try { rawBody = await getRawBody(req); }
  catch (e) { return res.status(400).json({ error: 'Cannot read body' }); }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET_MENU);
  } catch (e) {
    console.error('[webhook-menu] Signature failed:', e.message);
    return res.status(400).json({ error: `Signature invalid: ${e.message}` });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const meta    = session.metadata || {};

  if (meta.type !== 'menu_engineer') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const customerEmail = session.customer_details?.email || session.customer_email;
  if (!customerEmail) return res.status(200).json({ received: true, error: 'no_email' });

  const runId = meta.intakeId;
  if (!runId) {
    console.error('[webhook-menu] Missing intakeId in session metadata:', session.id);
    return res.status(200).json({ received: true, error: 'no_intake_id' });
  }

  console.log(`[webhook-menu] Payment confirmed: ${customerEmail}, intake: ${runId}`);

  try {
    // ── 1. Fetch the pending intake row ──────────────────────
    const { data: run, error: runError } = await supabase
      .from('menu_engineer_runs')
      .select('id, project_id, currency, language, brand_primary_color, brand_style, logo_provided, status, output_json')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      console.error('[webhook-menu] Pending intake row not found:', runId, runError);
      return res.status(200).json({ received: true, error: 'intake_not_found' });
    }

    // ── 2. Idempotency guard — webhook retries shouldn't double-process ──
    if (run.status !== 'pending_payment') {
      console.log(`[webhook-menu] Run ${runId} already processed (status: ${run.status}). Skipping.`);
      return res.status(200).json({ received: true, skipped: true, reason: 'already_processed' });
    }

    // ── 3. Look up name for personalization (from the Validator's user record) ──
    let customerName = '';
    let conceptName  = meta.conceptName || 'your concept';

    if (run.project_id) {
      const { data: project } = await supabase
        .from('za3fran_projects')
        .select('user_id, concept_name')
        .eq('id', run.project_id)
        .single();

      if (project) {
        conceptName = project.concept_name || conceptName;
        if (project.user_id) {
          const { data: user } = await supabase
            .from('za3fran_users')
            .select('name')
            .eq('id', project.user_id)
            .single();
          customerName = user?.name || '';
        }
      }
    }

    // ── 4. Resolve the project's unified access code, finalize run ──
    const accessCode = await getOrCreateProjectAccessCode(supabase, run.project_id);
    const mergedOutputJson = {
      ...(run.output_json || {}),
      status: 'pending_generation',
      stripe_session_id: session.id,
      paid_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('menu_engineer_runs')
      .update({
        access_code: accessCode,
        status:      'pending_generation',
        model_used:  getModel('menuEngineer'),
        output_json: mergedOutputJson,
      })
      .eq('id', runId);

    if (updateError) {
      console.error('[webhook-menu] Failed to finalize run record:', updateError);
      return res.status(200).json({ received: true, error: 'update_failed' });
    }

    console.log(`[webhook-menu] Run finalized: ${runId} (shared code ${accessCode})`);

    // ── 5. Send delivery email via Brevo ──────────────────────
    const BASE_URL    = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';
    const reportUrl   = `${BASE_URL}/api/report-menu-viewer?id=${runId}&code=${encodeURIComponent(accessCode)}`;
    const dashboardUrl = `${BASE_URL}/project.html?code=${encodeURIComponent(accessCode)}`;
    const firstName   = customerName ? customerName.split(' ')[0] : (meta.language === 'fr' ? 'bonjour' : 'there');
    const isFr        = meta.language === 'fr';

    const subject = isFr
      ? `Votre pack Menu Engineer — ${conceptName}`
      : `Your Menu Engineer package — ${conceptName}`;

    const html = isFr ? `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">
<div style="background:#0F1F3D;padding:40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Menu Engineer</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Bonjour ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Votre paiement pour <strong>${conceptName}</strong> est confirmé. Vos livrables Menu Engineer sont en cours de préparation :</p>
  <ul style="color:#1a1a1a;line-height:1.9;margin:0 0 24px;padding-left:20px;">
    <li>Rapport stratégique — architecture, psychologie des prix, projection Stars/Plowhorses/Puzzles/Dogs, sourcing fournisseurs</li>
    <li>Classeur de costing — un onglet par recette avec formules dynamiques, récap sales-mix, liste de marché</li>
  </ul>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Cliquez sur le bouton ci-dessous pour accéder à vos livrables. La première ouverture déclenchera la génération (quelques minutes).</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">Accéder à mes livrables →</a>
  </div>
  <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
    <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Votre code d'accès Za3fran</p>
    <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${accessCode}</p>
  </div>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${dashboardUrl}" style="display:inline-block;background:none;border:1px solid #C9862A;color:#C9862A;text-decoration:none;padding:12px 32px;font-size:13px;border-radius:2px;">Accéder à mon tableau de bord →</a>
  </div>
  <p style="color:#888880;font-size:13px;margin:0 0 8px;">Lien direct : <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>
  <p style="color:#888880;font-size:13px;margin:0 0 24px;">1 régénération gratuite est incluse avec votre achat, accessible depuis votre rapport.</p>
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
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Menu Engineer</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Hi ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Your payment for <strong>${conceptName}</strong> is confirmed. Your Menu Engineer deliverables are being prepared:</p>
  <ul style="color:#1a1a1a;line-height:1.9;margin:0 0 24px;padding-left:20px;">
    <li>Strategy Report — menu architecture, pricing psychology, Stars/Plowhorses/Puzzles/Dogs projection, supplier sourcing</li>
    <li>Costing Workbook — one tab per recipe with live formulas, sales-mix recap, market ordering list</li>
  </ul>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Click below to access your deliverables. The first time you open it, generation will start automatically (a few minutes).</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">Access my deliverables →</a>
  </div>
  <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
    <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Your Za3fran access code</p>
    <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${accessCode}</p>
  </div>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${dashboardUrl}" style="display:inline-block;background:none;border:1px solid #C9862A;color:#C9862A;text-decoration:none;padding:12px 32px;font-size:13px;border-radius:2px;">Go to my project dashboard →</a>
  </div>
  <p style="color:#888880;font-size:13px;margin:0 0 8px;">Direct link: <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>
  <p style="color:#888880;font-size:13px;margin:0 0 24px;">1 free regeneration is included with your purchase, accessible from your report.</p>
  <p style="color:#888880;font-size:13px;margin:0;">Questions? <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
</div>
<div style="background:#0F1F3D;padding:24px 40px;text-align:center;">
  <p style="color:#888880;font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:#C9862A;text-decoration:none;">za3fran.io</a></p>
</div></div></body></html>`;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender:      { name: 'Za3fran', email: 'hello@za3fran.io' },
        to:          [{ email: customerEmail, name: customerName || customerEmail }],
        subject,
        htmlContent: html,
      }),
    });

    if (!brevoResponse.ok) {
      const brevoErrorBody = await brevoResponse.text();
      console.error(`[webhook-menu] Brevo email FAILED (${brevoResponse.status}) for ${customerEmail}, run: ${runId}. Body: ${brevoErrorBody}`);
      // Non-fatal for the webhook response — payment already succeeded and the
      // run record is finalized. But surface it clearly so it's not mistaken
      // for a successful send.
      return res.status(200).json({ received: true, runId, accessCode, emailSent: false, emailError: brevoResponse.status });
    }

    console.log(`[webhook-menu] Email sent to ${customerEmail}. Run: ${runId}`);
    return res.status(200).json({ received: true, runId, accessCode, emailSent: true });

  } catch (err) {
    console.error('[webhook-menu] Error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
}
