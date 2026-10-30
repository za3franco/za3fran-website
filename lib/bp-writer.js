/* lib/bp-writer.js — Business Plan Essentials: writing of the BANK PLAN (Sonnet, parallel calls).
 * Version bpw-2.0.0 (9 Oct 2026, after Arnaud's review of the first v14 plan).
 *
 * The bank plan is the founder's own document: written in the project's voice ("nous", the project
 * name), confident and factual. It never mentions doubts, missing studies, estimates, quotes to obtain,
 * Za3fran, or anything to be confirmed: those belong to the founder's working report (lib/bp-report.js),
 * and the decisions they require are taken in the intake before generation (resolver ar-1.6.0).
 * It explains, it does not read the tables back: each paragraph gives drivers and logic, with a cap on
 * the number of figures.
 *
 * The model writes TEXT ONLY. Figures reach it as {placeholders} (lib/bp-facts.js) and it must write no
 * digit itself; lib/bp-checks.js verifies every string; a failing group is sent back with its problems
 * (at most MAX_REWRITES times); a group that still fails blocks delivery.
 *
 * writePlan({ facts, callModel, deadline }) -> { ok, text, attempts, errors, usage }
 *   text = { sections: { id: [paragraph…] }, risks: { B1: { titre, mesures } } }
 */
'use strict';

const { checkText, fill, elide } = require('./bp-checks.js');

const WRITER_VERSION = 'bpw-2.3.1';  // bpw-2.3.1: more trend verbs (« tombe à »), no article before a place name (« au Gauthier »), from bp_v14_canaille_10. bpw-2.3.0 (30 Oct 2026, Phase A acceptance read of bp_v14_canaille_9): a count placeholder keeps its own noun; no article before an amount or rate; a trend verb must match the figures it links; a preposition clash, a doubled unit or the same figure twice once filled are caught. bpw-2.2.0: bpw-2.2.0 (30 Oct 2026): French elisions fixed in code; a rewrite says how to remove a number in words or digits (bp_v14_canaille_9 failed twice on « cinquante et soixante références », taken from the founder's description). bpw-2.1.0: year-3 team additions
const MAX_REWRITES = 2;
const MAX_FIGURES = 6;   // per paragraph: analysis, not a reading of the tables

/** Words that have no place in a document the founder hands to a bank (doubt, process, tooling). */
const BANK_BANNED = [
  /porteur de projet/i, /(^|[^\p{L}])à (confirmer|valider|vérifier|préciser|clarifier)(?![\p{L}])/iu, /non vérifi/i, /pas (encore )?(été )?vérifi/i, /sans vérification/i, /incertitude/i,
  /\bZa3fran\b/, /\bdevis\b/i, /test de résistance/i, /stress test/i, /\bignor/i, /reconna[iî]t ne pas/i, /ne ma[iî]trise pas/i,
  /pas encore (été )?(identifi|étudi|réalis|chiffr|obtenu)/i, /\bselon (lui|elle|le fondateur|la fondatrice)\b/i, /\bestimation(s)?\b/i,
  /according to the founder/i, /to be (confirmed|validated|checked)/i, /not (yet )?verified/i, /uncertain/i, /\bquotes?\b/i, /\bestimate[sd]?\b/i,
];

/** Facts that belong to the founder's working report, never to the bank plan. */
const NOT_FOR_BANK = /^(prix_emission_51|part_fondateur|reserve_complementaire|licence_hors_investissement|investissement_estime|besoin_haut|besoin_bas|depassement_plafond|plafond_garantie|cite_\d+|choc_.*|sens_.*|.*_stress)$/;

/* ------------------------------ sections ------------------------------ */

