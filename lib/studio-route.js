/* lib/studio-route.js — Concept Studio routing, version sr-1.0.0 (12 Nov 2026, lot 1).
 *
 * The six free entry questions (no model call, no payment: Arnaud, 11 Nov 2026) -> a profile P1–P7 -> the
 * path of modules the session will follow. Rules of claude/concept-studio-methode.md §3, applied in order.
 * The profile is never shown to the founder as a label: only the path changes.
 *
 *   QUESTIONS                     -> the six questions, bilingual, with their options
 *   normalizeAnswers(raw)         -> { answers, errors }
 *   route(answers)                -> { profile, path, outside_city, notes }
 *
 * PURE module.
 */
'use strict';

const ROUTE_VERSION = 'sr-1.0.0';

const QUESTIONS = [
  { id: 'idea', fr: 'Où en est votre idée ?', en: 'Where is your idea?',
    options: [
      { v: 'none', fr: 'Je n’ai pas encore d’idée', en: 'I have no idea yet' },
      { v: 'wish', fr: 'J’ai une envie, un type de lieu en tête', en: 'I have a wish, a type of place in mind' },
      { v: 'worked', fr: 'J’ai un concept travaillé', en: 'I have a worked-out concept' },
    ] },
  { id: 'place', fr: 'Avez-vous un lieu ?', en: 'Do you have a place?',
    options: [
      { v: 'none', fr: 'Non', en: 'No' },
      { v: 'district', fr: 'Un quartier en tête', en: 'A district in mind' },
      { v: 'premises', fr: 'Un local précis', en: 'A specific premises' },
    ] },
  { id: 'budget', fr: 'Votre budget ?', en: 'Your budget?',
    options: [
      { v: 'unknown', fr: 'Je ne sais pas encore', en: 'I don’t know yet' },
      { v: 'range', fr: 'Une fourchette', en: 'A range' },
      { v: 'amount', fr: 'Un montant précis', en: 'A precise amount' },
    ] },
  { id: 'experience', fr: 'Votre expérience de la restauration ?', en: 'Your experience of food service?',
    options: [
      { v: 'none', fr: 'Aucune', en: 'None' },
      { v: 'close', fr: 'Proche (salle, cuisine, gestion, un proche du métier)', en: 'Close (floor, kitchen, management, someone in the trade)' },
      { v: 'pro', fr: 'C’est mon métier', en: 'It is my trade' },
    ] },
  { id: 'role', fr: 'Votre rôle dans le projet ?', en: 'Your role in the project?',
    options: [
      { v: 'operate', fr: 'Je vais l’exploiter', en: 'I will run it' },
      { v: 'invest', fr: 'J’investis, quelqu’un d’autre l’exploitera', en: 'I invest, someone else will run it' },
    ] },
  { id: 'city', fr: 'Dans quelle ville ?', en: 'In which city?',
    options: [
      { v: 'casablanca', fr: 'Casablanca', en: 'Casablanca' },
      { v: 'other', fr: 'Une autre ville', en: 'Another city' },
    ] },
];
const VALID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options.map((o) => o.v)]));

/** Studio cities with district knowledge (D6: Casablanca only at launch). */
const STUDIO_CITIES = ['casablanca'];

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function normalizeAnswers(raw) {
  const r = raw || {};
  const answers = {}; const errors = [];
  for (const q of QUESTIONS) {
    let v = r[q.id];
    if (q.id === 'city' && typeof v === 'string' && !VALID.city.includes(v)) {
      // A city typed by name: Casablanca (with or without accents, « Casa ») or another one.
      const s = strip(v);
      v = s === 'casa' || s.startsWith('casablanca') ? 'casablanca' : (s ? 'other' : undefined);
      if (v === 'other') answers.city_name = String(r[q.id]).trim().slice(0, 80);
    }
    if (!VALID[q.id].includes(v)) { errors.push({ path: q.id, code: 'required' }); continue; }
    answers[q.id] = v;
  }
  if (typeof r.city_name === 'string' && r.city_name.trim()) answers.city_name = r.city_name.trim().slice(0, 80);
  return { answers, errors };
}

/* A path step: a module id and a variant the later lots read (cards, depth). */
const S = (id, variant) => (variant ? { id, variant } : { id });

const PATHS = {
  P1: [S('M1'), S('M2'), S('M3'), S('M4'), S('M5'), S('M7'), S('M8')],
  P2: [S('M1', 'short'), S('M2', 'targeted'), S('M3', 'with_idea'), S('M4'), S('M5'), S('M7'), S('M8')],
  P3: [S('M1', 'short'), S('M5'), S('M7'), S('M8')],
  P4: [S('VALIDATOR')],
  P5: [S('M2', 'short'), S('M3'), S('M4', 'quick'), S('M5'), S('M8'), S('M7', 'on_request')],
  P6: [S('M1', 'investor'), S('M2'), S('M3', 'budget'), S('M4'), S('M5'), S('M7'), S('M8')],
  P7: [S('M1'), S('M6'), S('M3', 'limited'), S('M4'), S('M7'), S('M8')],
};

/**
 * @param answers normalised answers (normalizeAnswers)
 * @returns { profile, path, outside_city, notes[] } — profile null when the city is outside the Studio.
 */
function route(answers) {
  const a = answers || {};
  const notes = [];
  if (a.city !== 'casablanca') {
    // D6: said plainly; the waitlist, or the Validator when the concept is worked out.
    return { profile: null, path: [], outside_city: true, offer: a.idea === 'worked' ? ['validator', 'waitlist'] : ['waitlist'], notes: ['outside_city'] };
  }
  const worked = a.idea === 'worked', premises = a.place === 'premises', budgetKnown = a.budget === 'range' || a.budget === 'amount';
  let profile;
  if (worked && premises) {
    profile = 'P4';
    // The method's P4 rule needs a known budget; the Validator form asks for it anyway (decision to confirm, lot 1).
    if (!budgetKnown) notes.push('p4_budget_asked_by_validator');
  } else if (premises) profile = 'P7';
  else if (a.role === 'invest') profile = 'P6';
  else if (a.experience === 'pro') profile = 'P5';
  else if (worked) profile = 'P3';
  else if (a.idea === 'wish') profile = 'P2';
  else profile = 'P1';
  if (profile === 'P7' && a.role === 'invest') notes.push('premises_owner_invests');
  if (profile === 'P3' && a.place === 'none') notes.push('location_from_scratch');
  return { profile, path: PATHS[profile].map((s) => ({ ...s })), outside_city: false, offer: profile === 'P3' ? ['studio_location', 'studio'] : profile === 'P4' ? ['validator'] : ['studio'], notes };
}

module.exports = { ROUTE_VERSION, QUESTIONS, STUDIO_CITIES, PATHS, normalizeAnswers, route };
