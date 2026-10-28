/* lib/formats.js — venue format families and service ids shared by the Validator, the BP intake and Places.
 * Version fmt-1.0.0 (28 Oct 2026, Validator v2). PURE module.
 *
 * A format family is the key under which the Brain keeps its format benchmarks (turns, occupancy, cost
 * ratios, staffing and capex methods). Every Validator establishment type maps to one family, except the
 * dark kitchen (the engine is seat-based: no figures are computed for it) and "other" (the founder picks
 * the closest family on the form).
 */
'use strict';

const FORMATS_VERSION = 'fmt-1.0.0';

const FAMILIES = {
  bistro_wine_bar: { fr: 'Bistro / bar à vin', en: 'Bistro / wine bar', places: { fr: 'bar à vin bistro restaurant', en: 'wine bar bistro restaurant' } },
  restaurant:      { fr: 'Restaurant', en: 'Restaurant', places: { fr: 'restaurant', en: 'restaurant' } },
  cafe_brunch:     { fr: 'Café / brunch', en: 'Café / brunch', places: { fr: 'café brunch coffee shop', en: 'café brunch coffee shop' } },
  fast_casual:     { fr: 'Fast casual / restauration rapide', en: 'Fast casual / quick service', places: { fr: 'fast casual restauration rapide', en: 'fast casual restaurant' } },
  bar_lounge:      { fr: 'Bar / lounge', en: 'Bar / lounge', places: { fr: 'bar lounge rooftop', en: 'bar lounge rooftop' } },
};
const FAMILY_KEYS = Object.keys(FAMILIES);

/** Validator establishment type -> Brain format family (null: no engine figures, or the founder must choose). */
const FAMILY_BY_TYPE = {
  bistro: 'bistro_wine_bar', wine_bar: 'bistro_wine_bar',
  restaurant_casual: 'restaurant', restaurant_fine: 'restaurant', hotel_fb: 'restaurant',
  cafe_brunch: 'cafe_brunch',
  fast_casual: 'fast_casual', food_hall: 'fast_casual',
  bar_lounge: 'bar_lounge', rooftop: 'bar_lounge', beach_club: 'bar_lounge',
  dark_kitchen: null, other: null,
};
/** Types for which the engine cannot run (no seats to model). */
const NOT_SEAT_BASED = ['dark_kitchen'];

/** Services the engine and the forms know. 'dinner' is the evening service (a bar's night). */
const SERVICE_IDS = ['breakfast', 'lunch', 'dinner'];
const SERVICE_LABELS = {
  breakfast: { fr: 'Matin', en: 'Morning' },
  lunch: { fr: 'Déjeuner', en: 'Lunch' },
  dinner: { fr: 'Soir', en: 'Evening' },
};

/** Family for a project: the founder's explicit choice wins, then the establishment type. */
function familyFor(conceptType, chosen) {
  if (chosen && FAMILIES[chosen]) return chosen;
  if (NOT_SEAT_BASED.includes(conceptType)) return null;
  return FAMILY_BY_TYPE[conceptType] || null;
}

/**
 * Public bodies a report may name (Brain rule 3: proper names only from the founder, a cited source or
 * this list). Official names, checked 28 Oct 2026; Morocco only for now.
 */
const INSTITUTIONS = {
  MA: ['OMPIC', 'CNSS', 'AMO', 'ONSSA', 'CRI', 'DGI', 'ANAPEC', 'Tamwilcom', 'Intelaka', 'Damane', 'Forsa', 'RNE', 'ICE', 'CGI', 'BMDA', 'Bank Al-Maghrib', 'Commune', 'Wilaya', 'Préfecture', 'Glovo'],
};

module.exports = { FORMATS_VERSION, FAMILIES, FAMILY_KEYS, FAMILY_BY_TYPE, NOT_SEAT_BASED, SERVICE_IDS, SERVICE_LABELS, familyFor, INSTITUTIONS };
