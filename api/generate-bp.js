// ============================================================
// /api/generate-bp.js  (v4 — two-pass generation)
// Splits BP into two Claude calls (~135s each) to fit in 300s.
// Part 1: sections 1-7 (complete HTML with CSS)
// Part 2: sections 8-14 (HTML fragments, no wrapper)
// Combined and saved as a single document.
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

  const body = req.body || {};
  const bpRunId = body.bpRunId;
  if (!bpRunId) return res.status(400).json({ error: 'bpRunId required' });

  const runResult = await supabase
    .from('business_plan_essentials_runs')
    .select('id, output_html, output_json, currency, language, model_used')
    .eq('id', bpRunId)
    .single();

  var bpRun = runResult.data;
  var runError = runResult.error;

  if (runError || !bpRun) return res.status(404).json({ error: 'BP run not found' });
  if (bpRun.output_html) return res.status(200).json({ ready: true });

  var meta = bpRun.output_json || {};
  if (meta.status === 'generating') {
    return res.status(200).json({ status: 'generating' });
  }

  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: Object.assign({}, meta, { status: 'generating' }) })
    .eq('id', bpRunId);

  var validatorReportId = meta.validator_report_id;
  var submissionId = meta.submission_id;

  if (!validatorReportId) {
    return res.status(422).json({ error: 'Missing validator_report_id' });
  }

  var vrResult = await supabase
    .from('validator_reports')
    .select('report_json')
    .eq('id', validatorReportId)
    .single();

  if (!vrResult.data || !vrResult.data.report_json) {
    return res.status(422).json({ error: 'Validator report_json not found' });
  }

  var subResult = await supabase
    .from('validator_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  var reportJson = vrResult.data.report_json;
  var submission = subResult.data;
  var currency = bpRun.currency || 'EUR';
  var language = bpRun.language || 'en';
  var model = bpRun.model_used || getModel('essentials');

  console.log('[generate-bp] Starting two-pass generation for: ' + bpRunId);

  // ── Helper: call Claude with timeout ──────────────────────
  async function callClaude(prompt, maxTokens, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
    try {
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      clearTimeout(timer);
      var data = await response.json();
      if (!response.ok || !data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('API error ' + response.status + ': ' + JSON.stringify(data.error || ''));
      }
      return data.content[0].text.trim();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ── Build shared data context ─────────────────────────────
  var ctx = buildContext(reportJson, submission, currency, language);

  var part1Html = '';
  var part2Fragment = '';

  try {
    // ── PASS 1: Sections 1-7 with full HTML/CSS wrapper ─────
    console.log('[generate-bp] Pass 1 starting...');
    var prompt1 = buildPromptPart1(ctx, currency, language);
    part1Html = await callClaude(prompt1, 11000, 145000);
    part1Html = part1Html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    if (!part1Html.startsWith('<!DOCTYPE') && !part1Html.startsWith('<html')) {
      throw new Error('Part 1 did not return valid HTML');
    }
    console.log('[generate-bp] Pass 1 done: ' + part1Html.length + ' chars');

    // ── PASS 2: Sections 8-14 as HTML fragment ───────────────
    console.log('[generate-bp] Pass 2 starting...');
    var prompt2 = buildPromptPart2(ctx, currency, language);
    part2Fragment = await callClaude(prompt2, 11000, 145000);
    part2Fragment = part2Fragment.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    // Strip any accidental HTML wrapper from part 2
    part2Fragment = part2Fragment.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '').replace(/<\/?body[^>]*>/gi, '').trim();
    console.log('[generate-bp] Pass 2 done: ' + part2Fragment.length + ' chars');

  } catch (err) {
    console.error('[generate-bp] Generation error: ' + err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: err.message }) })
      .eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  // ── Combine: inject part2 before </body> in part1 ─────────
  var finalHtml;
  if (part1Html.includes('</body>')) {
    finalHtml = part1Html.replace('</body>', '\n' + part2Fragment + '\n</body>');
  } else {
    finalHtml = part1Html + '\n' + part2Fragment + '\n</body></html>';
  }

  var saveResult = await supabase
    .from('business_plan_essentials_runs')
    .update({
      output_html: finalHtml,
      output_json: Object.assign({}, meta, { status: 'complete' }),
    })
    .eq('id', bpRunId);

  if (saveResult.error) {
    console.error('[generate-bp] Save error: ' + saveResult.error.message);
    return res.status(500).json({ error: 'Save failed' });
  }

  console.log('[generate-bp] Complete. Total: ' + finalHtml.length + ' chars');
  return res.status(200).json({ ready: true });
}

