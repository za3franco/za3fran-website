/* lib/places.js — nearby comparable venues from the Google Places API (New), for the BP intake form.
 * Version pl-1.0.0 (9 Oct 2026; Arnaud approved the Places API, a few cents per lookup).
 *
 * Google's terms restrict storing Places content, so results are shown LIVE in the intake form as
 * suggestions only. The founder adds the venues they want and enters the prices from the venues' own
 * menus; what is stored and printed is the founder's input, never the Places response.
 * Needs GOOGLE_PLACES_API_KEY (Vercel env). Without it, nearby() returns { available: false }.
 */
'use strict';

const PLACES_VERSION = 'pl-1.0.0';
const QUERY_BY_FORMAT = {
  bistro_wine_bar: { fr: 'bar à vin bistro restaurant', en: 'wine bar bistro restaurant' },
};
const PRICE = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

async function nearby({ format, district, city, lang = 'fr', max = 8, fetchImpl = fetch }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { available: false, version: PLACES_VERSION };
  const q = (QUERY_BY_FORMAT[format] || { fr: 'restaurant', en: 'restaurant' })[lang === 'fr' ? 'fr' : 'en'];
  const where = [district, city].filter(Boolean).join(', ');
  if (!where) return { available: true, places: [], version: PLACES_VERSION };
  const r = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.priceLevel,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: `${q} ${where}`, languageCode: lang === 'fr' ? 'fr' : 'en', maxResultCount: Math.min(20, max) }),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const places = (j.places || []).map((p) => ({
    name: p.displayName && p.displayName.text, address: p.formattedAddress || null,
    kind: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || null,
    price_level: PRICE[p.priceLevel] || null, rating: p.rating ?? null, ratings: p.userRatingCount ?? null, maps_url: p.googleMapsUri || null,
  })).filter((p) => p.name);
  return { available: true, places, query: `${q} ${where}`, version: PLACES_VERSION };
}

module.exports = { nearby, PLACES_VERSION };
