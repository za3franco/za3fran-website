// ============================================================
// /api/generate-bp.js  (v6 — three-pass Haiku, definitive)
// Three passes, each conservatively sized for worst-case Haiku:
//   Pass 1: sections 1-7    → 9,000 tokens → ≤90s
//   Pass 2: sections 8-11   → 10,000 tokens → ≤100s
//   Pass 3: sections 12-14  → 6,000 tokens → ≤60s
//   Total worst-case: ~260s, within 300s Vercel limit.
// maxDuration: 300 set in vercel.json.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const HAIKU = 'claude-haiku-4-5-20251001';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var bpRunId = (req.body || {}).bpRunId;
  if (!bpRunId) return res.status(400).json({ error: 'bpRunId required' });

  var runResult = await supabase
    .from('business_plan_essentials_runs')
    .select('id, output_html, output_json, currency, language')
    .eq('id', bpRunId).single();

  if (runResult.error || !runResult.data) return res.status(404).json({ error: 'Not found' });
  var run = runResult.data;
  if (run.output_html) return res.status(200).json({ ready: true });

  var meta = run.output_json || {};
  if (meta.status === 'generating') return res.status(200).json({ status: 'generating' });

  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: Object.assign({}, meta, { status: 'generating' }) })
    .eq('id', bpRunId);

  if (!meta.validator_report_id) return res.status(422).json({ error: 'Missing validator_report_id' });

  var vrRes  = await supabase.from('validator_reports').select('report_json').eq('id', meta.validator_report_id).single();
  var subRes = await supabase.from('validator_submissions').select('*').eq('id', meta.submission_id).single();

  if (!vrRes.data || !vrRes.data.report_json) return res.status(422).json({ error: 'report_json not found' });

  var ctx = buildCtx(vrRes.data.report_json, subRes.data, run.currency || 'EUR', run.language || 'fr');

  console.log('[bp] Starting 3-pass generation: ' + bpRunId);

  async function callClaude(prompt, maxTokens, abortMs) {
    var ctrl = new AbortController();
    var t = setTimeout(function() { ctrl.abort(); }, abortMs);
    try {
      var r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
        body: JSON.stringify({ model: HAIKU, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      });
      clearTimeout(t);
      var d = await r.json();
      if (!r.ok || !d.content || !d.content[0] || !d.content[0].text) throw new Error('API ' + r.status + ': ' + JSON.stringify((d.error || {}).message || ''));
      return d.content[0].text.trim().replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
    } catch(e) { clearTimeout(t); throw e; }
  }

  function stripWrapper(html) {
    return html.replace(/<!DOCTYPE[^>]*>/gi,'').replace(/<\/?html[^>]*>/gi,'').replace(/<head[\s\S]*?<\/head>/gi,'').replace(/<\/?body[^>]*>/gi,'').trim();
  }

  var p1 = '', p2 = '', p3 = '';
  try {
    console.log('[bp] Pass 1 (s1-7, 9000t)...');
    p1 = await callClaude(buildP1(ctx), 9000, 100000);
    if (!p1.startsWith('<!DOCTYPE') && !p1.startsWith('<html')) throw new Error('Pass 1 bad HTML: ' + p1.substring(0,80));
    console.log('[bp] P1 done: ' + p1.length + 'c');

    console.log('[bp] Pass 2 (s8-11, 10000t)...');
    p2 = stripWrapper(await callClaude(buildP2(ctx), 10000, 110000));
    console.log('[bp] P2 done: ' + p2.length + 'c');

    console.log('[bp] Pass 3 (s12-14, 6000t)...');
    p3 = stripWrapper(await callClaude(buildP3(ctx), 6000, 70000));
    console.log('[bp] P3 done: ' + p3.length + 'c');

  } catch(err) {
    console.error('[bp] Error: ' + err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: err.message }) })
      .eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  var final = p1.includes('</body>')
    ? p1.replace('</body>', '\n' + p2 + '\n' + p3 + '\n</body>')
    : p1 + '\n' + p2 + '\n' + p3 + '\n</body></html>';

  var saved = await supabase.from('business_plan_essentials_runs')
    .update({ output_html: final, output_json: Object.assign({}, meta, { status: 'complete' }) })
    .eq('id', bpRunId);

  if (saved.error) return res.status(500).json({ error: 'Save failed: ' + saved.error.message });
  console.log('[bp] Complete: ' + final.length + 'c total');
  return res.status(200).json({ ready: true });
}

