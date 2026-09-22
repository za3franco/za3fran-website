// ============================================================
// /lib/crr-concept.js
// The "effective concept" — original Validator answers plus the
// Concept Readiness Review amendments layer (master strategy §3.18).
//
// Single source of truth for:
//   • which questionnaire fields exist, their input type and options
//   • how an answer is described in words (UI and AI prompts alike —
//     this is what fixes the budget-bracket misread: "50_150k" must be
//     described as "$50,000–$150,000 / ≈500k–1.5M MAD", never as a raw
//     code the model can mistake for "50–150k MAD")
//   • validating an amended value
//   • loading original answers + active amendments for a project
//
// Used by: webhook-validator.js (prompt labels), crr-review.js,
// and later the re-assessment, generate-bp.js and generate-menu.js.
// ============================================================

// Field keys MUST match the crr_amendments.field_key CHECK constraint.
const TYPE_OPTIONS = [
  ['restaurant_casual', 'Casual dining restaurant', 'Restaurant casual'],
  ['restaurant_fine',   'Fine dining restaurant',   'Restaurant gastronomique'],
  ['bistro',            'Bistro',                   'Bistro'],
  ['cafe_brunch',       'Café / Brunch spot',       'Café / Brunch'],
  ['wine_bar',          'Wine bar',                 'Bar à vin'],
  ['fast_casual',       'Fast casual / QSR',        'Fast casual / QSR'],
  ['bar_lounge',        'Bar / Lounge',             'Bar / Lounge'],
  ['beach_club',        'Beach club / Pool club',   'Beach club / Pool club'],
  ['rooftop',           'Rooftop / Terrace venue',  'Rooftop / Terrasse'],
  ['dark_kitchen',      'Dark kitchen / Delivery only', 'Dark kitchen / Livraison uniquement'],
  ['food_hall',         'Food hall / Market stall', 'Food hall / Stand de marché'],
  ['hotel_fb',          'Hotel F&B outlet',         'Point de vente F&B hôtelier'],
  ['other',             'Other',                    'Autre'],
];
const STAGE_OPTIONS = [
  ['idea',      'Early idea / Concept phase',             'Idée précoce / Phase concept'],
  ['planning',  'Business planning in progress',          'Planification en cours'],
  ['funding',   'Seeking funding / investors',            'Recherche de financement / investisseurs'],
  ['location',  'Location scouting / lease negotiation',  "Recherche d'emplacement / négociation de bail"],
  ['build',     'Under construction / fit-out',           'En construction / aménagement'],
  ['prelaunch', 'Pre-launch (opening within 3 months)',   'Pré-lancement (ouverture sous 3 mois)'],
  ['existing',  'Existing operation — repositioning',     'Établissement existant — repositionnement'],
];
const TIMELINE_OPTIONS = [
  ['under_3m',  'Under 3 months',   'Moins de 3 mois'],
  ['3_6m',      '3–6 months',       '3–6 mois'],
  ['6_12m',     '6–12 months',      '6–12 mois'],
  ['over_1y',   'More than 1 year', "Plus d'un an"],
  ['undefined', 'Not yet defined',  'Pas encore défini'],
];
const AUDIENCE_OPTIONS = [
  ['locals',          'Local residents',      'Résidents locaux'],
  ['tourists',        'Tourists',             'Touristes'],
  ['expats',          'Expats',               'Expatriés'],
  ['corporate',       'Corporate / Business', 'Corporate / Affaires'],
  ['affluent_locals', 'Affluent locals',      'Clientèle locale aisée'],
  ['families',        'Families',             'Familles'],
];
// Budget brackets exactly as shown on validator.html.
export const BUDGET_BRACKETS = {
  under_50k:  { en: 'Under $50,000 / under 500k MAD',        fr: 'Moins de 50 000 $ / moins de 500k MAD',   prompt: 'under USD 50,000 (≈ under 500,000 MAD)' },
  '50_150k':  { en: '$50,000–$150,000 / 500k–1.5M MAD',      fr: '50 000 $–150 000 $ / 500k–1,5M MAD',      prompt: 'USD 50,000–150,000 (≈ 500,000–1,500,000 MAD)' },
  '150_500k': { en: '$150,000–$500,000 / 1.5M–5M MAD',       fr: '150 000 $–500 000 $ / 1,5M–5M MAD',       prompt: 'USD 150,000–500,000 (≈ 1,500,000–5,000,000 MAD)' },
  '500k_1m':  { en: '$500,000–$1M / 5M–10M MAD',             fr: '500 000 $–1M $ / 5M–10M MAD',             prompt: 'USD 500,000–1,000,000 (≈ 5,000,000–10,000,000 MAD)' },
  over_1m:    { en: 'Over $1M / over 10M MAD',               fr: 'Plus de 1M $ / plus de 10M MAD',          prompt: 'over USD 1,000,000 (≈ over 10,000,000 MAD)' },
};

