/* Canaille concept record (cr-1.0.0), 28 Oct 2026: the effective concept (submission + the active budget amendment)
 * plus the structured fields from the founder's decided BP intake (services and tickets, premises, alcohol, Ramadan,
 * opening, funding). Covers: the founder's original claim (100 per day), which the Validator tests. Own funds =
 * the equity in the decided intake (founder 400,000 + investor partner 1,319,000); budget = equity + loan 1,500,000. */
'use strict';
module.exports = {
  schema: 'cr-1.0.0',
  concept_name: 'Canaille', concept_type: 'other', format_family: 'bistro_wine_bar',
  cuisine: 'Cuisine franchouillarde et paillarde/gourmande',
  description: 'Bistro bar à vins: \n- 50 à 60 références de vins toutes servies au verre grâce au Système Coravin\n- cuisine franchouillarde simple et sans prétention, chaleureuse et réconfortante, suivant les saisons et abordable\n- ambiance cosy, chaleureuse, de partage, sans prétention',
  differentiation: '- bar à vin au verre\n- cuisine franchouillarde abordable avec certains plats servis à table directement par le serveur',
  city: 'Casablanca', neighbourhood: 'Gauthier',
  audience: ['locals', 'expats', 'corporate', 'affluent_locals'],
  budget: '1700000', ticket: '450', covers: '100', seats: '50',
  opening_hours: 'Lunch tuesday to friday, dinner wednesday to saturday',
  competitors: 'Je ne sais pas', market_gap: '', stage: 'idea', timeline: 'over_1y', additional: '',
  services: [{ id: 'lunch', days: [1, 2, 3, 4, 5], ticket: 350 }, { id: 'dinner', days: [3, 4, 5, 6], ticket: 650 }],
  surface_m2: 200, rent_monthly: 30000, alcohol: true, ramadan: 'closed', opening: '2027-10',
  budget_amount: 3219000, own_funds: 1719000, founder_works: true,
  language: 'fr', currency: 'MAD',
};