// ── SHARED CONTEXT ────────────────────────────────────────────
function buildCtx(rj, sub, currency, language) {
  var snap = (rj && rj.concept_snapshot) || {};
  var ov   = (rj && rj.overall) || {};
  var sec  = (rj && rj.sections) || {};
  var fin  = sec.s4_financial || {};
  var be   = fin.breakeven || {};
  var sc   = fin.scenarios || {};
  var sym  = currency === 'MAD' ? 'MAD' : (currency === 'USD' ? '$' : '\u20ac');
  var isFr = language === 'fr';
  var fmt  = function(n) { return n ? Number(n).toLocaleString(isFr ? 'fr-FR' : 'en-US') : 'N/A'; };
  var scl  = function(s) { return s ? s.covers_day + 'c/j \u2192 ' + sym + fmt(s.monthly_result) + '/mois' : 'N/A'; };
  return {
    snap:snap, ov:ov, sec:sec, fin:fin, be:be, sc:sc,
    sym:sym, isFr:isFr, fmt:fmt, scl:scl, currency:currency,
    today: new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day:'numeric', month:'long', year:'numeric' }),
    audience: Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience || 'N/A'),
    risks: ((sec.s6_risks && sec.s6_risks.risks) || []).map(function(r){ return r.title; }).filter(Boolean).join(' | ') || 'N/A',
    recs:  ((sec.s5_strategy && sec.s5_strategy.recommendations) || []).map(function(r){ return r.title; }).filter(Boolean).join(' | ') || 'N/A',
    market: ((sec.s2_market && sec.s2_market.narrative) || '').substring(0, 400) || 'N/A',
    compet: ((sec.s3_competitive && sec.s3_competitive.narrative) || '').substring(0, 300) || 'N/A',
    alerts: (fin.alerts || []).map(function(a){ return a.title; }).filter(Boolean).join(' | ') || 'N/A',
  };
}

function dataBlock(c) {
  return [
    'CONCEPT: '+(c.snap.concept_name||'N/A')+'  TYPE: '+(c.snap.type||'N/A')+'  CUISINE: '+(c.snap.cuisine||'N/A'),
    'VILLE: '+(c.snap.city||'N/A')+(c.snap.neighbourhood?' / '+c.snap.neighbourhood:''),
    'TICKET: '+(c.snap.ticket||'N/A')+' '+c.currency+'  COUVERTS/J: '+(c.snap.covers||'N/A')+'  PLACES: '+(c.snap.seats||'N/A'),
    'BUDGET: '+(c.snap.budget||'N/A')+' '+c.currency+'  STADE: '+(c.snap.stage||'N/A'),
    'HORAIRES: '+(c.snap.opening_hours||'N/A')+'  AUDIENCE: '+c.audience,
    'DESCRIPTION: '+(c.snap.description||'N/A'),
    'DIFFERENTIATION: '+(c.snap.differentiation||'N/A'),
    'VIDE DE MARCHE: '+(c.snap.market_gap||'N/A'),
    'CONCURRENTS: '+(c.snap.competitors||'N/A'),
    'SCORE VALIDATOR: '+(c.ov.score||'N/A')+'/100  VERDICT: '+(c.ov.verdict||'N/A'),
    'RESUME: '+(c.ov.executive_summary||'N/A'),
    'POINT MORT: '+c.sym+c.fmt(c.be.monthly_revenue)+'/mois  '+(c.be.daily_covers||'N/A')+' couverts/jour',
    'CONSERVATEUR: '+c.scl(c.sc.conservative),
    'BASE: '+c.scl(c.sc.base),
    'OPTIMISTE: '+c.scl(c.sc.optimistic),
    'ALERTES FINANCIERES: '+c.alerts,
    'ANALYSE MARCHE: '+c.market,
    'ANALYSE CONCURRENTIELLE: '+c.compet,
    'RECOMMANDATIONS STRATEGIQUES: '+c.recs,
    'RISQUES: '+c.risks,
    'DEVISE: '+c.currency+' ('+c.sym+')  DATE: '+c.today,
  ].join('\n');
}

