/* lib/studio-brain.js — Concept Studio knowledge from the Brain, version sb-1.0.0 (12 Nov 2026, lot 1).
 *
 *   loadKnowledge(supabase, { city })   -> K (formats with traits, ranges, pitfalls, gaps, examples; districts with types,
 *                                          rents, dated census, density) — cached in the instance for 10 minutes
 *   buildKnowledge(rows)                -> K from raw table rows (pure; used by the loader and by the tests)
 *   marketFor(K, district)              -> { currency, chain } for the engine (district -> city -> country)
 *   matchVenueFormats(venueName, examples) -> catalogue slugs a census venue belongs to (by its name in the examples)
 *
 * Only *researched* or *verified* rows are read; superseded rows never. The census keeps only venues with a dated
 * source (check constraint of brain_venues). Nothing here writes to the Brain.
 */
'use strict';

const KNOWLEDGE_VERSION = 'sb-1.0.0';
const RANGE_KEYS = { 'concept.ticket': 'ticket', 'concept.seats': 'seats', 'concept.surface_m2': 'surface_m2' };
const CACHE_MS = 10 * 60 * 1000;
let cache = null;

const live = (r) => r && r.status !== 'superseded' && r.status !== 'rejected';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const n = (x) => (x == null || x === '' ? null : Number(x));
const recentSince = (today, months) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - months); return d.toISOString().slice(0, 10); };

/** Census venue -> catalogue formats, through the examples that name it (« Aïku » ⇄ « Aïku »). */
function matchVenueFormats(venueName, examples, formatsById) {
  const v = norm(venueName);
  if (!v) return [];
  const out = new Set();
  for (const e of examples || []) {
    const en = norm(e.venue_name);
    if (!en) continue;
    if (en === v || en.startsWith(v + ' ') || v.startsWith(en + ' ')) { const f = formatsById[e.format_id]; if (f) out.add(f.slug); }
  }
  return [...out].sort();
}

/**
 * @param rows { formats, traits, lines, examples, markets, archetypes, values, venues, density, notes, today }
 */
