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

  const { data: bpRun, error: runError } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, output_html, output_json, currency, language, model_used, access_code')
    .eq('id', bpRunId)
    .single();

  if (runError || !bpRun) return res.status(404).json({ error: 'BP run not found' });
  if (bpRun.output_html) return res.status(200).json({ ready: true });

  const meta = bpRun.output_json || {};
  await supabase.from('business_plan_essentials_runs')
    .update({ output_json: { ...meta, status: 'generating' } })
    .eq('id', bpRunId);

  const validatorReportId = meta.validator_report_id;
  const submissionId      = meta.submission_id;

  if (!validatorReportId) {
    return res.status(422).json({ error: 'Missing validator_report_id in output_json' });
  }

  const { data: validatorReport } = await supabase
    .from('validator_reports').select('report_json').eq('id', validatorReportId).single();

  if (!validatorReport?.report_json) {
    return res.status(422).json({ error: 'Validator report_json not found' });
  }

  const { data: submission } = await supabase
    .from('validator_submissions').select('*').eq('id', submissionId).single();

  const currency = bpRun.currency || 'EUR';
  const language = bpRun.language || 'en';
  const model    = bpRun.model_used || getModel('essentials');

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

  const { error: saveError } = await supabase
    .from('business_plan_essentials_runs')
    .update({ output_html: bpHtml, output_json: { ...meta, status: 'complete' } })
    .eq('id', bpRunId);

  if (saveError) {
    console.error('[generate-bp] Save failed:', saveError.message);
    return res.status(500).json({ error: 'Save failed: ' + saveError.message });
  }

  console.log(`[generate-bp] Done. Run ${bpRunId} complete.`);
  return res.status(200).json({ ready: true });
}

