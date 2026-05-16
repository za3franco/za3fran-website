// ============================================================
// /api/generate-bp.js  (v8 — streaming, single pass)
// One Claude Haiku streaming call generates the full document.
// 28,000 tokens at ~150 t/s = ~190s. No stitching, no formatting glitches.
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
  var prompt = buildPrompt(ctx);

  console.log('[bp] Starting streaming generation for ' + bpRunId);

  var fullText = '';
  try {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, 260000);

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: HAIKU,
        max_tokens: 28000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      clearTimeout(timer);
      var errData = await response.json();
      throw new Error('API ' + response.status + ': ' + JSON.stringify((errData.error || {}).message || ''));
    }

    // Parse SSE stream
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data: ')) continue;
        var raw = line.slice(6).trim();
        if (raw === '[DONE]' || raw === '') continue;
        try {
          var evt = JSON.parse(raw);
          if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
            fullText += evt.delta.text;
          }
        } catch (e) { /* skip malformed */ }
      }
    }

    clearTimeout(timer);
    console.log('[bp] Stream complete: ' + fullText.length + ' chars');

  } catch (err) {
    console.error('[bp] Stream error: ' + err.message);
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: err.message }) }).eq('id', bpRunId);
    return res.status(500).json({ error: err.message });
  }

  // Clean up any accidental markdown fences
  var html = fullText.trim()
    .replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: Object.assign({}, meta, { status: 'error', error: 'Invalid HTML output' }) }).eq('id', bpRunId);
    return res.status(500).json({ error: 'Invalid HTML: ' + html.substring(0, 80) });
  }

  var saved = await supabase.from('business_plan_essentials_runs')
    .update({ output_html: html, output_json: Object.assign({}, meta, { status: 'complete' }) }).eq('id', bpRunId);

  if (saved.error) return res.status(500).json({ error: 'Save failed: ' + saved.error.message });

  console.log('[bp] Saved. Complete.');
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
  var scl  = function(s) { return s ? s.covers_day + 'c/j \u2192 ' + sym + fmt(s.monthly_result) + '/mois' : 'N/A'; };
  return {
    snap:snap, ov:ov, sec:sec, fin:fin, be:be, sc:sc,
    sym:sym, isFr:isFr, fmt:fmt, scl:scl, currency:currency,
    today: new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day:'numeric', month:'long', year:'numeric' }),
    audience: Array.isArray(snap.audience) ? snap.audience.join(', ') : (snap.audience || 'N/A'),
    risks:  ((sec.s6_risks && sec.s6_risks.risks) || []).map(function(r){ return r.title; }).filter(Boolean).join(' | ') || 'N/A',
    recs:   ((sec.s5_strategy && sec.s5_strategy.recommendations) || []).map(function(r){ return r.title; }).filter(Boolean).join(' | ') || 'N/A',
    market: ((sec.s2_market && sec.s2_market.narrative) || '').substring(0, 400) || 'N/A',
    compet: ((sec.s3_competitive && sec.s3_competitive.narrative) || '').substring(0, 300) || 'N/A',
    alerts: (fin.alerts || []).map(function(a){ return a.title; }).filter(Boolean).join(' | ') || 'N/A',
  };
}

