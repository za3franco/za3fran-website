// ============================================================
// /api/generate-bp.js  (v7 — 4-pass Haiku, section 10 isolated)
// Pass 1: sections 1-7   (8000 tokens, ≤85s)
// Pass 2: sections 8-9   (5000 tokens, ≤55s)
// Pass 3: section 10     (8000 tokens, ≤85s)
// Pass 4: sections 11-14 (7000 tokens, ≤75s)
// Total worst-case at 100t/s: ~300s. At Haiku's real speed (~200t/s): ~145s.
// maxDuration: 300 in vercel.json.
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

  var runRes = await supabase.from('business_plan_essentials_runs')
    .select('id, output_html, output_json, currency, language').eq('id', bpRunId).single();
  if (runRes.error || !runRes.data) return res.status(404).json({ error: 'Not found' });

  var run = runRes.data;
  if (run.output_html) return res.status(200).json({ ready: true });

  var meta = run.output_json || {};
  if (meta.status === 'generating') return res.status(200).json({ status: 'generating' });

  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: Object.assign({}, meta, { status: 'generating' }) }).eq('id', bpRunId);

  if (!meta.validator_report_id) return res.status(422).json({ error: 'Missing validator_report_id' });

  var vrRes  = await supabase.from('validator_reports').select('report_json').eq('id', meta.validator_report_id).single();
  var subRes = await supabase.from('validator_submissions').select('*').eq('id', meta.submission_id).single();

  if (!vrRes.data || !vrRes.data.report_json) return res.status(422).json({ error: 'report_json not found' });

  var ctx = buildCtx(vrRes.data.report_json, subRes.data, run.currency || 'EUR', run.language || 'fr');

  console.log('[bp] 4-pass generation for ' + bpRunId);

  async function ai(prompt, maxT, abortMs) {
    var ctrl = new AbortController();
    var t = setTimeout(function() { ctrl.abort(); }, abortMs);
    try {
      var r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
        body: JSON.stringify({ model: HAIKU, max_tokens: maxT, messages: [{ role: 'user', content: prompt }] }),
      });
      clearTimeout(t);
      var d = await r.json();
      if (!r.ok || !d.content || !d.content[0] || !d.content[0].text) throw new Error('API ' + r.status + ': ' + JSON.stringify((d.error || {}).message || ''));
      return d.content[0].text.trim().replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
    } catch(e) { clearTimeout(t); throw e; }
  }

  function frag(html) {
    return html.replace(/<!DOCTYPE[^>]*>/gi,'').replace(/<\/?html[^>]*>/gi,'').replace(/<head[\s\S]*?<\/head>/gi,'').replace(/<\/?body[^>]*>/gi,'').trim();
  }

  var p1='', p2='', p3='', p4='';
  try {
    console.log('[bp] P1 s1-7 (8000t)...');
    p1 = await ai(buildP1(ctx), 8000, 92000);
    if (!p1.startsWith('<!DOCTYPE') && !p1.startsWith('<html')) throw new Error('P1 bad HTML');
    console.log('[bp] P1 ok: '+p1.length+'c');

    console.log('[bp] P2 s8-9 (5000t)...');
    p2 = frag(await ai(buildP2(ctx), 5000, 60000));
    console.log('[bp] P2 ok: '+p2.length+'c');

    console.log('[bp] P3 s10 (8000t)...');
    p3 = frag(await ai(buildP3(ctx), 8000, 92000));
    console.log('[bp] P3 ok: '+p3.length+'c');

    console.log('[bp] P4 s11-14 (7000t)...');
    p4 = frag(await ai(buildP4(ctx), 10000, 100000));
    console.log('[bp] P4 ok: '+p4.length+'c');

  } catch(err) {
    console.error('[bp] Error: ' + err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: err.message }) }).eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  var final = p1.includes('</body>')
    ? p1.replace('</body>', '\n'+p2+'\n'+p3+'\n'+p4+'\n</body>')
    : p1+'\n'+p2+'\n'+p3+'\n'+p4+'\n</body></html>';

  var saved = await supabase.from('business_plan_essentials_runs')
    .update({ output_html: final, output_json: Object.assign({}, meta, { status: 'complete' }) }).eq('id', bpRunId);

  if (saved.error) return res.status(500).json({ error: 'Save failed: ' + saved.error.message });
  console.log('[bp] Done: ' + final.length + 'c');
  return res.status(200).json({ ready: true });
}