// ── PROMPT ────────────────────────────────────────────────────
function buildBPPrompt(reportJson, submission, currency, language) {
  const snap     = reportJson?.concept_snapshot || {};
  const overall  = reportJson?.overall           || {};
  const sections = reportJson?.sections          || {};
  const sym      = { EUR: '€', MAD: 'MAD', USD: '$' }[currency] || '€';
  const isFr     = language === 'fr';
  const fin      = sections.s4_financial || {};
  const be       = fin.breakeven          || {};
  const sc       = fin.scenarios          || {};
  const fmt      = (n) => n ? Number(n).toLocaleString(isFr ? 'fr-FR' : 'en-US') : 'N/A';

  return `${isFr
    ? 'Tu es un expert senior en stratégie F&B et en rédaction de business plans professionnels pour investisseurs, banquiers et porteurs de projets dans la région MENA. Tu as 20 ans d\'expérience en conseil opérationnel F&B au Maroc, aux Émirats, en France et au Royaume-Uni.'
    : 'You are a senior F&B strategy expert and professional business plan writer for investors, banks and project owners in the MENA region. You have 20 years of F&B consulting experience across Morocco, UAE, France and the UK.'}

${isFr
  ? 'Génère un BUSINESS PLAN ESSENTIALS complet, professionnel et substantiel pour le concept ci-dessous. Ce document doit être digne d\'être présenté à un banquier ou un investisseur. Chaque section doit apporter une valeur analytique réelle. Les projections financières sont des ESTIMATIONS DIRECTIONNELLES basées sur des benchmarks sectoriels, clairement étiquetées, mais détaillées et crédibles.'
  : 'Generate a complete, professional, and substantive BUSINESS PLAN ESSENTIALS for the concept below. This document must be worthy of presentation to a banker or investor. Every section must deliver real analytical value. Financial projections are DIRECTIONAL ESTIMATES based on industry benchmarks, clearly labeled, but detailed and credible.'}

═══════════════════════════════════════════════════════════
DONNÉES VALIDATOR
═══════════════════════════════════════════════════════════
CONCEPT: ${snap.concept_name || 'N/A'} · TYPE: ${snap.type || 'N/A'} · CUISINE: ${snap.cuisine || 'N/A'}
VILLE: ${snap.city || 'N/A'}${snap.neighbourhood ? ` / ${snap.neighbourhood}` : ''}
TICKET: ${snap.ticket || 'N/A'} ${currency} · COUVERTS/JOUR: ${snap.covers || 'N/A'} · PLACES: ${snap.seats || 'N/A'}
BUDGET: ${snap.budget || 'N/A'} ${currency} · STADE: ${snap.stage || 'N/A'} · HORAIRES: ${snap.opening_hours || 'N/A'}
AUDIENCE: ${Array.isArray(snap.audience) ? snap.audience.join(', ') : snap.audience || 'N/A'}
DESCRIPTION: ${snap.description || 'N/A'}
DIFFÉRENCIATION: ${snap.differentiation || 'N/A'}
VIDE DE MARCHÉ: ${snap.market_gap || 'N/A'}
CONCURRENTS: ${snap.competitors || 'N/A'}
COMPLÉMENTAIRE: ${snap.additional || 'N/A'}

SCORE: ${overall.score || 'N/A'}/100 — ${overall.verdict || 'N/A'}
RÉSUMÉ VALIDATOR: ${overall.executive_summary || 'N/A'}

FINANCIER VALIDATOR:
- Point mort: ${sym}${fmt(be.monthly_revenue)}/mois · ${be.daily_covers || 'N/A'} couverts/jour
- Conservateur: ${sc.conservative ? `${sc.conservative.covers_day}c/j → ${sym}${fmt(sc.conservative.monthly_result)}/mois` : 'N/A'}
- Base: ${sc.base ? `${sc.base.covers_day}c/j → ${sym}${fmt(sc.base.monthly_result)}/mois` : 'N/A'}
- Optimiste: ${sc.optimistic ? `${sc.optimistic.covers_day}c/j → ${sym}${fmt(sc.optimistic.monthly_result)}/mois` : 'N/A'}
- Alertes: ${(fin.alerts || []).map(a => a.title).filter(Boolean).join(' | ') || 'N/A'}

MARCHÉ: ${sections.s2_market?.narrative?.substring(0, 500) || 'N/A'}
CONCURRENCE: ${sections.s3_competitive?.narrative?.substring(0, 400) || 'N/A'}
RECOMMANDATIONS: ${(sections.s5_strategy?.recommendations || []).map(r => r.title).filter(Boolean).join(' | ')}
RISQUES: ${(sections.s6_risks?.risks || []).map(r => `${r.title} [${r.probability}]`).filter(Boolean).join(' | ')}

DEVISE: ${currency} (${sym}) · LANGUE: ${language}
DATE: ${new Date().toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
═══════════════════════════════════════════════════════════

${isFr ? 'STRUCTURE — 14 SECTIONS DANS CET ORDRE EXACT:' : 'STRUCTURE — 14 SECTIONS IN THIS EXACT ORDER:'}

━━━ SECTION 1 — ${isFr ? 'PAGE DE COUVERTURE' : 'COVER PAGE'} ━━━
${isFr ? 'Fond #0a0a0a. Nom du concept grand Cormorant. Sous-titre cuivré (format/cuisine/ville). Badge score Validator (cercle cuivré, score/100, verdict). "Préparé par Za3fran Digital" + date. Design élégant investor-ready.' : 'Background #0a0a0a. Large Cormorant concept name. Copper subtitle (format/cuisine/city). Validator score badge (copper circle, score/100, verdict). "Prepared by Za3fran Digital" + date. Elegant investor-ready design.'}

━━━ SECTION 2 — ${isFr ? 'BRIEF INVESTISSEUR (2 pages standalone)' : 'INVESTOR BRIEF (2-page standalone)'} ━━━
${isFr
  ? `Section conçue pour être envoyée seule à un banquier ou investisseur. 2 pages max. Inclure:
(a) FICHE CONCEPT — tableau: Concept | Format | Cuisine | Localisation | Places | Ticket moyen | Horaires | Stade du projet
(b) OPPORTUNITÉ DE MARCHÉ — 3 phrases précises: vide identifié, taille opportunité, timing
(c) PROPOSITION DE VALEUR — 4–5 bullet points: ce qui rend ce concept unique et défendable
(d) RÉSUMÉ FINANCIER — tableau compact: Investissement total (fourchette) | Point mort mensuel | CA A1/A2/A3 | EBITDA A1/A2/A3 | Délai de retour estimé
(e) BESOIN DE FINANCEMENT — montant, répartition fonds propres/dette, usage des fonds (4 lignes)
(f) PROFIL DE RISQUE — 3 risques, niveau (Élevé/Moyen/Faible), mitigation en une ligne chacun
(g) SCORE DE VALIDATION — badge Za3fran (score/100, verdict, date)
Style: sobre, factuel, tableaux. Un investisseur comprend le projet en 90 secondes.`
  : `Section designed to be sent standalone to a banker or investor. 2 pages max. Include:
(a) CONCEPT SHEET — table: Concept | Format | Cuisine | Location | Seats | Avg ticket | Hours | Project stage
(b) MARKET OPPORTUNITY — 3 precise sentences: gap identified, opportunity size, timing
(c) VALUE PROPOSITION — 4–5 bullet points: what makes this concept unique and defensible
(d) FINANCIAL SUMMARY — compact table: Total investment (range) | Monthly break-even | Revenue Y1/Y2/Y3 | EBITDA Y1/Y2/Y3 | Estimated payback
(e) FUNDING REQUIREMENT — amount, equity/debt split, use of funds (4 lines)
(f) RISK PROFILE — 3 risks, level (High/Medium/Low), one-line mitigation each
(g) VALIDATION SCORE — Za3fran badge (score/100, verdict, date)
Style: sober, factual, table-centric. An investor understands the project in 90 seconds.`}

━━━ SECTION 3 — ${isFr ? 'TABLE DES MATIÈRES' : 'TABLE OF CONTENTS'} ━━━

━━━ SECTION 4 — ${isFr ? 'RÉSUMÉ EXÉCUTIF (500–600 mots)' : 'EXECUTIVE SUMMARY (500–600 words)'} ━━━
${isFr ? 'Mémo de direction complet: contexte marché, concept, modèle économique, besoins financement, potentiel financier, risques, prochaines étapes. Ton professionnel et factuel — évaluation honnête, pas publicité.' : 'Complete management memo: market context, concept, business model, funding needs, financial potential, risks, next steps. Professional factual tone — honest assessment, not advertising.'}

━━━ SECTION 5 — ${isFr ? 'CONCEPT & POSITIONNEMENT' : 'CONCEPT & POSITIONING'} ━━━
${isFr
  ? `- Vision et raison d'être (pourquoi maintenant, pourquoi ici)
- Identité de marque: nom, territoire visuel, tonalité, positionnement aspirationnel
- Proposition de valeur détaillée: ce que le client reçoit que nulle part ailleurs
- Format opérationnel: modèle de service, flux client, expérience de bout en bout
- Occasions de consommation principale et secondaire
- Cohérence positionnement prix/qualité/expérience`
  : `- Vision and rationale (why now, why here)
- Brand identity: name, visual territory, tone, aspirational positioning
- Detailed value proposition: what the customer receives that exists nowhere else
- Operational format: service model, customer flow, end-to-end experience
- Primary and secondary consumption occasions
- Price/quality/experience positioning coherence`}

━━━ SECTION 6 — ${isFr ? 'ANALYSE DE MARCHÉ & AUDIENCE CIBLE' : 'MARKET ANALYSIS & TARGET AUDIENCE'} ━━━
${isFr
  ? `- Taille et dynamiques du marché F&B local (city-specific), tendances 2024–2026
- Le vide de marché: pourquoi il existe, pourquoi non adressé
- 2–3 personas détaillés: âge, profession, revenus, habitudes déjeuner, sensibilité prix, canaux découverte
- Signaux de demande concrets (données livraison, observatoires, comparables MENA)
- Facteurs macro: pouvoir d'achat, inflation alimentaire, évolution habitudes`
  : `- Local F&B market size and dynamics (city-specific), 2024–2026 trends
- The market gap: why it exists, why it hasn't been addressed
- 2–3 detailed personas: age, profession, income, lunch habits, price sensitivity, discovery channels
- Concrete demand signals (delivery data, market observatories, MENA comparables)
- Macro factors: purchasing power, food inflation, habit evolution`}