const SECTIONS = {
  synthese: {
    title: ['Synthèse', 'Summary'],
    brief: [
      'Quatre paragraphes : (1) le projet, son emplacement et son ouverture, en une présentation claire et engageante ; (2) le besoin de financement et sa couverture (apports, emprunt et ses conditions), en expliquant ce que finance chaque grand poste, dont la réserve de trésorerie ; (3) la rentabilité et la capacité de remboursement, appréciée à partir de l’année 2 ; (4) ce qui rend le projet solide : la réserve, la capacité de remboursement dans le scénario prudent, l’expérience du fondateur et le potentiel au-delà du scénario de base.',
      'Four paragraphs: (1) the project, its location and opening, presented clearly and engagingly; (2) the funding need and how it is covered (equity, loan and its terms), explaining what each main item funds, including the cash reserve; (3) profitability and debt-service capacity, judged from year 2; (4) what makes the project robust: the reserve, debt service in the conservative case, the founder’s experience and the upside beyond the base case.',
    ],
  },
  projet: {
    title: ['Le projet et son fondateur', 'The project and its founder'],
    brief: [
      'Deux à trois paragraphes : le concept et l’offre (cuisine, vins, ambiance) à partir des mots du fondateur ; ce qui le distingue et pourquoi cela répond à une attente ; le fondateur et son expérience, présentés comme un atout du projet. Ne décris pas de plats ou de produits que le fondateur n’a pas cités.',
      'Two to three paragraphs: the concept and offer (food, wine, atmosphere) from the founder’s words; what sets it apart and why it meets a demand; the founder and their experience, presented as a strength. Do not describe dishes or products the founder did not mention.',
    ],
  },
  marche: {
    title: ['Marché, clientèle et concurrence', 'Market, customers and competition'],
    brief: [
      'Deux paragraphes : la clientèle visée et ce qu’elle recherche, à partir des mots du fondateur ; le positionnement de prix au déjeuner et au dîner et sa logique. S’il y a des établissements comparables dans les FAITS, situe le projet par rapport à eux (prix, offre) sans les dénigrer. N’écris jamais qu’une information manque.',
      'Two paragraphs: target customers and what they look for, from the founder’s words; lunch and dinner price positioning and its logic. If comparable venues are in the FACTS, position the project against them (price, offer) without disparaging them. Never write that information is missing.',
    ],
  },
  exploitation: {
    title: ['Offre, exploitation et équipe', 'Offer, operations and team'],
    brief: [
      'Deux paragraphes, avant les tableaux : l’organisation des services et la capacité, en expliquant la logique des rotations (une rotation par service retenue, potentiel d’une seconde rotation aux dîners soutenus) et ce que fait l’établissement pendant le Ramadan ; l’équipe, son organisation et son coût rapporté au chiffre d’affaires.',
      'Two paragraphs, before the tables: how services run and the capacity, explaining the turns (one turn per service used, upside from a second turn on busy dinners) and what the venue does during Ramadan; the team, its organisation and its cost relative to revenue.',
    ],
  },
  financement: {
    title: ['Investissement et financement', 'Investment and funding'],
    brief: [
      'Deux à trois paragraphes, avant les tableaux : ce que couvre l’investissement (aménagement, équipements, licence, pré-ouverture) ; la réserve de trésorerie, son montant en mois de charges fixes et son rôle ; la structure du financement (apports, emprunt, conditions, différé) et la répartition du capital telle qu’elle est arrêtée.',
      'Two to three paragraphs, before the tables: what the investment covers (fit-out, equipment, licence, pre-opening); the cash reserve, its size in months of fixed costs and its role; the funding structure (equity, loan, terms, interest-only period) and the capital split as agreed.',
    ],
  },
  previsions: {
    title: ['Prévisions d’activité et de résultat', 'Activity and profit forecast'],
    brief: [
      'Deux à trois paragraphes d’ANALYSE, avant le compte de résultat (qui donne déjà les chiffres) : comment se construit le chiffre d’affaires (services, occupation, montée en charge, fidélisation en année 3) et pourquoi ; la structure de coûts et ce qu’elle dit du modèle (coût matière, poids de la masse salariale, loyer) ; ce qui fait progresser la marge. Explique les causes, ne relis pas le tableau.',
      'Two to three paragraphs of ANALYSIS, before the income statement (which already gives the figures): how revenue is built (services, occupancy, ramp-up, loyalty in year 3) and why; the cost structure and what it says about the model (cost of sales, payroll weight, rent); what drives the margin. Explain causes; do not read the table back.',
    ],
  },
  tresorerie: {
    title: ['Trésorerie et remboursement', 'Cash and debt service'],
    brief: [
      'Deux paragraphes, avant le plan de trésorerie : la dynamique de trésorerie et son point bas, avec sa cause ; la capacité de remboursement année par année et l’effet du différé s’il existe.',
      'Two paragraphs, before the cash plan: how cash evolves and its low point, with its cause; debt-service capacity year by year and the effect of the interest-only period if there is one.',
    ],
  },
  scenarios: {
    title: ['Scénarios sur trois ans', 'Three-year scenarios'],
    brief: [
      'Deux à trois paragraphes, avant le tableau et le graphique : ce que montre le scénario prudent (la dette reste servie, la trésorerie reste positive si c’est le cas dans les FAITS) ; le potentiel du scénario favorable, raisonnable et sans remplir la salle ; le point mort et la marge de sécurité par rapport à la prévision de base.',
      'Two to three paragraphs, before the table and chart: what the conservative case shows (debt still serviced, cash still positive if the FACTS say so); the upside of the optimistic case, reasonable and without a full room; break-even and the safety margin against the base forecast.',
    ],
  },
};

const GROUPS = [
  { id: 'g1', sections: ['synthese'] },
  { id: 'g2', sections: ['projet', 'marche'] },
  { id: 'g3', sections: ['exploitation', 'financement'] },
  { id: 'g4', sections: ['previsions', 'tresorerie', 'scenarios'] },
  { id: 'g5', sections: [], risks: true },
];

/* ------------------------------ mandatory points ------------------------------ */

