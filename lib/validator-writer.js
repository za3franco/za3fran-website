/* lib/validator-writer.js — Concept Validator v2: the assessment text (Sonnet, parallel calls, checked).
 * Version vw-1.0.0 (28 Oct 2026; method docs/validator-method-v2.md). PURE apart from the injected callModel.
 *
 * The Validator is Za3fran's independent assessment, written TO the founder ("vous"): candid, constructive,
 * concrete. The model writes words only. Figures reach it as {placeholders} (lib/validator-v2.js buildFacts) and it
 * writes no digit; it scores rubric criteria 0–4 with a one-sentence reason; code adds the scores up. Every string
 * goes through lib/bp-checks.js (numbers, language, names, unfinished sentences, markdown); a failing group is sent
 * back with its problems at most MAX_REWRITES times; a group still failing blocks delivery (status qa_failed).
 *
 * writeAssessment({ assessment, context, callModel, deadline }) -> { ok, written, errors, attempts, usage, version }
 */
'use strict';

const { checkText, fill } = require('./bp-checks.js');
const V = require('./validator-v2.js');
const FMT = require('./formats.js');
const BF = require('./bp-facts.js');

const WRITER_VERSION = 'vw-1.0.3';   // vw-1.0.2: targeted hint for numbers in words; a failing action line is dropped as a last resort (list keeps ≥ 1)
                                     // vw-1.0.3: three rewrites; figures spread over paragraphs; a paragraph with too many figures is split at a sentence boundary
const WRITER_VERSION_PREV = 'vw-1.0.1';   // vw-1.0.1: no « deux/trois points » wording (read as a threshold by the checks)
const MAX_REWRITES = 3;
const MAX_FIGURES = 6;
const RISK_CATEGORIES = ['demand', 'competition', 'location', 'pricing', 'operations', 'team', 'supply', 'regulation', 'funding', 'timeline', 'brand'];
const FIELD_KEYS = ['concept_name', 'concept_type', 'cuisine', 'description', 'differentiation', 'city', 'neighbourhood', 'audience', 'budget',
  'ticket', 'covers', 'seats', 'opening_hours', 'competitors', 'market_gap', 'stage', 'timeline', 'additional'];
const PLAN_DAYS = { fr: ['Jours 1 à 7', 'Jours 8 à 14', 'Jours 15 à 21', 'Jours 22 à 30'], en: ['Days 1–7', 'Days 8–14', 'Days 15–21', 'Days 22–30'] };

/** Words that have no place in an independent assessment (sales talk, false certainty, internal tooling). */
const VALIDATOR_BANNED = [/investor[- ]ready/i, /prêt pour les investisseurs/i, /garanti(e|t)? (le )?succès/i, /guaranteed success/i, /\bsans risque\b/i, /\brisk[- ]free\b/i,
  /\bnote (globale|finale)\b/i, /\bsur cent\b/i, /\bout of a hundred\b/i];

/* ------------------------------ blocks ------------------------------ */

function factsBlock(F) { return Object.entries(F).map(([k, f]) => `{${k}} = ${f.v} — ${f.label}`).join('\n'); }

function founderBlock(ctx, lang) {
  const fr = lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const rec = ctx.record;
  const comps = (rec.competitors_list || []).map((c) => c.name + (c.note ? ` (${c.note})` : '')).join(' ; ');
  const svc = (rec.services || []).map((s) => `${FMT.SERVICE_LABELS[s.id][fr ? 'fr' : 'en']} ${BF.dayRange(s.days, fr ? 'fr' : 'en')}`).join(' ; ');
  const rows = [
    [L('Nom du projet', 'Project name'), rec.concept_name], [L('Type d’établissement', 'Venue type'), ctx.typeLabel], [L('Famille de format', 'Format family'), ctx.familyLabel],
    [L('Cuisine', 'Cuisine'), rec.cuisine], [L('Ville', 'City'), rec.city], [L('Quartier', 'District'), rec.neighbourhood],
    [L('Description', 'Description'), rec.description], [L('Différenciation', 'Differentiation'), rec.differentiation],
    [L('Opportunité de marché', 'Market gap'), rec.market_gap], [L('Clientèle visée', 'Target customers'), ctx.audienceText],
    [L('Services', 'Services'), svc], [L('Alcool', 'Alcohol'), rec.alcohol === true ? L('oui', 'yes') : rec.alcohol === false ? L('non', 'no') : ''],
    [L('Ramadan', 'Ramadan'), ctx.ramadanText], [L('Stade du projet', 'Project stage'), ctx.stageText],
    [L('Concurrents cités par le fondateur', 'Competitors named by the founder'), comps || rec.competitors],
    [L('Informations complémentaires', 'Additional information'), rec.additional],
  ].filter(([, v]) => v);
  return rows.map(([k, v]) => `${k} : ${String(v).replace(/\s*\n\s*/g, ' / ')}`).join('\n');
}