━━━ SECTION 7 — ${isFr ? 'PAYSAGE CONCURRENTIEL' : 'COMPETITIVE LANDSCAPE'} ━━━
${isFr
  ? `- Tableau concurrentiel complet (6–8 acteurs): Nom | Type | Ticket moyen | Même client? | Force principale | Faiblesse | Menace
- Concurrence directe ET indirecte (y compris restauration informelle)
- Analyse différenciation: sur quels axes ce concept gagne réellement
- Défendabilité avantage concurrentiel (score 1–5, justification)
- Risque entrants capitalisés: qui, délai probable, impact
- Stratégie de fossé concurrentiel: fidélisation, vitesse déploiement multi-sites`
  : `- Full competitive table (6–8 players): Name | Type | Avg ticket | Same customer? | Key strength | Weakness | Threat
- Direct AND indirect competition (including informal dining)
- Differentiation analysis: on which axes this concept genuinely wins
- Competitive advantage defensibility (score 1–5, justification)
- Capitalised entrant risk: who, likely timeline, impact
- Competitive moat strategy: loyalty, multi-site rollout speed`}

━━━ SECTION 8 — ⚡ ${isFr ? 'STRATÉGIE MENU (ESTIMATION DIRECTIONNELLE — benchmarks sectoriels)' : 'MENU STRATEGY (DIRECTIONAL ESTIMATE — industry benchmarks)'} ━━━
${isFr
  ? `Encadré: "⚡ ESTIMATION DIRECTIONNELLE — À valider et détailler avec Menu Engineer Za3fran."
- Architecture menu: sections, nombre d'items par section
- Tableau structure: Section | Nb items | Fourchette prix (${sym}) | Food cost cible (%)
- Logique pricing: ticket cible, composition typique (plat+boisson), marge brute visée
- Direction qualité et sourcing: local vs import, saisonnalité, 2–3 pistes approvisionnement régional nommées
- 3–5 items signature directionnels (nom + concept, pas de recette)
- Contraintes opérationnelles clés: préparation amont, temps service, complexité cuisine`
  : `Box: "⚡ DIRECTIONAL ESTIMATE — To be validated with Za3fran Menu Engineer."
- Menu architecture: sections, items per section
- Structure table: Section | Items | Price range (${sym}) | Target food cost (%)
- Pricing logic: target ticket, typical composition (dish+drink), target gross margin
- Quality and sourcing direction: local vs import, seasonality, 2–3 named regional sourcing leads
- 3–5 directional signature items (name + concept, no recipe)
- Key operational constraints: prep-ahead, service time, kitchen complexity`}

