// ============================================================
// /api/generate-bp.js
// On-demand BP generation. Called by report-bp-viewer.js when
// output_html is null. Runs Claude synchronously — client waits.
// maxDuration: 300 in vercel.json ensures 5-min window.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { getModel } from '../lib/claude-config.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bpRunId } = req.body || {};
  if (!bpRunId) return res.status(400).json({ error: 'bpRunId required' });

  // ── Load the pending BP run ──────────────────────────────
  const { data: bpRun, error: runError } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, output_html, output_json, currency, language, model_used, access_code')
    .eq('id', bpRunId)
    .single();

  if (runError || !bpRun) {
    return res.status(404).json({ error: 'BP run not found' });
  }

  // Already generated — return immediately
  if (bpRun.output_html) {
    return res.status(200).json({ ready: true });
  }

  // Mark as generating to prevent duplicate runs
  const meta = bpRun.output_json || {};
  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: { ...meta, status: 'generating' } })
    .eq('id', bpRunId);

  const validatorReportId = meta.validator_report_id;
  const submissionId      = meta.submission_id;

  if (!validatorReportId) {
    return res.status(422).json({ error: 'Missing validator_report_id in output_json' });
  }

  // ── Load Validator report_json ───────────────────────────
  const { data: validatorReport } = await supabase
    .from('validator_reports')
    .select('report_json')
    .eq('id', validatorReportId)
    .single();

  if (!validatorReport?.report_json) {
    return res.status(422).json({ error: 'Validator report_json not found' });
  }

  // ── Load submission ──────────────────────────────────────
  const { data: submission } = await supabase
    .from('validator_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  const currency = bpRun.currency || 'EUR';
  const language = bpRun.language || 'en';
  const model    = bpRun.model_used || getModel('essentials');

  // ── Call Claude ──────────────────────────────────────────
  console.log(`[generate-bp] Calling Claude (${model}) for run ${bpRunId}...`);

  let bpHtml;
  try {
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
        messages: [{ role: 'user', content: buildBPPrompt(validatorReport.report_json, submission, currency, language) }],
      }),
    });

    const anthropicData = await anthropicResponse.json();

    if (!anthropicResponse.ok || !anthropicData.content?.[0]?.text) {
      throw new Error(`Claude API error: ${anthropicData.error?.message || JSON.stringify(anthropicData).substring(0, 200)}`);
    }

    bpHtml = anthropicData.content[0].text.trim();

// Strip markdown code fences if Claude wrapped the HTML
bpHtml = bpHtml.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

if (!bpHtml.startsWith('<!DOCTYPE') && !bpHtml.startsWith('<html')) {
  throw new Error('Claude did not return valid HTML. Got: ' + bpHtml.substring(0, 100));
}

    console.log(`[generate-bp] HTML generated. ${bpHtml.length} chars`);

  } catch (err) {
    console.error('[generate-bp] Claude failed:', err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: { ...meta, status: 'error', error: err.message } })
      .eq('id', bpRunId);
    return res.status(500).json({ error: 'Generation failed: ' + err.message });
  }

  // ── Save generated HTML ──────────────────────────────────
  const { error: saveError } = await supabase
    .from('business_plan_essentials_runs')
    .update({
      output_html: bpHtml,
      output_json: { ...meta, status: 'complete' },
    })
    .eq('id', bpRunId);

  if (saveError) {
    console.error('[generate-bp] Save failed:', saveError.message);
    return res.status(500).json({ error: 'Save failed: ' + saveError.message });
  }

  console.log(`[generate-bp] Done. Run ${bpRunId} complete.`);
  return res.status(200).json({ ready: true });
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
  ? 'Génère un BUSINESS PLAN ESSENTIALS complet (12–18 pages) basé STRICTEMENT sur les données Validator. Ne pas inventer de faits. Projections financières = ESTIMATIONS DIRECTIONNELLES benchmark, clairement étiquetées.'
  : 'Generate a complete BUSINESS PLAN ESSENTIALS (12–18 pages) based STRICTLY on Validator data. Do not invent facts. Financial projections = DIRECTIONAL ESTIMATES from benchmarks, clearly labeled.'}