function findingsBlock(A, lang) {
  const fr = lang === 'fr';
  const lines = [];
  const fs = A.financial;
  if (A.fin_status !== 'computed') lines.push(fr ? `Volet financier : non calculé (${A.fin_status}).` : `Financials: not computed (${A.fin_status}).`);
  else {
    lines.push(fr ? `Scénario de base : ${A.base_source === 'benchmark' ? 'remplissage habituel du format (plus prudent que les couverts annoncés)' : 'couverts annoncés par le fondateur (plus prudents que le format)'}.`
      : `Base case: ${A.base_source === 'benchmark' ? 'the format’s usual occupancy (more prudent than the stated covers)' : 'the founder’s stated covers (more prudent than the format)'}.`);
    lines.push((fr ? 'Critères financiers (points obtenus / maximum) : ' : 'Financial criteria (points / max): ') + fs.criteria.map((c) => `${c.id} ${c.points}/${c.max}`).join(', '));
  }
  lines.push((fr ? 'Maturité (points / maximum) : ' : 'Readiness (points / max): ') + A.execution.criteria.map((c) => `${c.id} ${c.points}/${c.max}`).join(', '));
  if (A.own_funds_assumed) lines.push(fr ? 'Apports non indiqués : le calcul retient un apport de trente pour cent du besoin (pratique bancaire courante).' : 'Own funds not given: the figures assume thirty per cent of the need (usual bank practice).');
  if (A.alerts.length) {
    lines.push(fr ? 'Alertes financières (déjà affichées dans le rapport, à ne pas répéter comme risques) :' : 'Financial alerts (already shown in the report; do not repeat them as risks):');
    A.alerts.forEach((a) => lines.push(`- [${a.severity}] ${a.title} — ${a.body}`));
  }
  return lines.join('\n');
}

function reassessmentBlock(ctx, lang) {
  if (!ctx.reassessment) return '';
  const fr = lang === 'fr';
  const R = ctx.reassessment;
  const out = [fr ? '=== RÉÉVALUATION ===' : '=== RE-ASSESSMENT ==='];
  out.push(fr ? 'Ce concept a déjà été évalué. Le fondateur a depuis modifié certaines réponses et pris position sur les risques. Les FAITS et les données ci-dessus intègrent déjà ses modifications. Évalue le concept modifié sur ses mérites, sans complaisance : une modification non étayée ne lève pas un risque.'
    : 'This concept was assessed before. The founder has since changed some answers and taken a position on the risks. The FACTS and data above already include the changes. Assess the amended concept on its merits: an unsupported change does not remove a risk.');
  for (const c of R.changes || []) out.push(`- ${c}`);
  for (const d of R.decisions || []) out.push(`- ${d}`);
  if (R.previous_titles && R.previous_titles.length) {
    out.push(fr ? `Risques précédents (garde leur titre s’ils restent valables ; au plus ${R.max_risks} risques) :` : `Previous risks (keep their title when still valid; at most ${R.max_risks} risks):`);
    R.previous_titles.forEach((t) => out.push(`- ${t}`));
  }
  return out.join('\n');
}