━━━ SECTION 9 — ⚡ ${isFr ? 'MODÈLE OPÉRATIONNEL & STAFFING (DIRECTIONNEL)' : 'OPERATIONAL MODEL & STAFFING (DIRECTIONAL)'} ━━━
${isFr
  ? `Encadré: "⚡ ESTIMATION DIRECTIONNELLE — À valider avec Plan de Staffing Za3fran."
- Modèle de service: flux client détaillé, temps de rotation cible
- Tableau staffing: Poste | Nb ETP | Salaire mensuel benchmark (${sym}) | Masse salariale totale
- Ratios de productivité: couverts/serveur/service, tickets cuisine/heure
- Organisation cuisine: brigade recommandée (postes, rôles)
- Gestion des pics: stratégie déjeuner vs dîner, saisonnalité hebdomadaire
- KPIs opérationnels à piloter dès J+30`
  : `Box: "⚡ DIRECTIONAL ESTIMATE — To be validated with Za3fran Staffing Plan."
- Service model: detailed customer flow, target rotation time
- Staffing table: Position | FTE | Benchmark monthly salary (${sym}) | Total payroll
- Productivity ratios: covers/server/service, kitchen tickets/hour
- Kitchen organisation: recommended brigade (positions, roles)
- Peak management: lunch vs dinner strategy, weekly seasonality
- Operational KPIs to monitor from D+30`}