// ── Build shared data context string ─────────────────────────
function buildContext(reportJson, submission, currency, language) {
  var snap    = (reportJson && reportJson.concept_snapshot) ? reportJson.concept_snapshot : {};
  var overall = (reportJson && reportJson.overall) ? reportJson.overall : {};
  var secs    = (reportJson && reportJson.sections) ? reportJson.sections : {};
  var fin     = secs.s4_financial || {};
  var be      = fin.breakeven || {};
  var sc      = fin.scenarios || {};
  var sym     = currency === 'MAD' ? 'MAD' : (currency === 'USD' ? '$' : '\u20ac');
  var isFr    = language === 'fr';

  function fmtNum(n) { return n ? Number(n).toLocaleString(isFr ? 'fr-FR' : 'en-US') : 'N/A'; }
  function scLine(s) { return s ? s.covers_day + 'c/j \u2192 ' + sym + fmtNum(s.monthly_result) + '/mois' : 'N/A'; }

  var audience = Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience || 'N/A');
  var risks    = ((secs.s6_risks && secs.s6_risks.risks) ? secs.s6_risks.risks : []).map(function(r) { return r.title; }).filter(Boolean).join(' | ') || 'N/A';
  var recs     = ((secs.s5_strategy && secs.s5_strategy.recommendations) ? secs.s5_strategy.recommendations : []).map(function(r) { return r.title; }).filter(Boolean).join(' | ') || 'N/A';
  var today    = new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    snap: snap, overall: overall, secs: secs, fin: fin, be: be, sc: sc,
    sym: sym, isFr: isFr, audience: audience, risks: risks, recs: recs,
    today: today, currency: currency,
    market:  (secs.s2_market && secs.s2_market.narrative) ? secs.s2_market.narrative.substring(0, 400) : 'N/A',
    compet:  (secs.s3_competitive && secs.s3_competitive.narrative) ? secs.s3_competitive.narrative.substring(0, 300) : 'N/A',
    alerts:  (fin.alerts || []).map(function(a) { return a.title; }).filter(Boolean).join(' | ') || 'N/A',
    fmtNum:  fmtNum,
    scLine:  scLine,
  };
}