function systemPrompt(lang) {
  if (lang === 'fr') {
    return [
      'Tu es un consultant senior en restauration, quinze ans d’exploitation et de développement de concepts au Maroc et dans la région. Za3fran te confie l’évaluation indépendante d’un projet de restaurant ou de café. Tu écris au fondateur, en le vouvoyant, en français clair, direct et bienveillant : tu ne flattes pas, tu ne démolis pas, tu aides à décider.',
      '',
      'Règles absolues :',
      '1. AUCUN CHIFFRE ÉCRIT PAR TOI. Pas de chiffres, pas de signe %, pas de nombre en lettres au-delà de « trois ». Chaque montant, taux, date, durée ou quantité s’écrit par sa balise de la liste FAITS, recopiée exactement avec ses accolades, par exemple {ca_a2}. La balise est remplacée par la valeur exacte, déjà formatée avec son unité : n’ajoute pas l’unité. Une balise ne s’emploie que dans le sens exact de son libellé. Seule exception : « année 1 », « année 2 », « année 3 ». N’écris jamais « deux points » ou « trois points » (lu comme un seuil chiffré) : dis « deux enjeux », « trois éléments ».',
      '2. Aucun fait inventé. Pas de statistique, d’étude, de tendance chiffrée ni de loi. Aucun nom propre (établissement, fournisseur, marque, personne, rue, quartier) absent des données du fondateur ou de la liste NOMS AUTORISÉS. Tu peux t’appuyer sur ton expérience du métier pour raisonner, jamais pour affirmer un fait local précis.',
      '3. Les chiffres sont déjà calculés par le modèle financier de Za3fran : commente-les, explique leurs causes et ce qu’ils impliquent ; ne les recalcule pas et ne les contredis pas.',
      '4. Concret : chaque faiblesse est nommée, expliquée et assortie d’une piste d’action réaliste ; chaque force est précise.',
      '5. Au plus six balises par paragraphe ; paragraphes de deux à cinq phrases ; phrases complètes ; ni titre, ni liste, ni puce, ni mise en forme. Français uniquement ; « EBE » pour l’excédent brut d’exploitation.',
      '6. Réponds uniquement par l’objet JSON demandé.',
    ].join('\n');
  }
  return [
    'You are a senior restaurant consultant with fifteen years of operating and concept development in Morocco and the region. Za3fran asks you for an independent assessment of a restaurant or café project. You write to the founder ("you"), in clear, direct and constructive English: you do not flatter, you do not demolish, you help them decide.',
    '',
    'Absolute rules:',
    '1. YOU WRITE NO NUMBER. No digits, no % sign, no number in words above "three". Every amount, rate, date, duration or quantity is its placeholder from the FACTS list, copied exactly with braces, e.g. {ca_a2}. It is replaced by the exact value, already formatted with its unit: do not add the unit. Use a placeholder only in the exact sense of its label. Only exception: "year 1", "year 2", "year 3". Never write "two points" or "three points" (read as a numeric threshold): say "two issues", "three elements".',
    '2. No invented facts. No statistic, study, numeric trend or law. No proper name (venue, supplier, brand, person, street, district) absent from the founder’s data or the ALLOWED NAMES list. You may reason from trade experience, never assert a precise local fact.',
    '3. The figures are computed by Za3fran’s financial model: comment on them, explain their causes and implications; do not recompute or contradict them.',
    '4. Concrete: every weakness is named, explained and paired with a realistic way forward; every strength is precise.',
    '5. At most six placeholders per paragraph; paragraphs of two to five sentences; complete sentences; no headings, lists, bullets or formatting. English only; "EBITDA".',
    '6. Answer only with the requested JSON object.',
  ].join('\n');
}

/* ------------------------------ groups ------------------------------ */

function rubricSpec(section, lang) {
  return V.RUBRIC[section].map(([id, fr, en]) => `${id} : ${lang === 'fr' ? fr : en}`).join(' ; ');
}

function required(A) {
  const has = (k) => !!A.F[k];
  const req = { s4: [] };
  if (A.fin_status === 'computed') {
    req.s4 = ['ca_a2', 'marge_ebe_a2', 'point_mort_couverts_jour', 'couverts_jour_a2', 'besoin_total'].filter(has);
    if (has('dscr_min_prudent')) req.s4.push('dscr_min_prudent');
  }
  return req;
}

const GROUPS = [
  { id: 'g1', parts: ['summary', 's1'] },
  { id: 'g2', parts: ['s2', 's3'] },
  { id: 'g3', parts: ['s4', 's5'] },
  { id: 'g4', parts: ['risks'] },
];