function buildKnowledge(rows) {
  const today = rows.today || new Date().toISOString().slice(0, 10);
  const since18 = recentSince(today, 18);
  const formatsById = Object.fromEntries((rows.formats || []).map((f) => [f.id, f]));
  const formats = (rows.formats || []).filter(live).map((f) => {
    const traits = {}; const inference = {};
    for (const t of (rows.traits || []).filter((x) => x.format_id === f.id && live(x))) {
      const list = ['archetypes', 'services'].includes(t.trait);
      traits[t.trait] = list ? String(t.value || '').split(',').map((s) => s.trim()).filter(Boolean)
        : ['thin_sheet', 'proposable'].includes(t.trait) ? t.value === 'yes' : t.value;
      inference[t.trait] = !!t.inference;
    }
    const lines = (rows.lines || []).filter((l) => l.format_id === f.id && live(l)).sort((a, b) => a.position - b.position);
    const pick = (block) => lines.filter((l) => l.block === block).map((l) => ({ id: l.id, text: l.body_fr, inference: !!l.inference, source: l.source_name || null, published_at: l.source_published_at || null, country: l.source_country || null }));
    const ex = (rows.examples || []).filter((e) => e.format_id === f.id && live(e));
    const casaRecent = ex.filter((e) => /casablanca/i.test(e.city || '') && e.source_published_at && e.source_published_at >= since18);
    const top = ex.slice().sort((a, b) => (b.country === 'MA') - (a.country === 'MA') || String(b.source_published_at || '').localeCompare(String(a.source_published_at || '')))
      .slice(0, 3).map((e) => ({ name: e.venue_name, city: e.city, country: e.country, date: e.source_published_at || null, source: e.source_name || null }));
    // Ranges (A9): one live row per parameter, format and qualifier; estimates from Arnaud's judgment or a source.
    const ranges = {};
    for (const v of (rows.values || []).filter((x) => x.format_key === f.slug && RANGE_KEYS[x.parameter_key] && live(x))) {
      const k = RANGE_KEYS[v.parameter_key];
      const r = { low: n(v.low), high: n(v.high), value: n(v.value_num), source_class: v.source_class, origin: v.source_class === 'estimate' ? 'za3fran_range' : 'source', note: v.review_note || v.source_name || null, id: v.id };
      if (r.low == null || r.high == null) continue;
      if (k === 'ticket') { ranges.ticket = ranges.ticket || {}; ranges.ticket[v.qualifier || 'any'] = r; } else ranges[k] = r;
    }
    return {
      id: f.id, slug: f.slug, name_fr: f.name_fr, name_en: f.name_en, family: f.family || null, seat_based: f.seat_based !== false, priority: f.priority,
      traits, trait_inference: inference, ranges,
      pitfalls: pick('pitfalls'), gaps: pick('gaps'), regulatory: pick('regulatory'),
      casa_lines: lines.filter((l) => l.block === 'casablanca' && l.source_name).length,
      examples: { total: ex.length, casa_recent: casaRecent.length, top },
    };
  });
  const city = (rows.markets || []).find((m) => m.city && !m.district && /casablanca/i.test(m.city)) || null;
  const country = (rows.markets || []).find((m) => m.country_code === 'MA' && !m.city && !m.district) || null;
  const rentOf = (mid) => {
    const v = (rows.values || []).find((x) => x.market_id === mid && x.parameter_key === 'property.rent_m2_month' && live(x));
    return v ? { m2: n(v.value_num), low: n(v.low), high: n(v.high), source: v.source_name, observed_at: v.observed_at, status: v.status, id: v.id } : null;
  };
  const districts = (rows.markets || []).filter((m) => m.district && city && m.city === city.city).map((m) => {
    const archetypes = (rows.archetypes || []).filter((a) => a.market_id === m.id && live(a)).sort((a, b) => a.rank - b.rank).map((a) => ({ code: a.archetype, rank: a.rank, inference: !!a.inference }));
    const venues = (rows.venues || []).filter((v) => v.market_id === m.id && live(v) && v.venue_status !== 'closed').map((v) => ({
      name: v.name, family: v.family, venue_type: v.venue_type, source_published_at: v.source_published_at, formats: matchVenueFormats(v.name, rows.examples, formatsById),
    }));
    const dens = (rows.density || []).find((x) => x.market_id === m.id && live(x));
    return {
      id: m.id, name: m.district, archetypes, rent: rentOf(m.id), venues,
      notes: (rows.notes || []).filter((x) => x.market_id === m.id && live(x)).length,
      density: dens ? { total: dens.total, by_amenity: dens.by_amenity, radius_m: dens.radius_m, observed_at: dens.observed_at, attribution: dens.attribution } : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: KNOWLEDGE_VERSION, as_of: today, city: city ? city.city : null,
    ids: { country: country ? country.id : null, city: city ? city.id : null },
    city_rent: city ? rentOf(city.id) : null,
    formats: formats.sort((a, b) => (a.priority - b.priority) || a.slug.localeCompare(b.slug)), districts,
  };
}

/** Engine market chain for a district of the Studio city (district -> city -> country). */
function marketFor(K, district) {
  const d = (K.districts || []).find((x) => norm(x.name) === norm(district));
  const chain = [d && { id: d.id, level: 'district' }, K.ids.city && { id: K.ids.city, level: 'city' }, K.ids.country && { id: K.ids.country, level: 'country' }].filter(Boolean);
  return { currency: 'MAD', chain };
}

async function loadKnowledge(supabase, { city = 'Casablanca', today } = {}) {
  if (cache && cache.city === city && Date.now() - cache.at < CACHE_MS) return cache.K;
  const sel = (t, cols = '*') => supabase.from(t).select(cols);
  const markets = await sel('brain_markets', 'id, country_code, city, district').eq('country_code', 'MA');
  if (markets.error) throw new Error('brain_markets: ' + markets.error.message);
  const ids = markets.data.map((m) => m.id);
  const [formats, traits, lines, examples, archetypes, values, ranges, venues, density, notes] = await Promise.all([
    sel('brain_concept_formats'), sel('brain_concept_traits'),
    sel('brain_concept_lines', 'id, format_id, block, position, body_fr, inference, source_name, source_published_at, source_country, status'),
    sel('brain_concept_examples', 'id, format_id, venue_name, city, country, source_name, source_published_at, status'),
    sel('brain_district_archetypes'),
    sel('brain_values_effective').eq('parameter_key', 'property.rent_m2_month').in('market_id', ids),
    sel('brain_values_effective').in('parameter_key', Object.keys(RANGE_KEYS)),
    sel('brain_venues', 'id, market_id, name, family, venue_type, venue_status, source_published_at, status').in('market_id', ids),
    sel('brain_district_density').in('market_id', ids),
    sel('brain_district_notes', 'id, market_id, status').in('market_id', ids),
  ]);
  for (const r of [formats, traits, lines, examples, archetypes, values, ranges, venues, density, notes]) if (r.error) throw new Error('studio knowledge: ' + r.error.message);
  const K = buildKnowledge({
    formats: formats.data, traits: traits.data, lines: lines.data, examples: examples.data, markets: markets.data.filter((m) => !m.city || m.city === city),
    archetypes: archetypes.data, values: [...values.data, ...ranges.data], venues: venues.data, density: density.data, notes: notes.data, today,
  });
  cache = { city, at: Date.now(), K };
  return K;
}

module.exports = { KNOWLEDGE_VERSION, RANGE_KEYS, buildKnowledge, loadKnowledge, marketFor, matchVenueFormats };
