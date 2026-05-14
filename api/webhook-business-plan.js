// ============================================================
// /api/webhook-business-plan.js  (v2 — on-demand generation)
// Stripe webhook: payment confirmed → save pending record → send email.
// Claude generation moved to /api/generate-bp.js (triggered by report viewer).
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getModel } from '../lib/claude-config.js';

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

function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody;
  try { rawBody = await getRawBody(req); }
  catch (e) { return res.status(400).json({ error: 'Cannot read body' }); }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET_BP);
  } catch (e) {
    console.error('[webhook-bp] Signature failed:', e.message);
    return res.status(400).json({ error: `Signature invalid: ${e.message}` });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const meta    = session.metadata || {};

  if (meta.type !== 'business_plan_essentials') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const customerEmail = session.customer_details?.email || session.customer_email || meta.customerEmail;
  if (!customerEmail) return res.status(200).json({ received: true, error: 'no_email' });

  console.log(`[webhook-bp] Payment confirmed: ${customerEmail}`);

  try {
    // ── 1. Upsert user ───────────────────────────────────────
    const currency = meta.currency || 'EUR';
    const language = meta.language || 'en';
    const name     = meta.customerName || '';
    let userId = null;

    const { data: existingUser } = await supabase
      .from('za3fran_users').select('id').eq('email', customerEmail).single();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser } = await supabase.from('za3fran_users')
        .insert({ email: customerEmail, name, default_currency: currency, default_language: language })
        .select('id').single();
      userId = newUser?.id || null;
    }

    // ── 2. Upsert project ────────────────────────────────────
    let projectId = null;
    const { data: existingProject } = await supabase
      .from('za3fran_projects').select('id').eq('validator_submission_id', meta.submissionId).single();

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const { data: newProject } = await supabase.from('za3fran_projects')
        .insert({
          user_id: userId,
          concept_name: meta.conceptName || 'Concept',
          validator_submission_id: meta.submissionId,
          currency,
          language,
        })
        .select('id').single();
      projectId = newProject?.id || null;
    }

    // ── 3. Save PENDING BP run record ────────────────────────
    const bpAccessCode = generateAccessCode();
    const bpReportId   = `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await supabase.from('business_plan_essentials_runs').insert({
      id:          bpReportId,
      project_id:  projectId,
      output_html: null,           // null = pending, filled by /api/generate-bp
      access_code: bpAccessCode,
      currency,
      language,
      model_used:  getModel('essentials'),
      // store validator report ref in output_json for generate-bp to read
      output_json: { validator_report_id: meta.reportId, submission_id: meta.submissionId, status: 'pending' },
    });

    console.log(`[webhook-bp] Pending record saved: ${bpReportId} / ${bpAccessCode}`);

    // ── 4. Send delivery email via Brevo ─────────────────────
    const BASE_URL  = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';
    const reportUrl = `${BASE_URL}/business-plan/report/${bpReportId}`;
    const firstName = name ? name.split(' ')[0] : 'there';
    const isFr      = language === 'fr';
    const conceptName = meta.conceptName || 'your concept';

    const subject = isFr
      ? `Votre Business Plan Essentials — ${conceptName}`
      : `Your Business Plan Essentials — ${conceptName}`;

    const html = isFr ? `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">
<div style="background:#0F1F3D;padding:40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Business Plan Essentials</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Bonjour ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Votre paiement pour <strong>${conceptName}</strong> est confirmé. Votre Business Plan Essentials est en cours de génération.</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Cliquez sur le bouton ci-dessous pour accéder à votre rapport. La première ouverture déclenchera la génération (3–5 minutes).</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">Accéder à mon Business Plan →</a>
  </div>
  <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
    <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Votre code d'accès</p>
    <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${bpAccessCode}</p>
  </div>
  <p style="color:#888880;font-size:13px;margin:0 0 8px;">Lien direct : <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>
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
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Business Plan Essentials</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Hi ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Your payment for <strong>${conceptName}</strong> is confirmed. Your Business Plan Essentials is being prepared.</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Click below to access your report. The first time you open it, generation will start automatically (3–5 minutes).</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">Access my Business Plan →</a>
  </div>
  <div style="background:#f0f0ee;border-radius:4px;padding:24px;text-align:center;margin:0 0 32px;">
    <p style="font-size:12px;color:#888880;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Your access code</p>
    <p style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#0F1F3D;margin:0;letter-spacing:4px;">${bpAccessCode}</p>
  </div>
  <p style="color:#888880;font-size:13px;margin:0 0 8px;">Direct link: <a href="${reportUrl}" style="color:#C9862A;">${reportUrl}</a></p>
  <p style="color:#888880;font-size:13px;margin:0;">Questions? <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
</div>
<div style="background:#0F1F3D;padding:24px 40px;text-align:center;">
  <p style="color:#888880;font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:#C9862A;text-decoration:none;">za3fran.io</a></p>
</div></div></body></html>`;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender:      { name: 'Za3fran', email: 'hello@za3fran.io' },
        to:          [{ email: customerEmail, name: name || customerEmail }],
        subject,
        htmlContent: html,
      }),
    });

    console.log(`[webhook-bp] Email sent to ${customerEmail}. Run: ${bpReportId}`);
    return res.status(200).json({ received: true, bpReportId });

  } catch (err) {
    console.error('[webhook-bp] Error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
}