function groupPrompt(group, A, ctx) {
  const lang = A.lang, fr = lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const p = [];
  p.push(L('=== FAITS (seuls chiffres autorisés, à citer par leur balise) ===', '=== FACTS (the only figures allowed, cited by placeholder) ==='));
  p.push(factsBlock(A.F) || L('(aucun chiffre calculé)', '(no computed figure)'));
  p.push('', L('=== LE PROJET DANS LES MOTS DU FONDATEUR ===', '=== THE PROJECT IN THE FOUNDER’S WORDS ==='), founderBlock(ctx, lang));
  p.push('', L('=== CONSTATS CALCULÉS PAR ZA3FRAN ===', '=== FINDINGS COMPUTED BY ZA3FRAN ==='), findingsBlock(A, lang));
  p.push('', L('=== NOMS AUTORISÉS EN PLUS DES DONNÉES DU FONDATEUR ===', '=== ALLOWED NAMES BESIDES THE FOUNDER’S DATA ==='), ctx.allowedExtra.join(', '));
  const rb = reassessmentBlock(ctx, lang);
  if (rb) p.push('', rb);
  p.push('', L('=== À RÉDIGER ===', '=== TO WRITE ==='));
  const schema = {};
  for (const part of group.parts) {
    if (part === 'summary') {
      p.push(L('[summary] Synthèse : deux paragraphes. (1) Le concept et ce qui en fait la force. (2) Les enjeux qui décideront de sa réussite et la direction à prendre. N’annonce ni note ni verdict : ils sont affichés à côté.',
        '[summary] Summary: two paragraphs. (1) The concept and its main strength. (2) The issues that will decide its success and the way forward. Do not state a score or verdict: they are shown alongside.'));
      schema.summary = ['…', '…'];
    } else if (['s1', 's2', 's3'].includes(part)) {
      const T = {
        s1: L('Concept et positionnement : la clarté de l’offre, sa cohérence (format, prix, clientèle), sa différenciation, la faisabilité opérationnelle de la promesse, son identité.', 'Concept and positioning: clarity of the offer, its coherence (format, price, customers), differentiation, operational deliverability of the promise, identity.'),
        s2: L('Adéquation au marché : la demande de la clientèle visée dans cette ville et ce quartier tels que le fondateur les décrit, l’adéquation des prix, l’emplacement, l’exposition saisonnière, le moment.', 'Market fit: demand from the target customers in this city and district as the founder describes them, price fit, location, seasonal exposure, timing.'),
        s3: L('Concurrence : à partir des concurrents cités par le fondateur seulement (s’il n’en cite aucun, dis-le et explique pourquoi c’est un manque), l’intensité concurrentielle, l’avantage du projet, le positionnement prix, la difficulté à être copié.', 'Competition: from the competitors the founder named only (if none, say so and why it is a gap), competitive intensity, the project’s edge, price positioning, how hard it is to copy.'),
      }[part];
      p.push(`[${part}] ${T}`);
      p.push(L(`Écris deux ou trois paragraphes d’analyse, puis note chaque critère de 0 (rédhibitoire) à 4 (excellent) avec une phrase de justification. Critères : ${rubricSpec(part, lang)}.`,
        `Write two or three paragraphs of analysis, then score each criterion from 0 (deal-breaker) to 4 (excellent) with a one-sentence reason. Criteria: ${rubricSpec(part, lang)}.`));
      p.push(L('Donne aussi « force » (une phrase), « manque » (une phrase) et « cette_semaine » : une ou deux actions précises faisables en sept jours par le fondateur seul.', 'Also give "force" (one sentence: main strength), "manque" (one sentence: main gap) and "cette_semaine": one or two precise actions the founder can do alone within seven days.'));
      schema[part] = { paragraphes: ['…'], criteres: Object.fromEntries(V.RUBRIC[part].map(([id]) => [id, { note: 0, raison: '…' }])), force: '…', manque: '…', cette_semaine: ['…'] };
    } else if (part === 's4') {
      p.push(A.fin_status === 'computed'
        ? L(`[s4] Viabilité financière : deux ou trois paragraphes qui expliquent ce que disent les chiffres — comment se forme le chiffre d’affaires, ce qui pèse sur la marge, la marge de sécurité entre le point mort et la fréquentation attendue, le besoin de financement et la capacité de remboursement. Balises obligatoires : ${required(A).s4.map((k) => `{${k}}`).join(', ')}, réparties sur les paragraphes (quatre balises au plus par paragraphe). Puis « cette_semaine » (une ou deux actions).`,
          `[s4] Financial viability: two or three paragraphs explaining what the figures say — how revenue is built, what weighs on the margin, the safety margin between break-even and expected trade, the funding need and debt-service capacity. Mandatory placeholders: ${required(A).s4.map((k) => `{${k}}`).join(', ')}, spread over the paragraphs (four placeholders at most per paragraph). Then "cette_semaine" (one or two actions).`)
        : L('[s4] Viabilité financière : un paragraphe qui explique pourquoi le volet financier n’est pas calculé (voir les constats) et ce que le fondateur doit réunir pour le chiffrer. Puis « cette_semaine ».', '[s4] Financial viability: one paragraph explaining why the financials are not computed (see findings) and what the founder must gather to cost the project. Then "cette_semaine".'));
      schema.s4 = { paragraphes: ['…'], cette_semaine: ['…'] };
    } else if (part === 's5') {
      p.push(L('[s5] Maturité du projet : un ou deux paragraphes sur l’apport, le calendrier au regard du stade du projet et les informations qui manquent encore pour décider. Puis « cette_semaine ».', '[s5] Execution readiness: one or two paragraphs on own funds, the timeline against the project stage and the information still missing to decide. Then "cette_semaine".'));
      schema.s5 = { paragraphes: ['…'], cette_semaine: ['…'] };
    } else if (part === 'risks') {
      const max = ctx.reassessment ? ctx.reassessment.max_risks : 5;
      p.push(L(`[risques] Entre trois et ${max} risques NON FINANCIERS (les alertes financières sont déjà traitées), du plus important au moins important. Pour chacun : « titre » (court), « categorie » parmi ${RISK_CATEGORIES.join(', ')}, « probabilite » (HIGH, MEDIUM ou LOW), « impact » (CRITICAL, HIGH ou MEDIUM), « champs » : les réponses du questionnaire que ce risque concerne, parmi ${FIELD_KEYS.join(', ')} (une à quatre), « analyse » (deux ou trois phrases) et « parade » (une ou deux phrases d’action concrète).`,
        `[risks] Between three and ${max} NON-FINANCIAL risks (financial alerts are already covered), most important first. For each: "titre" (short), "categorie" among ${RISK_CATEGORIES.join(', ')}, "probabilite" (HIGH, MEDIUM or LOW), "impact" (CRITICAL, HIGH or MEDIUM), "champs": the questionnaire answers this risk concerns, among ${FIELD_KEYS.join(', ')} (one to four), "analyse" (two or three sentences) and "parade" (one or two sentences of concrete action).`));
      p.push(L('[recommandations] Exactement cinq recommandations stratégiques, de la plus importante à la moins importante : « titre » et « texte » (deux à quatre phrases : quoi faire, pourquoi, comment commencer).', '[recommandations] Exactly five strategic recommendations, most important first: "titre" and "texte" (two to four sentences: what, why, how to start).'));
      p.push(L(`[plan_30_jours] Quatre étapes (${PLAN_DAYS.fr.join(', ')}), une à trois actions chacune, dans l’ordre où le fondateur doit les mener.`, `[plan_30_jours] Four steps (${PLAN_DAYS.en.join(', ')}), one to three actions each, in the order the founder should take them.`));
      p.push(L('[risques_cette_semaine] Une ou deux actions de la semaine sur les risques.', '[risques_cette_semaine] One or two actions this week on the risks.'));
      schema.risques = [{ titre: '…', categorie: 'demand', probabilite: 'MEDIUM', impact: 'HIGH', champs: ['location'], analyse: '…', parade: '…' }];
      schema.recommandations = [{ titre: '…', texte: '…' }];
      schema.plan_30_jours = [['…'], ['…'], ['…'], ['…']];
      schema.risques_cette_semaine = ['…'];
    }
  }
  p.push('', L('=== FORMAT DE RÉPONSE ===', '=== ANSWER FORMAT ==='));
  p.push(L('Réponds uniquement par un objet JSON valide de cette forme :', 'Answer only with a valid JSON object of this shape:'));
  p.push(JSON.stringify(schema, null, 1));
  return p.join('\n');
}

