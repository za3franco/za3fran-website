// ============================================================
// /api/generate-bp.js  (v3 — clean rewrite)
// On-demand BP generation triggered by report-bp-viewer.js.
// maxDuration: 300 set in vercel.json.
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

  const { data: bpRun, error: runError } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, output_html, output_json, currency, language, model_used')
    .eq('id', bpRunId)
    .single();

  if (runError || !bpRun) return res.status(404).json({ error: 'BP run not found' });
  if (bpRun.output_html) return res.status(200).json({ ready: true });

  const meta = bpRun.output_json || {};

  // Prevent duplicate runs
  if (meta.status === 'generating') {
    return res.status(200).json({ status: 'generating' });
  }

  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: { ...meta, status: 'generating' } })
    .eq('id', bpRunId);

  const validatorReportId = meta.validator_report_id;
  const submissionId      = meta.submission_id;

  if (!validatorReportId) {
    return res.status(422).json({ error: 'Missing validator_report_id' });
  }

  const { data: vrData } = await supabase
    .from('validator_reports')
    .select('report_json')
    .eq('id', validatorReportId)
    .single();

  if (!vrData || !vrData.report_json) {
    return res.status(422).json({ error: 'Validator report_json not found' });
  }

  const { data: submission } = await supabase
    .from('validator_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  const currency = bpRun.currency || 'EUR';
  const language = bpRun.language || 'en';
  const model    = bpRun.model_used || getModel('essentials');

  console.log('[generate-bp] Calling Claude for run: ' + bpRunId);

  let bpHtml;
  try {
    const controller = new AbortController();
    const timer = setTimeout(function() { controller.abort(); }, 270000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 18000,
        messages: [
          { role: 'user', content: buildPrompt(vrData.report_json, submission, currency, language) }
        ],
      }),
    });

    clearTimeout(timer);

    const data = await response.json();

    if (!response.ok || !data.content || !data.content[0] || !data.content[0].text) {
      var errMsg = (data.error && data.error.message) ? data.error.message : 'API error ' + response.status;
      throw new Error(errMsg);
    }

    bpHtml = data.content[0].text.trim();
    bpHtml = bpHtml.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    if (!bpHtml.startsWith('<!DOCTYPE') && !bpHtml.startsWith('<html')) {
      throw new Error('Invalid HTML response: ' + bpHtml.substring(0, 100));
    }

    console.log('[generate-bp] Generated ' + bpHtml.length + ' chars');

  } catch (err) {
    console.error('[generate-bp] Error: ' + err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: { ...meta, status: 'error', error: err.message } })
      .eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  const { error: saveErr } = await supabase
    .from('business_plan_essentials_runs')
    .update({
      output_html: bpHtml,
      output_json: { ...meta, status: 'complete' },
    })
    .eq('id', bpRunId);

  if (saveErr) {
    console.error('[generate-bp] Save error: ' + saveErr.message);
    return res.status(500).json({ error: 'Save failed' });
  }

  console.log('[generate-bp] Complete: ' + bpRunId);
  return res.status(200).json({ ready: true });
}