/** What each bank-plan section must say, decided in code from the facts. { id: [{ text: [fr, en], cite }] } */
function mandatoryPoints(facts) {
  const F = facts.F;
  const has = (k) => !!F[k];
  const P = { synthese: [], projet: [], marche: [], exploitation: [], financement: [], previsions: [], tresorerie: [], scenarios: [] };
  const add = (sec, fr, en, cite = []) => P[sec].push({ text: [fr, en], cite: cite.filter(has) });
  const consDscr = Object.keys(F).filter((k) => /^dscr_a\d_prudent$/.test(k)).map((k) => F[k].raw).filter((x) => x != null);
  const consCovered = consDscr.length && consDscr.every((x) => x >= 1) && F.tresorerie_min_prudent && F.tresorerie_min_prudent.raw >= 0;

  add('synthese', 'Le besoin total, les apports et l’emprunt demandé.', 'Total need, equity and the loan requested.', ['besoin_total', 'apports', 'emprunt']);
  add('synthese', 'Le chiffre d’affaires, l’EBE et le DSCR de l’année 2.', 'Year-2 revenue, EBITDA and DSCR.', ['ca_a2', 'ebe_a2', 'dscr_a2']);
  if (has('reserve')) add('synthese', 'La réserve de trésorerie incluse dans le financement et ce qu’elle représente.', 'The cash reserve included in the funding and what it represents.', ['reserve', 'reserve_mois']);
  if (consCovered) add('synthese', 'Même dans le scénario prudent, la dette est servie chaque année.', 'Even in the conservative case, the debt is serviced every year.', ['dscr_min_prudent']);

  if (has('differe')) add('tresorerie', 'Le différé : seuls les intérêts sont payés ; le DSCR de l’année 1 est élevé par construction ; la capacité de remboursement se lit à partir de l’année 2.',
    'The interest-only period: only interest is paid; year-1 DSCR is high by construction; repayment capacity is read from year 2.', ['differe', 'dscr_a2']);
  add('tresorerie', 'Le point bas de trésorerie du scénario de base, son mois et sa place dans le calendrier d’exploitation.', 'The base-case cash low, its month and where it falls in trading time.', ['tresorerie_min', 'tresorerie_min_mois', 'rang_tresorerie_min']);
  if (facts.context.low_base_ramadan) add('tresorerie', 'Ce point bas tient au Ramadan : l\u2019établissement y est fermé ou au ralenti alors que loyer, salaires et charges fixes continuent ; la réserve est dimensionnée pour cela.',
    'That low is due to Ramadan: the venue is closed or slower while rent, salaries and fixed costs continue; the reserve is sized for it.', ['ramadan_a1', 'reserve']);
  if (facts.context.low_cons_ramadan) add('scenarios', 'Dans le scénario prudent, le point bas de trésorerie survient pendant le Ramadan ; la réserve le couvre et la trésorerie reste positive.',
    'In the conservative case the cash low falls during Ramadan; the reserve covers it and cash stays positive.', ['tresorerie_min_prudent', 'rang_tresorerie_min_prudent', 'ramadan_a1']);

  if (consCovered) add('scenarios', 'Dans le scénario prudent, le DSCR reste supérieur à un chaque année et la trésorerie reste positive.', 'In the conservative case, DSCR stays above one every year and cash stays positive.', ['dscr_min_prudent', 'tresorerie_min_prudent']);
  add('scenarios', 'Le chiffre d’affaires de l’année 3 dans les trois scénarios.', 'Year-3 revenue in the three cases.', ['ca_a3_prudent', 'ca_a3', 'ca_a3_favorable']);
  add('scenarios', 'Le point mort en couverts par jour d’ouverture comparé à la prévision de base.', 'Break-even in covers per open day against the base forecast.', ['point_mort_couverts', 'couverts_jour_a2']);

  if (has('reserve')) add('financement', 'La réserve de trésorerie, en montant et en mois de charges fixes, et pourquoi elle est là.', 'The cash reserve, in amount and in months of fixed costs, and why it is there.', ['reserve', 'reserve_mois', 'charges_fixes_mois']);
  if (has('licence')) add('financement', 'La licence de débit de boissons incluse dans l’investissement.', 'The alcohol licence included in the investment.', ['licence']);
  add('financement', 'L’emprunt, ses conditions et sa mensualité.', 'The loan, its terms and instalment.', ['emprunt', 'taux', 'duree_emprunt', 'mensualite']);
  add('financement', 'La répartition du capital entre les associés telle qu’elle est arrêtée.', 'The agreed capital split between shareholders.', ['part_capital_1', 'part_capital_2']);

  add('previsions', 'La montée en charge et la fréquentation des années 1 et 2.', 'The ramp-up and covers in years 1 and 2.', ['montee_en_charge', 'couverts_jour_a1', 'couverts_jour_a2']);
  if (has('occupation_a3_dinner') || has('occupation_a3_lunch')) add('previsions', 'La progression de la fréquentation en année 3, portée par la fidélisation.', 'Covers keep rising in year 3, driven by loyalty.', ['occupation_a3_dinner', 'ca_a3']);
  add('exploitation', 'L’effectif et le poids de la masse salariale dans le chiffre d’affaires de l’année 2.', 'Headcount and payroll as a share of year-2 revenue.', ['effectif', 'masse_salariale_pct_a2']);
  if (has('renforts_a3')) add('exploitation', 'Les renforts d’équipe prévus à partir de l’année 3 pour suivre la fréquentation.', 'The team additions planned from year 3 to follow covers.', ['renforts_a3']);
  add('exploitation', 'Les rotations retenues et le potentiel d’une seconde rotation aux dîners soutenus.', 'Turns used and the upside of a second turn on busy dinners.', ['rotation_dinner', 'rotation_haute_dinner']);
  if (has('ramadan')) add('exploitation', 'Ce que fait l’établissement pendant le Ramadan.', 'What the venue does during Ramadan.', ['ramadan']);
  add('marche', 'Les tickets moyens du déjeuner et du dîner.', 'Average lunch and dinner tickets.', ['ticket_lunch', 'ticket_dinner']);
  if (has('concurrent_1')) add('marche', 'Le positionnement face aux établissements comparables relevés.', 'Positioning against the comparable venues surveyed.', ['concurrent_1']);
  return P;
}