/* ------------------------------ checking ------------------------------ */

function parseJson(text) {
  const s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in the answer');
  return JSON.parse(s.slice(a, b + 1));
}

function checkGroup(group, out, A, ctx) {
  const errs = [];
  const keys = new Set(Object.keys(A.F));
  const c = { lang: A.lang, keys, names: ctx.names, F: A.F, banned: VALIDATOR_BANNED, maxFigures: MAX_FIGURES };
  const short = Object.assign({}, c, { maxFigures: 3 });
  const text = (where, t, ctx2 = c) => checkText(t, ctx2).forEach((e) => errs.push({ where, ...e }));
  const line = (where, t) => text(where, /[.!?»)]$/.test(String(t || '').trim()) ? t : String(t || '').trim() + '.', short);
  const paras = (where, arr, min, max) => {
    if (!Array.isArray(arr) || arr.length < min) { errs.push({ where, code: 'missing', detail: `at least ${min} paragraph(s)` }); return; }
    if (arr.length > max) errs.push({ where, code: 'length', detail: `${arr.length} paragraphs, at most ${max}` });
    arr.forEach((x, i) => text(`${where}[${i}]`, x));
  };
  const actions = (where, arr, min, max) => {
    if (!Array.isArray(arr) || arr.length < min || arr.length > max) { errs.push({ where, code: 'missing', detail: `${min} to ${max} actions` }); return; }
    arr.forEach((x, i) => line(`${where}[${i}]`, x));
  };
  for (const part of group.parts) {
    const o = out && out[part === 'risks' ? 'risques' : part];
    if (part === 'summary') { paras('summary', out && out.summary, 2, 3); continue; }
    if (['s1', 's2', 's3'].includes(part)) {
      if (!o) { errs.push({ where: part, code: 'missing', detail: 'section missing' }); continue; }
      paras(`${part}.paragraphes`, o.paragraphes, 2, 4);
      for (const [id] of V.RUBRIC[part]) {
        const x = o.criteres && o.criteres[id];
        if (!x || !Number.isInteger(x.note) || x.note < 0 || x.note > 4) { errs.push({ where: `${part}.${id}`, code: 'score', detail: 'note must be an integer 0-4' }); continue; }
        line(`${part}.${id}.raison`, x.raison);
      }
      line(`${part}.force`, o.force); line(`${part}.manque`, o.manque);
      actions(`${part}.cette_semaine`, o.cette_semaine, 1, 2);
      continue;
    }
    if (part === 's4' || part === 's5') {
      if (!o) { errs.push({ where: part, code: 'missing', detail: 'section missing' }); continue; }
      paras(`${part}.paragraphes`, o.paragraphes, 1, 3);
      actions(`${part}.cette_semaine`, o.cette_semaine, 1, 2);
      if (part === 's4') {
        const all = (o.paragraphes || []).join('\n');
        for (const k of required(A).s4) if (!all.includes(`{${k}}`)) errs.push({ where: 's4', code: 'missing', detail: `must cite {${k}}` });
      }
      continue;
    }
    if (part === 'risks') {
      const max = ctx.reassessment ? ctx.reassessment.max_risks : 5;
      const rs = out && out.risques;
      if (!Array.isArray(rs) || rs.length < Math.min(3, max) || rs.length > max) errs.push({ where: 'risques', code: 'missing', detail: `between ${Math.min(3, max)} and ${max} risks` });
      (rs || []).forEach((r, i) => {
        const w = `risques[${i}]`;
        line(`${w}.titre`, r.titre); text(`${w}.analyse`, r.analyse); text(`${w}.parade`, r.parade);
        if (!RISK_CATEGORIES.includes(r.categorie)) errs.push({ where: w, code: 'enum', detail: `categorie must be one of ${RISK_CATEGORIES.join(', ')}` });
        if (!['HIGH', 'MEDIUM', 'LOW'].includes(r.probabilite)) errs.push({ where: w, code: 'enum', detail: 'probabilite HIGH|MEDIUM|LOW' });
        if (!['CRITICAL', 'HIGH', 'MEDIUM'].includes(r.impact)) errs.push({ where: w, code: 'enum', detail: 'impact CRITICAL|HIGH|MEDIUM' });
        if (!Array.isArray(r.champs) || !r.champs.length || r.champs.some((f) => !FIELD_KEYS.includes(f))) errs.push({ where: w, code: 'enum', detail: `champs: one to four of ${FIELD_KEYS.join(', ')}` });
      });
      const recs = out && out.recommandations;
      if (!Array.isArray(recs) || recs.length !== 5) errs.push({ where: 'recommandations', code: 'missing', detail: 'exactly five recommendations' });
      (recs || []).forEach((r, i) => { line(`recommandations[${i}].titre`, r.titre); text(`recommandations[${i}].texte`, r.texte); });
      const plan = out && out.plan_30_jours;
      if (!Array.isArray(plan) || plan.length !== 4) errs.push({ where: 'plan_30_jours', code: 'missing', detail: 'four steps' });
      (plan || []).forEach((step, i) => actions(`plan_30_jours[${i}]`, step, 1, 3));
      actions('risques_cette_semaine', out && out.risques_cette_semaine, 1, 2);
    }
  }
  return errs;
}

