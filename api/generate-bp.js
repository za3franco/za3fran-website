// ============================================================
// /api/generate-bp.js  (v11 — calibrated per-section page budgets)
// Single streaming Haiku pass. Per-section content sized to fill A4 pages
// at ~85% density. Target: 17-19 pages total. Replaces v10 "120 words max"
// approach (which under-filled pages and forced CSS hacks).
// At 150 t/s: ~25k tokens out = ~167s. maxDuration: 300 in vercel.json.
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
      body: JSON.stringify({ model: HAIKU, max_tokens: 32000, stream: true, messages: [{ role: 'user', content: buildPrompt(ctx) }] }),
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
  var city = c.snap.city || '';

  // --- DATA BLOCK (unchanged from v10) ---
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

  // --- PAGE BUDGETS ---
  var budgets = fr
    ? '\n\nBUDGET DE PAGES A4 PAR SECTION (RESPECTER STRICTEMENT — total cible 17-19 pages, densite ~85% par page):\n'
      + '- Section 1 (Cover): 1 page fixe.\n'
      + '- Section 2 (Brief Investisseur): 2 pages.\n'
      + '- Section 3 (Table des Matieres): 1 page.\n'
      + '- Section 4 (Resume Executif): 1 page (~350-400 mots).\n'
      + '- Section 5 (Concept & Positionnement): 1 page (~350 mots structures).\n'
      + '- Section 6 (Marche & Audience): 1 page (~200 mots + tableau personas).\n'
      + '- Section 7 (Paysage Concurrentiel): 1.5 pages (tableau 6 acteurs + analyse).\n'
      + '- Section 8 (Strategie Menu): 1 page.\n'
      + '- Section 9 (Operationnel & Staffing): 1.5 pages.\n'
      + '- Section 10 (Projections Financieres): 3 pages.\n'
      + '- Section 11 (Marketing & Pre-Ouverture): 1.5 pages.\n'
      + '- Section 12 (Analyse des Risques): 2 pages.\n'
      + '- Section 13 (Recommandations): 1 page.\n'
      + '- Section 14 (Annexes): 1 page.\n'
      + 'Chaque section doit remplir son budget a au moins 80%. Densite cible: 85% (eviter blancs en fin de page). Tableaux: respecter le nombre exact de lignes specifie.'
    : '\n\nA4 PAGE BUDGETS PER SECTION (STRICT — total target 17-19 pages, ~85% density per page):\n'
      + '- Section 1 (Cover): 1 fixed page.\n'
      + '- Section 2 (Investor Brief): 2 pages.\n'
      + '- Section 3 (Table of Contents): 1 page.\n'
      + '- Section 4 (Executive Summary): 1 page (~350-400 words).\n'
      + '- Section 5 (Concept & Positioning): 1 page (~350 structured words).\n'
      + '- Section 6 (Market & Audience): 1 page (~200 words + personas table).\n'
      + '- Section 7 (Competitive Landscape): 1.5 pages (6-player table + analysis).\n'
      + '- Section 8 (Menu Strategy): 1 page.\n'
      + '- Section 9 (Operations & Staffing): 1.5 pages.\n'
      + '- Section 10 (Financial Projections): 3 pages.\n'
      + '- Section 11 (Marketing & Pre-Opening): 1.5 pages.\n'
      + '- Section 12 (Risk Analysis): 2 pages.\n'
      + '- Section 13 (Recommendations): 1 page.\n'
      + '- Section 14 (Appendices): 1 page.\n'
      + 'Each section must fill its budget at least 80%. Target density: 85% (avoid trailing blanks). Tables: respect exact row counts specified.';

  // --- SECTIONS (calibrated structure per page budget) ---
  var sections = fr ? [

    '1. PAGE DE COUVERTURE [section 1, classe CSS exacte "cover-section"]: <section class="cover-section"> pleine page, fond #0a0a0a, flex centre. CINQ elements DANS L\'ORDRE EXACT:\n'
    +'(1) <h1>'+(c.snap.concept_name||'')+'</h1> en Cormorant Garamond blanc tres grand (5-6rem, letter-spacing -2px).\n'
    +'(2) <p class="subtitle"> en MAJUSCULES TOTALES avec separateurs " \u00b7 " (ex: "FAST-CASUAL \u00b7 MAROCAIN MODERNE \u00b7 CASABLANCA"). Couleur cuivre #C9862A, 1.3rem, letter-spacing 1px, margin-bottom 3rem.\n'
    +'(3) <div class="badge-score"> cercle cuivre 130x130px (border 3px solid #C9862A, border-radius 50%, flex column center, padding 0.5rem). CONTIENT TROIS sous-elements DANS CET ORDRE: <div class="score-number">'+c.ov.score+'</div> (Cormorant 2.8rem cuivre); <div class="score-status">'+(c.ov.verdict||'').toUpperCase()+'</div> en MAJUSCULES (DM Sans 0.85rem cuivre, letter-spacing 1.5px); <div class="score-label">/ 100</div> (DM Sans 0.75rem cuivre, margin-top 0.2rem).\n'
    +'(4) <div class="cover-footer"> (classe "cover-footer" UNIQUEMENT \u2014 PAS "cover-section" dans le footer; margin-top 3rem, color #999, text-align center, font-size 0.95rem): contenir <p>Pr\u00e9par\u00e9 par Za3fran Digital</p> et <p>'+c.today+'</p>.\n'
    +'IMPERATIF: "Pr\u00e9par\u00e9 par Za3fran Digital" avec accents corrects, EN FRANCAIS \u2014 jamais "Prepared by".',

    '2. BRIEF INVESTISSEUR [2 pages — section autonome impression separee]: AVANT le h2, inserer <div class="section-number">Section 2</div>. Titre h2 "Brief Investisseur". STRUCTURE OBLIGATOIRE (cette section doit remplir 2 pages complets):\n'
    +'(a) h3 "Fiche Concept" + tableau 8 lignes [Parametre|Valeur]: Concept, Format, Cuisine, Ville (+quartier si dispo), Nombre de places, Ticket moyen, Horaires, Stade de developpement.\n'
    +'(b) h3 "Opportunite Marche" + 1 paragraphe dense 80-100 mots: validation marche, vide structurel identifie, signaux demande.\n'
    +'(c) h3 "Proposition de Valeur" + liste <ul> de 4 bullets percutants (15-20 mots chacun).\n'
    +'(d) h3 "Tableau Financier Resume" + tableau 9 lignes [Indicateur|Valeur]: Investissement (fourchette '+sym+'), Budget declare ('+(c.snap.budget||'N/A')+' '+cur+'), Ecart estime %, Point mort mensuel ('+sym+c.fmt(c.be.monthly_revenue)+' = '+(c.be.daily_covers||'N/A')+' cv/j), CA A1, EBITDA A1 (% CA), CA A2, EBITDA A2 (% CA), CA A3, EBITDA A3 (% CA), Delai retour estime.\n'
    +'(e) h3 "Top 3 Risques" + tableau 3 lignes [Risque|Niveau|Mitigation cle 1 ligne]. Niveaux: CRITIQUE (rouge), MOYEN (orange), ou ELEVE.',

    '3. TABLE DES MATIERES [1 page]: AVANT h2, <div class="section-number">Section 3</div>. h2 "Table des Matieres". Liste numerotee <ol> de 13 entrees (sections 2 a 14): pour chacune, format "Titre de section — description 8-12 mots du contenu". Densite cible: remplir la page (les descriptions etoffent la liste pour eviter blanc).',

    '4. RESUME EXECUTIF [1 page ~350-400 mots, format avec sous-titres comme section 5]: AVANT h2, <div class="section-number">Section 4</div>. h2 "Resume Executif". QUATRE sous-sections, chacune avec h3 + 1 paragraphe 80-100 mots:\n'
    +'h3 "Marche & Opportunite" + paragraphe — validation marche, vide structurel, audience cible, taille demande.\n'
    +'h3 "Concept & Positionnement" + paragraphe — proposition unique, identite, differenciation cle vs concurrents.\n'
    +'h3 "Modele Economique" + paragraphe — investissement, CA A1, EBITDA %, point mort, delai retour, robustesse financiere.\n'
    +'h3 "Verdict & Recommandation" + paragraphe — score Validator '+c.ov.score+'/100, '+(c.ov.verdict||'')+', 3 risques cles, recommandation finale (lancement direct ou phase ghost kitchen prealable).',

    '5. CONCEPT & POSITIONNEMENT [1 page ~350 mots structures]: AVANT h2, <div class="section-number">Section 5</div>. h2 "Concept & Positionnement". QUATRE sous-sections, chacune avec h3 + 1 paragraphe 80-90 mots:\n'
    +'h3 "Vision" + paragraphe — raison d\'etre du concept, ce qu\'il apporte au marche local.\n'
    +'h3 "Identite de Marque" + paragraphe — nom, signification, ton de voix, references visuelles, ambiance.\n'
    +'h3 "Proposition de Valeur" + paragraphe — promesse client core, 3 piliers differenciants.\n'
    +'h3 "Experience Client" + paragraphe — parcours type, points de contact, ambiance physique et service.',

    '6. ANALYSE DE MARCHE & AUDIENCE [1 page]: AVANT h2, <div class="section-number">Section 6</div>. h2 "Analyse de Marche & Audience".\n'
    +'(a) Narrative marche en 2 paragraphes courts (100 mots chacun): contexte '+(c.snap.city||'ville')+', taille audience cible, dynamique recente, signaux demande concrets.\n'
    +'(b) h3 "Personas Client" + tableau 7 lignes [Profil|Persona 1|Persona 2]: Age, Profession, Habitat, Habitudes lunch, Ticket acceptable, Sensibilites cles, Canaux d\'information. Deux personas distincts mais complementaires.',

    '7. PAYSAGE CONCURRENTIEL [1.5 pages]: AVANT h2, <div class="section-number">Section 7</div>. h2 "Paysage Concurrentiel".\n'
    +'(a) Tableau 6 acteurs concurrents [Acteur|Type|Ticket '+sym+'|Meme client?|Force|Faiblesse|Menace ZOCO]. Mix: 1 fast-casual international (ex: Sushi Shop), 1 fast-food, 1 restaurant traditionnel premium, 1 restaurant traditionnel moyen, 1 informel/street, 1 nouvel entrant hypothetique meme segment.\n'
    +'(b) h3 "Differenciation du Concept" + 1 paragraphe 150-180 mots structurant 4 differenciateurs cles numerotes (1) cuisine X en moins de Y minutes vs informel, (2) qualite et tracabilite vs fast-food, (3) experience coherente vs traditionnel lent, (4) positionnement premium urbain. Format: prose dense, pas bullets.',

    '8. STRATEGIE MENU [ESTIMATION DIRECTIONNELLE — 1 page]: AVANT h2, <div class="section-number">Section 8</div>. h2 "Strategie Menu".\n'
    +'(a) Encadre <div class="estimate-box"> avec <h4>Strategie Menu — Directionnel</h4> + paragraphe (40-50 mots): "Structure menu et fourchettes prix basees sur benchmarks F&B '+(c.snap.cuisine||'')+'. A affiner avec chef cuisinier post-recrutement. Sourcing fournisseurs detaille dans le module Menu Engineer."\n'
    +'(b) h3 "Structure Menu Estimee" + tableau 6 lignes [Section|Nb items|Prix moyen '+sym+'|Food cost %|Notes] — items principaux (ex: Bols), specialites (ex: Tajines), Salades & sides, Boissons, Desserts, MOYENNE TOTAL.\n'
    +'(c) h3 "Items Signature" + 3 plats sous forme <ul>. Pour chaque: nom en gras + description 35-45 mots (ingredients core, technique de preparation, prix indicatif). NE PAS inclure de section fournisseurs (traite dans Menu Engineer).',

    '9. MODELE OPERATIONNEL & STAFFING [ESTIMATION DIRECTIONNELLE — 1.5 pages, equilibre: p1 staffing, p2 ratios+KPIs]: AVANT h2, <div class="section-number">Section 9</div>. h2 "Modele Operationnel & Staffing".\n'
    +'(a) Encadre <div class="estimate-box"> avec <h4>Staffing — Directionnel</h4> + paragraphe (40 mots): "Staffing benchmarke sur formats similaires fast-casual MENA. A ajuster apres recrutement chef et test ghost kitchen 90j."\n'
    +'(b) h3 "Structure Staffing" + tableau 8 lignes [Poste|ETP|Salaire/mois '+sym+'|Total '+sym+'|Notes] — Chef cuisinier, Commis cuisine, Shift manager/service, Serveurs/caisse, Nettoyage/logistique, TOTAL BRUT, Charges sociales (~35%), TOTAL CHARGE.\n'
    +'(c) APRES le tableau staffing, INSERER <div class="page-break"></div> (saut de page force pour equilibre visuel: staffing seul sur page 1).\n'
    +'(d) h3 "Ratios Productivite" + <ul> de 4 bullets: CA/ETP/an, Couverts/ETP/jour, Temps moyen service, Masse salariale / CA %.\n'
    +'(e) h3 "Top 3 KPIs Operationnels J+30" + tableau 3 lignes [KPI|Cible J+30|Methode de mesure] — Couverts/jour atteints, Temps service moyen, Satisfaction client (NPS).',

    '10. PROJECTIONS FINANCIERES [3 pages — classe CSS "financial-section"]: AVANT h2, <div class="section-number">Section 10</div>. h2 "Projections Financieres". Sous h2, paragraphe italique 50-60 mots: "Estimations directionnelles basees sur benchmarks F&B casual MENA. Ratios cibles: food cost 30-34%, masse salariale 28-32%, loyer 8-12% CA. A affiner sur donnees operationnelles reelles post-lancement ghost kitchen."\n\n'
    +'CINQ sous-sections, CHACUNE dans un <div class="estimate-box"> contenant <h4>Titre</h4> + paragraphe description (25-35 mots) PUIS son tableau associe directement apres l\'encadre:\n\n'
    +'10A. BUDGET DEMARRAGE — encadre + tableau 12 lignes [Poste|Bas '+sym+'|Haut '+sym+'|Notes]: Travaux & amenagement, Equipements cuisine pro, Mobilier & decoration, IT/Caisse/POS, Licences & autorisations, Fiduciaire & conseil, Fonds de roulement (3 mois), Marketing pre-ouverture, Reserve tresorerie (3 mois min), Contingence 8%, TOTAL INVESTISSEMENT, Comparaison budget annonce '+(c.snap.budget||'N/A')+' '+cur+' (ecart % calcule).\n\n'
    +'10B. CHIFFRE D\'AFFAIRES PREVISIONNEL — encadre + DEUX tableaux: (1) trimestriel A1, 5 lignes [Trimestre|Couverts/jour|Jours ouverture|CA trimestriel '+sym+']: Q1 ramp-up, Q2 acceleration, Q3 stabilisation, Q4 croisiere, A1 TOTAL; (2) recap multi-annees, 3 lignes [Annee|CA annuel '+sym+'|Croissance %|Hypothese couverts/jour moyen]: A1, A2 (+25%), A3 (+18%).\n\n'
    +'10C. COMPTE DE RESULTAT (P&L) 3 ANS — encadre + tableau P&L 12 lignes [Ligne|A1 '+sym+'|A1 %|A2 '+sym+'|A2 %|A3 '+sym+'|A3 %]: Chiffre d\'Affaires, Cout matiere premiere (30-34%), Marge brute, Masse salariale (28-32%), Loyer (8-12%), Energie (3-5%), Emballages & transport (2-4%), Marketing & promotion (3-5%), Assurance & divers (1-2%), Amortissements, EBITDA, Resultat net.\n\n'
    +'10D. ANALYSE SENSIBILITE POINT MORT — encadre + tableau 4 lignes (en-tete + 3 lignes scenarios) [Scenario|Ticket -10%|Ticket Base|Ticket +15%]: Couverts -20%, Couverts Base, Couverts +30%. Chaque cellule = point mort mensuel en '+sym+'. Sous le tableau, 1 ligne synthese: "Point mort conservateur: X '+sym+'/mois = Y couverts/jour. Atteint en QZ A1."\n\n'
    +'10E. ROI & FINANCEMENT — encadre + DEUX tableaux: (1) Parametres ROI, 5 lignes [Parametre|Valeur]: Investissement retenu (mediane 10A), EBITDA cumule A1-A3, Delai retour (annees), ROI A3 (%), ROIC annualise base EBITDA A3. (2) Structure financement proposee, 3 lignes [Source|Montant '+sym+'|%|Notes]: Fonds propres (entrepreneur), Credit bancaire (12-15 ans, TAEG indicatif), TOTAL. Sous: h3 "Institutions de Financement a Contacter ('+city+')" + tableau 3 lignes [Banque|Produit F&B|Criteres cles] — 3 institutions reelles locales avec produit pertinent.',

    '11. MARKETING & PRE-OUVERTURE [ESTIMATION DIRECTIONNELLE — 1.5 pages]: AVANT h2, <div class="section-number">Section 11</div>. h2 "Marketing & Pre-Ouverture".\n'
    +'(a) Encadre <div class="estimate-box"> avec <h4>Marketing — Directionnel</h4> + paragraphe 35-45 mots: "Timeline J-90 a J-0. Budget total 40-60k '+sym+'. Mix digital + RP + activation terrain. Audience cible: professionnels '+(c.snap.neighbourhood||c.snap.city||'urbains')+' 25-45 ans."\n'
    +'(b) h3 "Calendrier Marketing Pre-Ouverture" + tableau 4 lignes [Periode|Phase|Actions cles (3-4 bullets dans la cellule)|Budget '+sym+']: J-90 a J-60 Awareness, J-60 a J-30 Preinscription, J-30 a J-0 Lancement, TOTAL PRE-OUVERTURE.\n'
    +'(c) h3 "Mix Canaux Indicatif (A1)" + <ul> de 4 bullets (20-30 mots chacun): Digital (Instagram/TikTok/LinkedIn), RP & influenceurs locaux, Terrain & activation, Email & CRM. Inclure % budget par canal.\n'
    +'(d) h3 "Top 3 KPIs Marketing" + tableau 3 lignes [KPI|Cible J+30|Methode]: Followers reseaux, Base email engagee, Clients repeat.',

    '12. ANALYSE DES RISQUES [2 pages, format synthetise]: AVANT h2, <div class="section-number">Section 12</div>. h2 "Analyse des Risques". Sous h2, paragraphe italique 25 mots: "6 risques identifies au total. Detail des 3 risques critiques ci-dessous. Score = Probabilite x Impact."\n'
    +'(a) h3 "Tableau Recapitulatif Risques" + tableau 6 lignes [Risque|Probabilite|Impact|Score /10|Mitigation cle 1 ligne]. Les 6 risques: budget aménagement, premier entrant erode, concurrence prix informelle, retards reglementaires, turnover chef, baisse trafic macro/insecurite.\n'
    +'(b) h3 "Detail des 3 Risques Critiques" + 3 blocs <div class="risk-block"> UNIQUEMENT (les 3 risques au plus haut score). Chaque bloc CONCIS: <h4>Risque N: Titre</h4> + ligne en gras "Probabilite: X | Impact: Y | Score: Z/10" + 1 paragraphe contexte court (40-50 mots) + h5 "Mitigation & Contingence" + liste <ol> de 3 actions concretes + 1 ligne "Plan B:" finale.\n'
    +'(c) h3 "Autres Risques a Surveiller" + 1 paragraphe court (40-60 mots) listant les 3 risques restants (scores les plus bas) avec mitigation cle resumee. Format: "Risque X: mitigation 8-12 mots. Risque Y: ... Risque Z: ...".',

    '13. RECOMMANDATIONS & PROCHAINES ETAPES [1 page]: AVANT h2, <div class="section-number">Section 13</div>. h2 "Recommandations & Prochaines Etapes".\n'
    +'(a) Paragraphe d\'introduction 30-40 mots resumant verdict Validator '+c.ov.score+'/100 et axes prioritaires.\n'
    +'(b) h3 "5 Actions Prioritaires J+30" + tableau 5 lignes [#|Action|Proprietaire|Livrable|Delai]. Issues des recommandations Validator.\n'
    +'(c) <div class="za3fran-box"> avec h3 "Services Za3fran Digital — Prochaines Etapes" (couleur cuivre #C9862A) + texte introductif court "Le concept est viable mais necessite X approfondissements critiques avant investissement immobilier. Za3fran Digital propose:" + 3 services en <ol>, chacun: nom en gras + 1 ligne objectif + 1 ligne processus + 1 ligne livrable + investissement indicatif. Services: (1) Menu Engineer, (2) Financial Builder Pro, (3) Business Plan Bancaire Pro. Finir par 1 ligne "Package complet 3 services: '+sym+'X-Y. Duree 60 jours." + ligne contact "Contact: hello@za3fran.io | WhatsApp: +212 648 960 306".',

    '14. ANNEXES [1 page]: AVANT h2, <div class="section-number">Section 14</div>. h2 "Annexes".\n'
    +'(a) h3 "Scores Validator — Detail" + tableau 7 lignes [Critere|Score /10|Observation 1 ligne]: Marche (demande validee), Avantage competitif, Modele economique, Financement & budget, Equipe & execution, Timing & risques, SCORE GLOBAL (avec verdict).\n'
    +'(b) h3 "Note Methodologique" + <ol> de 3 bullets concis: benchmarks utilises (ratios F&B MENA), scenario base (hypotheses CA), limitations (donnees post-launch a integrer).\n'
    +'(c) h3 "Glossaire" + tableau 10 lignes [Terme|Definition courte 12-18 mots]: Fast-Casual, Ghost Kitchen, Food Cost %, EBITDA, Point Mort, Couvert (CV), Ticket Moyen, ROI, Ramp-up, NPS.\n'
    +'(d) Footer minimal en fin de section: <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid #e8e8e4; text-align: center; font-size: 0.85rem; color: #999;"> contenant 3 lignes <p>: nom du document, "Prepare par Za3fran Digital | '+c.today+'", copyright "Document confidentiel — Usage interne. Reproduction interdite sans autorisation ecrite."',

  ].join('\n\n') : [

    '1. COVER PAGE [section 1, exact CSS class "cover-section"]: <section class="cover-section"> full-page, #0a0a0a background, centered flex. FIVE elements IN EXACT ORDER:\n'
    +'(1) <h1>'+(c.snap.concept_name||'')+'</h1> very large (white Cormorant Garamond 5-6rem, letter-spacing -2px).\n'
    +'(2) <p class="subtitle"> in TOTAL UPPERCASE with " \u00b7 " separators (e.g. "FAST-CASUAL \u00b7 MODERN MOROCCAN \u00b7 CASABLANCA"). Copper #C9862A, 1.3rem, letter-spacing 1px, margin-bottom 3rem.\n'
    +'(3) <div class="badge-score"> copper circle 130x130px (border 3px solid #C9862A, border-radius 50%, flex column center, padding 0.5rem). CONTAINS THREE sub-elements IN THIS ORDER: <div class="score-number">'+c.ov.score+'</div> (Cormorant 2.8rem copper); <div class="score-status">'+(c.ov.verdict||'').toUpperCase()+'</div> UPPERCASE (DM Sans 0.85rem copper, letter-spacing 1.5px); <div class="score-label">/ 100</div> (DM Sans 0.75rem copper, margin-top 0.2rem).\n'
    +'(4) <div class="cover-footer"> (class "cover-footer" ONLY \u2014 NOT "cover-section" inside footer; margin-top 3rem, color #999, text-align center, font-size 0.95rem): contains <p>Prepared by Za3fran Digital</p> and <p>'+c.today+'</p>.',

    '2. INVESTOR BRIEF [2 pages — standalone section for separate printing]: BEFORE h2, insert <div class="section-number">Section 2</div>. Title h2 "Investor Brief". MANDATORY STRUCTURE (must fill 2 complete pages):\n'
    +'(a) h3 "Concept Sheet" + 8-row table [Parameter|Value]: Concept, Format, Cuisine, City (+neighbourhood if avail), Number of seats, Average ticket, Hours, Development stage.\n'
    +'(b) h3 "Market Opportunity" + 1 dense paragraph 80-100 words: market validation, structural gap, demand signals.\n'
    +'(c) h3 "Value Proposition" + <ul> of 4 punchy bullets (15-20 words each).\n'
    +'(d) h3 "Financial Summary Table" + 9-row table [Metric|Value]: Investment range '+sym+', Declared budget ('+(c.snap.budget||'N/A')+' '+cur+'), Estimated gap %, Monthly break-even ('+sym+c.fmt(c.be.monthly_revenue)+' = '+(c.be.daily_covers||'N/A')+' cv/d), Y1 Revenue, Y1 EBITDA (% rev), Y2 Revenue, Y2 EBITDA, Y3 Revenue, Y3 EBITDA, Estimated payback.\n'
    +'(e) h3 "Top 3 Risks" + 3-row table [Risk|Level|Key mitigation 1 line]. Levels: CRITICAL (red), MEDIUM (orange), HIGH.',

    '3. TABLE OF CONTENTS [1 page]: BEFORE h2, <div class="section-number">Section 3</div>. h2 "Table of Contents". Numbered <ol> of 13 entries (sections 2 to 14): format each "Section title — 8-12 word description". Density target: fill the page.',

    '4. EXECUTIVE SUMMARY [1 page ~350-400 words, structured with sub-headings like section 5]: BEFORE h2, <div class="section-number">Section 4</div>. h2 "Executive Summary". FOUR sub-sections, each with h3 + 80-100 word paragraph:\n'
    +'h3 "Market & Opportunity" + paragraph — validation, structural gap, target audience, demand size.\n'
    +'h3 "Concept & Positioning" + paragraph — unique proposition, identity, key differentiation vs competitors.\n'
    +'h3 "Business Model" + paragraph — investment, Y1 revenue, EBITDA %, break-even, payback, financial robustness.\n'
    +'h3 "Verdict & Recommendation" + paragraph — Validator score '+c.ov.score+'/100, '+(c.ov.verdict||'')+', 3 key risks, final recommendation.',

    '5. CONCEPT & POSITIONING [1 page ~350 structured words]: BEFORE h2, <div class="section-number">Section 5</div>. h2 "Concept & Positioning". FOUR sub-sections, each with h3 + 80-90 word paragraph:\n'
    +'h3 "Vision" + paragraph.\n'
    +'h3 "Brand Identity" + paragraph.\n'
    +'h3 "Value Proposition" + paragraph.\n'
    +'h3 "Customer Experience" + paragraph.',

    '6. MARKET ANALYSIS & AUDIENCE [1 page]: BEFORE h2, <div class="section-number">Section 6</div>. h2 "Market Analysis & Audience".\n'
    +'(a) Market narrative in 2 short paragraphs (100 words each).\n'
    +'(b) h3 "Customer Personas" + 7-row table [Profile|Persona 1|Persona 2]: Age, Profession, Habitat, Lunch habits, Acceptable ticket, Key sensitivities, Information channels.',

    '7. COMPETITIVE LANDSCAPE [1.5 pages]: BEFORE h2, <div class="section-number">Section 7</div>. h2 "Competitive Landscape".\n'
    +'(a) 6-player table [Player|Type|Ticket '+sym+'|Same customer?|Strength|Weakness|Threat to concept]. Mix: 1 international fast-casual, 1 fast-food, 1 premium traditional, 1 mid traditional, 1 informal/street, 1 hypothetical new entrant.\n'
    +'(b) h3 "Concept Differentiation" + 1 paragraph 150-180 words structured around 4 key differentiators numbered.',

    '8. MENU STRATEGY [DIRECTIONAL ESTIMATE — 1 page]: BEFORE h2, <div class="section-number">Section 8</div>. h2 "Menu Strategy".\n'
    +'(a) <div class="estimate-box"> with <h4>Menu Strategy — Directional</h4> + paragraph 40-50 words (mention supplier sourcing is covered in the Menu Engineer module).\n'
    +'(b) h3 "Estimated Menu Structure" + 6-row table [Section|Items|Avg price '+sym+'|Food cost %|Notes].\n'
    +'(c) h3 "Signature Items" + 3 dishes as <ul>: bold name + 35-45 word description (ingredients, technique, indicative price). DO NOT include a suppliers section (handled in Menu Engineer).',

    '9. OPERATIONAL MODEL & STAFFING [DIRECTIONAL ESTIMATE — 1.5 pages, balanced: p1 staffing, p2 ratios+KPIs]: BEFORE h2, <div class="section-number">Section 9</div>. h2 "Operational Model & Staffing".\n'
    +'(a) <div class="estimate-box"> with <h4>Staffing — Directional</h4> + paragraph 40 words.\n'
    +'(b) h3 "Staffing Structure" + 8-row table [Position|FTE|Monthly salary '+sym+'|Total '+sym+'|Notes] ending in TOTAL GROSS, Social charges (~35%), TOTAL LOADED.\n'
    +'(c) AFTER the staffing table, INSERT <div class="page-break"></div> (forced page break for visual balance: staffing alone on page 1).\n'
    +'(d) h3 "Productivity Ratios" + <ul> of 4 bullets.\n'
    +'(e) h3 "Top 3 Operational KPIs D+30" + 3-row table.',

    '10. FINANCIAL PROJECTIONS [3 pages — CSS class "financial-section"]: BEFORE h2, <div class="section-number">Section 10</div>. h2 "Financial Projections". Italic sub-paragraph 50-60 words on benchmarks.\n'
    +'FIVE sub-sections, EACH in <div class="estimate-box"> with <h4>Title</h4> + 25-35 word description, THEN its table:\n\n'
    +'10A. STARTUP BUDGET — box + 12-row table [Item|Low '+sym+'|High '+sym+'|Notes]: Fit-out, Kitchen equipment, Furniture/decor, IT/POS, Licenses, Legal fees, Working capital (3 months), Pre-opening marketing, Cash reserve (3 months min), Contingency 8%, TOTAL, Gap vs declared budget '+(c.snap.budget||'N/A')+' '+cur+'.\n\n'
    +'10B. REVENUE PROJECTIONS — box + TWO tables: (1) quarterly Y1 5-row [Quarter|Covers/day|Trading days|Quarterly revenue '+sym+']; (2) multi-year recap 3-row [Year|Annual revenue '+sym+'|Growth %|Avg covers/day].\n\n'
    +'10C. 3-YEAR P&L — box + 12-row P&L table [Line|Y1 '+sym+'|Y1%|Y2 '+sym+'|Y2%|Y3 '+sym+'|Y3%]: Revenue, Food cost (30-34%), Gross margin, Payroll (28-32%), Rent (8-12%), Energy (3-5%), Packaging (2-4%), Marketing (3-5%), Insurance (1-2%), Depreciation, EBITDA, Net result.\n\n'
    +'10D. BREAK-EVEN SENSITIVITY — box + 4-row table [Scenario|Ticket -10%|Ticket Base|Ticket +15%]: Covers -20%, Covers Base, Covers +30%. Each cell = monthly break-even '+sym+'.\n\n'
    +'10E. ROI & FUNDING — box + TWO tables: (1) ROI Parameters 5-row; (2) Financing structure 3-row [Source|Amount '+sym+'|%|Notes]. + h3 "Financing Institutions to Contact ('+city+')" + 3-row table with 3 real local banks.',

    '11. MARKETING & PRE-OPENING [DIRECTIONAL ESTIMATE — 1.5 pages]: BEFORE h2, <div class="section-number">Section 11</div>. h2 "Marketing & Pre-Opening".\n'
    +'(a) <div class="estimate-box"> with <h4>Marketing — Directional</h4> + paragraph 35-45 words.\n'
    +'(b) h3 "Pre-Opening Marketing Timeline" + 4-row table [Period|Phase|Key actions (3-4 bullets in cell)|Budget '+sym+'].\n'
    +'(c) h3 "Indicative Channel Mix (Y1)" + <ul> of 4 bullets.\n'
    +'(d) h3 "Top 3 Marketing KPIs" + 3-row table.',

    '12. RISK ANALYSIS [2 pages, synthesized format]: BEFORE h2, <div class="section-number">Section 12</div>. h2 "Risk Analysis". Italic sub-paragraph 25 words: "6 risks identified total. Detail of the 3 critical risks below. Score = Probability x Impact."\n'
    +'(a) h3 "Risk Summary Table" + 6-row table [Risk|Probability|Impact|Score /10|Key mitigation 1 line]. ALL 6 risks listed.\n'
    +'(b) h3 "Detail of 3 Critical Risks" + 3 <div class="risk-block"> ONLY (the 3 highest-scored risks). Each COMPACT block: <h4>Risk N: Title</h4> + bold line "Probability: X | Impact: Y | Score: Z/10" + short 40-50 word context paragraph + h5 "Mitigation & Contingency" + <ol> of 3 numbered actions + final "Plan B:" line.\n'
    +'(c) h3 "Other Risks to Monitor" + 1 short paragraph (40-60 words) listing the 3 remaining (lowest-scored) risks with summarized key mitigation. Format: "Risk X: mitigation 8-12 words. Risk Y: ... Risk Z: ...".',

    '13. RECOMMENDATIONS & NEXT STEPS [1 page]: BEFORE h2, <div class="section-number">Section 13</div>. h2 "Recommendations & Next Steps".\n'
    +'(a) Intro paragraph 30-40 words.\n'
    +'(b) h3 "5 Priority Actions D+30" + 5-row table [#|Action|Owner|Deliverable|Deadline].\n'
    +'(c) <div class="za3fran-box"> with copper h3 "Za3fran Digital Services — Next Steps" + intro line + 3 services in <ol>: (1) Menu Engineer, (2) Financial Builder Pro, (3) Bank-Grade Business Plan Pro. Each: bold name + 1-line objective + 1-line process + 1-line deliverable + indicative investment. End with package price + duration + contact "Contact: hello@za3fran.io | WhatsApp: +212 648 960 306".',

    '14. APPENDICES [1 page]: BEFORE h2, <div class="section-number">Section 14</div>. h2 "Appendices".\n'
    +'(a) h3 "Validator Scores — Detail" + 7-row table [Criterion|Score /10|Observation 1 line].\n'
    +'(b) h3 "Methodology Note" + <ol> of 3 concise bullets.\n'
    +'(c) h3 "Glossary" + 10-row table [Term|Short definition 12-18 words].\n'
    +'(d) Minimal footer: <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid #e8e8e4; text-align: center; font-size: 0.85rem; color: #999;"> with 3 <p> lines: document name, "Prepared by Za3fran Digital | '+c.today+'", "Confidential — Internal use only. No reproduction without written permission."',

  ].join('\n\n');

  // --- PRINT CSS (simplified — content is calibrated, less hackery needed) ---
  var printCSS = '@media print { @page { margin: 1cm; size: A4; } html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; } section { display: block !important; width: 100% !important; min-height: 0 !important; max-height: none !important; height: auto !important; padding: 0.5rem 0 !important; margin: 0 !important; page-break-before: auto !important; page-break-inside: avoid !important; page-break-after: auto !important; break-inside: avoid !important; } section > p { page-break-inside: avoid !important; break-inside: avoid !important; } .cover-section { display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; min-height: 100vh !important; height: 100vh !important; page-break-before: avoid !important; page-break-after: always !important; break-after: page !important; padding: 3rem 2rem !important; background: #0a0a0a !important; color: white !important; } section:nth-of-type(2) { page-break-before: always !important; page-break-after: always !important; break-before: page !important; break-after: page !important; } section:nth-of-type(3) { page-break-before: always !important; page-break-after: always !important; break-before: page !important; break-after: page !important; } .financial-section { background: transparent !important; } .section-number { page-break-after: avoid !important; break-after: avoid !important; } section > *:nth-child(-n+4) { page-break-after: avoid !important; break-after: avoid !important; } table { page-break-inside: avoid !important; break-inside: avoid !important; margin: 1rem 0 !important; } thead { display: table-header-group !important; } tr { page-break-inside: avoid !important; break-inside: avoid !important; } h1, h2, h3, h4, h5 { page-break-after: avoid !important; break-after: avoid !important; } .estimate-box, .za3fran-box { page-break-inside: avoid !important; break-inside: avoid !important; margin: 1rem 0 !important; } .risk-block { page-break-inside: auto !important; break-inside: auto !important; margin: 1rem 0 !important; } .estimate-box { page-break-after: avoid !important; break-after: avoid !important; } p { orphans: 3; widows: 3; } section > div[style*="border-top"] { margin-top: 1rem !important; padding-top: 0.5rem !important; page-break-before: avoid !important; break-before: avoid !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }';

  // --- DESIGN INSTRUCTION (with explicit class taxonomy) ---
  var design = fr
    ? 'DESIGN HTML: Document HTML COMPLET et auto-contenu. Google Fonts: Cormorant Garamond (titres h1-h4) + DM Sans (corps + tableaux). Couleurs: background #FAFAF7, texte #1a1a1a, accent cuivre #C9862A, navy #0F1F3D, muted #999. '
      + 'CLASSES CSS A UTILISER STRICTEMENT: '
      + '(a) section 1 = <section class="cover-section"> avec fond #0a0a0a. '
      + '(b) section 10 = <section class="financial-section">. '
      + '(c) toutes autres sections = <section>. '
      + '(d) AVANT chaque h2 (sauf section 1), inserer <div class="section-number">Section N</div> stylise: font-size 0.75rem, color #C9862A, text-transform uppercase, letter-spacing 1.5px, margin-bottom 0.5rem. '
      + '(e) encadres ESTIMATION DIRECTIONNELLE = <div class="estimate-box"> avec fond #fff8f0, bordure gauche 3px solid #C9862A, padding 1rem, contenant <h4> + <p> description. '
      + '(f) blocs risques section 12 = <div class="risk-block"> avec fond blanc, bordure gauche 4px solid #C9862A, padding 1rem 1.5rem. '
      + '(g) encadre Za3fran section 13 = <div class="za3fran-box"> avec fond #0F1F3D, texte blanc, padding 1.5rem 2rem. '
      + 'Tableaux: bordure exterieure 1px #e8e8e4, en-tetes <thead> fond #0F1F3D texte blanc, rangees alternees fond #f9f9f7, padding cellules 0.7rem 1rem. '
      + 'Body max-width 860px, margin 0 auto, padding 0 2rem. '
      + 'Pas de wrapper .section-content (contenu direct dans section). '
      + printCSS
      + ' Rendu impeccable, professionnel, design investisseur premium.'
    : 'HTML DESIGN: Complete self-contained HTML document. Google Fonts: Cormorant Garamond (h1-h4) + DM Sans (body + tables). Colors: background #FAFAF7, text #1a1a1a, copper accent #C9862A, navy #0F1F3D, muted #999. '
      + 'STRICT CSS CLASS TAXONOMY: '
      + '(a) section 1 = <section class="cover-section"> with #0a0a0a background. '
      + '(b) section 10 = <section class="financial-section">. '
      + '(c) all other sections = <section>. '
      + '(d) BEFORE each h2 (except section 1), insert <div class="section-number">Section N</div> styled: font-size 0.75rem, color #C9862A, text-transform uppercase, letter-spacing 1.5px, margin-bottom 0.5rem. '
      + '(e) DIRECTIONAL ESTIMATE boxes = <div class="estimate-box"> with #fff8f0 background, 3px solid #C9862A left border, padding 1rem, containing <h4> + <p>. '
      + '(f) risk blocks section 12 = <div class="risk-block"> with white background, 4px solid #C9862A left border, padding 1rem 1.5rem. '
      + '(g) Za3fran box section 13 = <div class="za3fran-box"> with #0F1F3D background, white text, padding 1.5rem 2rem. '
      + 'Tables: 1px #e8e8e4 outer border, <thead> with #0F1F3D background white text, alternating rows #f9f9f7, cell padding 0.7rem 1rem. '
      + 'Body max-width 860px, margin 0 auto, padding 0 2rem. '
      + 'No .section-content wrapper (content direct in section). '
      + printCSS
      + ' Impeccable, professional, premium investor-grade design.';

  var closing = fr
    ? 'Retourne UNIQUEMENT le HTML complet. Commence par <!DOCTYPE html>. Termine par </html>. AUCUNE TRONCATURE. AUCUN MARKDOWN AUTOUR. Toutes les 14 sections doivent etre presentes, completes, et respecter strictement leurs budgets de pages.'
    : 'Return ONLY the complete HTML. Start with <!DOCTYPE html>. End with </html>. NO TRUNCATION. NO MARKDOWN AROUND. All 14 sections must be present, complete, and strictly respect their page budgets.';

  var intro = fr
    ? 'Tu es un expert F&B Maghreb/MENA, redacteur business plan investisseur senior. Genere un BUSINESS PLAN ESSENTIALS COMPLET en HTML pour le concept ci-dessous. PRIORITES ABSOLUES: (1) toutes les 14 sections completes; (2) chaque section respecte son budget de pages exact (voir liste); (3) tableaux avec nombre de lignes precis specifie; (4) classes CSS exactes (section-number, cover-section, financial-section, estimate-box, risk-block, za3fran-box); (5) densite ~85% par page, eviter blancs.'
    : 'You are a senior F&B Maghreb/MENA expert and investor-grade business plan writer. Generate a COMPLETE BUSINESS PLAN ESSENTIALS in HTML for the concept below. ABSOLUTE PRIORITIES: (1) all 14 sections complete; (2) each section respects exact page budget (see list); (3) tables with precise row counts specified; (4) exact CSS classes (section-number, cover-section, financial-section, estimate-box, risk-block, za3fran-box); (5) ~85% density per page, avoid blanks.';

  return intro
    + budgets
    + '\n\n=== DATA CONCEPT ===\n' + data
    + '\n\n=== 14 SECTIONS (RESPECTER STRUCTURE EXACTE) ===\n' + sections
    + '\n\n' + design
    + '\n\n' + closing;
}
