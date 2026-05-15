// ============================================================
// /api/generate-bp.js  (v5 — both passes use Haiku)
// Two-pass generation. Both passes use Haiku for speed.
// Part 1: sections 1-7, Haiku, 11000 tokens, 145s abort
// Part 2: sections 8-14, Haiku, 12000 tokens, 150s abort
// Total expected: ~60-120s. Well within 300s Vercel limit.
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
    .eq('id', bpRunId)
    .single();

  if (runResult.error || !runResult.data) return res.status(404).json({ error: 'BP run not found' });
  var bpRun = runResult.data;

  if (bpRun.output_html) return res.status(200).json({ ready: true });

  var meta = bpRun.output_json || {};
  if (meta.status === 'generating') return res.status(200).json({ status: 'generating' });

  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: Object.assign({}, meta, { status: 'generating' }) })
    .eq('id', bpRunId);

  if (!meta.validator_report_id) return res.status(422).json({ error: 'Missing validator_report_id' });

  var vrResult = await supabase.from('validator_reports').select('report_json').eq('id', meta.validator_report_id).single();
  if (!vrResult.data || !vrResult.data.report_json) return res.status(422).json({ error: 'report_json not found' });

  var subResult = await supabase.from('validator_submissions').select('*').eq('id', meta.submission_id).single();

  var currency = bpRun.currency || 'EUR';
  var language = bpRun.language || 'en';
  var ctx = buildCtx(vrResult.data.report_json, subResult.data, currency, language);

  console.log('[bp] Starting two-pass Haiku generation for ' + bpRunId);

  async function claude(prompt, maxTokens, abortMs) {
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
      if (!r.ok || !d.content || !d.content[0] || !d.content[0].text) throw new Error('API error: ' + (d.error && d.error.message ? d.error.message : r.status));
      return d.content[0].text.trim().replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
    } catch(e) { clearTimeout(t); throw e; }
  }

  var part1 = '', part2 = '';
  try {
    console.log('[bp] Pass 1 (Haiku, 11000 tokens)...');
    part1 = await claude(prompt1(ctx), 11000, 145000);
    if (!part1.startsWith('<!DOCTYPE') && !part1.startsWith('<html')) throw new Error('Pass 1 invalid HTML: ' + part1.substring(0, 80));
    console.log('[bp] Pass 1 done: ' + part1.length + ' chars');

    console.log('[bp] Pass 2 (Haiku, 12000 tokens)...');
    part2 = await claude(prompt2(ctx), 12000, 150000);
    part2 = part2.replace(/<!DOCTYPE[^>]*>/gi,'').replace(/<\/?html[^>]*>/gi,'').replace(/<head[\s\S]*?<\/head>/gi,'').replace(/<\/?body[^>]*>/gi,'').trim();
    console.log('[bp] Pass 2 done: ' + part2.length + ' chars');

  } catch(err) {
    console.error('[bp] Error: ' + err.message);
    await supabase.from('business_plan_essentials_runs').update({ output_json: Object.assign({}, meta, { status: 'error', error: err.message }) }).eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  var final = part1.includes('</body>') ? part1.replace('</body>', '\n' + part2 + '\n</body>') : part1 + '\n' + part2 + '\n</body></html>';

  var save = await supabase.from('business_plan_essentials_runs').update({ output_html: final, output_json: Object.assign({}, meta, { status: 'complete', model_used: HAIKU }) }).eq('id', bpRunId);
  if (save.error) return res.status(500).json({ error: 'Save failed: ' + save.error.message });

  console.log('[bp] Complete: ' + final.length + ' chars');
  return res.status(200).json({ ready: true });
}