function rewritePrompt(prevText, errs, lang) {
  const fr = lang === 'fr';
  return [
    fr ? 'Ta réponse précédente ne passe pas les contrôles de qualité. Corrige UNIQUEMENT ces problèmes, sans rien changer d’autre, et renvoie le JSON complet :' : 'Your previous answer fails the quality checks. Fix ONLY these problems, change nothing else, and return the complete JSON:',
    ...errs.slice(0, 40).map((e) => `- ${e.where} : ${e.code} — ${e.detail}` + ((e.code === 'spelled' || e.code === 'digit')
      ? (fr ? ' → supprime cette quantité ou remplace-la par « plusieurs », « quelques », « chaque » ; aucun nombre, ni en chiffres ni en lettres.' : ' → remove this quantity or replace it with "several", "a few", "each"; no number, in digits or in words.') : '')),
    '',
    fr ? 'Rappels : aucun chiffre ni signe % hors balise (écris « trois » plutôt que le chiffre, et au-delà reformule sans nombre) ; jamais « deux points » ni « trois points » ; aucun mot anglais ; aucun nom propre absent des données ; phrases complètes.'
      : 'Reminders: no digit or % sign outside a placeholder (write "three" rather than the digit, and above that rephrase without a number); no French word; no proper name absent from the data; complete sentences.',
    '', fr ? 'Ta réponse précédente :' : 'Your previous answer:', prevText,
  ].join('\n');
}

