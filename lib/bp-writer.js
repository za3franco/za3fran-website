/* lib/bp-writer.js — Business Plan Essentials v14 writing (Sonnet, parallel calls, bank framing).
 * Version bpw-1.0.0 (9 Oct 2026). Strategy v1.6 decisions 12-13, §15.
 *
 * The model writes TEXT ONLY. Figures reach it as {placeholders} from lib/bp-facts.js and it must
 * write no digit itself; lib/bp-checks.js verifies every string, and a group that fails is sent back
 * with the list of problems (at most MAX_REWRITES times). A group that still fails blocks delivery.
 *
 * Prompts are written in the plan's language (French-native for a French plan), not translated
 * instructions. No Validator score, no review vocabulary, no upsell (bank framing).
 *
 * writePlan({ facts, callModel, deadline }) -> { ok, text, attempts, errors, usage }
 *   callModel(system, user) -> Promise<{ text, usage }>   (injected: no network here, testable)
 *   text = { sections: { id: [paragraph…] }, risks: { R1: { titre, attenuation, suivi } }, hypotheses: { H1: { enonce, verification } } }
 */
'use strict';

const { checkText, fill } = require('./bp-checks.js');

const WRITER_VERSION = 'bpw-1.0.0';
const MAX_REWRITES = 2;

/* ------------------------------ sections ------------------------------ */

const SECTIONS = {
  synthese: {
    title: ['Synthèse', 'Summary'],
    brief: [
      'Quatre paragraphes, dans cet ordre : (1) le projet en une phrase claire puis son emplacement, sa capacité et son ouverture ; (2) le besoin de financement, sa couverture par les apports et l’emprunt demandé, avec ses conditions ; (3) la rentabilité attendue et la capacité de remboursement à partir de l’année 2, en rappelant que l’année 1 bénéficie du différé lorsqu’il existe ; (4) les principaux points d’attention, dits sobrement, et ce qui doit être confirmé avant décaissement.',
      'Four paragraphs, in this order: (1) the project in one clear sentence, then its location, capacity and opening; (2) the funding need, how equity and the requested loan cover it, with the loan terms; (3) expected profitability and debt-service capacity from year 2, noting that year 1 benefits from the interest-only period when there is one; (4) the main points of attention, stated plainly, and what must be confirmed before drawdown.',
    ],
  },
  projet: {
    title: ['Le projet', 'The project'],
    brief: [
      'Deux à trois paragraphes : le concept et l’offre (cuisine, boissons, ambiance) à partir des mots du porteur de projet ; ce qui le distingue ; l’expérience du porteur de projet telle qu’il la décrit (sans l’embellir). Ne décris pas de plats ou de produits que le porteur de projet n’a pas cités.',
      'Two to three paragraphs: the concept and offer (food, drinks, atmosphere) from the founder’s own words; what sets it apart; the founder’s experience as the founder describes it (without embellishing). Do not describe dishes or products the founder did not mention.',
    ],
  },
  marche: {
    title: ['Marché et clientèle', 'Market and customers'],
    brief: [
      'Deux paragraphes : la clientèle visée et l’emplacement ; le positionnement de prix (tickets du déjeuner et du dîner) et la concurrence. Tu n’as aucune donnée de marché chiffrée : n’en invente pas, ne cite aucun établissement concurrent ; si la concurrence n’a pas été étudiée, dis-le et renvoie aux hypothèses à confirmer.',
      'Two paragraphs: target customers and location; price positioning (lunch and dinner tickets) and competition. You have no market figures: invent none and name no competing venue; if competition has not been studied, say so and refer to the assumptions to confirm.',
    ],
  },
  exploitation: {
    title: ['Exploitation et équipe', 'Operations and team'],
    brief: [
      'Deux paragraphes, avant les tableaux des services et de l’équipe : l’organisation des services (jours, capacité, choix pour le Ramadan) ; l’équipe, son coût et son poids dans le chiffre d’affaires, en précisant ce qui est estimé par Za3fran.',
      'Two paragraphs, before the services and team tables: how the services are organised (days, capacity, Ramadan choice); the team, its cost and its weight in revenue, stating what Za3fran estimated.',
    ],
  },
  financement: {
    title: ['Investissement et financement', 'Investment and funding'],
    brief: [
      'Deux à trois paragraphes, avant les tableaux des besoins et des ressources : la nature de l’investissement et la part estimée par Za3fran ; la structure du financement (apports, emprunt, conditions, différé) ; la répartition du capital entre associés.',
      'Two to three paragraphs, before the uses and sources tables: what the investment covers and the part Za3fran estimated; the funding structure (equity, loan, terms, interest-only period); how the capital is split between shareholders.',
    ],
  },
  previsions: {
    title: ['Prévisions d’activité et de résultat', 'Activity and profit forecast'],
    brief: [
      'Deux à trois paragraphes, avant le compte de résultat : comment l’activité est construite (services, taux d’occupation de référence, montée en charge) ; l’évolution du chiffre d’affaires et des marges sur trois ans ; les principaux postes de charges et leurs ratios.',
      'Two to three paragraphs, before the income statement: how activity is built (services, reference occupancy, ramp-up); revenue and margins over three years; the main cost lines and their ratios.',
    ],
  },
  tresorerie: {
    title: ['Trésorerie et remboursement', 'Cash and debt service'],
    brief: [
      'Deux à trois paragraphes, avant le plan de trésorerie : l’évolution de la trésorerie et son point bas ; la capacité de remboursement année par année ; l’effet du différé d’amortissement s’il existe.',
      'Two to three paragraphs, before the cash plan: how cash evolves and its low point; debt-service capacity year by year; the effect of the interest-only period if there is one.',
    ],
  },
  scenarios: {
    title: ['Scénarios et sensibilités', 'Scenarios and sensitivity'],
    brief: [
      'Deux à trois paragraphes, avant les tableaux : ce que donnent les scénarios prudent et favorable ; la sensibilité la plus forte parmi les chocs testés ; le point mort et la marge de sécurité par rapport à la prévision de base. Le test de résistance n’est pas une prévision : dis-le s’il est cité.',
      'Two to three paragraphs, before the tables: what the conservative and optimistic cases show; the strongest sensitivity among the shocks tested; break-even and the safety margin against the base forecast. The stress test is not a forecast: say so if you cite it.',
    ],
  },
};