/* ------------------------------ prompts ------------------------------ */

const bankFacts = (facts) => Object.entries(facts.F).filter(([k]) => !NOT_FOR_BANK.test(k));
function factsBlock(facts) { return bankFacts(facts).map(([k, f]) => `{${k}} = ${f.v} — ${f.label}`).join('\n'); }

function founderBlock(facts, lang) {
  const c = facts.context, fr = lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const rows = [
    [L('Nom du projet', 'Project name'), c.concept_name], [L('Ville', 'City'), c.city], [L('Quartier', 'District'), c.district],
    [L('Cuisine', 'Cuisine'), c.cuisine], [L('Description', 'Description'), c.description], [L('Différenciation', 'Differentiation'), c.differentiation],
    [L('Opportunité de marché', 'Market gap'), c.market_gap], [L('Clientèle visée', 'Target customers'), c.audience],
    [L('Le fondateur', 'The founder'), c.additional],
  ].filter(([, v]) => v);
  return rows.map(([k, v]) => `${k} : ${String(v).replace(/\s*\n\s*/g, ' / ')}`).join('\n');
}

function systemPrompt(lang) {
  if (lang === 'fr') {
    return [
      'Tu es un analyste financier spécialisé en restauration au Maroc. Tu rédiges, en français sobre, précis et convaincant, le business plan que le fondateur d’un établissement présentera lui-même à sa banque et à ses investisseurs. C’est SON document : écris au nom du projet (« nous » ou le nom du projet), jamais sur lui.',
      '',
      'Règles absolues :',
      '1. AUCUN CHIFFRE ÉCRIT PAR TOI. Pas de chiffres, pas de signe %, pas de nombre en lettres au-delà de « trois ». Chaque montant, taux, date, durée ou quantité s’écrit par sa balise de la liste FAITS, recopiée exactement avec ses accolades, par exemple {ca_a2}. La balise sera remplacée par la valeur exacte, déjà formatée avec son unité : n’ajoute pas l’unité. Une balise ne s’emploie que dans le sens exact de son libellé. Seule exception : « année 1 », « année 2 », « année 3 ». Une balise de nombre est suivie de son propre nom ({places} places ou couverts, {effectif} personnes) et ne désigne jamais autre chose : une quantité absente des FAITS (nombre de vins, de plats…) ne s’écrit pas. Pas d’article juste devant un montant ou un taux : « un ticket de {ticket_lunch} », jamais « au {ticket_lunch} ». Quand tu compares deux années, le verbe suit le sens réel des chiffres (une part qui passe de 5 à 6 augmente).',
      '2. Aucun fait inventé : seulement les FAITS et les mots du fondateur. Aucun nom propre absent de ces données. Aucune loi, étude, statistique ou tendance de marché. Ne décris ni le quartier ni la ville au-delà de ce qu’en dit le fondateur.',
      '3. Un document affirmatif et serein. Les choix sont présentés comme arrêtés. N’écris jamais qu’une information manque, qu’un point reste à confirmer, à vérifier ou à chiffrer, qu’un montant est estimé, ni qu’une affirmation n’est pas vérifiée. Ne mentionne ni devis, ni étude à mener, ni outil, ni Za3fran, ni intelligence artificielle. Les déclarations du fondateur sont des faits du projet, énoncés simplement.',
      '4. Ton professionnel, sans superlatif ni promesse : chaque affirmation positive s’appuie sur un fait ou un chiffre.',
      '5. ANALYSE, pas lecture : chaque paragraphe explique des causes, des mécanismes et des choix ; au plus six balises par paragraphe ; ne recopie pas en phrases ce que les tableaux donnent déjà.',
      '6. Français uniquement ; « EBE » pour l’excédent brut d’exploitation ; à la première mention dans un texte, « DSCR (taux de couverture de la dette) ». Accords, articles et contractions corrects.',
      '7. Phrases complètes, paragraphes de trois à six phrases, sans titre, liste, puce ni mise en forme. Aucun texte hors du JSON demandé.',
    ].join('\n');
  }
  return [
    'You are a financial analyst specialised in restaurants in Morocco. You write, in plain, precise and persuasive English, the business plan that a venue’s founder will personally present to the bank and investors. It is THEIR document: write as the project ("we" or the project name), never about it.',
    '',
    'Absolute rules:',
    '1. YOU WRITE NO NUMBER. No digits, no % sign, no number in words above "three". Every amount, rate, date, duration or quantity is its placeholder from the FACTS list, copied exactly with braces, e.g. {ca_a2}. It is replaced by the exact value, already formatted with its unit: do not add the unit. Use a placeholder only in the exact sense of its label. Only exception: "year 1", "year 2", "year 3". A count placeholder is followed by its own noun ({places} seats or covers, {effectif} people) and never stands for anything else: a quantity absent from the FACTS (number of wines, dishes…) is not written. When you compare two years, the verb follows the real direction of the figures.',
    '2. No invented facts: only the FACTS and the founder’s words. No proper name absent from that data. No law, study, statistic or market trend. Do not describe the district or city beyond what the founder says.',
    '3. An assertive, composed document. Choices are presented as made. Never write that information is missing, that something is to be confirmed, checked or costed, that an amount is estimated, or that a statement is unverified. Never mention quotes, studies to run, tools, Za3fran or artificial intelligence. The founder’s statements are facts of the project, stated plainly.',
    '4. Professional tone, no superlatives or promises: every positive claim rests on a fact or figure.',
    '5. ANALYSIS, not reading: each paragraph explains causes, mechanisms and choices; at most six placeholders per paragraph; do not restate what the tables already give.',
    '6. English only; "EBITDA"; on first mention in a text, "DSCR (debt service coverage ratio)".',
    '7. Complete sentences, paragraphs of three to six sentences, no headings, lists, bullets or formatting. No text outside the requested JSON.',
  ].join('\n');
}