const opts = arr => arr.map(([value, en, fr]) => ({ value, en, fr }));

// input: text | textarea | select | multi | amount | number
export const FIELD_DEFS = {
  concept_name:    { en: 'Concept name',             fr: 'Nom du concept',              input: 'text',     column: 'concept_name' },
  concept_type:    { en: 'Establishment type',       fr: "Type d'établissement",        input: 'select',   column: 'concept_type', options: opts(TYPE_OPTIONS) },
  cuisine:         { en: 'Cuisine',                  fr: 'Cuisine',                     input: 'text',     column: 'cuisine' },
  description:     { en: 'Concept description',      fr: 'Description du concept',      input: 'textarea', column: 'description' },
  differentiation: { en: 'Differentiation',          fr: 'Différenciation',             input: 'textarea', column: 'differentiation' },
  city:            { en: 'City',                     fr: 'Ville',                       input: 'text',     column: 'city' },
  neighbourhood:   { en: 'Neighbourhood / location', fr: 'Quartier / emplacement',      input: 'text',     column: 'neighbourhood' },
  audience:        { en: 'Target audience',          fr: 'Clientèle cible',             input: 'multi',    column: 'audience', options: opts(AUDIENCE_OPTIONS) },
  budget:          { en: 'Investment budget',        fr: "Budget d'investissement",     input: 'amount',   column: 'budget' },
  ticket:          { en: 'Average ticket',           fr: 'Ticket moyen',                input: 'number',   column: 'ticket', money: true },
  covers:          { en: 'Daily covers',             fr: 'Couverts par jour',           input: 'number',   column: 'covers' },
  seats:           { en: 'Seats',                    fr: 'Places assises',              input: 'number',   column: 'seats' },
  opening_hours:   { en: 'Opening hours',            fr: "Horaires d'ouverture",        input: 'text',     column: 'opening_hours' },
  competitors:     { en: 'Competitors',              fr: 'Concurrents',                 input: 'textarea', column: 'competitors' },
  market_gap:      { en: 'Market gap',               fr: 'Opportunité de marché',       input: 'textarea', column: 'market_gap' },
  stage:           { en: 'Project stage',            fr: 'Stade du projet',             input: 'select',   column: 'stage', options: opts(STAGE_OPTIONS) },
  timeline:        { en: 'Opening timeline',         fr: "Calendrier d'ouverture",      input: 'select',   column: 'timeline', options: opts(TIMELINE_OPTIONS) },
  additional:      { en: 'Additional information',   fr: 'Informations complémentaires', input: 'textarea', column: 'additional' },
};
export const FIELD_KEYS = Object.keys(FIELD_DEFS);

const MAX_LEN = { text: 200, textarea: 2000 };

// ── Reading & comparing values ──────────────────────────────────

function parseAudience(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(String) : [raw]; } catch { return [raw]; }
  }
  return [];
}

/** The operator's original answer for a field, from the submission row. */
export function readOriginal(submission, field) {
  const def = FIELD_DEFS[field];
  if (!def || !submission) return field === 'audience' ? [] : '';
  const raw = submission[def.column];
  if (field === 'audience') return parseAudience(raw);
  return raw == null ? '' : String(raw);
}

function canon(field, v) {
  if (field === 'audience') return JSON.stringify(parseAudience(v).slice().sort());
  return String(v == null ? '' : v).trim();
}
export function valuesEqual(field, a, b) { return canon(field, a) === canon(field, b); }

// ── Describing values in words ──────────────────────────────────

function fmtNumber(n, lang) {
  return Number(n).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 2 });
}
const isNumeric = v => /^\s*\d+(\.\d+)?\s*$/.test(String(v == null ? '' : v));

/**
 * Human description of a value.
 * mode 'ui'     → short bilingual-ready label (lang = 'en' | 'fr')
 * mode 'prompt' → unambiguous English for AI prompts (units spelled out)
 */
