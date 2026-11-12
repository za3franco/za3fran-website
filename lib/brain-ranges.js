// lib/brain-ranges.js — « Fourchettes par format » (Concept Studio lot 0, brange-1.0.0)
// Arnaud gives, per format, a range for the ticket of each service, the seats and the surface. Each filled field becomes one
// Brain value (class estimate, low confidence, status researched) through brain_add_value(). Nothing is computed by a model.
'use strict';

const VERSION = 'brange-1.0.0';

// The 12 most common formats first (Arnaud, 11 Nov 2026): the six of priority 1, then six of priority 2.
const FORMATS = [
  'bar-a-vin', 'bar-a-cocktails', 'bistro-brasserie', 'boulangerie-patisserie-cafe', 'cafe-de-specialite', 'comptoir-japonais-sushi',
  'cafe-resto-brunch', 'burger', 'trattoria-pizzeria-napolitaine', 'grill-viande', 'table-marocaine-contemporaine', 'poissons-fruits-de-mer',
];

const FIELDS = [
  { id: 'ticket_breakfast', param: 'concept.ticket', qualifier: 'breakfast', min: 5,  max: 5000, label: ['Ticket · morning', 'Ticket · matin'], unit: 'MAD' },
  { id: 'ticket_lunch',     param: 'concept.ticket', qualifier: 'lunch',     min: 5,  max: 5000, label: ['Ticket · lunch', 'Ticket · déjeuner'], unit: 'MAD' },
  { id: 'ticket_dinner',    param: 'concept.ticket', qualifier: 'dinner',    min: 5,  max: 5000, label: ['Ticket · evening', 'Ticket · soir'], unit: 'MAD' },
  { id: 'seats',            param: 'concept.seats',  qualifier: '',          min: 4,  max: 1000, label: ['Seats', 'Places'], unit: '' },
  { id: 'surface_m2',       param: 'concept.surface_m2', qualifier: '',      min: 10, max: 5000, label: ['Surface', 'Surface'], unit: 'm²' },
];

// Claude's sourced references of 5 Nov 2026 (research, not stored in the Brain). Shown next to the fields; never pre-filled.
const REFS = {
  'bistro-brasserie': 'Soir : L\'Entrecôte Café de Paris (Mers Sultan), 300-500 DH par personne hors boissons (Gault&Millau Maroc 2026). Places : Brasserie Flâneur (Sofitel Tour Blanche), 60 couverts (Le Matin, 20 juin 2025) — brasserie d\'hôtel. Midi : aucune source.',
  'cafe-de-specialite': 'Aucun prix daté récent. Seul repère ancien : Starbucks Maroc, café-thé autour de 25-30 DH (Consonews, oct. 2019). Les articles de 2026 citent Bondi, EspressoLab, Bloom, Arabica sans prix.',
  'cafe-resto-brunch': 'Signal (cartes en ligne non datées, observées le 5 nov. 2026) : petit-déjeuner Mood\'s 105-135 DH, El Gousto (Gauthier) 95-110 DH ; midi : plat courant 85-170 DH + boisson 30-70 DH. Brunch d\'hôtel (Bliss Rooftop) 250-290 DH : autre catégorie. Le Pain Quotidien Maroc (carte hiver, PDF mis en ligne en mai 2025, prix TTC par article, pas par addition) : petit-déjeuner 59-75 DH, brunch 135 DH, plats du midi 69-129 DH, viennoiseries 5-15 DH.',
  'comptoir-japonais-sushi': 'Un seul lieu, haut de gamme : Iloli (Gauthier), carte été 2026. Midi : menu 430 DH. Soir : environ 660-870 DH (entrée + plat + dessert + un verre). Places : 56 (4 espaces). Aucune source pour une gamme moyenne : élargis vers le bas selon ton jugement.',
  'poissons-fruits-de-mer': 'Hors boissons. Midi : menus du jour La Taverne du Dauphin 120-150 DH (site, févr. 2026). Soir : Lucy in the Sky 200-400 DH (Gault&Millau Maroc 2026) ; haut de gamme Le Cabestan environ 360-630 DH (carte de mai 2025). Ajoute les boissons selon ton jugement.',
  'rooftop-lounge': 'Seul prix daté : Bliss Rooftop (Radisson, Gauthier), brunch du week-end 250-290 DH (Le Matin, 30 sept. 2026). Aucune donnée pour le soir.',
  'supper-club': 'Seul repère : Ruby Supper Club, 50-100 $ par personne (En Primeur Club, août 2026) ; non converti.',
  'table-marocaine-contemporaine': 'Seul repère, très haut de gamme : L\'ART Oriental Fine Dining, 500-1000 DH par personne hors boissons (Gault&Millau Maroc 2026). Pas représentatif d\'une gamme moyenne.',
};
const NO_REF = 'Aucune source trouvée pour ce format : ton jugement de terrain.';

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * One field → { low, high } | null (empty) | { error }. A single number counts as low = high.
 */
function readRange(field, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  let low = num(r.low), high = num(r.high);
  if (low === null && high === null) return null;
  if (low === null) low = high;
  if (high === null) high = low;
  if (Number.isNaN(low) || Number.isNaN(high)) return { error: 'not_a_number' };
  if (low > high) { const t = low; low = high; high = t; }
  if (low < field.min || high > field.max) return { error: 'out_of_bounds' };
  return { low, high };
}

/**
 * The brain_add_value() payloads for one format. values = { ticket_dinner: {low, high}, seats: {...}, ... }.
 * Returns { payloads, errors, cleared } — an empty field writes nothing.
 */
function buildPayloads(formatKey, values, now = new Date()) {
  const payloads = [], errors = [];
  if (!FORMATS.includes(formatKey)) return { payloads, errors: [{ field: 'format', error: 'unknown_format' }] };
  const day = now.toISOString().slice(0, 10);
  FIELDS.forEach((f) => {
    const r = readRange(f, values && values[f.id]);
    if (r === null) return;
    if (r.error) { errors.push({ field: f.id, error: r.error }); return; }
    payloads.push({
      parameter_key: f.param, format_key: formatKey, qualifier: f.qualifier,
      value_num: Math.round(((r.low + r.high) / 2) * 100) / 100, low: r.low, high: r.high,
      currency: f.unit === 'MAD' ? 'MAD' : null,
      source_class: 'estimate', status: 'researched', confidence: 'low',
      source_name: 'Arnaud — fourchettes par format (jugement)', observed_at: day,
      review_note: 'Jugement d\'Arnaud pour Casablanca, à remplacer par des cartes datées (Studio, lot 0).',
    });
  });
  return { payloads, errors };
}

module.exports = { VERSION, FORMATS, FIELDS, REFS, NO_REF, readRange, buildPayloads };
