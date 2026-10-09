/* Canaille readiness-review register and effective concept, live on 9 Oct 2026
 * (validator report rpt_1789307374819_xnkk7q v4, active crr_decisions, active amendment budget -> 1,700,000).
 * Shape: lib/crr-downstream.js loadDownstreamContext().register / conceptValues. Validator mitigation
 * text is kept here only to prove the plan does not use it (it names banks and calls a supplier "confirmed").
 */
'use strict';
const concept = {
  concept_name: 'Canaille', concept_type: 'other', cuisine: 'Cuisine franchouillarde et paillarde/gourmande',
  description: "Bistro bar à vins: \n- 50 à 60 références de vins toutes servies au verre grâce au Système Coravin\n- cuisine franchouillarde simple et sans prétention, chaleureuse et réconfortante, suivant les saisons et abordable\n- ambiance cosy, chaleureuse, de partage, sans prétention",
  differentiation: "- bar à vin au verre\n- cuisine franchouillarde abordable avec certains plats servis à table directement par le serveur (ex: aligot dans une grande poele servie directement sur l'assiette du client à table)\n- des prix qui permettent de passer un bon moment plus régulièrement sans prévoir de budget sortie en quelques sorte, un repair de copains et de bonne ambiance",
  city: 'Casablanca', neighbourhood: '', audience: ['locals', 'expats', 'corporate', 'affluent_locals'],
  audience_text: 'Résidents locaux, expatriés, clientèle d’affaires, clientèle locale aisée',
  budget: '1700000', ticket: '450', covers: '100', seats: '50',
  opening_hours: 'Lunch tuesday to friday, dinner wednesday to saturday', competitors: 'Je ne sais pas',
  market_gap: "accès à des vins très premium mais au verre pour se faire plaisir sans avoir à payer la bouteille\naccès à des recettes et un type de cuisine restant rare encore (vs les classiques cuisine française qu'on trouve un peu partout que tout le monde fait)",
  stage: 'idea', timeline: 'over_1y',
  additional: "La restauration est mon métier, je maitrise le pilotage opérationnel et financier de tels business. \nBesoin de plus d'infos sur la licence d'alcool, ça reste un point où je suis ignorant",
};
const D = (type, rationale) => ({ type, rationale, pre_conditions: [] });
const register = [
  { risk_key: 'risk_f5084f0030', category: 'risk', title: 'Alcohol license acquisition cost or availability', probability: 'HIGH', impact: 'CRITICAL', fields: null,
    validator_mitigation: 'Pre-negotiated cap 350k MAD; attorney due diligence; 3-5 property candidates with geographic fallback options; decision gate at M0 milestone',
    decision: D('risk_accepted', 'Complete legal due diligence on target property license status BEFORE any other commitments. Engage specialized attorney immediately. Build contingency list of 3–5 secondary properties.'), plan_changes: [] },
  { risk_key: 'risk_83275e0574', category: 'risk', title: 'Lunch service adoption and ticket average below projection', probability: 'HIGH', impact: 'HIGH', fields: null,
    validator_mitigation: 'Separate lunch/dinner ticket modeling; fixed-price formula testing at M4; wine upsell training; reassess menu composition if lunch average below 280 MAD sustained',
    decision: D('risk_accepted', 'Ticket 450 MAD repose sur hypothèse 60%+ couverts consomment vin. Sessions test valideront adoption réelle. Souplesse menu et prix pour adapter si nécessaire M1-M3. Communication pédagogique sur vins pour éducation clientèle.'), plan_changes: [] },
  { risk_key: 'risk_3ad5a79be2', category: 'risk', title: 'Chef recruitment or early turn-over', probability: 'MEDIUM', impact: 'HIGH', fields: null,
    validator_mitigation: 'Recruitment starts M-6 minimum; performance bonus structure; non-compete + 2-month notice period in contract; succession plan for sous-chef identification',
    decision: D('risk_accepted', 'Recrutement dès M-2 avant ouverture. Chef et second doivent valider menu et coûts matière. Serveurs formés à service vin et storytelling plats. Budget formation 20-30k MAD. Suivi KPI service qualité semaines 1-12.'), plan_changes: [] },
  { risk_key: 'risk_e352befe15', category: 'risk', title: 'Coravin adoption resistance or technical failure', probability: 'MEDIUM', impact: 'HIGH', fields: null,
    validator_mitigation: 'Staff training with importateur; test sessions pre-opening; pédagogic menu descriptions; maintenance contract with spare parts stock; fallback to traditional glass service if system underperforms',
    decision: D('facts_corrected', "Ce n'est pas un risque, l'équipement est durable, la formation est facile, et c'est un petit équipements non technique qui ne requiert pas de remplacement de pièces, qui se remplace à coût peu élevé."), plan_changes: [] },
  { risk_key: 'risk_f63a99c7c8', category: 'risk', title: 'French ingredient supply chain disruption', probability: 'MEDIUM', impact: 'MEDIUM', fields: null,
    validator_mitigation: 'Meniat/Gauthier partnership confirmed; secondary supplier identified; menu flexibility to substitute local quality equivalents',
    decision: D('risk_accepted', 'Opérateur accepte risque. Mitigation : pilotage volumes, anticipation achats, fournisseur structuré (Meniat/Gauthier identifié). Débat mensuel avec fournisseur sur prix/quantités. Clause prix fixe court terme (30j) dans commandes.'), plan_changes: [] },
  { risk_key: 'risk_a99a45df4d', category: 'risk', title: 'Competitive preemption or rapid copycat entry', probability: 'MEDIUM', impact: 'MEDIUM', fields: null,
    validator_mitigation: 'OMPIC mark filing immediate (1.8k MAD class 43); execution speed on service quality; community building via social media',
    decision: D('risk_accepted', "Opérateur accepte risque. Réponse : exécution irréprochable à l'ouverture, pas précipitation. Protection marque OMPIC immédiate. Activation pré-ouverture forte pour créer attente et noyau early adopters."), plan_changes: [] },
  { risk_key: 'alert_c9a5486517', category: 'financial_alert', title: 'Alcohol License Acquisition Cost Risk', severity: 'HIGH', fields: ['budget'],
    detail: 'Operator cap at 350k MAD is disciplined but restrictive. Prime area licenses trade 400k-800k MAD.',
    decision: D('risk_accepted', 'Reprise strategy is correct but license cost varies widely (200–800k MAD depending on quartier and existing operational status). Budget of 1.5M is only viable if reprise stays below 350k MAD, which severely constrains geographic options in Casablanca\'s prime zones.'), plan_changes: [] },
  { risk_key: 'alert_b0178376ae', category: 'financial_alert', title: 'Operating Cash Reserve Insufficient', severity: 'MEDIUM', fields: ['budget'],
    detail: 'Budget of 1.7M MAD allows 3-4 months reserve. If fixed investment costs exceed 1.1M MAD, open credit line conversation with BMCE or Attijariwafa.',
    decision: D('facts_corrected', "Cela suffira d'après mes 1ères recherches et les 1ers contacts pris."), plan_changes: [{ label: 'Investment budget', from: 'USD 50,000–150,000', to: '1,700,000 MAD' }] },
  { risk_key: 'alert_0836306ce5', category: 'financial_alert', title: 'Ticket Average Sensitivity', severity: 'MEDIUM', fields: ['ticket', 'covers'],
    detail: '450 MAD average is defensible for dinner but ambitious for lunch.',
    decision: D('facts_corrected', "Je pense que le ticket moyen à 450 MAD est très safe, le ticket moyen des restaurants à licence dans Casablanca, d'expérience, s'élève à 550-850 MAD sur le service du dîner, une carte de vins au verre permettra certainement d'augmenter le ticket moyen déjeuner en vente additionnel, pour la clientèle qui ne se permettra pas une bouteille à ce créneau là."), plan_changes: [] },
];
module.exports = { concept, register };