var CSS_DESIGN = 'DESIGN: Document HTML complet auto-contenu, tout le CSS dans <head>. Google Fonts: Cormorant Garamond (titres) + DM Sans (corps). Background doc #FAFAF7, texte #1a1a1a, accent #C9862A, navy #0F1F3D. Page couverture fond #0a0a0a. Tableaux: bordures 1px #e8e8e4, rangees alternees (#F5F4F0/blanc), en-tetes #0F1F3D texte blanc. Encadres ESTIMATION DIRECTIONNELLE: fond #fff8f0 bordure gauche 3px #C9862A. En-tetes sections: numero grand Cormorant cuivre + titre navy DM Sans. Max-width 860px centre. Footer chaque section. @media print page-break-before chaque section.';

var FRAG_STYLE = 'STYLE: Memes classes CSS que le document principal. Encadres ESTIMATION DIRECTIONNELLE: fond #fff8f0 bordure gauche 3px #C9862A. En-tetes: numero Cormorant cuivre + titre navy. Tableaux: #e8e8e4, rangees alternees, en-tetes #0F1F3D. Footer chaque section. @media print page-break-before chaque section.';

// ── PASS 1: Sections 1-7 ─────────────────────────────────────
function buildP1(c) {
  var fr = c.isFr;
  var s = fr ? [
    '1. PAGE DE COUVERTURE: fond #0a0a0a. Nom concept grand Cormorant. Sous-titre cuivre (format/cuisine/ville). Badge score: cercle cuivre, '+c.ov.score+'/100, '+c.ov.verdict+'. "Prepare par Za3fran Digital" + date.',
    '2. BRIEF INVESTISSEUR (standalone 2 pages pour banquier/investisseur): tableau fiche concept [Concept|Format|Cuisine|Localisation|Places|Ticket|Horaires|Stade]; opportunite marche 3 phrases; proposition valeur 4-5 bullets; tableau financier [Investissement total (fourchette)|Point mort mensuel|CA A1/A2/A3|EBITDA A1/A2/A3|Delai retour]; besoin financement (montant + repartition fonds propres/dette); 3 risques avec niveau; badge score '+c.ov.score+'/100.',
    '3. TABLE DES MATIERES.',
    '4. RESUME EXECUTIF (300 mots): contexte marche, concept, modele economique, besoins financement, potentiel, risques.',
    '5. CONCEPT & POSITIONNEMENT: vision et raison d\'etre; identite de marque; proposition de valeur detaillee; format operationnel et experience client.',
    '6. ANALYSE DE MARCHE & AUDIENCE CIBLE: dynamiques marche local, vide de marche, 2-3 personas (age/profession/habitudes), signaux de demande, facteurs macro.',
    '7. PAYSAGE CONCURRENTIEL: tableau 6-8 acteurs [Nom|Type|Ticket|Meme client?|Force|Faiblesse|Menace]; axes de differenciation; defensibilite du concept (score 1-5); risque entrants capitalises.',
  ].join('\n') : [
    '1. COVER PAGE: #0a0a0a background. Large Cormorant concept name. Copper subtitle (format/cuisine/city). Score badge: copper circle, '+c.ov.score+'/100, '+c.ov.verdict+'. "Prepared by Za3fran Digital" + date.',
    '2. INVESTOR BRIEF (standalone 2 pages for banker/investor): concept sheet table [Concept|Format|Cuisine|Location|Seats|Ticket|Hours|Stage]; market opportunity 3 sentences; value proposition 4-5 bullets; financial table [Total investment (range)|Monthly break-even|Revenue Y1/Y2/Y3|EBITDA Y1/Y2/Y3|Payback]; funding requirement (amount + equity/debt split); 3 risks with level; score badge '+c.ov.score+'/100.',
    '3. TABLE OF CONTENTS.',
    '4. EXECUTIVE SUMMARY (300 words): market context, concept, business model, funding needs, potential, risks.',
    '5. CONCEPT & POSITIONING: vision and rationale; brand identity; detailed value proposition; operational format and customer experience.',
    '6. MARKET ANALYSIS & TARGET AUDIENCE: local market dynamics, market gap, 2-3 personas (age/profession/habits), demand signals, macro factors.',
    '7. COMPETITIVE LANDSCAPE: table 6-8 players [Name|Type|Ticket|Same customer?|Strength|Weakness|Threat]; differentiation axes; defensibility score (1-5); capitalised entrant risk.',
  ].join('\n');

  return (fr ? 'Expert F&B senior. Genere SECTIONS 1 A 7 UNIQUEMENT d\'un business plan professionnel. Sois dense et concis.' : 'Senior F&B expert. Generate SECTIONS 1 TO 7 ONLY of a professional business plan. Be dense and concise.')
    + '\n\n=== DONNEES ===\n' + dataBlock(c)
    + '\n\n=== SECTIONS 1-7 ===\n' + s
    + '\n\n' + CSS_DESIGN
    + '\n\n' + (fr ? 'Termine par </body></html> apres la section 7. Retourne UNIQUEMENT le HTML. Commence par <!DOCTYPE html>.' : 'End with </body></html> after section 7. Return ONLY the HTML. Start with <!DOCTYPE html>.');
}