const GROUPS = [
  { id: 'g1', sections: ['synthese'] },
  { id: 'g2', sections: ['projet', 'marche'] },
  { id: 'g3', sections: ['exploitation', 'financement'] },
  { id: 'g4', sections: ['previsions', 'tresorerie', 'scenarios'] },
  { id: 'g5', sections: [], risks: true, hypotheses: true },
];

/* ------------------------------ mandatory points ------------------------------ */

/**
 * What each section MUST say, decided in code from the facts (never left to the model).
 * Returns { sectionId: [{ text: [fr, en], cite: [keys] }] }.
 */
function mandatoryPoints(facts) {
  const F = facts.F;
  const has = (k) => !!F[k];
  const P = { synthese: [], projet: [], marche: [], exploitation: [], financement: [], previsions: [], tresorerie: [], scenarios: [] };
  const add = (sec, fr, en, cite = []) => P[sec].push({ text: [fr, en], cite: cite.filter(has) });

  add('synthese', 'Le besoin total et l’emprunt demandé.', 'The total need and the loan requested.', ['besoin_total', 'emprunt']);
  add('synthese', 'Le chiffre d’affaires et l’EBE de l’année 2, et le DSCR de l’année 2.', 'Year-2 revenue, EBITDA and DSCR.', ['ca_a2', 'ebe_a2', 'dscr_a2']);
  if (has('differe')) {
    add('tresorerie', 'Le différé : pendant cette période, seuls les intérêts sont payés ; le DSCR de l’année 1 est donc élevé par construction et ne mesure pas la capacité de remboursement, qui s’apprécie à partir de l’année 2.',
      'The interest-only period: only interest is paid; year-1 DSCR is therefore high by construction and does not measure repayment capacity, which is judged from year 2.', ['differe', 'dscr_a1', 'dscr_a2']);
  }
  add('tresorerie', 'La trésorerie la plus basse du scénario de base, son mois et sa place dans le calendrier d\u2019exploitation (attention : l\u2019année civile n\u2019est pas l\u2019année d\u2019exploitation).', 'Lowest cash in the base case, its month and where it falls in trading time (calendar year is not trading year).', ['tresorerie_min', 'tresorerie_min_mois', 'rang_tresorerie_min']);
  if (facts.context.low_is_ramadan) add('tresorerie', 'Le point bas de trésorerie coïncide avec le Ramadan : l\u2019établissement y est fermé ou au ralenti, tandis que le loyer, les salaires et les charges fixes continuent.', 'The cash low coincides with Ramadan: the venue is closed or slower while rent, salaries and fixed costs continue.', ['ramadan_a1', 'ramadan']);
  if (has('reserve_complementaire')) {
    add('tresorerie', 'Dit clairement : dans le scénario prudent, la trésorerie devient négative ; le financement prévu ne couvre pas ce cas ; une réserve complémentaire le couvrirait.',
      'Say plainly: in the conservative case cash turns negative; the planned funding does not cover that case; an additional reserve would.', ['tresorerie_min_prudent', 'tresorerie_min_prudent_mois', 'reserve_complementaire']);
    add('synthese', 'Le scénario prudent fait apparaître un besoin de trésorerie non couvert ; le dire sans détour, avec le moment où il survient.', 'The conservative case shows an uncovered cash need; say so directly, with when it occurs.', ['reserve_complementaire', 'rang_tresorerie_min_prudent']);
  }
  const consBelow1 = Object.keys(F).filter((k) => /^dscr_a\d_prudent$/.test(k) && F[k].raw != null && F[k].raw < 1);
  if (consBelow1.length) add('scenarios', 'Dans le scénario prudent, le DSCR est inférieur à un pour l’année concernée : l’exploitation ne couvrirait pas le service de la dette cette année-là.',
    'In the conservative case DSCR is below one in that year: operations would not cover debt service that year.', consBelow1);
  add('scenarios', 'Le point mort d’exploitation en couverts par jour d’ouverture, comparé à la prévision de base.', 'Operating break-even in covers per open day, against the base forecast.', ['point_mort_couverts', 'couverts_jour_a2']);
  if (has('plafond_garantie')) add('financement', 'L’emprunt dépasse le plafond de la garantie publique : le dire et en tirer la conséquence (garantie partielle ou sûretés complémentaires à prévoir avec la banque).',
    'The loan exceeds the state guarantee ceiling: say so and state the consequence (partial guarantee or extra collateral to agree with the bank).', ['plafond_garantie', 'depassement_plafond']);
  if (has('prix_emission_51')) add('financement', 'À la valeur nominale, le fondateur est minoritaire ; indiquer le prix d’émission qui lui conserverait la majorité, à titre indicatif, sans le présenter comme acquis.',
    'At face value the founder is a minority shareholder; state the issue price that would keep a majority, as an indication, not as agreed.', ['part_fondateur', 'prix_emission_51']);
  if (has('investissement_estime')) add('financement', 'La part de l’investissement estimée par Za3fran, à remplacer par des devis.', 'The part of the investment estimated by Za3fran, to be replaced by quotes.', ['investissement_estime']);
  if (has('licence_hors_investissement')) add('financement', 'Le coût de la licence d’alcool n’est pas inclus dans l’investissement.', 'The alcohol licence cost is not included in the investment.', ['licence_hors_investissement']);
  if (has('excedent_ressources')) add('financement', 'Les ressources dépassent les besoins : l’excédent constitue la trésorerie de départ.', 'Sources exceed uses: the surplus is the opening cash.', ['excedent_ressources']);
  add('previsions', 'La montée en charge et les couverts par jour d’ouverture en années 1 et 2.', 'The ramp-up and covers per open day in years 1 and 2.', ['montee_en_charge', 'couverts_jour_a1', 'couverts_jour_a2']);
  if (facts.context.covers_from_benchmark) add('previsions', 'La fréquentation retenue provient de références de format et non d’une estimation du porteur de projet ; elle reste à confirmer sur le terrain.',
    'The covers used come from format references, not from the founder’s estimate; they remain to be confirmed on the ground.', ['occupation_lunch', 'occupation_dinner']);
  add('exploitation', 'L’effectif et le poids de la masse salariale dans le chiffre d’affaires de l’année 2.', 'Headcount and payroll as a share of year-2 revenue.', ['effectif', 'masse_salariale_pct_a2']);
  if (has('ramadan')) add('exploitation', 'Le choix du projet pour le Ramadan, et le fait que loyer, salaires et charges fixes continuent pendant cette période.', 'The project’s Ramadan choice, and that rent, salaries and fixed costs continue in that period.', ['ramadan']);
  if (facts.context.team_estimated) add('exploitation', 'Une partie de l’équipe est une estimation Za3fran (à confirmer par le porteur de projet).', 'Part of the team is a Za3fran estimate (to be confirmed by the founder).');
  add('marche', 'Les tickets moyens du déjeuner et du dîner.', 'Average lunch and dinner tickets.', ['ticket_lunch', 'ticket_dinner']);
  return P;
}