function buildPrompt(reportJson, submission, currency, language) {
  var snap    = reportJson && reportJson.concept_snapshot ? reportJson.concept_snapshot : {};
  var overall = reportJson && reportJson.overall ? reportJson.overall : {};
  var secs    = reportJson && reportJson.sections ? reportJson.sections : {};
  var fin     = secs.s4_financial || {};
  var be      = fin.breakeven || {};
  var sc      = fin.scenarios || {};
  var sym     = currency === 'MAD' ? 'MAD' : (currency === 'USD' ? '$' : '\u20ac');
  var isFr    = language === 'fr';

  function fmtNum(n) {
    if (!n) return 'N/A';
    return Number(n).toLocaleString(isFr ? 'fr-FR' : 'en-US');
  }

  function scLine(s) {
    if (!s) return 'N/A';
    return s.covers_day + ' couverts/j \u2192 ' + sym + fmtNum(s.monthly_result) + '/mois';
  }

  var audience = Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience || 'N/A');
  var risks    = (secs.s6_risks && secs.s6_risks.risks ? secs.s6_risks.risks : []).map(function(r) { return r.title; }).filter(Boolean).join(' | ') || 'N/A';
  var recs     = (secs.s5_strategy && secs.s5_strategy.recommendations ? secs.s5_strategy.recommendations : []).map(function(r) { return r.title; }).filter(Boolean).join(' | ') || 'N/A';
  var market   = secs.s2_market && secs.s2_market.narrative ? secs.s2_market.narrative.substring(0, 500) : 'N/A';
  var compet   = secs.s3_competitive && secs.s3_competitive.narrative ? secs.s3_competitive.narrative.substring(0, 400) : 'N/A';
  var alerts   = (fin.alerts || []).map(function(a) { return a.title; }).filter(Boolean).join(' | ') || 'N/A';
  var today    = new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  var dataBlock = [
    'CONCEPT: ' + (snap.concept_name || 'N/A') + '  TYPE: ' + (snap.type || 'N/A') + '  CUISINE: ' + (snap.cuisine || 'N/A'),
    'VILLE: ' + (snap.city || 'N/A') + (snap.neighbourhood ? ' / ' + snap.neighbourhood : ''),
    'TICKET: ' + (snap.ticket || 'N/A') + ' ' + currency + '  COUVERTS/JOUR: ' + (snap.covers || 'N/A') + '  PLACES: ' + (snap.seats || 'N/A'),
    'BUDGET: ' + (snap.budget || 'N/A') + ' ' + currency + '  STADE: ' + (snap.stage || 'N/A'),
    'HORAIRES: ' + (snap.opening_hours || 'N/A'),
    'AUDIENCE: ' + audience,
    'DESCRIPTION: ' + (snap.description || 'N/A'),
    'DIFFERENTIATION: ' + (snap.differentiation || 'N/A'),
    'VIDE MARCHE: ' + (snap.market_gap || 'N/A'),
    'CONCURRENTS: ' + (snap.competitors || 'N/A'),
    'VALIDATOR SCORE: ' + (overall.score || 'N/A') + '/100  VERDICT: ' + (overall.verdict || 'N/A'),
    'RESUME VALIDATOR: ' + (overall.executive_summary || 'N/A'),
    'POINT MORT: ' + sym + fmtNum(be.monthly_revenue) + '/mois  ' + (be.daily_covers || 'N/A') + ' couverts/jour',
    'CONSERVATEUR: ' + scLine(sc.conservative),
    'BASE: ' + scLine(sc.base),
    'OPTIMISTE: ' + scLine(sc.optimistic),
    'ALERTES: ' + alerts,
    'MARCHE: ' + market,
    'CONCURRENCE: ' + compet,
    'RECOMMANDATIONS: ' + recs,
    'RISQUES: ' + risks,
    'DEVISE: ' + currency + ' (' + sym + ')  LANGUE: ' + language,
    'DATE: ' + today,
  ].join('\n');

  var intro = isFr
    ? 'Tu es un expert senior en strategie F&B et redaction de business plans pour investisseurs et banquiers MENA. Genere un BUSINESS PLAN ESSENTIALS complet, professionnel et concis. Vise 15-18 pages HTML. Chaque section doit etre chiffree, specifique et actionnable — pas de remplissage.'
    : 'You are a senior F&B strategy expert writing business plans for MENA investors and banks. Generate a complete, professional, concise BUSINESS PLAN ESSENTIALS. Target 15-18 HTML pages. Every section must be specific, data-driven and actionable — no padding.';

  var finNote = isFr
    ? 'ESTIMATIONS DIRECTIONNELLES — benchmarks sectoriels F&B MENA. A valider avec Financial Builder Za3fran.'
    : 'DIRECTIONAL ESTIMATES — MENA F&B industry benchmarks. To validate with Za3fran Financial Builder.';

  var structure = isFr ? [
    '1. PAGE DE COUVERTURE — fond #0a0a0a, nom concept grand Cormorant, sous-titre cuivre (format/cuisine/ville), badge score Validator (cercle cuivre, score/100, verdict), "Prepare par Za3fran Digital", date.',

    '2. BRIEF INVESTISSEUR (2 pages, standalone) — concu pour etre envoye seul a un banquier. Inclure: (a) Fiche concept tableau [Concept|Format|Cuisine|Localisation|Places|Ticket|Horaires|Stade]; (b) Opportunite de marche en 3 phrases precises; (c) Proposition de valeur en 4-5 bullets; (d) Resume financier tableau [Investissement total|Point mort|CA A1/A2/A3|EBITDA A1/A2/A3|Delai retour]; (e) Besoin de financement (montant, repartition fonds propres/dette, usage); (f) Profil de risque (3 risques, niveau, mitigation 1 ligne); (g) Badge score Za3fran.',

    '3. TABLE DES MATIERES',

    '4. RESUME EXECUTIF (400 mots) — memo de direction: marche, concept, modele economique, financement, potentiel, risques, prochaines etapes.',

    '5. CONCEPT & POSITIONNEMENT — vision et raison d\'etre; identite de marque (nom, territoire visuel, tonalite); proposition de valeur detaillee; format operationnel et experience client; coherence positionnement prix/qualite.',

    '6. ANALYSE DE MARCHE & AUDIENCE CIBLE — dynamiques marche local city-specific; le vide de marche et pourquoi non adresse; 2-3 personas detailles (age, profession, habitudes dejeuner, sensibilite prix); signaux de demande concrets (livraison, comparables MENA); facteurs macro.',

    '7. PAYSAGE CONCURRENTIEL — tableau complet 6-8 acteurs [Nom|Type|Ticket|Meme client?|Force|Faiblesse|Menace]; concurrence directe ET informelle; sur quels axes ce concept gagne; defensibilite avantage (score 1-5); risque entrants capitalises; strategie fidelisation.',

    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE] — architecture menu: sections et nb items; tableau [Section|Nb items|Fourchette prix ' + sym + '|Food cost cible %]; logique pricing; direction sourcing local + 2-3 fournisseurs regionaux nommes; 3-5 items signature directionnels (nom + concept); contraintes operationnelles cles.',

    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE] — modele de service et flux client; tableau staffing [Poste|ETP|Salaire ' + sym + '/mois|Total charges]; ratios productivite (couverts/serveur, tickets cuisine/h); gestion des pics; KPIs operationnels J+30.',

    '10. PROJECTIONS FINANCIERES [ESTIMATIONS DIRECTIONNELLES — ' + finNote + '] — Cette section est la plus importante. Inclure:\n' +
    '10A BUDGET DEMARRAGE: tableau ligne par ligne [Poste|Bas ' + sym + '|Haut ' + sym + '|Notes] — travaux/amenagement, equipements cuisine pro, mobilier/deco, IT/caisse, licences/autorisations, honoraires fiduciaire, fonds de roulement, marketing pre-ouverture, reserve tresorerie (min 3 mois charges fixes), contingence 8%, TOTAL; comparer au budget declare.\n' +
    '10B CA ANNEES 1-3: tableau mensuel A1 (12 mois) [Mois|Couverts/j|Jours|CA ' + sym + '|Note] avec montee en charge realiste; recap A1/A2(+25%)/A3(+18%).\n' +
    '10C P&L 3 ANS: tableau [Ligne|A1 ' + sym + '|A1%|A2 ' + sym + '|A2%|A3 ' + sym + '|A3%] — CA, cout matiere (30-34%), marge brute, masse salariale (28-32%), loyer (8-12%), energie (3-5%), emballages (2-4%), marketing (3-5%), amortissements, autres, EBITDA, resultat net.\n' +
    '10D POINT MORT: reprendre donnees Validator + taux occupation + delai estimé + tableau sensibilite 3x3 [tickets -10%/base/+15% × couverts -20%/base/+30%].\n' +
    '10E ROI: investissement retenu, flux cumules A1/A2/A3, point de retour (mois), comparaison alternatives investissement locales.\n' +
    '10F FINANCEMENT: montant total, repartition fonds propres/dette recommandee, cout dette (taux marche local PME), impact cashflow, 2-3 institutions de financement locales a contacter.',

    '11. MARKETING & CALENDRIER PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE] — positionnement marque; mix canaux avec budget indicatif (Instagram, TikTok, livraison, micro-influenceurs 8K-50K, presse); plan contenu J-90/J-60/J-30/J-0; evenement lancement; strategie retention; KPIs; tableau 6 mois [Periode|Actions cles|Budget ' + sym + '].',

    '12. ANALYSE DES RISQUES — tableau [Risque|Probabilite|Impact|Score|Mitigation]; 6 risques (financier, operationnel, marche, concurrentiel, reglementaire, humain); paragraphe d\'analyse specifique a CE concept dans CETTE ville; plan de contingence pour risque #1.',

    '13. RECOMMANDATIONS & PROCHAINES ETAPES — 5 actions 30 jours (issues du Validator); ce que ce plan ne peut pas encore dire; encadre "Approfondissez avec Za3fran" (fond navy): Menu Engineer (menu coute avec food cost reel), Financial Builder (modele financier complet base sur vos donnees reelles), Business Plan Pro (business plan niveau financement bancaire, donnees modelisees).',

    '14. ANNEXES — tableau recap scores Validator; note methodologique; glossaire.',
  ].join('\n\n') : [
    '1. COVER PAGE — dark #0a0a0a background, large Cormorant concept name, copper subtitle (format/cuisine/city), Validator score badge (copper circle, score/100, verdict), "Prepared by Za3fran Digital", date.',

    '2. INVESTOR BRIEF (2 pages, standalone) — designed to be sent alone to a banker. Include: (a) Concept sheet table [Concept|Format|Cuisine|Location|Seats|Ticket|Hours|Stage]; (b) Market opportunity in 3 precise sentences; (c) Value proposition 4-5 bullets; (d) Financial summary table [Total investment|Break-even|Revenue Y1/Y2/Y3|EBITDA Y1/Y2/Y3|Payback]; (e) Funding requirement (amount, equity/debt split, use of funds); (f) Risk profile (3 risks, level, 1-line mitigation); (g) Za3fran score badge.',

    '3. TABLE OF CONTENTS',

    '4. EXECUTIVE SUMMARY (400 words) — management memo: market, concept, business model, funding, potential, risks, next steps.',

    '5. CONCEPT & POSITIONING — vision and rationale; brand identity (name, visual territory, tone); detailed value proposition; operational format and customer experience; price/quality/experience coherence.',

    '6. MARKET ANALYSIS & TARGET AUDIENCE — local market dynamics (city-specific); the market gap and why it exists; 2-3 detailed personas (age, profession, lunch habits, price sensitivity); concrete demand signals (delivery, MENA comparables); macro factors.',

    '7. COMPETITIVE LANDSCAPE — complete table 6-8 players [Name|Type|Ticket|Same customer?|Strength|Weakness|Threat]; direct AND informal competition; on which axes this concept wins; defensibility score (1-5); capitalised entrant risk; loyalty strategy.',

    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE] — menu architecture: sections and item count; table [Section|Items|Price range ' + sym + '|Target food cost %]; pricing logic; local sourcing direction + 2-3 named regional suppliers; 3-5 directional signature items (name + concept); key operational constraints.',

    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE] — service model and customer flow; staffing table [Position|FTE|Salary ' + sym + '/month|Total incl. charges]; productivity ratios (covers/server, kitchen tickets/h); peak management; operational KPIs D+30.',

    '10. FINANCIAL PROJECTIONS [DIRECTIONAL ESTIMATES — ' + finNote + '] — This is the most important section. Include:\n' +
    '10A STARTUP BUDGET: line-by-line table [Item|Low ' + sym + '|High ' + sym + '|Notes] — fit-out/works, professional kitchen equipment, furniture/decor, IT/POS, licenses/permits, legal fees, working capital, pre-opening marketing, cash reserve (min 3 months fixed costs), contingency 8%, TOTAL; compare to stated budget.\n' +
    '10B REVENUE Y1-Y3: monthly Y1 table (12 months) [Month|Covers/day|Trading days|Revenue ' + sym + '|Note] with realistic ramp-up; summary Y1/Y2(+25%)/Y3(+18%).\n' +
    '10C 3-YEAR P&L: table [Line|Y1 ' + sym + '|Y1%|Y2 ' + sym + '|Y2%|Y3 ' + sym + '|Y3%] — Revenue, food cost (30-34%), gross margin, payroll incl. charges (28-32%), rent (8-12%), energy (3-5%), packaging (2-4%), marketing (3-5%), depreciation, other, EBITDA, net result.\n' +
    '10D BREAK-EVEN: carry from Validator + occupancy rate + estimated months + 3x3 sensitivity table [tickets -10%/base/+15% x covers -20%/base/+30%].\n' +
    '10E ROI: retained investment, cumulative flows Y1/Y2/Y3, payback point (months), comparison with local investment alternatives.\n' +
    '10F FUNDING: total amount, recommended equity/debt split, cost of debt (local SME rate), cashflow impact, 2-3 local financing institutions to contact.',

    '11. MARKETING & PRE-OPENING TIMELINE [DIRECTIONAL ESTIMATE] — brand positioning; channel mix with indicative budget (Instagram, TikTok, delivery, micro-influencers 8K-50K, press); content plan D-90/D-60/D-30/D-0; launch event; retention strategy; KPIs; 6-month table [Period|Key actions|Budget ' + sym + '].',

    '12. RISK ANALYSIS — table [Risk|Probability|Impact|Score|Mitigation]; 6 risks (financial, operational, market, competitive, regulatory, human); analysis paragraph specific to THIS concept in THIS city; contingency plan for risk #1.',

    '13. RECOMMENDATIONS & NEXT STEPS — 5 actions in 30 days (from Validator); what this plan cannot yet tell you; "Go deeper with Za3fran" box (navy background): Menu Engineer (costed menu with real food cost), Financial Builder (complete financial model from your real data), Business Plan Pro (bank-financing-grade plan with modelled data).',

    '14. APPENDICES — Validator score summary table; methodology note; glossary.',
  ].join('\n\n');

  var design = isFr
    ? 'DESIGN HTML: Document HTML complet auto-contenu. Polices Google Fonts: Cormorant Garamond (titres) + DM Sans (corps). Couleurs: background #FAFAF7, texte #1a1a1a, accent #C9862A, muted #888880, navy #0F1F3D. Page couverture et Brief Investisseur: fond #0a0a0a accents cuivre. Encadres ESTIMATION DIRECTIONNELLE: fond #fff8f0 bordure gauche 3px #C9862A. Encadre Za3fran prochaines etapes: fond #0F1F3D texte blanc. Tableaux: bordures #e8e8e4 rangees alternees en-tetes navy. Max-width 860px centre. Footer chaque section: "Za3fran Digital · Business Plan Essentials · ' + today + '". @media print page-break sur sections majeures. RETOURNE UNIQUEMENT le HTML complet. Commence par <!DOCTYPE html>.'
    : 'HTML DESIGN: Complete self-contained HTML. Google Fonts: Cormorant Garamond (headings) + DM Sans (body). Colors: background #FAFAF7, text #1a1a1a, accent #C9862A, muted #888880, navy #0F1F3D. Cover and Investor Brief: #0a0a0a background copper accents. DIRECTIONAL ESTIMATE boxes: #fff8f0 background 3px #C9862A left border. Za3fran next steps box: #0F1F3D background white text. Tables: #e8e8e4 borders alternating rows navy headers. Max-width 860px centered. Footer each section: "Za3fran Digital · Business Plan Essentials · ' + today + '". @media print page-break on major sections. RETURN ONLY the complete HTML. Start with <!DOCTYPE html>.';

  return intro + '\n\n' +
    '=== DONNEES VALIDATOR / VALIDATOR DATA ===\n' + dataBlock + '\n\n' +
    '=== STRUCTURE (14 sections) ===\n' + structure + '\n\n' +
    design;
}