export function describeValue(field, value, { lang = 'en', currency = '', mode = 'ui' } = {}) {
  const def = FIELD_DEFS[field];
  const empty = mode === 'prompt' ? 'Not provided' : '—';
  if (!def) return value == null || value === '' ? empty : String(value);

  if (field === 'audience') {
    const list = parseAudience(value);
    if (!list.length) return empty;
    return list.map(v => {
      const o = def.options.find(x => x.value === v);
      return o ? (mode === 'prompt' ? o.en : o[lang] || o.en) : v;
    }).join(', ');
  }

  const s = String(value == null ? '' : value).trim();
  if (!s) return empty;

  if (field === 'budget') {
    const b = BUDGET_BRACKETS[s];
    if (b) {
      return mode === 'prompt'
        ? `${b.prompt} — a RANGE selected by the operator on the form (not an exact figure; convert to ${currency || 'the report currency'} as needed)`
        : (b[lang] || b.en);
    }
    if (isNumeric(s)) {
      return mode === 'prompt'
        ? `${fmtNumber(s, 'en')} ${currency} (exact amount stated by the operator)`
        : `${fmtNumber(s, lang)} ${currency}`.trim();
    }
    return mode === 'prompt' ? `${s} ${currency}`.trim() : s;
  }

  if (def.options) {
    const o = def.options.find(x => x.value === s);
    if (o) return mode === 'prompt' ? o.en : (o[lang] || o.en);
    return s;
  }

  if (def.money && isNumeric(s)) {
    return mode === 'prompt' ? `${fmtNumber(s, 'en')} ${currency}`.trim() : `${fmtNumber(s, lang)} ${currency}`.trim();
  }
  return s;
}

// ── Validating an amended value ─────────────────────────────────

export class FieldError extends Error {
  constructor(field, code) { super(code); this.field = field; this.code = code; }
}

/** Returns the normalized value to store, or throws FieldError. */
export function normalizeValue(field, raw) {
  const def = FIELD_DEFS[field];
  if (!def) throw new FieldError(field, 'unknown_field');

  if (def.input === 'multi') {
    const list = parseAudience(raw).map(s => s.trim()).filter(Boolean);
    const allowed = def.options.map(o => o.value);
    if (!list.length) throw new FieldError(field, 'required');
    if (list.some(v => !allowed.includes(v))) throw new FieldError(field, 'invalid_option');
    return [...new Set(list)];
  }

  const s = String(raw == null ? '' : raw).trim();
  if (!s) throw new FieldError(field, 'required');

  if (def.input === 'select') {
    if (!def.options.some(o => o.value === s)) throw new FieldError(field, 'invalid_option');
    return s;
  }
  if (def.input === 'amount' || def.input === 'number') {
    const n = Number(s.replace(/[\s,\u202f\u00a0]/g, ''));
    if (!Number.isFinite(n) || n <= 0) throw new FieldError(field, 'invalid_number');
    if (n > 1e10) throw new FieldError(field, 'too_large');
    return String(def.input === 'amount' ? Math.round(n) : n);
  }
  if (s.length > (MAX_LEN[def.input] || 200)) throw new FieldError(field, 'too_long');
  return s;
}

// ── Effective concept ───────────────────────────────────────────

/**
 * Combines original answers with ACTIVE amendments.
 * Returns { values: {field: value}, fields: {field: {original, value, amended, amendment}} }
 */
export function buildEffectiveConcept(submission, activeAmendments) {
  const byField = {};
  (activeAmendments || []).forEach(a => {
    if (a.amendment_status === 'active' || a.amendment_status === undefined) byField[a.field_key] = a;
  });
  const values = {}, fields = {};
  FIELD_KEYS.forEach(k => {
    const original = readOriginal(submission, k);
    const am = byField[k];
    const value = am ? am.amended_value : original;
    values[k] = value;
    fields[k] = { original, value, amended: !!am, amendment: am || null };
  });
  return { values, fields };
}

async function withRetry(fn, attempts = 3, delayMs = 1300) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (!last.error) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return last;
}

/** Loads submission + active amendments for a project and builds the effective concept. */
export async function loadEffectiveConcept(supabase, project) {
  const [subRes, amRes] = await Promise.all([
    withRetry(() => supabase.from('validator_submissions').select('*').eq('id', project.validator_submission_id).maybeSingle()),
    withRetry(() => supabase.from('crr_amendments').select('*').eq('project_id', project.id).eq('amendment_status', 'active')),
  ]);
  if (subRes.error) throw new Error('submission lookup failed: ' + subRes.error.message);
  if (amRes.error) throw new Error('amendments lookup failed: ' + amRes.error.message);
  return Object.assign({ submission: subRes.data }, buildEffectiveConcept(subRes.data, amRes.data || []));
}

/** Canonical map of active amendments {field: canonical value} — used to detect un-reassessed changes. */
export function amendmentSignature(activeAmendments) {
  const sig = {};
  (activeAmendments || []).forEach(a => { sig[a.field_key] = canon(a.field_key, a.amended_value); });
  return sig;
}
export function signaturesEqual(a, b) {
  const ka = Object.keys(a || {}).sort(), kb = Object.keys(b || {}).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}
