/* Concept Studio — 8 FICTITIOUS founder profiles for lot 1 (12 Nov 2026). Invented people and figures, used only to
 * exercise routing, selection and the engine; none of these figures enters the Brain or a deliverable.
 * One per profile P1–P7, plus « un bar à vin comme Canaille » (P2). `m4` holds what the founder would answer in the
 * deepening steps (lot 3 asks it in cards); `choice` is the direction he would keep when it is not the first one. */
'use strict';
const WEEK = [0, 1, 2, 3, 4, 5, 6], MON_SAT = [1, 2, 3, 4, 5, 6], TUE_SAT = [2, 3, 4, 5, 6];

module.exports = [
  {
    key: 'p1-salma', label: 'Salma — aucune idée, envie d’un lieu de matin',
    entry: { idea: 'none', place: 'none', budget: 'amount', experience: 'none', role: 'operate', city: 'Casablanca' },
    founder: { experience: 'none', skill: null, role: 'operate', time: 'full', risk: 'prudent', budget_amount: 1200000, own_funds: 400000,
      desires: { tags: ['cafe', 'sucre', 'brunch'], moments: ['breakfast', 'lunch'] }, constraints: {} },
    m4: { services: [{ id: 'breakfast', days: WEEK, ticket: 65 }, { id: 'lunch', days: WEEK, ticket: 140 }], seats: 35, surface_m2: 110, alcohol: false, ramadan: 'reduced', opening: '2027-09' },
  },
  {
    key: 'p2-nadia', label: 'Nadia — une envie de burger, sans expérience',
    entry: { idea: 'wish', place: 'none', budget: 'amount', experience: 'none', role: 'operate', city: 'casa' },
    founder: { experience: 'none', skill: null, role: 'operate', time: 'full', risk: 'balanced', budget_amount: 800000, own_funds: 250000,
      desires: { tags: ['street', 'viande'], moments: ['lunch', 'dinner'] }, constraints: { no_alcohol: true }, idea_format: 'burger' },
    m4: { services: [{ id: 'lunch', days: WEEK, ticket: 95 }, { id: 'dinner', days: WEEK, ticket: 110 }], seats: 40, surface_m2: 120, alcohol: false, ramadan: 'reduced', opening: '2027-06' },
  },
  {
    key: 'p3-youssef', label: 'Youssef — un café de spécialité travaillé, pas encore de quartier',
    entry: { idea: 'worked', place: 'none', budget: 'amount', experience: 'close', role: 'operate', city: 'Casablanca' },
    founder: { experience: 'close', skill: 'floor', role: 'operate', time: 'full', risk: 'balanced', budget_amount: 900000, own_funds: 300000,
      desires: { tags: ['cafe'], moments: ['breakfast', 'lunch'] }, constraints: {}, idea_format: 'cafe-de-specialite' },
    m4: { services: [{ id: 'breakfast', days: MON_SAT, ticket: 45 }, { id: 'lunch', days: MON_SAT, ticket: 95 }], seats: 30, surface_m2: 80, alcohol: false, ramadan: 'reduced', opening: '2027-04' },
  },
  {
    key: 'p4-leila', label: 'Leila — concept travaillé, local trouvé à Bourgogne, budget connu',
    entry: { idea: 'worked', place: 'premises', budget: 'amount', experience: 'close', role: 'operate', city: 'Casablanca' },
    founder: { experience: 'close', skill: 'kitchen', role: 'operate', time: 'full', risk: 'balanced', budget_amount: 1600000, own_funds: 600000, desires: { tags: [], moments: [] }, constraints: {} },
  },
  {
    key: 'p5-omar', label: 'Omar — chef, veut ouvrir sa table marocaine',
    entry: { idea: 'wish', place: 'none', budget: 'amount', experience: 'pro', role: 'operate', city: 'Casablanca' },
    founder: { experience: 'pro', skill: 'kitchen', role: 'operate', time: 'full', risk: 'balanced', budget_amount: 3000000, own_funds: 1200000,
      desires: { tags: ['marocain', 'poisson'], moments: ['lunch', 'dinner'] }, constraints: { no_alcohol: true }, idea_format: 'table-marocaine-contemporaine' },
    m4: { services: [{ id: 'lunch', days: TUE_SAT, ticket: 260 }, { id: 'dinner', days: TUE_SAT, ticket: 380 }], seats: 60, surface_m2: 200, alcohol: false, ramadan: 'normal', opening: '2027-10' },
  },
  {
    key: 'p6-mehdi', label: 'Mehdi — investisseur, ne veut pas exploiter',
    entry: { idea: 'none', place: 'none', budget: 'amount', experience: 'none', role: 'invest', city: 'Casablanca' },
    founder: { experience: 'none', skill: null, role: 'invest', time: 'part', risk: 'prudent', budget_amount: 4000000, own_funds: 2000000,
      desires: { tags: ['italien', 'street'], moments: ['lunch', 'dinner'] }, constraints: {} },
    m4: { services: [{ id: 'lunch', days: WEEK, ticket: 150 }, { id: 'dinner', days: WEEK, ticket: 210 }], seats: 70, surface_m2: 220, alcohol: false, ramadan: 'reduced', opening: '2027-12', founder_works: false },
  },
  {
    key: 'p7-amina', label: 'Amina — un local familial au CIL, pas de concept',
    entry: { idea: 'none', place: 'premises', budget: 'amount', experience: 'none', role: 'operate', city: 'Casablanca' },
    founder: { experience: 'none', skill: null, role: 'operate', time: 'full', risk: 'prudent', budget_amount: 1000000, own_funds: 600000,
      desires: { tags: ['sucre', 'cafe', 'sain'], moments: ['breakfast', 'lunch'] }, constraints: { districts: ['CIL'] } },
    premises: { district: 'CIL', surface_m2: 140, seats: 45, extraction: 'no', terrace: true, rent_monthly: 22000 },
    m4: { services: [{ id: 'breakfast', days: WEEK, ticket: 60 }, { id: 'lunch', days: WEEK, ticket: 120 }], seats: 45, surface_m2: 140, rent_monthly: 22000, alcohol: false, ramadan: 'reduced', opening: '2027-05' },
  },
  {
    key: 'canaille-like', label: 'Karim — « un bar à vin comme Canaille », Gauthier en tête',
    entry: { idea: 'wish', place: 'district', budget: 'amount', experience: 'close', role: 'operate', city: 'Casablanca' },
    founder: { experience: 'close', skill: 'floor', role: 'operate', time: 'full', risk: 'bold', budget_amount: 2500000, own_funds: 700000,
      desires: { tags: ['vin', 'francais', 'festif'], moments: ['dinner'] }, constraints: { districts: ['Gauthier'] }, idea_format: 'bar-a-vin' },
    m4: { services: [{ id: 'lunch', days: [2, 3, 4, 5], ticket: 220 }, { id: 'dinner', days: [3, 4, 5, 6], ticket: 420 }], seats: 50, surface_m2: 150, alcohol: true, ramadan: 'closed', opening: '2027-10' },
  },
];