// ── CONTEXT ───────────────────────────────────────────────────
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
  var scl  = function(s) { return s ? s.covers_day+'c/j \u2192 '+sym+fmt(s.monthly_result)+'/mois' : 'N/A'; };
  return {
    snap:snap, ov:ov, sec:sec, fin:fin, be:be, sc:sc,
    sym:sym, isFr:isFr, fmt:fmt, scl:scl, currency:currency,
    today: new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day:'numeric', month:'long', year:'numeric' }),
    audience: Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience||'N/A'),
    risks:  ((sec.s6_risks&&sec.s6_risks.risks)||[]).map(function(r){return r.title;}).filter(Boolean).join(' | ')||'N/A',
    recs:   ((sec.s5_strategy&&sec.s5_strategy.recommendations)||[]).map(function(r){return r.title;}).filter(Boolean).join(' | ')||'N/A',
    market: ((sec.s2_market&&sec.s2_market.narrative)||'').substring(0,400)||'N/A',
    compet: ((sec.s3_competitive&&sec.s3_competitive.narrative)||'').substring(0,300)||'N/A',
    alerts: (fin.alerts||[]).map(function(a){return a.title;}).filter(Boolean).join(' | ')||'N/A',
  };
}

function data(c) {
  return [
    'CONCEPT: '+(c.snap.concept_name||'N/A')+'  TYPE: '+(c.snap.type||'N/A')+'  CUISINE: '+(c.snap.cuisine||'N/A'),
    'VILLE: '+(c.snap.city||'N/A')+(c.snap.neighbourhood?' / '+c.snap.neighbourhood:''),
    'TICKET: '+(c.snap.ticket||'N/A')+' '+c.currency+'  COUVERTS/J: '+(c.snap.covers||'N/A')+'  PLACES: '+(c.snap.seats||'N/A'),
    'BUDGET: '+(c.snap.budget||'N/A')+' '+c.currency+'  STADE: '+(c.snap.stage||'N/A'),
    'AUDIENCE: '+c.audience+'  HORAIRES: '+(c.snap.opening_hours||'N/A'),
    'DESCRIPTION: '+(c.snap.description||'N/A'),
    'DIFFERENTIATION: '+(c.snap.differentiation||'N/A'),
    'VIDE MARCHE: '+(c.snap.market_gap||'N/A'),
    'CONCURRENTS: '+(c.snap.competitors||'N/A'),
    'SCORE: '+(c.ov.score||'N/A')+'/100  VERDICT: '+(c.ov.verdict||'N/A'),
    'RESUME VALIDATOR: '+(c.ov.executive_summary||'N/A'),
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

var CSS = 'DESIGN HTML: Document HTML COMPLET auto-contenu, tout le CSS dans <head>. Fonts Google: Cormorant Garamond (titres) + DM Sans (corps). Couleurs: bg #FAFAF7, texte #1a1a1a, accent #C9862A, navy #0F1F3D. Couverture fond #0a0a0a. Tableaux: bordures #e8e8e4, rangees alternees, en-tetes #0F1F3D blanc. En-tetes sections: numero Cormorant cuivre + titre DM Sans navy. Max-width 860px centré. Footer chaque section. @media print page-break-before chaque section.';
var FSTYLE = 'STYLE: Memes classes CSS que le reste du document. Encadres ESTIMATION DIRECTIONNELLE: fond #fff8f0, bordure gauche 3px #C9862A. En-tetes sections: numero Cormorant cuivre + titre navy. Tableaux: #e8e8e4 bordures, rangees alternees, en-tetes #0F1F3D blanc. Footer chaque section. @media print page-break-before chaque section.';

// ── PASS 1: Sections 1-7 ─────────────────────────────────────
function buildP1(c) {
  var fr = c.isFr;
  var s = fr ? [
    '1. PAGE DE COUVERTURE: fond #0a0a0a. Nom concept grand Cormorant. Sous-titre cuivre (format/cuisine/ville). Badge score: cercle cuivre, '+c.ov.score+'/100, '+c.ov.verdict+'. "Prepare par Za3fran Digital" + date '+c.today+'.',
    '2. BRIEF INVESTISSEUR (standalone pour banquier): (a) tableau fiche concept [Concept|Format|Cuisine|Ville|Places|Ticket|Horaires|Stade]; (b) opportunite marche 3 phrases; (c) proposition valeur 4-5 bullets; (d) tableau financier compact [Indicateur|Valeur] avec: investissement total (fourchette), point mort mensuel, CA A1/A2/A3, EBITDA A1/A2/A3, delai retour estime; (e) besoin financement; (f) 3 risques avec niveau.',
    '3. TABLE DES MATIERES (14 sections).',
    '4. RESUME EXECUTIF (300 mots): marche, concept, modele economique, financement, potentiel, risques.',
    '5. CONCEPT & POSITIONNEMENT: vision; identite de marque; proposition de valeur; format operationnel et experience client.',
    '6. ANALYSE DE MARCHE & AUDIENCE: dynamiques marche local, vide de marche, 2-3 personas detailles (age/profession/habitudes/prix), signaux de demande, facteurs macro.',
    '7. PAYSAGE CONCURRENTIEL: tableau 6-8 acteurs [Nom|Type|Ticket|Meme client?|Force|Faiblesse|Menace]; axes de differenciation; defensibilite (score 1-5); risque entrants capitalises.',
  ].join('\n') : [
    '1. COVER PAGE: #0a0a0a background. Large Cormorant concept name. Copper subtitle (format/cuisine/city). Score badge: copper circle, '+c.ov.score+'/100, '+c.ov.verdict+'. "Prepared by Za3fran Digital" + date '+c.today+'.',
    '2. INVESTOR BRIEF (standalone for banker): (a) concept sheet table [Concept|Format|Cuisine|City|Seats|Ticket|Hours|Stage]; (b) market opportunity 3 sentences; (c) value proposition 4-5 bullets; (d) compact financial table [Metric|Value] with: total investment (range), monthly break-even, Revenue Y1/Y2/Y3, EBITDA Y1/Y2/Y3, estimated payback; (e) funding requirement; (f) 3 risks with level.',
    '3. TABLE OF CONTENTS (14 sections).',
    '4. EXECUTIVE SUMMARY (300 words): market, concept, business model, funding, potential, risks.',
    '5. CONCEPT & POSITIONING: vision; brand identity; value proposition; operational format and customer experience.',
    '6. MARKET ANALYSIS & AUDIENCE: local market dynamics, market gap, 2-3 detailed personas (age/profession/habits/price), demand signals, macro factors.',
    '7. COMPETITIVE LANDSCAPE: table 6-8 players [Name|Type|Ticket|Same customer?|Strength|Weakness|Threat]; differentiation axes; defensibility (score 1-5); capitalised entrant risk.',
  ].join('\n');

  return (fr ? 'Expert F&B. SECTIONS 1 A 7 UNIQUEMENT. Dense et concis.' : 'F&B expert. SECTIONS 1 TO 7 ONLY. Dense and concise.')
    +'\n\n=== DATA ===\n'+data(c)
    +'\n\n=== SECTIONS 1-7 ===\n'+s
    +'\n\n'+CSS
    +'\n\n'+(fr ? 'Termine par </body></html> apres s7. Retourne UNIQUEMENT le HTML. Commence par <!DOCTYPE html>.' : 'End with </body></html> after s7. Return ONLY the HTML. Start with <!DOCTYPE html>.');
}

// ── PASS 2: Sections 8-9 ─────────────────────────────────────
function buildP2(c) {
  var fr = c.isFr;
  var sym = c.sym;
  var s = fr ? [
    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE]: tableau structure [Section|Nb items|Fourchette prix '+sym+'|Food cost cible %]; logique pricing et ticket cible; 2-3 fournisseurs regionaux nommes; 3-5 items signature (nom + concept en 1 ligne); contraintes operationnelles cles.',
    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE]: tableau staffing [Poste|ETP|Salaire '+sym+'/mois|Total charges]; ratios productivite (couverts/serveur); modele de service et flux client; gestion des pics; 3 KPIs operationnels J+30.',
  ].join('\n\n') : [
    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE]: structure table [Section|Items|Price range '+sym+'|Target food cost %]; pricing logic; 2-3 named regional suppliers; 3-5 signature items (name + 1-line concept); key operational constraints.',
    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE]: staffing table [Position|FTE|Salary '+sym+'/month|Total charges]; productivity ratios (covers/server); service model and customer flow; peak management; 3 operational KPIs D+30.',
  ].join('\n\n');

  return (fr ? 'Expert F&B. SECTIONS 8 ET 9 UNIQUEMENT. HTML fragments, pas de DOCTYPE/body.' : 'F&B expert. SECTIONS 8 AND 9 ONLY. HTML fragments, no DOCTYPE/body.')
    +'\n\n=== DATA ===\n'+data(c)
    +'\n\n=== SECTIONS 8-9 ===\n'+s
    +'\n\n'+FSTYLE
    +'\n\n'+(fr ? 'Retourne UNIQUEMENT le HTML sections 8-9.' : 'Return ONLY HTML for sections 8-9.');
}