// ── SHARED CONTEXT ────────────────────────────────────────────
function buildCtx(rj, sub, currency, language) {
  var snap = (rj && rj.concept_snapshot) ? rj.concept_snapshot : {};
  var ov   = (rj && rj.overall) ? rj.overall : {};
  var sec  = (rj && rj.sections) ? rj.sections : {};
  var fin  = sec.s4_financial || {};
  var be   = fin.breakeven || {};
  var sc   = fin.scenarios || {};
  var sym  = currency === 'MAD' ? 'MAD' : (currency === 'USD' ? '$' : '\u20ac');
  var isFr = language === 'fr';
  var fmt  = function(n) { return n ? Number(n).toLocaleString(isFr ? 'fr-FR' : 'en-US') : 'N/A'; };
  var scl  = function(s) { return s ? s.covers_day + 'c/j \u2192 ' + sym + fmt(s.monthly_result) + '/mois' : 'N/A'; };
  var today = new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day:'numeric', month:'long', year:'numeric' });
  return {
    snap:snap, ov:ov, sec:sec, fin:fin, be:be, sc:sc,
    sym:sym, isFr:isFr, fmt:fmt, scl:scl, today:today, currency:currency,
    audience: Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience||'N/A'),
    risks: ((sec.s6_risks&&sec.s6_risks.risks)?sec.s6_risks.risks:[]).map(function(r){return r.title;}).filter(Boolean).join(' | ')||'N/A',
    recs:  ((sec.s5_strategy&&sec.s5_strategy.recommendations)?sec.s5_strategy.recommendations:[]).map(function(r){return r.title;}).filter(Boolean).join(' | ')||'N/A',
    market: (sec.s2_market&&sec.s2_market.narrative)?sec.s2_market.narrative.substring(0,400):'N/A',
    compet: (sec.s3_competitive&&sec.s3_competitive.narrative)?sec.s3_competitive.narrative.substring(0,300):'N/A',
    alerts: (fin.alerts||[]).map(function(a){return a.title;}).filter(Boolean).join(' | ')||'N/A',
  };
}

function data(c) {
  return [
    'CONCEPT: '+(c.snap.concept_name||'N/A')+'  TYPE: '+(c.snap.type||'N/A')+'  CUISINE: '+(c.snap.cuisine||'N/A'),
    'VILLE: '+(c.snap.city||'N/A')+(c.snap.neighbourhood?' / '+c.snap.neighbourhood:''),
    'TICKET: '+(c.snap.ticket||'N/A')+' '+c.currency+'  COUVERTS: '+(c.snap.covers||'N/A')+'/j  PLACES: '+(c.snap.seats||'N/A'),
    'BUDGET: '+(c.snap.budget||'N/A')+' '+c.currency+'  STADE: '+(c.snap.stage||'N/A')+'  HORAIRES: '+(c.snap.opening_hours||'N/A'),
    'AUDIENCE: '+c.audience,
    'DESCRIPTION: '+(c.snap.description||'N/A'),
    'DIFFERENTIATION: '+(c.snap.differentiation||'N/A'),
    'VIDE MARCHE: '+(c.snap.market_gap||'N/A'),
    'CONCURRENTS: '+(c.snap.competitors||'N/A'),
    'VALIDATOR: '+(c.ov.score||'N/A')+'/100  '+(c.ov.verdict||'N/A'),
    'RESUME: '+(c.ov.executive_summary||'N/A'),
    'POINT MORT: '+c.sym+c.fmt(c.be.monthly_revenue)+'/mois  '+(c.be.daily_covers||'N/A')+' couverts/jour',
    'CONSERVATEUR: '+c.scl(c.sc.conservative),
    'BASE: '+c.scl(c.sc.base),
    'OPTIMISTE: '+c.scl(c.sc.optimistic),
    'ALERTES: '+c.alerts,
    'MARCHE: '+c.market,
    'CONCURRENCE: '+c.compet,
    'RECOMMANDATIONS: '+c.recs,
    'RISQUES: '+c.risks,
    'DEVISE: '+c.currency+' ('+c.sym+')  DATE: '+c.today,
  ].join('\n');
}