// ── PART 1 PROMPT: Sections 1-7 (complete HTML with CSS) ─────
function buildPromptPart1(c, currency, language) {
  var isFr = c.isFr;
  var sym  = c.sym;

  var dataBlock = [
    'CONCEPT: ' + (c.snap.concept_name || 'N/A') + '  TYPE: ' + (c.snap.type || 'N/A') + '  CUISINE: ' + (c.snap.cuisine || 'N/A'),
    'VILLE: ' + (c.snap.city || 'N/A') + (c.snap.neighbourhood ? ' / ' + c.snap.neighbourhood : ''),
    'TICKET: ' + (c.snap.ticket || 'N/A') + ' ' + currency + '  COUVERTS/JOUR: ' + (c.snap.covers || 'N/A') + '  PLACES: ' + (c.snap.seats || 'N/A'),
    'BUDGET: ' + (c.snap.budget || 'N/A') + ' ' + currency + '  STADE: ' + (c.snap.stage || 'N/A') + '  HORAIRES: ' + (c.snap.opening_hours || 'N/A'),
    'AUDIENCE: ' + c.audience,
    'DESCRIPTION: ' + (c.snap.description || 'N/A'),
    'DIFFERENTIATION: ' + (c.snap.differentiation || 'N/A'),
    'VIDE MARCHE: ' + (c.snap.market_gap || 'N/A'),
    'CONCURRENTS: ' + (c.snap.competitors || 'N/A'),
    'VALIDATOR: ' + (c.overall.score || 'N/A') + '/100  ' + (c.overall.verdict || 'N/A'),
    'RESUME: ' + (c.overall.executive_summary || 'N/A'),
    'POINT MORT: ' + sym + c.fmtNum(c.be.monthly_revenue) + '/mois  ' + (c.be.daily_covers || 'N/A') + ' couverts/jour',
    'CONSERVATEUR: ' + c.scLine(c.sc.conservative),
    'BASE: ' + c.scLine(c.sc.base),
    'OPTIMISTE: ' + c.scLine(c.sc.optimistic),
    'ALERTES: ' + c.alerts,
    'MARCHE: ' + c.market,
    'CONCURRENCE: ' + c.compet,
    'RECOMMANDATIONS: ' + c.recs,
    'RISQUES: ' + c.risks,
    'DEVISE: ' + currency + ' (' + sym + ')  DATE: ' + c.today,
  ].join('\n');

  var intro = isFr
    ? 'Tu es un expert senior en strategie F&B. Genere la PREMIERE PARTIE d\'un business plan professionnel. Sois concis et dense — privilegie les tableaux et chiffres sur la prose.'
    : 'You are a senior F&B strategy expert. Generate the FIRST PART of a professional business plan. Be concise and dense — prioritise tables and figures over prose.';

  var sections = isFr ? [
    '1. PAGE DE COUVERTURE: fond #0a0a0a, nom concept grand Cormorant, sous-titre cuivre (format/cuisine/ville), badge score Validator (cercle cuivre score/100 verdict), "Prepare par Za3fran Digital" + date.',
    '2. BRIEF INVESTISSEUR (standalone 2 pages): (a) tableau fiche concept; (b) opportunite marche 3 phrases; (c) proposition valeur 4-5 bullets; (d) tableau resume financier [Investissement|Point mort|CA A1/A2/A3|EBITDA A1/A2/A3|Delai retour]; (e) besoin financement; (f) 3 risques avec niveau; (g) badge score Za3fran.',
    '3. TABLE DES MATIERES: lister les 14 sections.',
    '4. RESUME EXECUTIF (350 mots): marche, concept, modele economique, financement, potentiel, risques.',
    '5. CONCEPT & POSITIONNEMENT: vision, identite marque, proposition valeur detaillee, format operationnel, experience client.',
    '6. ANALYSE DE MARCHE & AUDIENCE: dynamiques marche local, vide marche, 2-3 personas detailles, signaux demande MENA, facteurs macro.',
    '7. PAYSAGE CONCURRENTIEL: tableau 6-8 acteurs [Nom|Type|Ticket|Meme client?|Force|Faiblesse|Menace]; differenciateurs; defensibilite; risque entrants.',
  ].join('\n') : [
    '1. COVER PAGE: #0a0a0a background, large Cormorant concept name, copper subtitle (format/cuisine/city), Validator score badge (copper circle score/100 verdict), "Prepared by Za3fran Digital" + date.',
    '2. INVESTOR BRIEF (standalone 2 pages): (a) concept sheet table; (b) market opportunity 3 sentences; (c) value proposition 4-5 bullets; (d) financial summary table [Investment|Break-even|Revenue Y1/Y2/Y3|EBITDA Y1/Y2/Y3|Payback]; (e) funding requirement; (f) 3 risks with level; (g) Za3fran score badge.',
    '3. TABLE OF CONTENTS: list all 14 sections.',
    '4. EXECUTIVE SUMMARY (350 words): market, concept, business model, funding, potential, risks.',
    '5. CONCEPT & POSITIONING: vision, brand identity, detailed value proposition, operational format, customer experience.',
    '6. MARKET ANALYSIS & AUDIENCE: local market dynamics, market gap, 2-3 detailed personas, MENA demand signals, macro factors.',
    '7. COMPETITIVE LANDSCAPE: table 6-8 players [Name|Type|Ticket|Same customer?|Strength|Weakness|Threat]; differentiators; defensibility; entrant risk.',
  ].join('\n');

  var design = isFr
    ? 'HTML: Document COMPLET auto-contenu avec tout le CSS. Cormorant Garamond (titres) + DM Sans (corps) via Google Fonts. Background #FAFAF7, texte #1a1a1a, accent #C9862A, navy #0F1F3D. Page couverture fond #0a0a0a. Tableaux: bordures #e8e8e4, rangees alternees, en-tetes #0F1F3D. Max-width 860px centre. Footer chaque section. @media print page-break-before sur chaque section. IMPORTANT: Termine le document avec </body></html> apres la section 7. Les sections 8-14 seront ajoutees separement.'
    : 'HTML: COMPLETE self-contained document with all CSS. Cormorant Garamond (headings) + DM Sans (body) via Google Fonts. Background #FAFAF7, text #1a1a1a, accent #C9862A, navy #0F1F3D. Cover page #0a0a0a. Tables: #e8e8e4 borders, alternating rows, #0F1F3D headers. Max-width 860px centered. Footer each section. @media print page-break-before on each section. IMPORTANT: End the document with </body></html> after section 7. Sections 8-14 will be added separately.';

  return intro + '\n\n=== DATA ===\n' + dataBlock + '\n\n=== SECTIONS 1-7 ONLY ===\n' + sections + '\n\n' + design + '\n\nRetourne UNIQUEMENT le HTML. Commence par <!DOCTYPE html>.';
}