CONCEPT: ${snap.concept_name || 'N/A'} · TYPE: ${snap.type || 'N/A'} · CUISINE: ${snap.cuisine || 'N/A'}
CITY: ${snap.city || 'N/A'}${snap.neighbourhood ? ` / ${snap.neighbourhood}` : ''} · TICKET: ${snap.ticket || 'N/A'} ${currency} · COVERS: ${snap.covers || 'N/A'}/day · SEATS: ${snap.seats || 'N/A'}
BUDGET: ${snap.budget || 'N/A'} · STAGE: ${snap.stage || 'N/A'} · HOURS: ${snap.opening_hours || 'N/A'}
AUDIENCE: ${Array.isArray(snap.audience) ? snap.audience.join(', ') : snap.audience || 'N/A'}
DESCRIPTION: ${snap.description || 'N/A'}
DIFFERENTIATION: ${snap.differentiation || 'N/A'}
MARKET GAP: ${snap.market_gap || 'N/A'}
COMPETITORS: ${snap.competitors || 'N/A'}
VALIDATOR SCORE: ${overall.score || 'N/A'}/100 — ${overall.verdict || 'N/A'}
EXECUTIVE SUMMARY: ${overall.executive_summary || 'N/A'}
BREAKEVEN: ${breakeven.monthly_revenue ? `${sym}${Number(breakeven.monthly_revenue).toLocaleString()}/month, ${breakeven.daily_covers} covers/day` : 'N/A'}
SCENARIOS: Conservative ${scenarios.conservative ? `${scenarios.conservative.covers_day}c/d → ${sym}${Number(scenarios.conservative.monthly_result || 0).toLocaleString()}/mo` : 'N/A'} | Base ${scenarios.base ? `${scenarios.base.covers_day}c/d → ${sym}${Number(scenarios.base.monthly_result || 0).toLocaleString()}/mo` : 'N/A'} | Optimistic ${scenarios.optimistic ? `${scenarios.optimistic.covers_day}c/d → ${sym}${Number(scenarios.optimistic.monthly_result || 0).toLocaleString()}/mo` : 'N/A'}
MARKET: ${sections.s2_market?.narrative?.substring(0, 500) || 'N/A'}
COMPETITIVE: ${sections.s3_competitive?.narrative?.substring(0, 300) || 'N/A'}
RISKS: ${(sections.s6_risks?.risks || []).map(r => r.title).filter(Boolean).join('; ') || 'N/A'}
KEY RECOMMENDATIONS: ${(sections.s5_strategy?.recommendations || []).map(r => r.title).filter(Boolean).join('; ') || 'N/A'}

CURRENCY: ${currency} (${sym}) · LANGUAGE: ${language}
DATE: ${new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

${isFr ? 'STRUCTURE (ordre exact) :' : 'STRUCTURE (exact order):'}
1. ${isFr ? 'PAGE DE COUVERTURE' : 'COVER PAGE'}
2. ${isFr ? 'RÉSUMÉ EXÉCUTIF (300–400 mots)' : 'EXECUTIVE SUMMARY (300–400 words)'}
3. ${isFr ? 'CONCEPT & POSITIONNEMENT' : 'CONCEPT & POSITIONING'}
4. ${isFr ? 'ANALYSE DE MARCHÉ & AUDIENCE CIBLE' : 'MARKET ANALYSIS & TARGET AUDIENCE'}
5. ${isFr ? 'PAYSAGE CONCURRENTIEL' : 'COMPETITIVE LANDSCAPE'}
6. ⚡ ${isFr ? 'STRATÉGIE MENU (DIRECTIONNELLE — benchmarks)' : 'MENU STRATEGY (DIRECTIONAL — benchmarks)'}
7. ⚡ ${isFr ? 'MODÈLE OPÉRATIONNEL & STAFFING (DIRECTIONNEL)' : 'OPERATIONAL MODEL & STAFFING (DIRECTIONAL)'}
8. ⚡ ${isFr ? `PROJECTIONS FINANCIÈRES — TOUTES VALEURS EN ${currency} (${sym})` : `FINANCIAL PROJECTIONS — ALL VALUES IN ${currency} (${sym})`}
   ${isFr
     ? `(a) Fourchette investissement démarrage (b) CA A1–A3 (Validator → +25% A2 → +18% A3) (c) Ratios coûts (d) Point mort (e) EBITDA A1/A2/A3`
     : `(a) Startup investment range (b) Revenue Y1–Y3 (Validator → +25% Y2 → +18% Y3) (c) Cost ratios (d) Break-even (e) EBITDA Y1/Y2/Y3`}
9. ⚡ ${isFr ? 'MARKETING & CALENDRIER PRÉ-OUVERTURE (DIRECTIONNEL)' : 'MARKETING & PRE-OPENING TIMELINE (DIRECTIONAL)'}
10. ${isFr ? 'ANALYSE DES RISQUES' : 'RISK ANALYSIS'}
11. ${isFr ? 'RECOMMANDATIONS & PROCHAINES ÉTAPES (mentionner: Menu Engineer, Financial Builder, Business Plan Pro)' : 'RECOMMENDATIONS & NEXT STEPS (mention: Menu Engineer, Financial Builder, Business Plan Pro)'}

${isFr
  ? 'Sections ⚡ : encadré "⚡ ESTIMATION DIRECTIONNELLE — Benchmarks sectoriels. À valider avec un outil Za3fran dédié."'
  : 'Sections ⚡: box "⚡ DIRECTIONAL ESTIMATE — Industry benchmarks. Validate with a dedicated Za3fran tool."'}

HTML: Cormorant Garamond (titres) + DM Sans (corps) via Google Fonts. Background #FAFAF7. Accent #C9862A. Cover: fond #0a0a0a. Max-width 860px. Print-ready. Footer Za3fran.

${isFr ? 'Retourne UNIQUEMENT le HTML complet. Commence par <!DOCTYPE html>.' : 'Return ONLY the complete HTML. Start with <!DOCTYPE html>.'}`;
}