// ── PROMPT 1: Sections 1-7 (complete HTML document) ──────────
function prompt1(c) {
  var fr = c.isFr;
  var sym = c.sym;

  var sections = fr ? [
    '1. PAGE DE COUVERTURE: fond #0a0a0a, nom concept grand Cormorant, sous-titre cuivre (format/cuisine/ville), badge score (cercle cuivre, '+c.ov.score+'/100, '+c.ov.verdict+'), "Prepare par Za3fran Digital", date '+c.today+'.',
    '2. BRIEF INVESTISSEUR (2 pages standalone pour banquier): (a) tableau fiche concept [Concept|Format|Cuisine|Localisation|Places|Ticket|Horaires|Stade]; (b) opportunite marche 3 phrases; (c) proposition valeur 4-5 bullets; (d) tableau financier [Investissement total|Point mort|CA A1/A2/A3|EBITDA A1/A2/A3|Delai retour]; (e) besoin financement (montant + repartition fonds propres/dette + usage); (f) 3 risques avec niveau (Eleve/Moyen/Faible); (g) badge score Za3fran '+c.ov.score+'/100.',
    '3. TABLE DES MATIERES: lister les 14 sections.',
    '4. RESUME EXECUTIF (350 mots): marche cible, concept et positionnement, modele economique, besoins financement, potentiel, risques principaux.',
    '5. CONCEPT & POSITIONNEMENT: vision et raison d\'etre; identite marque; proposition valeur detaillee; format operationnel et experience client; coherence prix/qualite.',
    '6. ANALYSE DE MARCHE & AUDIENCE: dynamiques marche local, vide marche, 2-3 personas (age/profession/habitudes/prix), signaux demande, facteurs macro.',
    '7. PAYSAGE CONCURRENTIEL: tableau 6-8 acteurs [Nom|Type|Ticket|Meme client?|Force|Faiblesse|Menace]; axes de differenciation; defensibilite (score 1-5); risque entrants capitalises.',
  ].join('\n') : [
    '1. COVER PAGE: #0a0a0a background, large Cormorant concept name, copper subtitle (format/cuisine/city), score badge (copper circle, '+c.ov.score+'/100, '+c.ov.verdict+'), "Prepared by Za3fran Digital", date '+c.today+'.',
    '2. INVESTOR BRIEF (2 standalone pages for banker): (a) concept sheet table [Concept|Format|Cuisine|Location|Seats|Ticket|Hours|Stage]; (b) market opportunity 3 sentences; (c) value proposition 4-5 bullets; (d) financial table [Total investment|Break-even|Revenue Y1/Y2/Y3|EBITDA Y1/Y2/Y3|Payback]; (e) funding requirement (amount + equity/debt split + use of funds); (f) 3 risks with level (High/Medium/Low); (g) Za3fran score badge '+c.ov.score+'/100.',
    '3. TABLE OF CONTENTS: list all 14 sections.',
    '4. EXECUTIVE SUMMARY (350 words): target market, concept and positioning, business model, funding needs, potential, key risks.',
    '5. CONCEPT & POSITIONING: vision and rationale; brand identity; detailed value proposition; operational format and customer experience; price/quality coherence.',
    '6. MARKET ANALYSIS & AUDIENCE: local market dynamics, market gap, 2-3 personas (age/profession/habits/price sensitivity), demand signals, macro factors.',
    '7. COMPETITIVE LANDSCAPE: table 6-8 players [Name|Type|Ticket|Same customer?|Strength|Weakness|Threat]; differentiation axes; defensibility (score 1-5); capitalised entrant risk.',
  ].join('\n');

  var design = 'HTML DESIGN: Document HTML COMPLET auto-contenu avec tout le CSS dans le <head>. Google Fonts: Cormorant Garamond (titres) + DM Sans (corps). Background #FAFAF7, texte #1a1a1a, accent #C9862A, navy #0F1F3D. Page couverture fond #0a0a0a. Tableaux: bordures #e8e8e4, rangees alternees (#F5F4F0/blanc), en-tetes #0F1F3D blanc. Max-width 860px centre. Footer chaque section: "Za3fran Digital \u00b7 Business Plan Essentials \u00b7 '+c.today+'". @media print page-break-before chaque section. Terminer par </body></html> apres section 7.';

  return (fr ? 'Tu es un expert F&B. Genere la PREMIERE PARTIE d\'un business plan professionnel et concis. SECTIONS 1 A 7 UNIQUEMENT.' : 'You are an F&B expert. Generate the FIRST PART of a professional concise business plan. SECTIONS 1 TO 7 ONLY.')
    + '\n\n=== DONNEES ===\n' + data(c)
    + '\n\n=== SECTIONS 1-7 ===\n' + sections
    + '\n\n' + design
    + '\n\n' + (fr ? 'Retourne UNIQUEMENT le HTML complet. Commence par <!DOCTYPE html>.' : 'Return ONLY the complete HTML. Start with <!DOCTYPE html>.');
}

