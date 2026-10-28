/* A deterministic stand-in for the writing model (tests only): answers each Validator v2 writing group with text
 * that follows the rules (placeholders for every figure, no proper name outside the data, French). */
'use strict';

const RUBRIC = {
  s1: ['clarity', 'coherence', 'differentiation', 'deliverability', 'story'],
  s2: ['demand', 'price_fit', 'location', 'seasonality', 'timing'],
  s3: ['knowledge', 'intensity', 'edge', 'price_position', 'copy'],
};

function rubric(ids, n) { return Object.fromEntries(ids.map((id) => [id, { note: n, raison: 'Le critère est tenu de façon satisfaisante au vu des réponses fournies.' }])); }
function section(ids, n) {
  return {
    paragraphes: ['Le concept repose sur une offre lisible et une ambiance de partage qui parlent à une clientèle locale exigeante.', 'La cohérence entre le format, les prix et la clientèle visée doit encore être éprouvée sur le terrain avant d’engager les fonds.'],
    criteres: rubric(ids, n), force: 'Une offre claire et facile à raconter.', manque: 'Une validation de la demande sur le terrain.',
    cette_semaine: ['Rencontrer trois clients types et noter leurs attentes précises.'],
  };
}

function answer(user, opts = {}) {
  const n = opts.note == null ? 3 : opts.note;
  const out = {};
  if (user.includes('[summary]')) out.summary = ['Le projet propose une offre claire dans un quartier que vous connaissez bien.', 'Sa réussite dépendra de la fréquentation réelle, de la maîtrise des coûts et du financement, qu’il faut sécuriser avant de signer.'];
  for (const s of ['s1', 's2', 's3']) if (user.includes(`[${s}]`)) out[s] = section(RUBRIC[s], n);
  if (user.includes('[s4]')) {
    const req = (user.match(/Balises obligatoires : ([^.]*)\./) || [, ''])[1];
    const keys = (req.match(/\{[a-z0-9_]+\}/g) || []);
    const sentences = keys.length
      ? [`Le chiffre d’affaires attendu atteint ${keys[0] || ''} en année 2 et la marge reste solide à ${keys[1] || ''}.`, `Le point mort se situe à ${keys[2] || ''} couverts par jour, contre ${keys[3] || ''} attendus, et le besoin total s’élève à ${keys[4] || ''}.`, ...(keys[5] ? [`Dans le scénario prudent, la couverture de l’annuité descend à ${keys[5]} l’année la plus faible.`] : [])]
      : ['Le volet financier ne peut pas être calculé pour ce format à ce stade.'];
    out.s4 = { paragraphes: sentences, cette_semaine: ['Demander deux propositions de financement à votre banque.'] };
  }
  if (user.includes('[s5]')) out.s5 = { paragraphes: ['Votre apport et votre calendrier donnent une base sérieuse, à compléter par une étude des concurrents.'], cette_semaine: ['Lister les établissements comparables du quartier.'] };
  if (user.includes('[risques]') || user.includes('[risks]')) {
    out.risques = [
      { titre: 'Demande du midi incertaine', categorie: 'demand', probabilite: 'MEDIUM', impact: 'HIGH', champs: ['opening_hours', 'audience'], analyse: 'La clientèle de bureau du midi reste à confirmer sur le terrain.', parade: 'Compter les passages aux heures de déjeuner pendant deux semaines.' },
      { titre: 'Recrutement de la cuisine', categorie: 'team', probabilite: 'MEDIUM', impact: 'MEDIUM', champs: ['cuisine'], analyse: 'Une cuisine de bistro exige un chef capable de tenir la qualité.', parade: 'Identifier deux profils de chef avant de signer le bail.' },
      { titre: 'Approvisionnement en vins', categorie: 'supply', probabilite: 'LOW', impact: 'MEDIUM', champs: ['description'], analyse: 'Une large carte au verre dépend de fournisseurs réguliers.', parade: 'Sécuriser deux fournisseurs et leurs conditions.' },
    ];
    out.recommandations = [1, 2, 3, 4, 5].map(() => ({ titre: 'Tester la demande', texte: 'Organiser des dégustations pour mesurer l’intérêt réel avant d’engager les travaux.' }));
    out.plan_30_jours = [['Visiter le quartier aux heures clés.'], ['Rencontrer la banque.'], ['Consulter deux architectes.'], ['Finaliser le budget détaillé.']];
    out.risques_cette_semaine = ['Lister les risques et leur parade.'];
  }
  return out;
}

/** callModel(system, user) -> { text, usage } ; opts.bad = true inserts a digit once per group (tests the rewrite loop). */
function mockModel(opts = {}) {
  const seen = new Set();
  return async (system, user) => {
    const out = answer(user, opts);
    const key = Object.keys(out).join(',');
    if (opts.bad && !seen.has(key)) { seen.add(key); const k = Object.keys(out)[0]; if (Array.isArray(out[k]) && typeof out[k][0] === 'string') out[k][0] += ' Il y a 12 places.'; else if (Array.isArray(out[k])) out[k][0].analyse += ' Il y a 12 places.'; else if (out[k].paragraphes) out[k].paragraphes[0] += ' Il y a 12 places.'; }
    return { text: JSON.stringify(out), usage: { input_tokens: 1000, output_tokens: 500 } };
  };
}

module.exports = { mockModel, answer };
