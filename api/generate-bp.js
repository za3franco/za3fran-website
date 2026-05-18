// ============================================================
// /api/generate-bp.js  (v10 — single streaming pass, strict limits)
// Hard 150-word cap on prose sections keeps total under 24,000 tokens.
// Financial tables are the exception — always complete.
// At 117 t/s: 24,000 / 117 = 205s. Safely within 300s at any speed.
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

  console.log('[bp] Streaming generation for ' + bpRunId);

  var html = '';
  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, 260000);

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
      body: JSON.stringify({ model: HAIKU, max_tokens: 26000, stream: true, messages: [{ role: 'user', content: buildPrompt(ctx) }] }),
    });

    if (!r.ok) { clearTimeout(timer); var e = await r.json(); throw new Error('API ' + r.status + ': ' + JSON.stringify((e.error||{}).message||'')); }

    var reader = r.body.getReader();
    var dec = new TextDecoder();
    var buf = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (!ln.startsWith('data: ')) continue;
        var raw = ln.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try { var ev = JSON.parse(raw); if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') html += ev.delta.text; } catch(e) {}
      }
    }
    clearTimeout(timer);
    console.log('[bp] Stream done: ' + html.length + ' chars');

  } catch(err) {
    console.error('[bp] Error: ' + err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: err.message }) }).eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  html = html.trim().replace(/^```html\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();

  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: 'Invalid HTML' }) }).eq('id', bpRunId);
    return res.status(500).json({ error: 'Invalid HTML: ' + html.substring(0,80) });
  }

  var saved = await supabase.from('business_plan_essentials_runs')
    .update({ output_html: html, output_json: Object.assign({}, meta, { status: 'complete' }) }).eq('id', bpRunId);
  if (saved.error) return res.status(500).json({ error: 'Save failed' });

  console.log('[bp] Saved. Done.');
  return res.status(200).json({ ready: true });
}

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
    audience: Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience||'N/A'),
    risks:  ((sec.s6_risks&&sec.s6_risks.risks)||[]).map(function(r){return r.title;}).filter(Boolean).join(' | ')||'N/A',
    recs:   ((sec.s5_strategy&&sec.s5_strategy.recommendations)||[]).map(function(r){return r.title;}).filter(Boolean).join(' | ')||'N/A',
    market: ((sec.s2_market&&sec.s2_market.narrative)||'').substring(0,400)||'N/A',
    compet: ((sec.s3_competitive&&sec.s3_competitive.narrative)||'').substring(0,300)||'N/A',
    alerts: (fin.alerts||[]).map(function(a){return a.title;}).filter(Boolean).join(' | ')||'N/A',
  };
}

function buildPrompt(c) {
  var fr  = c.isFr;
  var sym = c.sym;
  var cur = c.currency;
  var fn  = fr ? 'ESTIMATIONS DIRECTIONNELLES \u2014 benchmarks F&B MENA' : 'DIRECTIONAL ESTIMATES \u2014 MENA F&B benchmarks';

  var data = [
    'CONCEPT: '+(c.snap.concept_name||'N/A')+'  TYPE: '+(c.snap.type||'N/A')+'  CUISINE: '+(c.snap.cuisine||'N/A'),
    'VILLE: '+(c.snap.city||'N/A')+(c.snap.neighbourhood?' / '+c.snap.neighbourhood:''),
    'TICKET: '+(c.snap.ticket||'N/A')+' '+cur+'  COUVERTS/J: '+(c.snap.covers||'N/A')+'  PLACES: '+(c.snap.seats||'N/A'),
    'BUDGET: '+(c.snap.budget||'N/A')+' '+cur+'  STADE: '+(c.snap.stage||'N/A')+'  HORAIRES: '+(c.snap.opening_hours||'N/A'),
    'AUDIENCE: '+c.audience,
    'DESCRIPTION: '+(c.snap.description||'N/A'),
    'DIFFERENTIATION: '+(c.snap.differentiation||'N/A'),
    'VIDE MARCHE: '+(c.snap.market_gap||'N/A'),
    'CONCURRENTS: '+(c.snap.competitors||'N/A'),
    'VALIDATOR: '+(c.ov.score||'N/A')+'/100  '+(c.ov.verdict||'N/A'),
    'RESUME: '+(c.ov.executive_summary||'N/A'),
    'POINT MORT: '+sym+c.fmt(c.be.monthly_revenue)+'/mois  '+(c.be.daily_covers||'N/A')+' couverts/jour',
    'CONSERVATEUR: '+c.scl(c.sc.conservative),
    'BASE: '+c.scl(c.sc.base),
    'OPTIMISTE: '+c.scl(c.sc.optimistic),
    'ALERTES: '+c.alerts,
    'MARCHE: '+c.market,
    'CONCURRENCE: '+c.compet,
    'RECOMMANDATIONS: '+c.recs,
    'RISQUES: '+c.risks,
    'DEVISE: '+cur+' ('+sym+')  DATE: '+c.today,
  ].join('\n');

  var wordLimit = fr
    ? '\n\nREGLE ABSOLUE SUR LA LONGUEUR:\n- Sections 1, 4, 5, 6, 7, 9, 13: MAXIMUM 120 MOTS de prose chacune. Pas de depassement.\n- Section 2 (Brief Investisseur): tableaux uniquement, pas de prose.\n- Section 10 (Financier): tous les tableaux doivent etre COMPLETS. Aucune exception.\n- Section 12 (Risques): tableau complet + 1 paragraphe court par risque (50 mots max).\nCette regle est la priorite absolue. Un document concis et complet vaut mieux qu\'un document verbeux et tronque.'
    : '\n\nABSOLUTE LENGTH RULE:\n- Sections 1, 4, 5, 6, 7, 9, 13: MAXIMUM 120 WORDS of prose each. No exceptions.\n- Section 2 (Investor Brief): tables only, no prose.\n- Section 10 (Financial): all tables must be COMPLETE. No exceptions.\n- Section 12 (Risks): complete table + 1 short paragraph per risk (50 words max).\nThis rule is the absolute priority. A concise complete document beats a verbose truncated one.';

  var sections = fr ? [
    '1. PAGE DE COUVERTURE: fond #0a0a0a pleine largeur. Nom concept GRAND Cormorant blanc. Sous-titre cuivre (format/cuisine/ville). Badge score: cercle cuivre, '+c.ov.score+'/100, '+c.ov.verdict+'. "Prepare par Za3fran Digital" + date '+c.today+'.',

    '2. BRIEF INVESTISSEUR (section standalone): (a) Fiche concept tableau [Concept|Format|Cuisine|Ville|Places|Ticket|Horaires|Stade]; (b) Opportunite marche: 2 phrases courtes; (c) Proposition valeur: 4 bullets; (d) Tableau financier [Indicateur|Valeur] — investissement (fourchette), point mort '+sym+c.fmt(c.be.monthly_revenue)+'/mois, CA A1/A2/A3, EBITDA A1/A2/A3, delai retour; (e) 3 risques avec niveau.',

    '3. TABLE DES MATIERES (liste compacte des 13 sections).',

    '4. RESUME EXECUTIF: 120 mots maximum. Marche, concept, modele economique, financement, potentiel, risques.',

    '5. CONCEPT & POSITIONNEMENT: 120 mots max. Vision, identite marque, proposition valeur, experience client.',

    '6. ANALYSE DE MARCHE & AUDIENCE: 120 mots max + tableau 2 personas [Profil|Age|Profession|Habitudes|Prix].',

    '7. PAYSAGE CONCURRENTIEL: tableau 6 acteurs [Nom|Type|Ticket|Meme client?|Force|Faiblesse|Menace] + 60 mots sur differenciation.',

    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE]: tableau structure [Section|Nb items|Prix '+sym+'|Food cost %] + 3 items signature (nom+concept 1 ligne) + 1-2 fournisseurs regionaux nommes.',

    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE]: tableau staffing [Poste|ETP|'+sym+'/mois|Total] + ratios productivite + 3 KPIs J+30.',

    '10. PROJECTIONS FINANCIERES ['+fn+']\n'
    +'Chaque sous-section dans un encadre "ESTIMATION DIRECTIONNELLE".\n'
    +'10A. BUDGET DEMARRAGE: tableau complet [Poste|Bas '+sym+'|Haut '+sym+'|Notes] — Travaux/amenagement, Equipements cuisine pro, Mobilier/deco, IT/caisse, Licences/autorisations, Fiduciaire/conseil, Fonds roulement, Marketing pre-ouverture, Reserve tresorerie (3 mois min), Contingence 8%, TOTAL. Ecart vs '+c.snap.budget+' '+cur+'.\n'
    +'10B. CA PREVISIONNEL: tableau trimestriel A1 [Trimestre|Couverts/j|Jours|CA '+sym+'] + recap [Annee|CA '+sym+'|Croissance] A1/A2(+25%)/A3(+18%).\n'
    +'10C. P&L 3 ANS: tableau [Ligne|A1 '+sym+'|A1%|A2 '+sym+'|A2%|A3 '+sym+'|A3%] — CA, Cout matiere (30-34%), Marge brute, Masse salariale (28-32%), Loyer (8-12%), Energie (3-5%), Emballages (2-4%), Marketing (3-5%), Amortissements, EBITDA, Resultat net.\n'
    +'10D. POINT MORT: tableau sensibilite 3x3 [ticket -10/base/+15% x couverts -20/base/+30%] + delai estimé.\n'
    +'10E. ROI & FINANCEMENT: investissement retenu (milieu 10A), flux cumules A1/A2/A3, delai retour, repartition fonds propres/dette, 2 institutions de financement a contacter a '+(c.snap.city||'')+'.',

    '11. MARKETING & PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE]: tableau [Periode|Actions cles|Budget '+sym+'] J-90/J-60/J-30/J-0 + mix canaux indicatif + 3 KPIs.',

    '12. ANALYSE DES RISQUES: tableau [Risque|Probabilite|Impact|Score|Mitigation] 6 risques + 50 mots par risque + plan contingence risque #1 (100 mots).',

    '13. RECOMMANDATIONS & PROCHAINES ETAPES: 5 actions 30 jours (issues Validator). Encadre fond #0F1F3D: Menu Engineer (menu coute food cost reel), Financial Builder (modele financier base sur vos donnees reelles), Business Plan Pro (niveau financement bancaire).',

    '14. ANNEXES: tableau scores Validator + note methodologique (3 lignes) + glossaire (10 termes max).',
  ].join('\n\n') : [
    '1. COVER PAGE: full-width #0a0a0a background. LARGE white Cormorant concept name. Copper subtitle (format/cuisine/city). Score badge: copper circle, '+c.ov.score+'/100, '+c.ov.verdict+'. "Prepared by Za3fran Digital" + date '+c.today+'.',

    '2. INVESTOR BRIEF (standalone section): (a) Concept sheet table [Concept|Format|Cuisine|City|Seats|Ticket|Hours|Stage]; (b) Market opportunity: 2 short sentences; (c) Value proposition: 4 bullets; (d) Financial table [Metric|Value] — investment (range), break-even '+sym+c.fmt(c.be.monthly_revenue)+'/month, Revenue Y1/Y2/Y3, EBITDA Y1/Y2/Y3, payback; (e) 3 risks with level.',

    '3. TABLE OF CONTENTS (compact list of 13 sections).',

    '4. EXECUTIVE SUMMARY: 120 words maximum. Market, concept, business model, funding, potential, risks.',

    '5. CONCEPT & POSITIONING: 120 words max. Vision, brand identity, value proposition, customer experience.',

    '6. MARKET ANALYSIS & AUDIENCE: 120 words max + table 2 personas [Profile|Age|Profession|Habits|Price sensitivity].',

    '7. COMPETITIVE LANDSCAPE: table 6 players [Name|Type|Ticket|Same customer?|Strength|Weakness|Threat] + 60 words on differentiation.',

    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE]: structure table [Section|Items|Price '+sym+'|Food cost %] + 3 signature items (name+1-line concept) + 1-2 named regional suppliers.',

    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE]: staffing table [Position|FTE|'+sym+'/month|Total] + productivity ratios + 3 KPIs D+30.',

    '10. FINANCIAL PROJECTIONS ['+fn+']\n'
    +'Each sub-section in a "DIRECTIONAL ESTIMATE" box.\n'
    +'10A. STARTUP BUDGET: complete table [Item|Low '+sym+'|High '+sym+'|Notes] — Fit-out/works, Kitchen equipment, Furniture/decor, IT/POS, Licenses/permits, Legal fees, Working capital, Pre-opening marketing, Cash reserve (3 months min), Contingency 8%, TOTAL. Gap vs '+c.snap.budget+' '+cur+'.\n'
    +'10B. REVENUE PROJECTIONS: quarterly Y1 table [Quarter|Covers/day|Trading days|Revenue '+sym+'] + summary [Year|Revenue '+sym+'|Growth] Y1/Y2(+25%)/Y3(+18%).\n'
    +'10C. 3-YEAR P&L: table [Line|Y1 '+sym+'|Y1%|Y2 '+sym+'|Y2%|Y3 '+sym+'|Y3%] — Revenue, Food cost (30-34%), Gross margin, Payroll (28-32%), Rent (8-12%), Energy (3-5%), Packaging (2-4%), Marketing (3-5%), Depreciation, EBITDA, Net result.\n'
    +'10D. BREAK-EVEN: 3x3 sensitivity table [ticket -10/base/+15% x covers -20/base/+30%] + estimated months.\n'
    +'10E. ROI & FUNDING: retained investment (midpoint 10A), cumulative Y1/Y2/Y3, payback, equity/debt split, 2 financing institutions in '+(c.snap.city||'')+'.',

    '11. MARKETING & PRE-OPENING [DIRECTIONAL ESTIMATE]: table [Period|Key actions|Budget '+sym+'] D-90/D-60/D-30/D-0 + channel mix + 3 KPIs.',

    '12. RISK ANALYSIS: table [Risk|Probability|Impact|Score|Mitigation] 6 risks + 50 words per risk + contingency plan risk #1 (100 words).',

    '13. RECOMMENDATIONS & NEXT STEPS: 5 actions in 30 days (from Validator). Dark box #0F1F3D: Menu Engineer (costed menu real food cost), Financial Builder (complete financial model from real data), Business Plan Pro (bank-financing-grade plan).',

    '14. APPENDICES: Validator scores table + methodology note (3 lines) + glossary (10 terms max).',
  ].join('\n\n');

  var printCSS = '@media print { @page { margin: 1.5cm 1.2cm; size: A4; } html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; background: white !important; } section { min-height: 0 !important; max-height: none !important; height: auto !important; page-break-before: auto; page-break-inside: auto; page-break-after: auto; break-inside: auto; } .cover-section { page-break-before: always; page-break-after: always; break-after: page; } .financial-section { page-break-before: always; break-before: page; } table { page-break-inside: auto !important; break-inside: auto !important; } thead { display: table-header-group; } tr { page-break-inside: avoid !important; break-inside: avoid !important; } h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid; } .estimate-box, .za3fran-box { page-break-inside: avoid; break-inside: avoid; } .risk-block { page-break-inside: auto; break-inside: auto; } p { orphans: 3; widows: 3; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body > section:last-of-type, body > *:last-child { page-break-after: avoid !important; break-after: avoid !important; } }';
  
  var design = fr
    ? 'DESIGN HTML: Document HTML COMPLET auto-contenu. Google Fonts: Cormorant Garamond (titres) + DM Sans (corps). Background #FAFAF7, texte #1a1a1a, accent #C9862A, navy #0F1F3D. Page couverture (section 1): fond #0a0a0a — assigner la classe CSS "cover-section". Section 10 (financier): assigner la classe CSS "financial-section". Encadres ESTIMATION DIRECTIONNELLE: classe "estimate-box", fond #fff8f0, bordure gauche 3px #C9862A. Chaque bloc de risque: classe "risk-block". Encadre Za3fran: classe "za3fran-box", fond #0F1F3D texte blanc. Tableaux: bordures #e8e8e4, rangees alternees, en-tetes #0F1F3D blanc. Max-width 860px. ' + printCSS + ' Rendu impeccable et professionnel.'
    : 'HTML DESIGN: Complete self-contained HTML document. Google Fonts: Cormorant Garamond (headings) + DM Sans (body). Background #FAFAF7, text #1a1a1a, accent #C9862A, navy #0F1F3D. Cover page (section 1): #0a0a0a background — assign CSS class "cover-section". Section 10 (financial): assign CSS class "financial-section". DIRECTIONAL ESTIMATE boxes: class "estimate-box", #fff8f0 background, 3px #C9862A left border. Each risk block: class "risk-block". Za3fran box: class "za3fran-box", #0F1F3D background white text. Tables: #e8e8e4 borders, alternating rows, #0F1F3D white headers. Max-width 860px. ' + printCSS + ' Impeccable, professional rendering.';

  var closing = fr
    ? 'Retourne UNIQUEMENT le HTML complet. Commence par <!DOCTYPE html>. Termine par </html>. AUCUNE TRONCATURE — toutes les 14 sections doivent etre presentes et completes.'
    : 'Return ONLY the complete HTML. Start with <!DOCTYPE html>. End with </html>. NO TRUNCATION — all 14 sections must be present and complete.';

  var intro = fr
    ? 'Tu es un expert F&B. Genere un BUSINESS PLAN ESSENTIALS COMPLET en HTML pour le concept suivant. PRIORITE ABSOLUE: toutes les 14 sections doivent etre presentes. Respecte les limites de mots indiquees. Les tableaux de la section 10 doivent etre complets.'
    : 'You are an F&B expert. Generate a COMPLETE BUSINESS PLAN ESSENTIALS in HTML for the following concept. ABSOLUTE PRIORITY: all 14 sections must be present. Respect the word limits. Section 10 tables must be complete.';

  return intro + wordLimit
    + '\n\n=== DATA ===\n' + data
    + '\n\n=== 14 SECTIONS ===\n' + sections
    + '\n\n' + design
    + '\n\n' + closing;
}