// ── PROMPT ────────────────────────────────────────────────────
function buildPrompt(c) {
  var fr  = c.isFr;
  var sym = c.sym;
  var cur = c.currency;
  var fn  = fr ? 'ESTIMATIONS DIRECTIONNELLES \u2014 benchmarks F&B MENA. A remplacer par Financial Builder Za3fran.'
               : 'DIRECTIONAL ESTIMATES \u2014 MENA F&B benchmarks. Replace with Za3fran Financial Builder.';

  var dataStr = [
    'CONCEPT: '+(c.snap.concept_name||'N/A')+'  TYPE: '+(c.snap.type||'N/A')+'  CUISINE: '+(c.snap.cuisine||'N/A'),
    'VILLE: '+(c.snap.city||'N/A')+(c.snap.neighbourhood?' / '+c.snap.neighbourhood:''),
    'TICKET: '+(c.snap.ticket||'N/A')+' '+cur+'  COUVERTS/J: '+(c.snap.covers||'N/A')+'  PLACES: '+(c.snap.seats||'N/A'),
    'BUDGET: '+(c.snap.budget||'N/A')+' '+cur+'  STADE: '+(c.snap.stage||'N/A'),
    'HORAIRES: '+(c.snap.opening_hours||'N/A')+'  AUDIENCE: '+c.audience,
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

  var sections = fr ? [
    '1. PAGE DE COUVERTURE: fond #0a0a0a. Nom concept GRAND Cormorant Garamond. Sous-titre cuivre (format / cuisine / ville). Badge score Validator: grand cercle cuivre, score '+c.ov.score+'/100, verdict '+c.ov.verdict+'. "Prepare par Za3fran Digital" + date '+c.today+'. Design elegant, professionnel.',

    '2. BRIEF INVESTISSEUR (section standalone, peut etre detachee et envoyee seule a un banquier): (a) Fiche concept tableau [Concept|Format|Cuisine|Ville|Places|Ticket moyen|Horaires|Stade]; (b) Opportunite de marche en 3 phrases precises; (c) Proposition de valeur en 4-5 bullets; (d) Tableau financier compact [Indicateur|Valeur]: investissement total (fourchette), point mort mensuel '+sym+c.fmt(c.be.monthly_revenue)+', CA previsionnel A1/A2/A3, EBITDA A1/A2/A3, delai de retour estime; (e) Besoin de financement (montant + repartition fonds propres/dette); (f) Profil de risque: 3 risques avec niveau (Eleve/Moyen/Faible) et mitigation 1 ligne.',

    '3. TABLE DES MATIERES: toutes les 14 sections avec titres.',

    '4. RESUME EXECUTIF (300 mots): marche cible, concept et positionnement, modele economique, besoins financement, potentiel, risques principaux, prochaines etapes cles.',

    '5. CONCEPT & POSITIONNEMENT: vision et raison d\'etre du concept (pourquoi maintenant, pourquoi ici); identite de marque (nom, territoire visuel, tonalite); proposition de valeur detaillee; format operationnel et experience client; coherence prix/qualite/experience.',

    '6. ANALYSE DE MARCHE & AUDIENCE CIBLE: dynamiques marche F&B local (city-specific); vide de marche et pourquoi non adresse; 2-3 personas detailles (age, profession, habitudes dejeuner, sensibilite prix, canaux decouverte); signaux de demande concrets; facteurs macro (pouvoir d\'achat, tendances).',

    '7. PAYSAGE CONCURRENTIEL: tableau 6-8 acteurs [Nom|Type|Ticket|Meme client?|Force principale|Faiblesse|Niveau de menace]; concurrence directe ET informelle; axes de differenciation de ce concept; defensibilite (score 1-5); risque entrants capitalises dans les 18 mois.',

    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE]: tableau structure menu [Section|Nb items|Fourchette prix '+sym+'|Food cost cible %]; logique de pricing et ticket cible; 2-3 fournisseurs/producteurs regionaux nommes; 3-5 items signature directionnels (nom + concept en 1 ligne); contraintes operationnelles cles (preparation en amont, temps de service).',

    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE]: tableau staffing [Poste|Nb ETP|Salaire '+sym+'/mois|Total charges mensuelles]; ratios de productivite (couverts/serveur/service); modele de service et flux client; gestion des pics; 3 KPIs operationnels a suivre des J+30.',

    '10. PROJECTIONS FINANCIERES ['+fn+']\n'
    + '10A. BUDGET DE DEMARRAGE: tableau [Poste|Bas '+sym+'|Haut '+sym+'|Notes] avec: Travaux & amenagement, Equipements cuisine professionnels, Mobilier & decoration, IT & systeme de caisse, Licences & autorisations, Honoraires fiduciaire & conseil, Fonds de roulement initial, Marketing pre-ouverture, Reserve tresorerie (3 mois charges fixes minimum), Contingence 8%. Ligne TOTAL basse et haute. Commentaire sur l\'ecart avec le budget declare ('+c.snap.budget+' '+cur+').\n'
    + '10B. PREVISIONS CA: Tableau trimestriel A1 [Trimestre|Couverts/j moyens|Jours|CA '+sym+'|Note] avec montee en charge realiste. Tableau recap [Annee|CA '+sym+'|vs annee prec.]: A1 base, A2 (+25%), A3 (+18%).\n'
    + '10C. COMPTE DE RESULTAT PREVISIONNEL: tableau [Ligne|A1 '+sym+'|A1 %|A2 '+sym+'|A2 %|A3 '+sym+'|A3 %] — CA, Cout matiere (30-34%), Marge brute, Masse salariale chargee (28-32%), Loyer & charges (8-12%), Energie & fluides (3-5%), Emballages (2-4%), Marketing (3-5%), Amortissements, Autres charges, EBITDA, Resultat net avant IS.\n'
    + '10D. ANALYSE POINT MORT: tableau sensibilite 3x3 [ticket -10%/base/+15% x couverts/jour -20%/base/+30%] montrant le resultat mensuel. Delai estime pour atteindre le point mort depuis l\'ouverture.\n'
    + '10E. ROI & FINANCEMENT: investissement retenu (milieu fourchette 10A); flux de tresorerie cumules A1/A2/A3; point de retour (mois); repartition recommandee fonds propres/dette; taux de la dette marche PME local; 2-3 institutions de financement a contacter par nom (specifiques a '+( c.snap.city||'la ville')+').',

    '11. STRATEGIE MARKETING & CALENDRIER PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE]: tableau [Periode|Actions cles|Budget indicatif '+sym+'] pour J-90/J-60/J-30/J-0; mix canaux recommande avec budget indicatif (Instagram, TikTok, livraison Glovo/Jumia, micro-influenceurs 8K-50K, presse locale); strategie de lancement et evenement inaugural; strategie de retention client (taux de retour); 4 KPIs marketing a suivre.',

    '12. ANALYSE DES RISQUES: tableau [Risque|Probabilite|Impact|Score|Mitigation principale] avec 6 risques couvrant: financier, operationnel, marche, concurrentiel, reglementaire, humain. Pour chaque risque: paragraphe d\'analyse specifique a CE concept dans CETTE ville. Plan de contingence detaille pour le risque #1.',

    '13. RECOMMANDATIONS & PROCHAINES ETAPES: 5 actions prioritaires dans les 30 jours (issues des recommandations Validator). Ce que ce plan vous dit de faire — et ce qu\'il ne peut pas encore vous dire. Encadre "Approfondissez avec Za3fran" (fond #0F1F3D, texte blanc, accent cuivre): Menu Engineer (architecture menu coute avec food cost reel et prix de vente), Financial Builder (modele financier complet base sur vos donnees reelles — remplace les estimations directionnelles), Business Plan Pro (business plan niveau financement bancaire avec donnees entierement modelisees).',

    '14. ANNEXES: (a) Tableau recapitulatif scores Validator [Section|Sous-score|Ponderation|Contribution]; (b) Note methodologique (document genere par IA a partir des donnees Validator, projections = estimations directionnelles sur benchmarks sectoriels, non substituables a un audit financier); (c) Glossaire des termes cles utilises dans ce document.',
  ].join('\n\n') : [
    '1. COVER PAGE: #0a0a0a background. LARGE Cormorant Garamond concept name. Copper subtitle (format / cuisine / city). Validator score badge: large copper circle, score '+c.ov.score+'/100, verdict '+c.ov.verdict+'. "Prepared by Za3fran Digital" + date '+c.today+'. Elegant, professional design.',

    '2. INVESTOR BRIEF (standalone section, detachable and sendable to a banker): (a) Concept sheet table [Concept|Format|Cuisine|City|Seats|Avg ticket|Hours|Stage]; (b) Market opportunity in 3 precise sentences; (c) Value proposition in 4-5 bullets; (d) Compact financial table [Metric|Value]: total investment (range), monthly break-even '+sym+c.fmt(c.be.monthly_revenue)+', projected revenue Y1/Y2/Y3, EBITDA Y1/Y2/Y3, estimated payback; (e) Funding requirement (amount + equity/debt split); (f) Risk profile: 3 risks with level (High/Medium/Low) and 1-line mitigation.',

    '3. TABLE OF CONTENTS: all 14 sections with titles.',

    '4. EXECUTIVE SUMMARY (300 words): target market, concept and positioning, business model, funding needs, potential, key risks, key next steps.',

    '5. CONCEPT & POSITIONING: vision and rationale (why now, why here); brand identity (name, visual territory, tone); detailed value proposition; operational format and customer experience; price/quality/experience coherence.',

    '6. MARKET ANALYSIS & TARGET AUDIENCE: local F&B market dynamics (city-specific); market gap and why it exists; 2-3 detailed personas (age, profession, lunch habits, price sensitivity, discovery channels); concrete demand signals; macro factors (purchasing power, trends).',

    '7. COMPETITIVE LANDSCAPE: table 6-8 players [Name|Type|Ticket|Same customer?|Key strength|Weakness|Threat level]; direct AND informal competition; differentiation axes; defensibility (score 1-5); capitalised entrant risk within 18 months.',

    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE]: menu structure table [Section|Items|Price range '+sym+'|Target food cost %]; pricing logic and target ticket; 2-3 named regional suppliers; 3-5 directional signature items (name + 1-line concept); key operational constraints (prep-ahead, service time).',

    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE]: staffing table [Position|FTE|Salary '+sym+'/month|Total monthly charges]; productivity ratios (covers/server/service); service model and customer flow; peak management; 3 operational KPIs to track from D+30.',

    '10. FINANCIAL PROJECTIONS ['+fn+']\n'
    + '10A. STARTUP BUDGET: table [Item|Low '+sym+'|High '+sym+'|Notes] with: Works & fit-out, Professional kitchen equipment, Furniture & decor, IT & POS system, Licenses & permits, Legal & fiduciary fees, Initial working capital, Pre-opening marketing, Cash reserve (3 months fixed costs minimum), Contingency 8%. TOTAL row low and high. Comment on gap vs stated budget ('+c.snap.budget+' '+cur+').\n'
    + '10B. REVENUE PROJECTIONS: Quarterly Y1 table [Quarter|Avg covers/day|Trading days|Revenue '+sym+'|Note] with realistic ramp-up. Summary table [Year|Revenue '+sym+'|vs prior year]: Y1 base, Y2 (+25%), Y3 (+18%).\n'
    + '10C. PROJECTED P&L: table [Line|Y1 '+sym+'|Y1%|Y2 '+sym+'|Y2%|Y3 '+sym+'|Y3%] — Revenue, Food cost (30-34%), Gross margin, Payroll incl. charges (28-32%), Rent & occupancy (8-12%), Energy (3-5%), Packaging (2-4%), Marketing (3-5%), Depreciation, Other charges, EBITDA, Net result before tax.\n'
    + '10D. BREAK-EVEN ANALYSIS: 3x3 sensitivity table [ticket -10%/base/+15% x covers/day -20%/base/+30%] showing monthly result. Estimated months to break-even from opening.\n'
    + '10E. ROI & FUNDING: retained investment (midpoint of 10A range); cumulative cash flows Y1/Y2/Y3; payback point (months); recommended equity/debt split; local SME debt rate; 2-3 financing institutions to contact by name (specific to '+(c.snap.city||'the city')+').',

    '11. MARKETING STRATEGY & PRE-OPENING TIMELINE [DIRECTIONAL ESTIMATE]: table [Period|Key actions|Indicative budget '+sym+'] for D-90/D-60/D-30/D-0; recommended channel mix with indicative budget (Instagram, TikTok, delivery platforms, micro-influencers 8K-50K, local press); launch strategy and inaugural event; retention strategy; 4 marketing KPIs to track.',

    '12. RISK ANALYSIS: table [Risk|Probability|Impact|Score|Main mitigation] with 6 risks covering: financial, operational, market, competitive, regulatory, human. For each risk: analysis paragraph specific to THIS concept in THIS city. Detailed contingency plan for risk #1.',

    '13. RECOMMENDATIONS & NEXT STEPS: 5 priority actions in 30 days (from Validator). What this plan tells you to do — and what it cannot yet tell you. "Go deeper with Za3fran" box (background #0F1F3D, white text, copper accent): Menu Engineer (costed menu architecture with real food cost and selling prices), Financial Builder (complete financial model from your real data — replaces directional estimates), Business Plan Pro (bank-financing-grade business plan with fully modelled data).',

    '14. APPENDICES: (a) Validator scores table [Section|Sub-score|Weight|Contribution]; (b) Methodology note (AI-generated from Validator data, projections = directional estimates based on industry benchmarks, not a substitute for a financial audit); (c) Glossary of key terms used in this document.',
  ].join('\n\n');

  var design = fr
    ? 'DESIGN HTML OBLIGATOIRE: Document HTML COMPLET et AUTO-CONTENU (tout le CSS dans <head>). Google Fonts: Cormorant Garamond (titres, nombres cles) + DM Sans (corps, tableaux). Palette: background document #FAFAF7, texte #1a1a1a, accent cuivre #C9862A, navy #0F1F3D, muted #888880. Page de couverture: fond #0a0a0a, titre blanc, sous-titre #C9862A. Encadres ESTIMATION DIRECTIONNELLE: fond #fff8f0, bordure gauche 3px #C9862A, label en majuscules cuivrees. Encadre Za3fran prochaines etapes: fond #0F1F3D, texte blanc, accents cuivres. Tableaux: bordures 1px #e8e8e4, rangees alternees (#F5F4F0 / blanc), en-tetes #0F1F3D texte blanc, padding genereux. En-tetes de sections: grand numero Cormorant cuivre (opacity 0.3) + titre DM Sans navy 500. Max-width 860px centre, padding lateral 48px. Footer discret chaque section: "Za3fran Digital \u00b7 Business Plan Essentials \u00b7 '+c.today+'". @media print: page-break-before sur chaque <section>. Rendu impeccable, professionnel, investor-ready. Aucun element brise, aucun debordement de tableau.'
    : 'REQUIRED HTML DESIGN: Complete self-contained HTML (all CSS in <head>). Google Fonts: Cormorant Garamond (headings, key numbers) + DM Sans (body, tables). Palette: document background #FAFAF7, text #1a1a1a, copper accent #C9862A, navy #0F1F3D, muted #888880. Cover page: #0a0a0a background, white title, #C9862A subtitle. DIRECTIONAL ESTIMATE boxes: #fff8f0 background, 3px #C9862A left border, uppercase copper label. Za3fran next steps box: #0F1F3D background, white text, copper accents. Tables: 1px #e8e8e4 borders, alternating rows (#F5F4F0 / white), #0F1F3D white-text headers, generous padding. Section headers: large copper Cormorant number (opacity 0.3) + navy DM Sans 500 title. Max-width 860px centered, 48px side padding. Subtle footer each section: "Za3fran Digital \u00b7 Business Plan Essentials \u00b7 '+c.today+'". @media print: page-break-before on each <section>. Impeccable, professional, investor-ready rendering. No broken elements, no table overflow.';

  var intro = fr
    ? 'Tu es un expert senior en strategie F&B et redaction de business plans professionnels pour investisseurs et banquiers MENA. Genere un BUSINESS PLAN ESSENTIALS complet (14 sections, 18-22 pages) en HTML. Sois dense, precis et professionnel. Chaque tableau doit etre complet. Ne tronque aucune section.'
    : 'You are a senior F&B strategy expert writing professional business plans for MENA investors and bankers. Generate a complete BUSINESS PLAN ESSENTIALS (14 sections, 18-22 pages) in HTML. Be dense, precise and professional. Every table must be complete. Do not truncate any section.';

  var closing = fr
    ? 'Retourne UNIQUEMENT le code HTML complet. Commence par <!DOCTYPE html> et termine par </html>. Aucun texte avant ou apres.'
    : 'Return ONLY the complete HTML. Start with <!DOCTYPE html> and end with </html>. No text before or after.';

  return intro
    + '\n\n=== DONNEES VALIDATOR ===\n' + dataStr
    + '\n\n=== STRUCTURE 14 SECTIONS ===\n' + sections
    + '\n\n' + design
    + '\n\n' + closing;
}