function groupPrompt(group, facts, points) {
  const lang = facts.lang, fr = lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const parts = [];
  parts.push(L('=== FAITS (seuls chiffres autorisés, à citer par leur balise) ===', '=== FACTS (the only figures allowed, cited by placeholder) ==='));
  parts.push(factsBlock(facts));
  parts.push('');
  parts.push(L('=== LE PROJET DANS LES MOTS DU FONDATEUR (noms propres autorisés) ===', '=== THE PROJECT IN THE FOUNDER’S WORDS (allowed proper names) ==='));
  parts.push(founderBlock(facts, lang));
  const schema = {};
  if (group.sections.length) {
    parts.push('');
    parts.push(L('=== SECTIONS À RÉDIGER ===', '=== SECTIONS TO WRITE ==='));
    for (const id of group.sections) {
      const S = SECTIONS[id];
      parts.push(`[${id}] ${S.title[fr ? 0 : 1]}`);
      parts.push(S.brief[fr ? 0 : 1]);
      const pts = points[id] || [];
      if (pts.length) {
        parts.push(L('Points obligatoires (avec ces balises, réparties sur plusieurs paragraphes : au plus six balises par paragraphe) :', 'Mandatory points (with these placeholders, spread over several paragraphs: at most six per paragraph):'));
        pts.forEach((p) => parts.push(`- ${p.text[fr ? 0 : 1]}${p.cite.length ? ' → ' + p.cite.map((k) => `{${k}}`).join(', ') : ''}`));
      }
      parts.push('');
    }
    schema.sections = Object.fromEntries(group.sections.map((id) => [id, [L('paragraphe', 'paragraph'), '…']]));
  }
  if (group.risks) {
    parts.push(L('=== RISQUES ET MESURES ===', '=== RISKS AND MEASURES ==='));
    parts.push(L(
      'Pour chaque risque : « titre » (court, en français ; traduis le titre fourni) et « mesures » (deux à trois phrases : les mesures que le projet a prévues, tirées des mots du fondateur, et l’indicateur suivi pour réagir tôt). Pas de niveau de risque, pas de chiffre hors balise, pas de doute exprimé.',
      'For each risk: "titre" (short, in English; translate the given title) and "mesures" (two to three sentences: the measures the project has planned, from the founder’s words, and the indicator followed to react early). No risk level, no figure outside a placeholder, no doubt expressed.'));
    for (const r of facts.bankRisks) {
      parts.push(`[${r.id}] ${r.title_src}`);
      if (r.founder_words) parts.push(`  ${L('Mots du fondateur', 'Founder’s words')} : « ${r.founder_words.replace(/\s*\n\s*/g, ' ')} »`);
      if (r.plan_changes && r.plan_changes.length) parts.push(`  ${L('Évolution du projet', 'Plan change')} : ${r.plan_changes.join(' ; ')}`);
    }
    parts.push('');
    schema.risks = Object.fromEntries(facts.bankRisks.map((r) => [r.id, { titre: '…', mesures: '…' }]));
  }
  parts.push(L('=== FORMAT DE RÉPONSE ===', '=== ANSWER FORMAT ==='));
  parts.push(L('Réponds uniquement par un objet JSON valide de cette forme (chaque paragraphe est une chaîne) :', 'Answer only with a valid JSON object of this shape (each paragraph is a string):'));
  parts.push(JSON.stringify(schema, null, 1));
  return parts.join('\n');
}