// ── PROMPT 2: Sections 8-14 (HTML fragments only) ────────────
function prompt2(c) {
  var fr = c.isFr;
  var sym = c.sym;
  var cur = c.currency;
  var finNote = fr ? 'ESTIMATIONS DIRECTIONNELLES - benchmarks F&B MENA' : 'DIRECTIONAL ESTIMATES - MENA F&B benchmarks';

  var sections = fr ? [
    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE]: tableau [Section|Nb items|Prix '+sym+'|Food cost %]; logique pricing; 2-3 fournisseurs regionaux nommes; 3-5 items signature (nom+concept); contraintes operationnelles cles.',
    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE]: tableau staffing [Poste|ETP|Salaire '+sym+'/mois|Total charges]; ratios productivite; flux client; gestion des pics; KPIs J+30.',
    '10. PROJECTIONS FINANCIERES ['+finNote+']:\n10A BUDGET DEMARRAGE: tableau [Poste|Bas '+sym+'|Haut '+sym+'|Notes] - travaux, cuisine pro, mobilier, IT/caisse, licences, fiduciaire, fonds roulement, marketing pre-ouverture, reserve tresorerie (3 mois min), contingence 8%, TOTAL; ecart vs budget declare.\n10B CA A1-A3: tableau mensuel A1 (12 mois) [Mois|Couverts/j|Jours|CA '+sym+'] montee en charge; recap A1/A2(+25%)/A3(+18%).\n10C P&L 3 ANS: [Ligne|A1 '+sym+'|A1%|A2 '+sym+'|A2%|A3 '+sym+'|A3%] - CA, cout matiere, marge brute, masse salariale, loyer, energie, emballages, marketing, amortissements, EBITDA, resultat net.\n10D POINT MORT: tableau sensibilite 3x3 [tickets -10%/base/+15% x couverts -20%/base/+30%]; delai estimé.\n10E ROI: investissement retenu, cumuls A1/A2/A3, point de retour mois.\n10F FINANCEMENT: repartition fonds propres/dette; taux marche local PME; 2-3 institutions a contacter.',
    '11. MARKETING & CALENDRIER PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE]: tableau [Periode|Actions cles|Budget '+sym+'] J-90/J-60/J-30/J-0; canaux + budget indicatif; evenement lancement; strategie retention; KPIs.',
    '12. ANALYSE DES RISQUES: tableau [Risque|Probabilite|Impact|Score|Mitigation] 6 risques; analyse specifique a CE concept dans CETTE ville; plan contingence risque #1.',
    '13. RECOMMANDATIONS & PROCHAINES ETAPES: 5 actions 30 jours; encadre "Approfondissez avec Za3fran" (fond #0F1F3D): Menu Engineer (menu coute food cost reel), Financial Builder (modele financier complet base sur vos donnees), Business Plan Pro (plan financement bancaire donnees modelisees).',
    '14. ANNEXES: tableau scores Validator; note methodologique; glossaire.',
  ].join('\n\n') : [
    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE]: table [Section|Items|Price '+sym+'|Food cost %]; pricing logic; 2-3 named regional suppliers; 3-5 signature items (name+concept); key operational constraints.',
    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE]: staffing table [Position|FTE|Salary '+sym+'/month|Total incl. charges]; productivity ratios; customer flow; peak management; KPIs D+30.',
    '10. FINANCIAL PROJECTIONS ['+finNote+']:\n10A STARTUP BUDGET: table [Item|Low '+sym+'|High '+sym+'|Notes] - fit-out, kitchen equipment, furniture, IT/POS, licenses, legal fees, working capital, pre-opening marketing, cash reserve (3 months min), contingency 8%, TOTAL; gap vs stated budget.\n10B REVENUE Y1-Y3: monthly Y1 table (12 months) [Month|Covers/day|Trading days|Revenue '+sym+'] ramp-up; summary Y1/Y2(+25%)/Y3(+18%).\n10C 3-YEAR P&L: [Line|Y1 '+sym+'|Y1%|Y2 '+sym+'|Y2%|Y3 '+sym+'|Y3%] - revenue, food cost, gross margin, payroll, rent, energy, packaging, marketing, depreciation, EBITDA, net result.\n10D BREAK-EVEN: 3x3 sensitivity table [tickets -10%/base/+15% x covers -20%/base/+30%]; estimated months to break-even.\n10E ROI: retained investment, cumulative Y1/Y2/Y3, payback months.\n10F FUNDING: equity/debt split; local SME rate; 2-3 institutions to contact.',
    '11. MARKETING & PRE-OPENING TIMELINE [DIRECTIONAL ESTIMATE]: table [Period|Key actions|Budget '+sym+'] D-90/D-60/D-30/D-0; channel mix + indicative budget; launch event; retention strategy; KPIs.',
    '12. RISK ANALYSIS: table [Risk|Probability|Impact|Score|Mitigation] 6 risks; analysis specific to THIS concept in THIS city; contingency plan for risk #1.',
    '13. RECOMMENDATIONS & NEXT STEPS: 5 actions in 30 days; "Go deeper with Za3fran" box (background #0F1F3D): Menu Engineer (costed menu real food cost), Financial Builder (complete financial model from your real data), Business Plan Pro (bank-financing-grade plan modelled data).',
    '14. APPENDICES: Validator score table; methodology note; glossary.',
  ].join('\n\n');

  var style = fr
    ? 'STYLE: Memes classes CSS que le document principal. Encadres ESTIMATION DIRECTIONNELLE: fond #fff8f0 bordure gauche 3px #C9862A. En-tetes sections: numero cuivre Cormorant + titre navy. Tableaux: bordures #e8e8e4 rangees alternees en-tetes #0F1F3D. Footer chaque section. @media print page-break-before chaque section.'
    : 'STYLE: Same CSS classes as main document. DIRECTIONAL ESTIMATE boxes: #fff8f0 background 3px #C9862A left border. Section headers: copper Cormorant number + navy title. Tables: #e8e8e4 borders alternating rows #0F1F3D headers. Footer each section. @media print page-break-before each section.';

  return (fr
    ? 'Tu es un expert F&B. Genere la DEUXIEME PARTIE d\'un business plan. IMPORTANT: Retourne UNIQUEMENT des elements HTML (sections, divs, tableaux). PAS de DOCTYPE, PAS de html/head/body. Ces sections seront inserees dans un document HTML existant.'
    : 'You are an F&B expert. Generate the SECOND PART of a business plan. IMPORTANT: Return ONLY HTML elements (sections, divs, tables). NO DOCTYPE, NO html/head/body tags. These sections will be inserted into an existing HTML document.')
    + '\n\n=== DONNEES ===\n' + data(c)
    + '\n\n=== SECTIONS 8-14 UNIQUEMENT ===\n' + sections
    + '\n\n' + style
    + '\n\n' + (fr ? 'Retourne UNIQUEMENT le HTML des sections 8-14. Pas de DOCTYPE.' : 'Return ONLY the HTML for sections 8-14. No DOCTYPE.');
}