/* ------------------------------ prompts ------------------------------ */

function factsBlock(facts) {
  return Object.entries(facts.F).map(([k, f]) => `{${k}} = ${f.v} — ${f.label}`).join('\n');
}

function founderBlock(facts, lang) {
  const c = facts.context, fr = lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const rows = [
    [L('Nom du projet', 'Project name'), c.concept_name], [L('Ville', 'City'), c.city], [L('Quartier', 'District'), c.district],
    [L('Cuisine', 'Cuisine'), c.cuisine], [L('Description', 'Description'), c.description], [L('Différenciation', 'Differentiation'), c.differentiation],
    [L('Opportunité de marché', 'Market gap'), c.market_gap], [L('Concurrents', 'Competitors'), c.competitors], [L('Clientèle visée', 'Target customers'), c.audience],
    [L('Informations complémentaires', 'Additional information'), c.additional],
  ].filter(([, v]) => v);
  return rows.map(([k, v]) => `${k} : ${String(v).replace(/\s*\n\s*/g, ' / ')}`).join('\n');
}

function systemPrompt(lang) {
  if (lang === 'fr') {
    return [
      'Tu es analyste crédit et consultant en restauration au Maroc. Tu rédiges en français, dans une langue sobre, précise et naturelle, les textes d’un business plan qu’un porteur de projet remettra à sa banque.',
      '',
      'Règles absolues :',
      '1. AUCUN CHIFFRE ÉCRIT PAR TOI. Pas de chiffres, pas de signe %, pas de nombre en lettres au-delà de « trois ». Chaque montant, taux, date, durée ou quantité s’écrit par sa balise de la liste FAITS, recopiée exactement avec ses accolades, par exemple {ca_a2}. La balise sera remplacée par la valeur exacte (déjà formatée, avec l’unité) : n’ajoute pas l’unité après la balise. Si un fait n’a pas de balise, exprime-le sans chiffre.',
      '2. Aucun fait inventé. Tu n’utilises que les FAITS et les mots du porteur de projet. Aucun nom propre (établissement, fournisseur, banque, cabinet, marque, personne, lieu) qui ne figure pas dans les données du porteur de projet. Aucune loi, étude, statistique ou tendance de marché. Ne décris ni le quartier, ni la ville, ni le marché au-delà de ce qu\u2019en dit le porteur de projet. N\u2019attribue au porteur de projet aucune opinion, intention ou décision qu\u2019il n\u2019a pas exprimée.',
      '3. Cadrage bancaire : ton factuel et mesuré, sans superlatif ni promesse. Les risques sont décrits avec leur atténuation et leur suivi. Ne parle jamais de note, de score, d’évaluation, de revue, d’outil ou d’intelligence artificielle. « Za3fran » n’apparaît que pour qualifier une estimation (« estimation Za3fran »).',
      '4. Ce que le porteur de projet affirme sans preuve est présenté comme son affirmation (« selon le porteur de projet ») et non comme un fait établi. N\u2019écris jamais « selon le porteur de projet » ou « le porteur de projet estime » devant une idée qui n\u2019est pas dans ses mots ci-dessous. Les jours de service se décrivent avec les balises des jours, sans résumé approximatif.',
      '5. Les anciens chiffres du porteur de projet (budget initial, ancien ticket unique) sont dépassés par le plan de financement et les tickets des FAITS : ne les reprends jamais.',
      '6. Français uniquement. Traduis tout mot anglais des données (pas de « staff », « cash », « storytelling », « early adopters », « food cost », « business », « monitoring »). Utilise « EBE » (excédent brut d’exploitation) et, la première fois dans un texte, « DSCR (taux de couverture de la dette) ». Accords et articles corrects ; contractions (« du », « au », « des », « aux »).',
      '7. Des phrases complètes. Paragraphes de trois à six phrases. Pas de titre, pas de liste, pas de puce, pas de mise en forme : du texte suivi. Aucun texte en dehors du JSON demandé.',
    ].join('\n');
  }
  return [
    'You are a credit analyst and restaurant consultant for Morocco. You write, in plain, precise and natural English, the text of a business plan that a founder will hand to the bank.',
    '',
    'Absolute rules:',
    '1. YOU WRITE NO NUMBER. No digits, no % sign, no number in words above "three". Every amount, rate, date, duration or quantity is written as its placeholder from the FACTS list, copied exactly with its braces, for example {ca_a2}. The placeholder is replaced by the exact value (already formatted, with its unit): do not add the unit after it. A placeholder is used only in the exact sense of its label (a DSCR is not the size of a shock; an amount is not a duration). If a fact has no placeholder, express it without a number. Only exception: the plan years are written "year 1", "year 2", "year 3".',
    '2. No invented facts. Use only the FACTS and the founder’s own words. No proper name (venue, supplier, bank, firm, brand, person, place) that is not in the founder’s data. No law, study, statistic or market trend. Do not describe the district, the city or the market beyond what the founder says. Never attribute to the founder an opinion, intention or decision the founder did not express.',
    '3. Bank framing: factual, measured tone, no superlatives or promises. Risks are described with their mitigation and monitoring. Never mention a rating, score, assessment, review, tool or artificial intelligence. "Za3fran" appears only to qualify an estimate ("Za3fran estimate").',
    '4. What the founder states without evidence is presented as the founder’s statement ("according to the founder"), never as an established fact. Never write "according to the founder" before an idea that is not in the founder\u2019s words below. Service days are described with the day placeholders, never summarised loosely.',
    '5. The founder’s old figures (initial budget, former single ticket) are superseded by the financing plan and the tickets in the FACTS: never repeat them.',
    '6. English only. Translate any French word from the data. Use "EBITDA" and, the first time in a text, "DSCR (debt service coverage ratio)".',
    '7. Complete sentences. Paragraphs of three to six sentences. No headings, lists, bullets or formatting: running text. No text outside the requested JSON.',
  ].join('\n');
}