/* ------------------------------ parsing & checking ------------------------------ */

function parseJson(text) {
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in the answer');
  return JSON.parse(s.slice(a, b + 1));
}

/** Checks that only make sense once the figures are in: a phrase repeated around a placeholder. */
function checkFilled(raw, F) {
  const t = fill(raw, F);
  const m = /(^|[^\p{L}])((?:[\p{L}'’]+\s+){0,3}[\p{L}'’]{3,})\s+\2(?=$|[^\p{L}])/iu.exec(t);
  return m && !/^(nous|vous)$/i.test(m[2]) ? [{ code: 'repeat', detail: `words repeated once the figures are in: "${m[2]} ${m[2]}"` }] : [];
}

/* bpw-2.3.0 — checks found by the Phase A acceptance read (bp_v14_canaille_9), the Validator's vw-1.0.4 rules plus three post-fill rules. */
/** Count placeholders carry no unit: the word after them must be their own noun (« {places} références » used the seats as a wine count). */
const COUNT_NOUNS = [
  [/^places$/, /^(places?|couverts|sièges?|seats?|covers)\b/iu],
  [/^effectif$/, /^(personnes?|salariés?|collaborateurs?|employés?|postes?|people|employees|staff)\b/iu],
];
function countMisuse(t) {
  const errs = []; const re = /\{([a-z0-9_]+)\}/g; let m;
  while ((m = re.exec(String(t || '')))) {
    const rule = COUNT_NOUNS.find(([k]) => k.test(m[1])); if (!rule) continue;
    const after = String(t).slice(m.index + m[0].length).replace(/^[\s  ]+/u, '');
    const next = (/^[\p{L}'’-]+/u.exec(after) || [''])[0];
    if (!next || /^(et|ou|en|à|au|aux|dont|qui|que|pour|par|sur|sous|dans|de|du|des|avec|sans|soit|and|or|in|at|to|for|with|of)$/iu.test(next)) continue;
    if (!rule[1].test(after)) errs.push({ code: 'misuse', detail: `{${m[1]}} must be followed by its own noun (it is a count of ${m[1] === 'places' ? 'seats' : 'people'}), found: "{${m[1]}} ${after.slice(0, 20)}" — a quantity absent from the facts is not written` });
  }
  return errs;
}
/** French: no article right before an amount or a rate whose value starts with a figure (« au {ticket_ht_a1} »); a bare count is fine (« les {places} places »). */
function articleMisuse(t, F, lang) {
  const errs = []; if (lang !== 'fr') return errs;
  const re = /(^|[^\p{L}])(le|la|les|du|au|aux)\s+\{([a-z0-9_]+)\}/giu; let m;
  while ((m = re.exec(String(t || '')))) {
    if (/^(quartier|ville)$/.test(m[3])) { errs.push({ code: 'grammar', detail: `no article before a place name: "${m[2]} {${m[3]}}" — write « à {${m[3]}} » or « dans le quartier {quartier} »` }); continue; }
    const v = F[m[3]] && F[m[3]].v; if (!v || !/^[−\-+]?\d/.test(v)) continue;
    if (/^[\d   ]+$/.test(v) || COUNT_NOUNS.some(([k]) => k.test(m[3]))) continue;
    errs.push({ code: 'grammar', detail: `no article before an amount or a rate: "${m[2]} {${m[3]}}" — write « un ticket de {${m[3]}} », « une marge de {${m[3]}} », or check that this figure is the one meant` });
  }
  return errs;
}
/** A trend verb must match the figures it links: « sa part diminue à {loyer_pct_a3} » when year 3 is above year 1 is wrong. */
const DOWN = /\b(diminue|diminuent|baisse|baissent|descend|descendent|tombe|tombent|retombe|chute|chutent|redescend|se replie|s’allège|s'allège|recule|reculent|se réduit|se réduisent|se dilue|se diluent|se desserre|décro[iî]t|reflue|decreases?|falls?|declines?|drops?)\b/giu;
const UP = /\b(progresse|progressent|augmente|augmentent|grimpe|grimpent|bondit|cro[iî]t|croissent|monte|montent|remonte|increases?|rises?|grows?)\b/giu;
/** A trend verb applies to the figure right after it (« diminue à {loyer_pct_a3} »), compared with the same figure of an earlier year in the sentence. */
function trendMisuse(t, F) {
  const errs = [];
  for (const sent of String(t || '').split(/(?<=[.!?])\s+/)) {
    for (const [re, dir] of [[DOWN, -1], [UP, 1]]) {
      re.lastIndex = 0; let v;
      while ((v = re.exec(sent))) {
        const after = sent.slice(v.index + v[0].length, v.index + v[0].length + 60);
        const ph = /^[^{.;]*?\{([a-z0-9_]+)_a([1-3])\}/.exec(after); if (!ph) continue;
        const to = F[`${ph[1]}_a${ph[2]}`]; if (!to || typeof to.raw !== 'number') continue;
        const re2 = new RegExp(`\\{${ph[1]}_a([1-3])\\}`, 'g'); let e, from = null;
        while ((e = re2.exec(sent.slice(0, v.index)))) if (+e[1] < +ph[2]) from = e[1];
        if (from == null) continue;
        const fv = F[`${ph[1]}_a${from}`].raw;
        if (dir < 0 && to.raw > fv) errs.push({ code: 'trend', detail: `"${v[0]} … {${ph[1]}_a${ph[2]}}" but it is higher than {${ph[1]}_a${from}}: the figure rises; state the real direction and its cause` });
        if (dir > 0 && to.raw < fv) errs.push({ code: 'trend', detail: `"${v[0]} … {${ph[1]}_a${ph[2]}}" but it is lower than {${ph[1]}_a${from}}: the figure falls; state the real direction and its cause` });
      }
    }
  }
  return errs;
}
/** Once filled: a preposition clash (« accès à avec service d’alcool »), a doubled unit (« 6 mois premiers mois »), the same figure twice (« 1,3 et 1,3 »). */
function filledMisuse(raw, F) {
  const t = fill(raw, F); const errs = []; let x;
  if ((x = /(^|[^\p{L}])((?:à|au|aux|de|du|des)\s+(?:avec|sans))(?=$|[^\p{L}])/iu.exec(t))) errs.push({ code: 'misuse', detail: `a placeholder reads wrongly once filled: "${x[2]}" — use the placeholder only in the exact sense of its label, or rephrase without it` });
  if ((x = /(^|[^\p{L}])((mois|ans|années|jours|semaines|months|years|days|weeks)\s+[\p{L}'’]+\s+\3)(?=$|[^\p{L}])/iu.exec(t))) errs.push({ code: 'misuse', detail: `unit doubled once the figure is in: "${x[2]}" — the placeholder already carries its unit` });
  if ((x = /(^|[^\d])(\d[\d   ]*(?:,\d+)?(?:\s?(?:%|MAD))?)\s+(et|and|à|to)\s+\2(?=$|[^\d])/u.exec(t))) errs.push({ code: 'misuse', detail: `the same figure twice: "${x[2]} ${x[3]} ${x[2]}" — say it once, or drop it` });
  return errs;
}
function moreChecks(p, facts) { return countMisuse(p).concat(articleMisuse(p, facts.F, facts.lang), trendMisuse(p, facts.F), filledMisuse(p, facts.F)); }

function checkGroup(group, out, facts, points) {
  const errs = [];
  // Facts reserved for the founder's report are unknown here: citing one is an error.
  const keys = new Set(bankFacts(facts).map(([k]) => k));
  const names = new Set(facts.names);
  const ctx = { lang: facts.lang, keys, names, F: facts.F, banned: BANK_BANNED, maxFigures: MAX_FIGURES };
  const push = (where, list) => list.forEach((e) => errs.push({ where, ...e }));
  for (const id of group.sections) {
    const paras = out && out.sections && out.sections[id];
    if (!Array.isArray(paras) || !paras.length) { errs.push({ where: id, code: 'missing', detail: 'section missing' }); continue; }
    paras.forEach((p, i) => push(`${id}[${i}]`, checkText(p, ctx).concat(checkFilled(p, facts.F), moreChecks(p, facts))));
    const all = paras.join('\n');
    for (const pt of points[id] || []) for (const k of pt.cite) if (!all.includes(`{${k}}`)) errs.push({ where: id, code: 'missing', detail: `must cite {${k}} (${pt.text[facts.lang === 'fr' ? 0 : 1]})` });
    if (paras.length > 12) errs.push({ where: id, code: "length", detail: `${paras.length} paragraphs, at most 12` });
  }
  if (group.risks) {
    for (const r of facts.bankRisks) {
      const x = out && out.risks && out.risks[r.id];
      if (!x) { errs.push({ where: r.id, code: 'missing', detail: 'risk missing' }); continue; }
      for (const f of ['titre', 'mesures']) {
        if (!x[f]) { errs.push({ where: `${r.id}.${f}`, code: 'missing', detail: 'field missing' }); continue; }
        push(`${r.id}.${f}`, checkText(f === 'titre' ? String(x[f]).replace(/\s*$/, '.') : x[f], ctx).concat(checkFilled(x[f], facts.F), f === 'mesures' ? moreChecks(x[f], facts) : []));
      }
    }
  }
  return errs;
}

function rewritePrompt(prevText, errs, lang) {
  const fr = lang === 'fr';
  return [
    fr ? 'Ta réponse précédente ne passe pas les contrôles de qualité. Corrige UNIQUEMENT ces problèmes, sans rien changer d’autre, et renvoie le JSON complet :' : 'Your previous answer fails the quality checks. Fix ONLY these problems, change nothing else, and return the complete JSON:',
    ...errs.slice(0, 40).map((e) => `- ${e.where} : ${e.code} — ${e.detail}` + ((e.code === 'spelled' || e.code === 'digit')
      ? (fr ? ' → supprime cette quantité, ou remplace-la par « plusieurs », « une large sélection de », « chaque » ; aucun nombre, ni en chiffres ni en lettres (même un chiffre donné par le fondateur, s’il n’a pas de balise).'
        : ' → remove this quantity, or replace it with "several", "a wide selection of", "each"; no number, in digits or in words (even a figure from the founder, if it has no placeholder).') : '')),
    '',
    ...(errs.some((e) => e.code === 'too_many_figures') ? [fr
      ? 'Pour un paragraphe qui a trop de balises : coupe-le en deux paragraphes (chacun avec au plus six balises), ou retire les chiffres que les tableaux donnent déjà ; garde toutes les balises obligatoires de la section, réparties entre les paragraphes.'
      : 'For a paragraph with too many placeholders: split it into two paragraphs (each with at most six), or drop figures the tables already show; keep every mandatory placeholder of the section, spread across paragraphs.'] : []),
    fr ? 'Rappels : aucun chiffre ni signe % hors balise ; au plus six balises par paragraphe ; aucun mot anglais ; aucun nom propre absent des données ; aucune expression de doute, d’estimation ou de point à confirmer ; écrire au nom du projet.'
      : 'Reminders: no digit or % sign outside a placeholder; at most six placeholders per paragraph; no French word; no proper name absent from the data; no doubt, estimate or point to confirm; write as the project.',
    '',
    fr ? 'Ta réponse précédente :' : 'Your previous answer:',
    prevText,
  ].join('\n');
}

/**
 * Deterministic layout fix: a paragraph carrying more than MAX_FIGURES placeholders is split at
 * sentence boundaries so that each paragraph carries at most MAX_FIGURES. Words are never changed.
 * A single sentence with more than MAX_FIGURES figures is a list and still fails the check.
 */
function reflowParagraph(p) {
  const count = (t) => (t.match(/\{[a-z0-9_]+\}/g) || []).length;
  if (count(p) <= MAX_FIGURES) return [p];
  const sentences = String(p).match(/[^.!?]+[.!?]+(\s+|$)/g) || [p];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && count(cur) + count(s) > MAX_FIGURES) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function reflowSections(out) {
  if (!out || !out.sections) return;
  for (const id of Object.keys(out.sections)) {
    if (Array.isArray(out.sections[id])) out.sections[id] = out.sections[id].flatMap(reflowParagraph);
  }
}

/* ------------------------------ main ------------------------------ */

async function writeGroup(group, facts, points, callModel, deadline) {
  const system = systemPrompt(facts.lang);
  const base = groupPrompt(group, facts, points);
  let user = base, last = null, errs = [], attempts = 0;
  const usage = { input_tokens: 0, output_tokens: 0 };
  for (let i = 0; i <= MAX_REWRITES; i++) {
    if (i > 0 && deadline && Date.now() > deadline) break;
    attempts++;
    const r = await callModel(system, user);
    usage.input_tokens += (r.usage && r.usage.input_tokens) || 0;
    usage.output_tokens += (r.usage && r.usage.output_tokens) || 0;
    let out;
    try { out = parseJson(r.text); } catch (e) { errs = [{ where: group.id, code: 'json', detail: e.message }]; user = base + '\n\n' + (facts.lang === 'fr' ? 'Réponds uniquement par l’objet JSON demandé, valide et complet.' : 'Answer only with the requested JSON object, valid and complete.'); continue; }
    if (facts.lang === 'fr') out = elide(out);
    last = out;
    reflowSections(out);
    errs = checkGroup(group, out, facts, points);
    if (!errs.length) return { ok: true, out, attempts, errors: [], usage };
    user = base + '\n\n' + rewritePrompt(JSON.stringify(out), errs, facts.lang);
  }
  return { ok: false, out: last, attempts, errors: errs, usage };
}

async function writePlan({ facts, callModel, deadline }) {
  const points = mandatoryPoints(facts);
  const groups = GROUPS.filter((g) => g.sections.length || (g.risks && facts.bankRisks.length));
  const results = await Promise.all(groups.map((g) => writeGroup(g, facts, points, callModel, deadline).catch((e) => ({ ok: false, out: null, attempts: 1, errors: [{ where: g.id, code: 'call', detail: e.message }], usage: {} }))));
  const text = { sections: {}, risks: {} };
  const errors = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const attempts = {};
  results.forEach((r, i) => {
    const g = groups[i];
    attempts[g.id] = r.attempts;
    usage.input_tokens += (r.usage && r.usage.input_tokens) || 0;
    usage.output_tokens += (r.usage && r.usage.output_tokens) || 0;
    errors.push(...r.errors.map((e) => ({ group: g.id, ...e })));
    if (r.out) { Object.assign(text.sections, r.out.sections || {}); Object.assign(text.risks, r.out.risks || {}); }
  });
  return { ok: errors.length === 0, text, errors, attempts, usage, version: WRITER_VERSION };
}

module.exports = { writePlan, rewritePrompt, moreChecks, reflowParagraph, checkFilled, mandatoryPoints, groupPrompt, systemPrompt, checkGroup, parseJson, bankFacts, SECTIONS, GROUPS, WRITER_VERSION, MAX_REWRITES, BANK_BANNED, NOT_FOR_BANK };