// ── PASS 2: Sections 8-11 ────────────────────────────────────
function buildP2(c) {
  var fr = c.isFr;
  var sym = c.sym;
  var cur = c.currency;
  var fn  = fr ? 'ESTIMATION DIRECTIONNELLE - benchmarks F&B MENA. A valider avec Financial Builder Za3fran.' : 'DIRECTIONAL ESTIMATE - MENA F&B benchmarks. Validate with Za3fran Financial Builder.';

  var s = fr ? [
    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE]: tableau structure menu [Section|Nb items|Fourchette prix '+sym+'|Food cost cible %]; logique pricing et ticket cible; 2-3 fournisseurs regionaux nommes; 3-5 items signature (nom + concept en 1 ligne); contraintes operationnelles cles.',
    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE]: tableau staffing [Poste|Nb ETP|Salaire '+sym+'/mois|Total charges]; ratios productivite (couverts/serveur/service); modele de service et flux client; gestion des pics; 3 KPIs operationnels a suivre des J+30.',
    '10. PROJECTIONS FINANCIERES ['+fn+']\n'
      +'10A. BUDGET DE DEMARRAGE: tableau ligne par ligne [Poste|Bas '+sym+'|Haut '+sym+'|Notes] incluant: travaux & amenagement, equipements cuisine pro, mobilier & decoration, IT & caisse, licences & autorisations, honoraires fiduciaire, fonds de roulement initial, marketing pre-ouverture, reserve tresorerie (minimum 3 mois charges fixes), contingence 8%. Ligne TOTAL avec fourchette basse et haute. Comparer au budget declare et commenter l\'ecart.\n'
      +'10B. PREVISIONS CA ANNEES 1-3: tableau mensuel A1 (12 mois) [Mois|Couverts/j|Jours|CA '+sym+'] avec montee en charge realiste (M1-2 conservateur, M3-6 montee vers base, M7-12 base). Tableau recap [Indicateur|A1|A2 (+25%)|A3 (+18%)].\n'
      +'10C. COMPTE DE RESULTAT PREVISIONNEL: tableau [Ligne|A1 '+sym+'|A1%|A2 '+sym+'|A2%|A3 '+sym+'|A3%] avec CA, cout matiere (benchmark 30-34%), marge brute, masse salariale chargee (28-32%), loyer (8-12%), energie (3-5%), emballages (2-4%), marketing (3-5%), amortissements, autres, EBITDA, resultat net.\n'
      +'10D. ANALYSE POINT MORT: tableau sensibilite 3x3 [ticket -10%/base/+15% x couverts/j -20%/base/+30%] montrant le resultat mensuel. Delai estime pour atteindre le point mort depuis l\'ouverture.\n'
      +'10E. ROI & FINANCEMENT: investissement total retenu (milieu fourchette 10A); flux de tresorerie cumules A1/A2/A3; point de retour sur investissement (mois); repartition recommandee fonds propres/dette; 2-3 institutions de financement locales a contacter.',
    '11. STRATEGIE MARKETING & CALENDRIER PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE]: tableau [Periode|Actions cles|Responsable|Budget '+sym+'] pour J-90/J-60/J-30/J-0; mix canaux recommande avec budget indicatif (Instagram, TikTok, livraison, micro-influenceurs, presse); strategie de lancement et evenement inaugural; strategie retention client post-ouverture; 4 KPIs marketing a suivre.',
  ].join('\n\n') : [
    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE]: menu structure table [Section|Items|Price range '+sym+'|Target food cost %]; pricing logic and target ticket; 2-3 named regional suppliers; 3-5 signature items (name + 1-line concept); key operational constraints.',
    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE]: staffing table [Position|FTE|Salary '+sym+'/month|Total incl. charges]; productivity ratios (covers/server/service); service model and customer flow; peak management; 3 operational KPIs to track from D+30.',
    '10. FINANCIAL PROJECTIONS ['+fn+']\n'
      +'10A. STARTUP BUDGET: line-by-line table [Item|Low '+sym+'|High '+sym+'|Notes] including: works & fit-out, professional kitchen equipment, furniture & decor, IT & POS, licenses & permits, legal/fiduciary fees, initial working capital, pre-opening marketing, cash reserve (minimum 3 months fixed costs), contingency 8%. TOTAL line with low/high range. Compare to stated budget and comment on gap.\n'
      +'10B. REVENUE PROJECTIONS Y1-Y3: monthly Y1 table (12 months) [Month|Covers/day|Trading days|Revenue '+sym+'] with realistic ramp-up (M1-2 conservative, M3-6 ramp to base, M7-12 base). Summary table [Metric|Y1|Y2 (+25%)|Y3 (+18%)].\n'
      +'10C. PROJECTED P&L: table [Line|Y1 '+sym+'|Y1%|Y2 '+sym+'|Y2%|Y3 '+sym+'|Y3%] with revenue, food cost (30-34%), gross margin, payroll incl. charges (28-32%), rent (8-12%), energy (3-5%), packaging (2-4%), marketing (3-5%), depreciation, other, EBITDA, net result.\n'
      +'10D. BREAK-EVEN ANALYSIS: 3x3 sensitivity table [ticket -10%/base/+15% x covers/day -20%/base/+30%] showing monthly result. Estimated months to reach break-even from opening.\n'
      +'10E. ROI & FUNDING: total investment retained (midpoint of 10A); cumulative cash flows Y1/Y2/Y3; payback period (months); recommended equity/debt split; 2-3 local financing institutions to contact.',
    '11. MARKETING STRATEGY & PRE-OPENING TIMELINE [DIRECTIONAL ESTIMATE]: table [Period|Key actions|Owner|Budget '+sym+'] for D-90/D-60/D-30/D-0; recommended channel mix with indicative budget (Instagram, TikTok, delivery, micro-influencers, press); launch strategy and inaugural event; post-opening retention strategy; 4 marketing KPIs to track.',
  ].join('\n\n');

  return (fr ? 'Expert F&B senior. Genere SECTIONS 8 A 11 UNIQUEMENT. Retourne UNIQUEMENT des elements HTML (pas de DOCTYPE/html/head/body). Sois exhaustif sur la section 10 - tous les tableaux doivent etre complets.' : 'Senior F&B expert. Generate SECTIONS 8 TO 11 ONLY. Return ONLY HTML elements (no DOCTYPE/html/head/body). Be thorough on section 10 - all tables must be complete.')
    + '\n\n=== DONNEES ===\n' + dataBlock(c)
    + '\n\n=== SECTIONS 8-11 ===\n' + s
    + '\n\n' + FRAG_STYLE
    + '\n\n' + (fr ? 'Retourne UNIQUEMENT le HTML des sections 8-11. Pas de DOCTYPE.' : 'Return ONLY the HTML for sections 8-11. No DOCTYPE.');
}