function groupPrompt(group, facts, points) {
  const lang = facts.lang, fr = lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const parts = [];
  parts.push(L('=== FAITS (seuls chiffres autorisés, à citer par leur balise) ===', '=== FACTS (the only figures allowed, cited by placeholder) ==='));
  parts.push(factsBlock(facts));
  parts.push('');
  parts.push(L('=== DONNÉES DU PORTEUR DE PROJET (ses propres mots ; noms propres autorisés) ===', '=== FOUNDER DATA (the founder’s own words; allowed proper names) ==='));
  parts.push(founderBlock(facts, lang));
  const schema = { };
  if (group.sections.length) {
    parts.push('');
    parts.push(L('=== SECTIONS À RÉDIGER ===', '=== SECTIONS TO WRITE ==='));
    for (const id of group.sections) {
      const S = SECTIONS[id];
      parts.push(`[${id}] ${S.title[fr ? 0 : 1]}`);
      parts.push(S.brief[fr ? 0 : 1]);
      const pts = points[id] || [];
      if (pts.length) {
        parts.push(L('Points obligatoires (avec ces balises) :', 'Mandatory points (with these placeholders):'));
        pts.forEach((p) => parts.push(`- ${p.text[fr ? 0 : 1]}${p.cite.length ? ' → ' + p.cite.map((k) => `{${k}}`).join(', ') : ''}`));
      }
      parts.push('');
    }
    schema.sections = Object.fromEntries(group.sections.map((id) => [id, [L('paragraphe', 'paragraph'), '…']]));
  }
  if (group.risks) {
    parts.push(L('=== RISQUES ===', '=== RISKS ==='));
    parts.push(L(
      'Pour chaque risque : un titre court en français (traduis le titre fourni ; garde le titre déjà en français tel quel), « attenuation » (deux à trois phrases : les mesures prévues, tirées des mots du porteur de projet quand il en donne ; sinon des mesures prudentes et générales, sans nom propre) et « suivi » (une à deux phrases : l’indicateur suivi, sa fréquence et le seuil qui déclenche une action ; un seuil chiffré ne peut être qu’une balise des FAITS). Le niveau de risque est fixé par ailleurs : n’écris pas de niveau.',
      'For each risk: "titre", a short English title (translate the given title; keep an English title as is), "attenuation" (mitigation: two to three sentences: the measures planned, from the founder’s own words when given; otherwise prudent general measures, no proper name) and "suivi" (monitoring: one to two sentences: the indicator, its frequency and the threshold that triggers action; a numeric threshold can only be a FACTS placeholder). The risk level is set elsewhere: do not write a level.'));
    for (const r of facts.risks) {
      parts.push(`[${r.id}] ${r.title_src || r.title}`);
      if (r.founder_words) parts.push(`  ${L('Mots du porteur de projet', 'Founder’s words')} : « ${r.founder_words.replace(/\s*\n\s*/g, ' ')} »`);
      if (r.plan_changes && r.plan_changes.length) parts.push(`  ${L('Modification du projet', 'Plan change')} : ${r.plan_changes.join(' ; ')}`);
      if (r.pre_conditions && r.pre_conditions.length) parts.push(`  ${L('Conditions préalables', 'Conditions precedent')} : ${r.pre_conditions.join(' ; ')}`);
      const cite = [...(r.facts || []), ...(r.founder_figures || [])];
      if (cite.length) parts.push(`  ${L('Balises utiles', 'Useful placeholders')} : ${cite.map((k) => `{${k}}`).join(', ')}`);
    }
    parts.push('');
    schema.risks = Object.fromEntries(facts.risks.map((r) => [r.id, fr ? { titre: '…', attenuation: '…', suivi: '…' } : { titre: '…', attenuation: '…', suivi: '…' }]));
  }
  if (group.hypotheses && facts.confirm.length) {
    parts.push(L('=== HYPOTHÈSES À CONFIRMER (déclarations du porteur de projet non vérifiées) ===', '=== ASSUMPTIONS TO CONFIRM (unverified founder statements) ==='));
    parts.push(L(
      'Pour chacune : « enonce » (une phrase : ce que le porteur de projet affirme, présenté comme son affirmation) et « verification » (une phrase : comment le vérifier avant engagement). Pas de chiffre hors balise.',
      'For each: "enonce" (one sentence: what the founder states, presented as the founder’s statement) and "verification" (one sentence: how to check it before commitment). No figure outside a placeholder.'));
    for (const h of facts.confirm) {
      parts.push(`[${h.id}] ${h.title_src}`);
      parts.push(`  ${L('Mots du porteur de projet', 'Founder’s words')} : « ${h.founder_words.replace(/\s*\n\s*/g, ' ')} »`);
      if (h.founder_figures.length) parts.push(`  ${L('Balises utiles', 'Useful placeholders')} : ${h.founder_figures.map((k) => `{${k}}`).join(', ')}`);
    }
    parts.push('');
    schema.hypotheses = Object.fromEntries(facts.confirm.map((h) => [h.id, { enonce: '…', verification: '…' }]));
  }
  parts.push(L('=== FORMAT DE RÉPONSE ===', '=== ANSWER FORMAT ==='));
  parts.push(L('Réponds uniquement par un objet JSON valide de cette forme (chaque paragraphe est une chaîne) :', 'Answer only with a valid JSON object of this shape (each paragraph is a string):'));
  parts.push(JSON.stringify(schema, null, 1));
  return parts.join('\n');
}