// ── PASS 3: Section 10 (Financial) ───────────────────────────
function buildP3(c) {
  var fr = c.isFr;
  var sym = c.sym;
  var cur = c.currency;
  var fn = fr ? 'ESTIMATIONS DIRECTIONNELLES — benchmarks F&B MENA. A remplacer par Financial Builder Za3fran.' : 'DIRECTIONAL ESTIMATES — MENA F&B benchmarks. Replace with Za3fran Financial Builder.';

  // Use quarterly summary instead of monthly to save tokens
  var s = fr
    ? '10. PROJECTIONS FINANCIERES ['+fn+']\n\n'
      +'10A. BUDGET DE DEMARRAGE — tableau [Poste|Bas '+sym+'|Haut '+sym+'|Notes]: (1) Travaux & amenagement, (2) Equipements cuisine professionnels, (3) Mobilier, decoration & signalétique, (4) IT, caisse & logiciels, (5) Licences, autorisations & frais legaux, (6) Fonds de roulement initial (stocks + consommables 2 mois), (7) Marketing pre-ouverture, (8) Reserve tresorerie montee en charge (3 mois charges fixes minimum), (9) Contingence 8%. Ligne TOTAL basse et haute. Note: ecart vs budget declare '+c.snap.budget+' '+cur+'.\n\n'
      +'10B. PREVISIONS CA — Tableau trimestriel A1 [Trimestre|Couverts/j moyens|Jours|CA '+sym+'|Note] puis recap annuel [Annee|CA '+sym+'|Croissance]: A1 base, A2 (+25%), A3 (+18%).\n\n'
      +'10C. COMPTE DE RESULTAT PREVISIONNEL — tableau [Ligne|A1 '+sym+'|A1%|A2 '+sym+'|A2%|A3 '+sym+'|A3%]: CA, Cout matiere (30-34%), Marge brute, Masse salariale chargee (28-32%), Loyer & charges (8-12%), Energie & fluides (3-5%), Emballages & consommables (2-4%), Marketing (3-5%), Amortissements, Autres, EBITDA, Resultat net avant impots.\n\n'
      +'10D. ANALYSE POINT MORT — tableau sensibilite [ticket -10%/base/+15% x couverts/j -20%/base/+30%] → resultat mensuel '+sym+'. Delai estime pour atteindre le point mort (mois depuis ouverture).\n\n'
      +'10E. ROI & FINANCEMENT — investissement retenu (milieu fourchette 10A); flux cumules A1/A2/A3; point de retour (mois); repartition recommandee fonds propres/dette; cout dette marche local PME; 2-3 institutions de financement a contacter (nommer specifiquement pour la ville '+(c.snap.city||'')+')'
    : '10. FINANCIAL PROJECTIONS ['+fn+']\n\n'
      +'10A. STARTUP BUDGET — table [Item|Low '+sym+'|High '+sym+'|Notes]: (1) Works & fit-out, (2) Professional kitchen equipment, (3) Furniture, decor & signage, (4) IT, POS & software, (5) Licenses, permits & legal fees, (6) Initial working capital (2 months stock + consumables), (7) Pre-opening marketing, (8) Cash reserve for ramp-up (minimum 3 months fixed costs), (9) Contingency 8%. TOTAL row low and high. Note: gap vs stated budget '+c.snap.budget+' '+cur+'.\n\n'
      +'10B. REVENUE PROJECTIONS — Quarterly Y1 table [Quarter|Avg covers/day|Trading days|Revenue '+sym+'|Note] then annual summary [Year|Revenue '+sym+'|Growth]: Y1 base, Y2 (+25%), Y3 (+18%).\n\n'
      +'10C. PROJECTED P&L — table [Line|Y1 '+sym+'|Y1%|Y2 '+sym+'|Y2%|Y3 '+sym+'|Y3%]: Revenue, Food cost (30-34%), Gross margin, Payroll incl. charges (28-32%), Rent & occupancy (8-12%), Energy (3-5%), Packaging (2-4%), Marketing (3-5%), Depreciation, Other, EBITDA, Net result before tax.\n\n'
      +'10D. BREAK-EVEN ANALYSIS — sensitivity table [ticket -10%/base/+15% x covers/day -20%/base/+30%] → monthly result '+sym+'. Estimated months to break-even from opening.\n\n'
      +'10E. ROI & FUNDING — retained investment (midpoint of 10A); cumulative flows Y1/Y2/Y3; payback (months); recommended equity/debt split; local SME debt cost; 2-3 financing institutions to contact (name specifically for '+(c.snap.city||'')+'city)';

  return (fr ? 'Expert F&B. SECTION 10 UNIQUEMENT (toutes les sous-sections 10A-10E). HTML fragment, pas de DOCTYPE/body. Sois exhaustif sur les tableaux.' : 'F&B expert. SECTION 10 ONLY (all sub-sections 10A-10E). HTML fragment, no DOCTYPE/body. Be thorough on all tables.')
    +'\n\n=== DATA ===\n'+data(c)
    +'\n\n=== SECTION 10 ===\n'+s
    +'\n\n'+FSTYLE
    +'\n\n'+(fr ? 'Retourne UNIQUEMENT le HTML section 10.' : 'Return ONLY HTML for section 10.');
}

