// ============================================================
// /api/webhook-business-plan.js
// Stripe webhook for Business Plan Essentials.
// Returns 200 immediately, generates report asynchronously.
// Uses same patterns as webhook-validator.js:
//   - Brevo for email delivery
//   - Raw fetch for Anthropic API
//   - waitUntil for async processing
//   - NEXT_PUBLIC_BASE_URL for report links
// ============================================================

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
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
    req.on('data', (chunk) => chunks.push(chunk));
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

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody;
  try { rawBody = await getRawBody(req); }
  catch (err) { return res.status(400).json({ error: 'Could not read request body' }); }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET_BP);
  } catch (err) {
    console.error('[webhook-bp] Signature failed:', err.message);
    return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;
  const meta    = session.metadata || {};

  if (meta.type !== 'business_plan_essentials') {
    return res.status(200).json({ received: true, skipped: true, reason: 'not_bp' });
  }

  const customerEmail = session.customer_details?.email || session.customer_email || meta.customerEmail;
  if (!customerEmail) {
    console.error('[webhook-bp] No email in session:', session.id);
    return res.status(200).json({ received: true, error: 'no_email' });
  }

  console.log(`[webhook-bp] Payment confirmed: ${customerEmail}, session: ${session.id}`);
  res.status(200).json({ received: true });
  waitUntil(generateBusinessPlan({
    reportId:     meta.reportId,
    submissionId: meta.submissionId,
    currency:     meta.currency    || 'EUR',
    language:     meta.language    || 'en',
    conceptName:  meta.conceptName || 'Concept',
    customerName: meta.customerName|| '',
    customerEmail,
  }));
}

// ── Generation function ───────────────────────────────────────
async function generateBusinessPlan({ reportId, submissionId, currency, language, conceptName, customerName, customerEmail }) {
  console.log(`[BP] Starting for: ${conceptName} (${reportId})`);

  try {
    // Load Validator report_json
    const { data: validatorReport, error: rpError } = await supabase
      .from('validator_reports').select('report_json').eq('id', reportId).single();

    if (rpError || !validatorReport?.report_json) {
      throw new Error(`Cannot load report_json for ${reportId}: ${rpError?.message}`);
    }

    const reportJson = validatorReport.report_json;

    // Load submission for context
    const { data: submission } = await supabase
      .from('validator_submissions').select('*').eq('id', submissionId).single();

    const name = customerName || submission?.name || '';
    const lang = language || submission?.language || 'en';
    const curr = currency || submission?.currency || 'EUR';

    // Upsert user
    let userId = null;
    const { data: existingUser } = await supabase.from('za3fran_users').select('id').eq('email', customerEmail).single();
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser } = await supabase.from('za3fran_users')
        .insert({ email: customerEmail, name, default_currency: curr, default_language: lang })
        .select('id').single();
      userId = newUser?.id || null;
    }

    // Upsert project
    let projectId = null;
    const { data: existingProject } = await supabase.from('za3fran_projects').select('id').eq('validator_submission_id', submissionId).single();
    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const { data: newProject } = await supabase.from('za3fran_projects')
        .insert({ user_id: userId, concept_name: conceptName, validator_submission_id: submissionId, currency: curr, language: lang })
        .select('id').single();
      projectId = newProject?.id || null;
    }

    // Generate BP HTML
    const model  = getModel('essentials');
    console.log(`[BP] Calling Claude (${model})...`);

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        messages: [{ role: 'user', content: buildBPPrompt(reportJson, submission, curr, lang) }],
      }),
    });

    const anthropicData = await anthropicResponse.json();
    if (!anthropicResponse.ok || !anthropicData.content?.[0]?.text) {
      throw new Error(`Claude API error: ${anthropicData.error?.message || JSON.stringify(anthropicData).substring(0, 200)}`);
    }

    const bpHtml = anthropicData.content[0].text.trim();
    if (!bpHtml.startsWith('<!DOCTYPE') && !bpHtml.startsWith('<html')) {
      throw new Error('Claude did not return valid HTML. Got: ' + bpHtml.substring(0, 200));
    }
    console.log(`[BP] HTML generated. Length: ${bpHtml.length} chars`);

    // Save to Supabase
    const bpAccessCode = generateAccessCode();
    const bpReportId   = `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { error: saveError } = await supabase.from('business_plan_essentials_runs').insert({
      id: bpReportId, project_id: projectId, output_html: bpHtml,
      access_code: bpAccessCode, currency: curr, language: lang, model_used: model,
    });

    if (saveError) throw new Error(`Supabase save failed: ${saveError.message}`);
    console.log(`[BP] Saved ${bpReportId} with code ${bpAccessCode}`);

    // Send email via Brevo
    const BASE_URL  = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';
    const reportUrl = `${BASE_URL}/business-plan/report/${bpReportId}`;
    const firstName = name ? name.split(' ')[0] : 'there';
    const isFr      = lang === 'fr';

    const emailSubject = isFr
      ? `Votre Business Plan Essentials — ${conceptName}`
      : `Your Business Plan Essentials — ${conceptName}`;

    const emailHtml = isFr ? `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">