/* ------------------------------ parsing & checking ------------------------------ */

function parseJson(text) {
  let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in the answer');
  return JSON.parse(s.slice(a, b + 1));
}

/** Check one group's answer. Returns a list of { where, code, detail }. */
/** Checks that only make sense once the figures are in: a phrase repeated around a placeholder. */
function checkFilled(raw, F) {
  const t = fill(raw, F);
  const m = /(^|[^\p{L}])((?:[\p{L}'’]+\s+){0,3}[\p{L}'’]{3,})\s+\2(?=$|[^\p{L}])/iu.exec(t);
  return m && !/^(nous|vous)$/i.test(m[2]) ? [{ code: 'repeat', detail: `words repeated once the figures are in: "${m[2]} ${m[2]}"` }] : [];
}

function checkGroup(group, out, facts, points) {
  const errs = [];
  const keys = new Set(Object.keys(facts.F));
  const names = new Set(facts.names);
  const ctx = (required) => ({ lang: facts.lang, keys, names, F: facts.F, required });
  const push = (where, list) => list.forEach((e) => errs.push({ where, ...e }));
  for (const id of group.sections) {
    const paras = out && out.sections && out.sections[id];
    if (!Array.isArray(paras) || !paras.length) { errs.push({ where: id, code: 'missing', detail: 'section missing' }); continue; }
    paras.forEach((p, i) => push(`${id}[${i}]`, checkText(p, ctx([])).concat(checkFilled(p, facts.F))));
    const all = paras.join('\n');
    for (const pt of points[id] || []) for (const k of pt.cite) if (!all.includes(`{${k}}`)) errs.push({ where: id, code: 'missing', detail: `must cite {${k}} (${pt.text[facts.lang === 'fr' ? 0 : 1]})` });
    if (paras.length > 6) errs.push({ where: id, code: 'length', detail: `${paras.length} paragraphs, at most 6` });
  }
  if (group.risks) {
    for (const r of facts.risks) {
      const x = out && out.risks && out.risks[r.id];
      if (!x) { errs.push({ where: r.id, code: 'missing', detail: 'risk missing' }); continue; }
      for (const f of ['titre', 'attenuation', 'suivi']) {
        if (!x[f]) { errs.push({ where: `${r.id}.${f}`, code: 'missing', detail: 'field missing' }); continue; }
        const list = checkText(f === 'titre' ? String(x[f]).replace(/\s*$/, '.') : x[f], ctx([])).concat(checkFilled(x[f], facts.F));
        push(`${r.id}.${f}`, list);
      }
    }
  }
  if (group.hypotheses) {
    for (const h of facts.confirm) {
      const x = out && out.hypotheses && out.hypotheses[h.id];
      if (!x) { errs.push({ where: h.id, code: 'missing', detail: 'assumption missing' }); continue; }
      for (const f of ['enonce', 'verification']) {
        if (!x[f]) { errs.push({ where: `${h.id}.${f}`, code: 'missing', detail: 'field missing' }); continue; }
        push(`${h.id}.${f}`, checkText(x[f], ctx([])).concat(checkFilled(x[f], facts.F)));
      }
    }
  }
  return errs;
}

function rewritePrompt(prevText, errs, lang) {
  const fr = lang === 'fr';
  return [
    fr ? 'Ta réponse précédente ne passe pas les contrôles de qualité. Corrige UNIQUEMENT ces problèmes, sans rien changer d’autre, et renvoie le JSON complet :' : 'Your previous answer fails the quality checks. Fix ONLY these problems, change nothing else, and return the complete JSON:',
    ...errs.slice(0, 40).map((e) => `- ${e.where} : ${e.code} — ${e.detail}`),
    '',
    fr ? 'Rappels : aucun chiffre ni signe % hors balise ; aucun mot anglais ; aucun nom propre absent des données du porteur de projet ; phrases complètes ; balises obligatoires présentes.'
      : 'Reminders: no digit or % sign outside a placeholder; no French word; no proper name absent from the founder data; complete sentences; mandatory placeholders present.',
    '',
    fr ? 'Ta réponse précédente :' : 'Your previous answer:',
    prevText,
  ].join('\n');
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
    last = out;
    errs = checkGroup(group, out, facts, points);
    if (!errs.length) return { ok: true, out, attempts, errors: [], usage };
    user = base + '\n\n' + rewritePrompt(JSON.stringify(out), errs, facts.lang);
  }
  return { ok: false, out: last, attempts, errors: errs, usage };
}