// ── PART 2 PROMPT: Sections 8-14 (HTML fragment only) ────────
function buildPromptPart2(c, currency, language) {
  var isFr = c.isFr;
  var sym  = c.sym;

  var finNote = isFr
    ? 'ESTIMATIONS DIRECTIONNELLES - benchmarks F&B MENA. A valider avec Financial Builder Za3fran.'
    : 'DIRECTIONAL ESTIMATES - MENA F&B benchmarks. To validate with Za3fran Financial Builder.';

  var dataBlock = [
    'CONCEPT: ' + (c.snap.concept_name || 'N/A') + '  CUISINE: ' + (c.snap.cuisine || 'N/A') + '  VILLE: ' + (c.snap.city || 'N/A'),
    'TICKET: ' + (c.snap.ticket || 'N/A') + ' ' + currency + '  COUVERTS/JOUR: ' + (c.snap.covers || 'N/A') + '  PLACES: ' + (c.snap.seats || 'N/A'),
    'BUDGET: ' + (c.snap.budget || 'N/A') + ' ' + currency + '  HORAIRES: ' + (c.snap.opening_hours || 'N/A'),
    'POINT MORT: ' + sym + c.fmtNum(c.be.monthly_revenue) + '/mois  ' + (c.be.daily_covers || 'N/A') + ' couverts/jour',
    'CONSERVATEUR: ' + c.scLine(c.sc.conservative),
    'BASE: ' + c.scLine(c.sc.base),
    'OPTIMISTE: ' + c.scLine(c.sc.optimistic),
    'ALERTES: ' + c.alerts,
    'RECOMMANDATIONS: ' + c.recs,
    'RISQUES: ' + c.risks,
    'DEVISE: ' + currency + ' (' + sym + ')  DATE: ' + c.today,
  ].join('\n');

  var intro = isFr
    ? 'Tu es un expert senior en strategie F&B. Genere la DEUXIEME PARTIE d\'un business plan. IMPORTANT: Retourne UNIQUEMENT des elements HTML (sections, divs, tableaux) — PAS de DOCTYPE, PAS de balises html/head/body. Ces sections seront inserees dans un document HTML existant qui contient deja tout le CSS.'
    : 'You are a senior F&B strategy expert. Generate the SECOND PART of a business plan. IMPORTANT: Return ONLY HTML elements (sections, divs, tables) — NO DOCTYPE, NO html/head/body tags. These sections will be inserted into an existing HTML document that already contains all CSS.';

  var sections = isFr ? [
    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE]: architecture menu tableau [Section|Nb items|Fourchette prix ' + sym + '|Food cost cible %]; logique pricing et ticket cible; 2-3 fournisseurs regionaux nommes; 3-5 items signature (nom+concept); contraintes operationnelles.',

    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE]: tableau staffing [Poste|ETP|Salaire ' + sym + '/mois|Total charges]; ratios productivite; modele service et flux client; gestion des pics; KPIs operationnels J+30.',

    '10. PROJECTIONS FINANCIERES [' + finNote + ']\n' +
    '10A BUDGET DEMARRAGE: tableau ligne par ligne [Poste|Bas ' + sym + '|Haut ' + sym + '|Notes] couvrant travaux, equipements cuisine, mobilier/deco, IT/caisse, licences, honoraires fiduciaire, fonds de roulement, marketing pre-ouverture, reserve tresorerie (min 3 mois), contingence 8%, TOTAL; comparer au budget declare.\n' +
    '10B CA A1-A3: tableau mensuel A1 (12 mois) [Mois|Couverts/j|Jours|CA ' + sym + '|Note] montee en charge realiste; recap A1/A2(+25%)/A3(+18%).\n' +
    '10C P&L 3 ANS: tableau [Ligne|A1 ' + sym + '|A1%|A2 ' + sym + '|A2%|A3 ' + sym + '|A3%] avec CA, cout matiere, marge brute, masse salariale, loyer, energie, emballages, marketing, amortissements, EBITDA, resultat net.\n' +
    '10D POINT MORT: tableau sensibilite 3x3 [tickets -10%/base/+15% x couverts -20%/base/+30%] + delai estimé atteinte point mort.\n' +
    '10E ROI: investissement retenu, cumuls A1/A2/A3, point de retour (mois).\n' +
    '10F FINANCEMENT: repartition fonds propres/dette; cout dette local; 2-3 institutions a contacter.',

    '11. MARKETING & CALENDRIER PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE]: mix canaux avec budget indicatif; tableau 6 mois [Periode|Actions cles|Budget ' + sym + ']; strategie contenu J-90/J-60/J-30/J-0; evenement lancement; strategie retention; KPIs.',

    '12. ANALYSE DES RISQUES: tableau [Risque|Probabilite|Impact|Score|Mitigation] avec 6 risques; analyse specifique a CE concept dans CETTE ville; plan contingence risque #1.',

    '13. RECOMMANDATIONS & PROCHAINES ETAPES: 5 actions 30 jours; encadre "Approfondissez avec Za3fran" (fond #0F1F3D) — Menu Engineer (menu coute avec food cost reel), Financial Builder (modele financier complet base sur vos donnees reelles), Business Plan Pro (plan niveau financement bancaire, donnees modelisees).',

    '14. ANNEXES: tableau scores Validator; note methodologique; glossaire.',
  ].join('\n\n') : [
    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE]: menu architecture table [Section|Items|Price range ' + sym + '|Target food cost %]; pricing logic and target ticket; 2-3 named regional suppliers; 3-5 signature items (name+concept); operational constraints.',

    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE]: staffing table [Position|FTE|Salary ' + sym + '/month|Total incl. charges]; productivity ratios; service model and customer flow; peak management; operational KPIs D+30.',

    '10. FINANCIAL PROJECTIONS [' + finNote + ']\n' +
    '10A STARTUP BUDGET: line-by-line table [Item|Low ' + sym + '|High ' + sym + '|Notes] covering fit-out/works, kitchen equipment, furniture/decor, IT/POS, licenses, legal fees, working capital, pre-opening marketing, cash reserve (min 3 months), contingency 8%, TOTAL; compare to stated budget.\n' +
    '10B REVENUE Y1-Y3: monthly Y1 table (12 months) [Month|Covers/day|Trading days|Revenue ' + sym + '|Note] with realistic ramp-up; summary Y1/Y2(+25%)/Y3(+18%).\n' +
    '10C 3-YEAR P&L: table [Line|Y1 ' + sym + '|Y1%|Y2 ' + sym + '|Y2%|Y3 ' + sym + '|Y3%] with revenue, food cost, gross margin, payroll, rent, energy, packaging, marketing, depreciation, EBITDA, net result.\n' +
    '10D BREAK-EVEN: 3x3 sensitivity table [tickets -10%/base/+15% x covers -20%/base/+30%] + estimated months to break-even.\n' +
    '10E ROI: retained investment, cumulative Y1/Y2/Y3, payback point (months).\n' +
    '10F FUNDING: equity/debt split; local debt cost; 2-3 institutions to contact.',

    '11. MARKETING & PRE-OPENING TIMELINE [DIRECTIONAL ESTIMATE]: channel mix with indicative budget; 6-month table [Period|Key actions|Budget ' + sym + ']; content plan D-90/D-60/D-30/D-0; launch event; retention strategy; KPIs.',

    '12. RISK ANALYSIS: table [Risk|Probability|Impact|Score|Mitigation] with 6 risks; analysis specific to THIS concept in THIS city; contingency plan for risk #1.',

    '13. RECOMMENDATIONS & NEXT STEPS: 5 actions in 30 days; "Go deeper with Za3fran" box (background #0F1F3D) — Menu Engineer (costed menu with real food cost), Financial Builder (complete financial model from your real data), Business Plan Pro (bank-financing-grade plan with modelled data).',

    '14. APPENDICES: Validator score table; methodology note; glossary.',
  ].join('\n\n');

  var styleNote = isFr
    ? 'STYLE: Utilise les memes classes CSS que le reste du document. Encadres estimations directionnelles: fond #fff8f0 bordure gauche 3px #C9862A. En-tetes sections: numero cuivre Cormorant + titre navy. Tableaux: bordures #e8e8e4 rangees alternees en-tetes #0F1F3D. Footer chaque section. @media print page-break-before chaque section.'
    : 'STYLE: Use the same CSS classes as the rest of the document. Directional estimate boxes: #fff8f0 background 3px #C9862A left border. Section headers: copper Cormorant number + navy title. Tables: #e8e8e4 borders alternating rows #0F1F3D headers. Footer each section. @media print page-break-before each section.';

  return intro + '\n\n=== DATA ===\n' + dataBlock + '\n\n=== SECTIONS 8-14 ONLY ===\n' + sections + '\n\n' + styleNote + '\n\nRetourne UNIQUEMENT les elements HTML pour les sections 8-14. Pas de DOCTYPE. Pas de html/head/body.';
}