━━━ SECTION 10 — ⚡ ${isFr ? `PROJECTIONS FINANCIÈRES — TOUTES VALEURS EN ${currency} (${sym})` : `FINANCIAL PROJECTIONS — ALL VALUES IN ${currency} (${sym})`} ━━━
${isFr
  ? `Encadré: "⚡ ESTIMATIONS DIRECTIONNELLES — Benchmarks sectoriels F&B MENA. À remplacer par projections modélisées avec Financial Builder Za3fran."
CETTE SECTION EST LA PLUS IMPORTANTE DU DOCUMENT. 6 sous-sections obligatoires:

10A — BUDGET D'INVESTISSEMENT DE DÉMARRAGE
Tableau ligne par ligne: Poste | Estimation basse (${sym}) | Estimation haute (${sym}) | Notes
Postes obligatoires: Travaux & aménagement · Équipement cuisine professionnel · Mobilier & décoration · Informatique & caisse · Licences & autorisations · Honoraires fiduciaire & conseil · Fonds de roulement initial · Marketing pré-ouverture · Réserve de trésorerie (min. 3 mois charges fixes) · Contingence (8%) · TOTAL (fourchette basse / haute)
Comparer au budget déclaré + analyse de l'écart

10B — PRÉVISIONS CA ANNÉES 1–3
Tableau mensuel A1 (12 mois): Mois | Couverts/jour | Jours exploitation | CA (${sym}) | Commentaire
(Montée en charge: M1–2 = conservateur, M3–6 = montée vers base, M7–12 = base atteint)
Tableau récap A1/A2/A3: Couverts/jour moyen | Jours exploitation | CA annuel (${sym}) | Croissance

10C — COMPTE DE RÉSULTAT PRÉVISIONNEL 3 ANS
Tableau P&L: Ligne | A1 (${sym}) | A1 (%) | A2 (${sym}) | A2 (%) | A3 (${sym}) | A3 (%)
Lignes: CA · Coût matière (benchmark 30–34%) · Marge brute · Masse salariale chargée (28–32%) · Loyer & charges (8–12%) · Énergie & fluides (3–5%) · Emballages & consommables (2–4%) · Marketing (3–5%) · Amortissements · Autres charges · EBITDA · Résultat net

10D — ANALYSE DU POINT MORT
- Reprendre données Validator: ${sym}${fmt(be.monthly_revenue)}/mois · ${be.daily_covers || 'N/A'} couverts/jour
- Taux d'occupation au point mort vs capacité totale
- Délai estimé pour atteindre le point mort (mois depuis ouverture)
- TABLEAU DE SENSIBILITÉ (matrice 3×3): tickets (-10% / base / +15%) × couverts/jour (-20% / base / +30%) → résultat mensuel (${sym})

10E — RETOUR SUR INVESTISSEMENT
- Investissement retenu (milieu de fourchette 10A)
- Flux trésorerie cumulés A1/A2/A3
- Point de ROI (mois)
- Comparaison avec alternatives d'investissement locales (immobilier locatif, obligations)

10F — STRUCTURE DE FINANCEMENT RECOMMANDÉE
- Montant total à financer
- Recommandation: % fonds propres / % dette bancaire
- Coût de la dette estimé (taux marché PME local)
- Impact sur cashflow mensuel (remboursement estimé)
- Institutions de financement à contacter en priorité (nommer 2–3 institutions locales pertinentes)`
  : `Box: "⚡ DIRECTIONAL ESTIMATES — MENA F&B industry benchmarks. To be replaced by modelled projections with Za3fran Financial Builder."
THIS IS THE MOST IMPORTANT SECTION. 6 mandatory sub-sections:

10A — STARTUP INVESTMENT BUDGET
Line-by-line table: Item | Low estimate (${sym}) | High estimate (${sym}) | Notes
Required items: Works & fit-out · Professional kitchen equipment · Furniture & décor · IT & POS · Licenses & permits · Legal & advisory fees · Initial working capital · Pre-opening marketing · Cash reserve (min. 3 months fixed costs) · Contingency (8%) · TOTAL (low/high range)
Compare to stated budget + gap analysis

10B — REVENUE PROJECTIONS YEARS 1–3
Monthly Y1 table (12 months): Month | Covers/day | Trading days | Revenue (${sym}) | Comment
(Ramp-up: M1–2 = conservative, M3–6 = ramp to base, M7–12 = base achieved)
Summary table Y1/Y2/Y3: Avg covers/day | Trading days | Annual revenue (${sym}) | Growth

10C — PROJECTED P&L 3 YEARS
P&L table: Line | Y1 (${sym}) | Y1 (%) | Y2 (${sym}) | Y2 (%) | Y3 (${sym}) | Y3 (%)
Lines: Revenue · Food cost (benchmark 30–34%) · Gross margin · Total payroll incl. charges (28–32%) · Rent & occupancy (8–12%) · Energy & utilities (3–5%) · Packaging (2–4%) · Marketing (3–5%) · Depreciation · Other · EBITDA · Net result

10D — BREAK-EVEN ANALYSIS
- Validator data: ${sym}${fmt(be.monthly_revenue)}/month · ${be.daily_covers || 'N/A'} covers/day
- Occupancy rate at break-even vs total capacity
- Estimated months to break-even from opening
- SENSITIVITY TABLE (3×3 matrix): tickets (-10% / base / +15%) × covers/day (-20% / base / +30%) → monthly result (${sym})

10E — RETURN ON INVESTMENT
- Investment retained (midpoint of 10A range)
- Cumulative cash flows Y1/Y2/Y3
- ROI breakeven point (months)
- Comparison with local investment alternatives

10F — RECOMMENDED FUNDING STRUCTURE
- Total amount to finance
- Recommendation: % equity / % bank debt
- Estimated cost of debt (local SME market rate)
- Impact on monthly cashflow
- Priority financing institutions (name 2–3 relevant local institutions)`}