<div style="background:#0F1F3D;padding:40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Business Plan Essentials</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Bonjour ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Votre Business Plan Essentials pour <strong>${conceptName}</strong> est prêt.</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Cliquez ci-dessous et entrez votre code d'accès pour accéder à votre document.</p>
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
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#FAFAF7;border-radius:4px;overflow:hidden;">
<div style="background:#0F1F3D;padding:40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:#C9862A;margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:#888880;font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">Business Plan Essentials</p>
</div>
<div style="padding:48px 40px;">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0F1F3D;margin:0 0 20px;">Hi ${firstName},</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 16px;">Your Business Plan Essentials for <strong>${conceptName}</strong> is ready.</p>
  <p style="color:#1a1a1a;line-height:1.75;margin:0 0 32px;">Click below to access your complete business plan. You'll need your access code to open it.</p>
  <div style="text-align:center;margin:0 0 32px;">
    <a href="${reportUrl}" style="display:inline-block;background:#C9862A;color:#FAFAF7;text-decoration:none;padding:16px 40px;font-size:15px;font-weight:600;border-radius:2px;">View my Business Plan →</a>
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

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({
        sender:      { name: 'Za3fran', email: 'hello@za3fran.io' },
        to:          [{ email: customerEmail, name: name || customerEmail }],
        subject:     emailSubject,
        htmlContent: emailHtml,
      }),
    });

    if (!brevoResponse.ok) {
      console.error('[BP] Brevo email failed:', await brevoResponse.json());
    } else {
      console.log(`[BP] Delivery email sent to ${customerEmail}`);
    }

    console.log(`[BP] Complete. reportId: ${bpReportId}`);

  } catch (err) {
    console.error('[BP] Generation error:', err.message);
  }
}