async function writePlan({ facts, callModel, deadline }) {
  const points = mandatoryPoints(facts);
  const groups = GROUPS.filter((g) => g.sections.length || (g.risks && facts.risks.length) || (g.hypotheses && facts.confirm.length));
  const results = await Promise.all(groups.map((g) => writeGroup(g, facts, points, callModel, deadline).catch((e) => ({ ok: false, out: null, attempts: 1, errors: [{ where: g.id, code: 'call', detail: e.message }], usage: {} }))));
  const text = { sections: {}, risks: {}, hypotheses: {} };
  const errors = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const attempts = {};
  results.forEach((r, i) => {
    const g = groups[i];
    attempts[g.id] = r.attempts;
    usage.input_tokens += (r.usage && r.usage.input_tokens) || 0;
    usage.output_tokens += (r.usage && r.usage.output_tokens) || 0;
    errors.push(...r.errors.map((e) => ({ group: g.id, ...e })));
    if (r.out) {
      Object.assign(text.sections, r.out.sections || {});
      Object.assign(text.risks, r.out.risks || {});
      Object.assign(text.hypotheses, r.out.hypotheses || {});
    }
  });
  return { ok: errors.length === 0, text, errors, attempts, usage, version: WRITER_VERSION };
}

module.exports = { writePlan, checkFilled, mandatoryPoints, groupPrompt, systemPrompt, checkGroup, parseJson, SECTIONS, GROUPS, WRITER_VERSION, MAX_REWRITES };