━━━ SECTION 11 — ⚡ ${isFr ? 'STRATÉGIE MARKETING & CALENDRIER PRÉ-OUVERTURE (DIRECTIONNEL)' : 'MARKETING STRATEGY & PRE-OPENING TIMELINE (DIRECTIONAL)'} ━━━
${isFr
  ? `Encadré: "⚡ ESTIMATION DIRECTIONNELLE — À personnaliser avec Marketing Builder Za3fran."
- Positionnement de marque et territoire de communication (ton, visuels, messages clés)
- Mix canaux avec budget indicatif: Instagram · TikTok · Plateformes livraison · Micro-influenceurs (4–6 profils, 8K–50K abonnés) · Relations presse locale
- Plan contenu pré-ouverture: J-90 / J-60 / J-30 / J-0 (actions concrètes à chaque étape)
- Événement de lancement: format, cible invités, budget indicatif
- Stratégie rétention post-ouverture: comment transformer l'essai en habitude
- KPIs marketing: taux conversion réseau→visite, CAC, taux réachat
- Tableau calendrier 6 mois: Période | Actions clés | Responsable | Budget indicatif (${sym})`
  : `Box: "⚡ DIRECTIONAL ESTIMATE — To be personalised with Za3fran Marketing Builder."
- Brand positioning and communication territory (tone, visuals, key messages)
- Channel mix with indicative budget: Instagram · TikTok · Delivery platforms · Micro-influencers (4–6 profiles, 8K–50K followers) · Local press
- Pre-opening content plan: D-90 / D-60 / D-30 / D-0 (concrete actions at each stage)
- Launch event: format, guest target, indicative budget
- Post-opening retention strategy: how to convert first visit into habit
- Marketing KPIs: social-to-visit conversion, CAC, repurchase rate
- 6-month timeline table: Period | Key actions | Owner | Indicative budget (${sym})`}