// ── BP prompt ─────────────────────────────────────────────────
function buildBPPrompt(reportJson, submission, currency, language) {
  const snap    = reportJson?.concept_snapshot || {};
  const overall = reportJson?.overall           || {};
  const sections= reportJson?.sections          || {};
  const sym     = { EUR: '€', MAD: 'MAD', USD: '$' }[currency] || '€';
  const isFr    = language === 'fr';
  const financial = sections.s4_financial || {};
  const breakeven = financial.breakeven   || {};
  const scenarios = financial.scenarios   || {};

  return `${isFr
    ? 'Tu es un expert en stratégie F&B et rédaction de business plans professionnels pour investisseurs et porteurs de projets MENA.'
    : 'You are an F&B strategy expert and professional business plan writer for investors and project owners in the MENA region.'}

${isFr
  ? 'Génère un BUSINESS PLAN ESSENTIALS complet (15–25 pages) basé STRICTEMENT sur les données Validator ci-dessous. Ne pas inventer de faits. Les projections financières sont des ESTIMATIONS DIRECTIONNELLES benchmark et doivent être clairement étiquetées.'
  : 'Generate a complete BUSINESS PLAN ESSENTIALS (15–25 pages) based STRICTLY on the Validator data below. Do not invent facts. Financial projections are DIRECTIONAL ESTIMATES from benchmarks and must be clearly labeled.'}

CONCEPT: ${snap.concept_name || 'N/A'} · TYPE: ${snap.type || 'N/A'} · CUISINE: ${snap.cuisine || 'N/A'}
CITY: ${snap.city || 'N/A'}${snap.neighbourhood ? ` / ${snap.neighbourhood}` : ''} · TICKET: ${snap.ticket || 'N/A'} ${currency} · COVERS: ${snap.covers || 'N/A'}/day
SEATS: ${snap.seats || 'N/A'} · BUDGET: ${snap.budget || 'N/A'} · STAGE: ${snap.stage || 'N/A'}
AUDIENCE: ${Array.isArray(snap.audience) ? snap.audience.join(', ') : snap.audience || 'N/A'}
DESCRIPTION: ${snap.description || 'N/A'}
DIFFERENTIATION: ${snap.differentiation || 'N/A'}
MARKET GAP: ${snap.market_gap || 'N/A'}
COMPETITORS: ${snap.competitors || 'N/A'}
VALIDATOR SCORE: ${overall.score || 'N/A'}/100 — ${overall.verdict || 'N/A'}
EXECUTIVE SUMMARY: ${overall.executive_summary || 'N/A'}
BREAKEVEN: ${breakeven.monthly_revenue ? `${sym}${Number(breakeven.monthly_revenue).toLocaleString()}/month` : 'N/A'} · ${breakeven.daily_covers || 'N/A'} covers/day
SCENARIOS: Conservative ${scenarios.conservative ? `${scenarios.conservative.covers_day}c/d → ${sym}${Number(scenarios.conservative.monthly_result).toLocaleString()}/mo` : 'N/A'} | Base ${scenarios.base ? `${scenarios.base.covers_day}c/d → ${sym}${Number(scenarios.base.monthly_result).toLocaleString()}/mo` : 'N/A'} | Optimistic ${scenarios.optimistic ? `${scenarios.optimistic.covers_day}c/d → ${sym}${Number(scenarios.optimistic.monthly_result).toLocaleString()}/mo` : 'N/A'}
MARKET: ${sections.s2_market?.narrative?.substring(0, 500) || 'N/A'}
COMPETITIVE: ${sections.s3_competitive?.narrative?.substring(0, 300) || 'N/A'}
RISKS: ${(sections.s6_risks?.risks || []).map(r => r.title).join('; ')}
RECOMMENDATIONS: ${(sections.s5_strategy?.recommendations || []).map(r => r.title).join('; ')}

CURRENCY: ${currency} (${sym}) · LANGUAGE: ${language}
DATE: ${new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

${isFr ? 'STRUCTURE (ordre exact) :' : 'STRUCTURE (exact order):'}
1. ${isFr ? 'PAGE DE COUVERTURE' : 'COVER PAGE'}
2. ${isFr ? 'TABLE DES MATIÈRES' : 'TABLE OF CONTENTS'}
3. ${isFr ? 'RÉSUMÉ EXÉCUTIF (400–600 mots)' : 'EXECUTIVE SUMMARY (400–600 words)'}
4. ${isFr ? 'CONCEPT & POSITIONNEMENT' : 'CONCEPT & POSITIONING'}
5. ${isFr ? 'ANALYSE DE MARCHÉ' : 'MARKET ANALYSIS'}
6. ${isFr ? 'AUDIENCE CIBLE' : 'TARGET AUDIENCE'}
7. ${isFr ? 'PAYSAGE CONCURRENTIEL' : 'COMPETITIVE LANDSCAPE'}
8. ⚡ ${isFr ? 'STRATÉGIE MENU (ESTIMATION DIRECTIONNELLE)' : 'MENU STRATEGY (DIRECTIONAL ESTIMATE)'}
9. ⚡ ${isFr ? 'MODÈLE OPÉRATIONNEL (ESTIMATION DIRECTIONNELLE)' : 'OPERATIONAL MODEL (DIRECTIONAL ESTIMATE)'}
10. ⚡ ${isFr ? `PROJECTIONS FINANCIÈRES — TOUTES VALEURS EN ${currency} (${sym})` : `FINANCIAL PROJECTIONS — ALL VALUES IN ${currency} (${sym})`}
    ${isFr
      ? `(a) Fourchette investissement démarrage + décomposition (b) CA A1–A3 (Validator → +25% A2 → +18% A3) (c) Ratios coûts standards (d) Point mort (e) EBITDA A1/A2/A3 (f) ROI + délai retour`
      : `(a) Startup investment range + breakdown (b) Revenue Y1–Y3 (Validator → +25% Y2 → +18% Y3) (c) Standard cost ratios (d) Break-even (e) EBITDA Y1/Y2/Y3 (f) ROI + payback`}
11. ⚡ ${isFr ? 'STRATÉGIE MARKETING (DIRECTIONNELLE)' : 'MARKETING STRATEGY (DIRECTIONAL)'}
12. ⚡ ${isFr ? 'CALENDRIER PRÉ-OUVERTURE 6 MOIS (J-180 → J-0)' : 'PRE-OPENING TIMELINE 6 MONTHS (D-180 → D-0)'}
13. ${isFr ? 'ANALYSE DES RISQUES' : 'RISK ANALYSIS'}
14. ${isFr ? 'RECOMMANDATIONS & PROCHAINES ÉTAPES (mentionner: Menu Engineer, Financial Builder, Business Plan Pro)' : 'RECOMMENDATIONS & NEXT STEPS (mention: Menu Engineer, Financial Builder, Business Plan Pro)'}
15. ${isFr ? 'ANNEXES (données Validator, glossaire)' : 'APPENDICES (Validator data, glossary)'}

${isFr
  ? 'Chaque section ⚡ : encadré visible "⚡ ESTIMATION DIRECTIONNELLE — Basée sur benchmarks sectoriels. À valider avec un outil Za3fran dédié."'
  : 'Each ⚡ section: visible box "⚡ DIRECTIONAL ESTIMATE — Based on industry benchmarks. Validate with a dedicated Za3fran tool."'}

HTML: Cormorant Garamond (titres) + DM Sans (corps). Background #FAFAF7. Accent #C9862A. Cover: fond #0a0a0a. Max-width 860px. Print-ready. Footer Za3fran.

${isFr
  ? 'Retourne UNIQUEMENT le HTML complet. Commence par <!DOCTYPE html>.'
  : 'Return ONLY the complete HTML. Start with <!DOCTYPE html>.'}`;
}