// ── PASS 3: Sections 12-14 ───────────────────────────────────
function buildP3(c) {
  var fr = c.isFr;
  var sym = c.sym;

  var s = fr ? [
    '12. ANALYSE DES RISQUES: tableau [Risque|Probabilite (Eleve/Moyen/Faible)|Impact (Critique/Eleve/Moyen)|Score|Mitigation principale] avec 6 risques couvrant: financier, operationnel, marche, concurrentiel, reglementaire, humain. Pour chaque risque: paragraphe d\'analyse specifique a CE concept dans CETTE ville. Plan de contingence detaille pour le risque #1.',
    '13. RECOMMANDATIONS & PROCHAINES ETAPES: 5 actions prioritaires dans les 30 prochains jours (issues des recommandations Validator). Ce que ce plan vous dit de faire - et ce qu\'il ne peut pas encore vous dire. Encadre "Approfondissez avec Za3fran" (fond #0F1F3D, texte blanc, accent cuivre): Menu Engineer (architecture menu coute avec food cost reel et prix de vente), Financial Builder (modele financier complet base sur vos donnees reelles - remplace les estimations directionnelles), Business Plan Pro (business plan niveau financement bancaire avec donnees entierement modelisees).',
    '14. ANNEXES: Tableau recapitulatif scores Validator [Section|Sous-score|Ponderation|Contribution]. Note methodologique (comment ce document a ete genere, definition des estimations directionnelles, limites d\'usage). Glossaire des principaux termes financiers et operationnels utilises.',
  ].join('\n\n') : [
    '12. RISK ANALYSIS: table [Risk|Probability (High/Medium/Low)|Impact (Critical/High/Medium)|Score|Main mitigation] with 6 risks covering: financial, operational, market, competitive, regulatory, human. For each risk: analysis paragraph specific to THIS concept in THIS city. Detailed contingency plan for risk #1.',
    '13. RECOMMENDATIONS & NEXT STEPS: 5 priority actions in the next 30 days (from Validator recommendations). What this plan tells you to do - and what it cannot yet tell you. "Go deeper with Za3fran" box (background #0F1F3D, white text, copper accent): Menu Engineer (costed menu architecture with real food cost and selling prices), Financial Builder (complete financial model from your real data - replaces directional estimates), Business Plan Pro (bank-financing-grade business plan with fully modelled data).',
    '14. APPENDICES: Validator score summary table [Section|Sub-score|Weight|Contribution]. Methodology note (how this document was generated, definition of directional estimates, usage limitations). Glossary of key financial and operational terms used.',
  ].join('\n\n');

  return (fr ? 'Expert F&B senior. Genere SECTIONS 12 A 14 UNIQUEMENT. Retourne UNIQUEMENT des elements HTML (pas de DOCTYPE/html/head/body).' : 'Senior F&B expert. Generate SECTIONS 12 TO 14 ONLY. Return ONLY HTML elements (no DOCTYPE/html/head/body).')
    + '\n\n=== DONNEES ===\n' + dataBlock(c)
    + '\n\n=== SECTIONS 12-14 ===\n' + s
    + '\n\n' + FRAG_STYLE
    + '\n\n' + (fr ? 'Retourne UNIQUEMENT le HTML des sections 12-14. Pas de DOCTYPE.' : 'Return ONLY the HTML for sections 12-14. No DOCTYPE.');
}