━━━ SECTION 12 — ${isFr ? 'ANALYSE DES RISQUES' : 'RISK ANALYSIS'} ━━━
${isFr
  ? `- Matrice des risques: Risque | Probabilité | Impact | Score | Mitigation principale
- Minimum 6 risques: financier, opérationnel, marché, concurrentiel, réglementaire, humain
- Pour chaque risque: paragraphe d'analyse spécifique à CE concept dans CETTE ville + plan de mitigation concret avec actions nommées
- Signaux d'alerte à surveiller (triggers de matérialisation du risque)
- Plan de contingence détaillé pour le risque #1`
  : `- Risk matrix: Risk | Probability | Impact | Score | Main mitigation
- Minimum 6 risks: financial, operational, market, competitive, regulatory, human
- For each risk: analysis paragraph specific to THIS concept in THIS city + concrete mitigation with named actions
- Warning signals to monitor
- Detailed contingency plan for risk #1`}

━━━ SECTION 13 — ${isFr ? 'RECOMMANDATIONS & PROCHAINES ÉTAPES' : 'RECOMMENDATIONS & NEXT STEPS'} ━━━
${isFr
  ? `- 5 actions prioritaires dans les 30 prochains jours (issues du Validator)
- Ce que ce plan vous dit de faire — et ce qu'il ne peut pas encore vous dire
- Encadré "Approfondissez avec Za3fran" (fond navy, texte blanc):
  • Menu Engineer — Architecture menu coûtée avec prix de vente réels, food cost et mix produit optimisé
  • Financial Builder — Modèle financier complet basé sur vos données réelles (P&L détaillé, trésorerie, sensibilités)
  • Business Plan Pro — Business plan niveau financement bancaire, données modélisées, assemblement de tous les outils Za3fran`
  : `- 5 priority actions in the next 30 days (from Validator)
- What this plan tells you to do — and what it cannot yet tell you
- "Go deeper with Za3fran" box (navy background, white text):
  • Menu Engineer — Costed menu architecture with real selling prices, food cost and optimised product mix
  • Financial Builder — Complete financial model based on your real data (detailed P&L, cash flow, sensitivities)
  • Business Plan Pro — Bank-financing-grade business plan with modelled data, assembling all Za3fran tool outputs`}

━━━ SECTION 14 — ${isFr ? 'ANNEXES' : 'APPENDICES'} ━━━
${isFr
  ? `- Récapitulatif données Validator (tableau: section, sous-score, pondération, contribution, total)
- Note méthodologique: comment ce document a été généré, définition des estimations directionnelles, limites d'usage
- Glossaire des termes financiers et opérationnels`
  : `- Validator data summary (table: section, sub-score, weight, contribution, total)
- Methodology note: how this document was generated, definition of directional estimates, usage limitations
- Glossary of financial and operational terms`}

═══════════════════════════════════════════════════════════
DESIGN HTML — INSTRUCTIONS
═══════════════════════════════════════════════════════════
Document HTML COMPLET et AUTO-CONTENU. Polices: Cormorant Garamond (titres) + DM Sans (corps) via Google Fonts.
Couleurs: Background #FAFAF7 · Texte #1a1a1a · Accent #C9862A · Muted #888880 · Navy #0F1F3D
Page couverture & Brief Investisseur: fond #0a0a0a, accents cuivrés
Encadrés ⚡: fond #fff8f0, bordure gauche 3px #C9862A
Encadré "Prochaines étapes": fond #0F1F3D, texte blanc, accent cuivré
Tableaux: bordures 1px #e8e8e4, alternance rangées (#F5F4F0/blanc), en-têtes navy (#0F1F3D) texte blanc
Section headers: numéro grand Cormorant cuivré (opacity 0.25) + titre navy
Max-width 860px centré · @media print page-break-before sections majeures
Footer chaque section: "Za3fran Digital · Business Plan Essentials · [date]"

Retourne UNIQUEMENT le code HTML complet. Commence par <!DOCTYPE html>.`;
}