/**
 * Last resort after the rewrites, adding nothing to the report:
 *  - an action line still failing (cette_semaine, plan_30_jours, risques_cette_semaine) is dropped, as long as its list
 *    keeps at least one action;
 *  - a paragraph with too many figures is split in two at the sentence boundary that best balances its placeholders,
 *    as long as the section stays within its paragraph limit.
 * Any other error (analysis wording, scores, risks, names) is never repaired. The whole group is re-checked after.
 */
const ACTION_PATH = /^((?:s[1-5]\.cette_semaine)|risques_cette_semaine|plan_30_jours\[(\d+)\])\[(\d+)\]$/;
const PARA_PATH = /^(summary|s[1-5]\.paragraphes)\[(\d+)\]$/;
const PARA_MAX = { summary: 3, 's1.paragraphes': 4, 's2.paragraphes': 4, 's3.paragraphes': 4, 's4.paragraphes': 3, 's5.paragraphes': 3 };
const PH_RE = /\{[a-z0-9_]+\}/g;
function splitParagraph(text, max) {
  const parts = String(text).split(/(?<=[.!?»])\s+(?=[A-ZÀ-ÝÉ«])/u);
  if (parts.length < 2) return null;
  const counts = parts.map((x) => (x.match(PH_RE) || []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  let best = null, left = 0;
  for (let i = 1; i < parts.length; i++) {
    left += counts[i - 1];
    if (left > max || total - left > max) continue;
    const gap = Math.abs(total / 2 - left);
    if (!best || gap < best.gap) best = { i, gap };
  }
  return best ? [parts.slice(0, best.i).join(' '), parts.slice(best.i).join(' ')] : null;
}
function repairGroup(group, out, errs) {
  const repairable = (e) => ACTION_PATH.test(e.where) || (e.code === 'too_many_figures' && PARA_PATH.test(e.where));
  if (!errs.length || !errs.every(repairable)) return null;
  const copy = JSON.parse(JSON.stringify(out));
  const repaired = [];
  const listOf = (path, planIdx) => {
    if (planIdx != null) return copy.plan_30_jours && copy.plan_30_jours[+planIdx];
    if (path === 'risques_cette_semaine') return copy.risques_cette_semaine;
    if (path === 'summary') return copy.summary;
    const [sec, key] = path.split('.'); return copy[sec] && copy[sec][key || 'cette_semaine'];
  };
  // paragraphs first, highest index first so earlier indexes stay valid
  const paras = errs.filter((e) => PARA_PATH.test(e.where)).map((e) => { const m = PARA_PATH.exec(e.where); return { key: m[1], idx: +m[2] }; })
    .sort((a, b) => (a.key === b.key ? b.idx - a.idx : a.key < b.key ? -1 : 1));
  for (const { key, idx } of paras) {
    const arr = listOf(key);
    if (!Array.isArray(arr) || arr.length + 1 > PARA_MAX[key]) return null;
    const two = splitParagraph(arr[idx], MAX_FIGURES);
    if (!two) return null;
    arr.splice(idx, 1, two[0], two[1]);
    repaired.push({ where: `${key}[${idx}]`, action: 'split' });
  }
  const drop = new Map();
  for (const e of errs.filter((x) => ACTION_PATH.test(x.where))) { const m = ACTION_PATH.exec(e.where); if (!drop.has(m[1])) drop.set(m[1], { planIdx: m[2], idx: new Set() }); drop.get(m[1]).idx.add(+m[3]); }
  for (const [key, { planIdx, idx }] of drop) {
    const arr = listOf(key, planIdx);
    if (!Array.isArray(arr) || arr.length - idx.size < 1) return null;
    [...idx].sort((a, b) => b - a).forEach((i) => repaired.push({ where: `${key}[${i}]`, action: 'dropped', text: arr.splice(i, 1)[0] }));
  }
  return { out: copy, repaired };
}
function pruneActions(group, out, errs, A, ctx) {
  const r = repairGroup(group, out, errs);
  if (!r || checkGroup(group, r.out, A, ctx).length) return null;
  return { out: r.out, pruned: r.repaired };
}

/* ------------------------------ main ------------------------------ */

async function writeGroup(group, A, ctx, callModel, deadline) {
  const system = systemPrompt(A.lang);
  const base = groupPrompt(group, A, ctx);
  let user = base, last = null, errs = [], attempts = 0;
  const usage = { input_tokens: 0, output_tokens: 0 };
  for (let i = 0; i <= MAX_REWRITES; i++) {
    if (i > 0 && deadline && Date.now() > deadline) break;
    attempts++;
    const r = await callModel(system, user);
    usage.input_tokens += (r.usage && r.usage.input_tokens) || 0;
    usage.output_tokens += (r.usage && r.usage.output_tokens) || 0;
    let out;
    try { out = parseJson(r.text); } catch (e) { errs = [{ where: group.id, code: 'json', detail: e.message }]; user = base + '\n\n' + (A.lang === 'fr' ? 'Réponds uniquement par l’objet JSON demandé, valide et complet.' : 'Answer only with the requested JSON object, valid and complete.'); continue; }
    last = out;
    errs = checkGroup(group, out, A, ctx);
    if (!errs.length) return { ok: true, out, attempts, errors: [], usage };
    user = base + '\n\n' + rewritePrompt(JSON.stringify(out), errs, A.lang);
  }
  const pr = last ? pruneActions(group, last, errs, A, ctx) : null;
  if (pr) return { ok: true, out: pr.out, attempts, errors: [], usage, pruned: pr.pruned };
  return { ok: false, out: last, attempts, errors: errs, usage };
}

/** Writer output (French keys from the model) -> the neutral shape lib/validator-v2.js finalize/reportJson expect. */
function assemble(parts, lang) {
  const w = { sections: {}, rubric: {}, strength: {}, gap: {}, this_week: {}, risks: [], recommendations: [], action_plan: [] };
  const p = Object.assign({}, ...parts.filter(Boolean));
  if (p.summary) w.sections.summary = p.summary;
  for (const s of ['s1', 's2', 's3']) {
    const o = p[s]; if (!o) continue;
    w.sections[s] = o.paragraphes || [];
    w.rubric[s] = Object.fromEntries(Object.entries(o.criteres || {}).map(([k, x]) => [k, { score: x.note, reason: x.raison }]));
    w.strength[s] = o.force; w.gap[s] = o.manque; w.this_week[s] = o.cette_semaine || [];
  }
  for (const s of ['s4', 's5']) { const o = p[s]; if (!o) continue; w.sections[s] = o.paragraphes || []; w.this_week[s] = o.cette_semaine || []; }
  w.risks = (p.risques || []).map((r) => ({ title: r.titre, category: r.categorie, probability: r.probabilite, impact: r.impact, fields: (r.champs || []).filter((f) => FIELD_KEYS.includes(f)).slice(0, 4), analysis: r.analyse, mitigation: r.parade }));
  w.recommendations = (p.recommandations || []).map((r) => ({ title: r.titre, body: r.texte }));
  w.action_plan = (p.plan_30_jours || []).map((actions, i) => ({ days: PLAN_DAYS[lang === 'fr' ? 'fr' : 'en'][i], actions }));
  w.this_week.s6 = p.risques_cette_semaine || [];
  return w;
}

/**
 * @param assessment lib/validator-v2.js assess() output
 * @param context    { record, typeLabel, familyLabel, audienceText, ramadanText, stageText, names: Set, allowedExtra: string[], reassessment? }
 */
async function writeAssessment({ assessment, context, callModel, deadline }) {
  const results = await Promise.all(GROUPS.map((g) => writeGroup(g, assessment, context, callModel, deadline)
    .catch((e) => ({ ok: false, out: null, attempts: 1, errors: [{ where: g.id, code: 'call', detail: e.message }], usage: {} }))));
  const errors = [], attempts = {}, pruned = [], usage = { input_tokens: 0, output_tokens: 0 };
  results.forEach((r, i) => {
    attempts[GROUPS[i].id] = r.attempts;
    if (r.pruned) pruned.push(...r.pruned.map((x) => ({ group: GROUPS[i].id, ...x })));
    usage.input_tokens += (r.usage && r.usage.input_tokens) || 0;
    usage.output_tokens += (r.usage && r.usage.output_tokens) || 0;
    errors.push(...r.errors.map((e) => ({ group: GROUPS[i].id, ...e })));
  });
  const written = assemble(results.map((r) => r.out), assessment.lang);
  return { ok: errors.length === 0, written, errors, attempts, pruned, usage, version: WRITER_VERSION };
}

module.exports = { WRITER_VERSION, GROUPS, pruneActions, RISK_CATEGORIES, FIELD_KEYS, PLAN_DAYS, VALIDATOR_BANNED, writeAssessment, groupPrompt, systemPrompt, checkGroup, assemble, parseJson, required, fill };