// ── PASS 4: Sections 11-14 ───────────────────────────────────
function buildP4(c) {
  var fr = c.isFr;
  var sym = c.sym;
  var s = fr ? [
    '11. STRATEGIE MARKETING & CALENDRIER PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE]: tableau [Periode|Actions cles|Budget '+sym+'] pour J-90/J-60/J-30/J-0; mix canaux + budget indicatif (Instagram, TikTok, livraison, micro-influenceurs, presse); evenement lancement; strategie retention; 4 KPIs marketing.',
    '12. ANALYSE DES RISQUES: tableau [Risque|Probabilite|Impact|Score|Mitigation] avec 6 risques (financier, operationnel, marche, concurrentiel, reglementaire, humain); analyse specifique a CE concept dans CETTE ville; plan contingence risque #1.',
    '13. RECOMMANDATIONS & PROCHAINES ETAPES: 5 actions prioritaires 30 jours (issues du Validator). Encadre "Approfondissez avec Za3fran" (fond #0F1F3D, texte blanc, accents cuivre): Menu Engineer (architecture menu coute food cost reel), Financial Builder (modele financier complet base sur vos donnees reelles — remplace les estimations), Business Plan Pro (business plan financement bancaire donnees modelisees).',
    '14. ANNEXES: tableau scores Validator [Section|Sous-score|Ponderation|Contribution|Total]; note methodologique (document genere par IA sur base donnees Validator, projections = estimations directionnelles); glossaire des termes cles.',
  ].join('\n\n') : [
    '11. MARKETING STRATEGY & PRE-OPENING TIMELINE [DIRECTIONAL ESTIMATE]: table [Period|Key actions|Budget '+sym+'] for D-90/D-60/D-30/D-0; channel mix + indicative budget (Instagram, TikTok, delivery, micro-influencers, press); launch event; retention strategy; 4 marketing KPIs.',
    '12. RISK ANALYSIS: table [Risk|Probability|Impact|Score|Mitigation] with 6 risks (financial, operational, market, competitive, regulatory, human); analysis specific to THIS concept in THIS city; contingency plan for risk #1.',
    '13. RECOMMENDATIONS & NEXT STEPS: 5 priority actions in 30 days (from Validator). "Go deeper with Za3fran" box (background #0F1F3D, white text, copper accent): Menu Engineer (costed menu architecture real food cost), Financial Builder (complete financial model from your real data — replaces estimates), Business Plan Pro (bank-financing-grade plan fully modelled data).',
    '14. APPENDICES: Validator scores table [Section|Sub-score|Weight|Contribution|Total]; methodology note (AI-generated from Validator data, projections = directional estimates); key terms glossary.',
  ].join('\n\n');

  return (fr ? 'Expert F&B. SECTIONS 11 A 14 UNIQUEMENT. HTML fragments, pas de DOCTYPE/body.' : 'F&B expert. SECTIONS 11 TO 14 ONLY. HTML fragments, no DOCTYPE/body.')
    +'\n\n=== DATA ===\n'+data(c)
    +'\n\n=== SECTIONS 11-14 ===\n'+s
    +'\n\n'+FSTYLE
    +'\n\n'+(fr ? 'Retourne UNIQUEMENT le HTML sections 11-14.' : 'Return ONLY HTML for sections 11-14.');
}
