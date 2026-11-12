/* lib/studio-select.js — Concept Studio selection in code, version ss-1.0.0 (12 Nov 2026, lot 1).
 *
 * The code chooses what each card will speak about; the model (lot 2) only writes the text around it.
 *   selectFormats({ K, founder, premisesFit?, investmentOf? }) -> M3: every format with its status, three directions, a comparison
 *   premisesFit({ K, premises })                        -> M6: compatible / under condition / incompatible formats
 *   selectDistricts({ K, format, surface_m2, prefer })  -> M5: 2–3 districts (never an address)
 *   marketReading({ K, focus? })                        -> M2: per district type, formats present / with no dated Casablanca example
 *   comparison(K, slugs, founder, investments)          -> qualitative table of the three directions (no note, no score)
 *
 * Guardrails (method §1): no score is ever returned to the founder — `rank` is internal and stripped by
 * publicView(); a format whose sheet says « not proposable » (beach club, D4) is never proposed unless the
 * founder asks for it, and then its regulatory flag comes first; an absence in our data is a « possible gap,
 * or a limit of our data », never a market gap; inferences keep their flag.
 *
 * K = the Studio knowledge (lib/studio-brain.js -> loadKnowledge): formats with structured traits, district
 * types, rents, the dated venue census, examples, pitfalls and gaps. PURE module.
 */
'use strict';

const SELECT_VERSION = 'ss-1.0.0';
const ARCHETYPES = ['A', 'B', 'C', 'D', 'E'];
const ARCHETYPE_LABELS = {
  A: { fr: 'bureaux et déjeuner en semaine', en: 'offices and weekday lunch' },
  B: { fr: 'résidentiel aisé', en: 'affluent residential' },
  C: { fr: 'sortie du soir et centre animé', en: 'evening out and lively centre' },
  D: { fr: 'front de mer et loisirs', en: 'seafront and leisure' },
  E: { fr: 'passage et transit', en: 'transit and footfall' },
};

/* Routing vocabulary — how the founder's wishes (M1, classified later by Haiku) meet the catalogue. This is the
 * Studio's own matching table, not a Brain fact: it never appears in a card as information about a format. */
const FORMAT_TAGS = {
  'bar-a-cocktails': ['cocktail', 'festif'],
  'bar-a-vin': ['vin', 'francais', 'festif'],
  'bistro-brasserie': ['francais', 'vin', 'viande'],
  'boulangerie-patisserie-cafe': ['cafe', 'sucre', 'brunch'],
  'cafe-de-specialite': ['cafe'],
  'comptoir-japonais-sushi': ['japonais', 'poisson'],
  burger: ['street', 'viande'],
  'cafe-resto-brunch': ['brunch', 'cafe', 'sain'],
  'dark-kitchen': ['street', 'livraison'],
  'grill-viande': ['viande'],
  'libanais-mediterraneen': ['mediterraneen'],
  'poissons-fruits-de-mer': ['poisson'],
  'rooftop-lounge': ['cocktail', 'festif', 'vue'],
  'salon-de-the-patisserie': ['sucre', 'cafe'],
  'sandwich-shawarma-premium': ['street', 'mediterraneen'],
  'table-marocaine-contemporaine': ['marocain'],
  'tapas-iberiques': ['espagnol', 'vin', 'festif'],
  'trattoria-pizzeria-napolitaine': ['italien'],
  'bar-de-quartier': ['vin', 'cocktail', 'festif'],
  'beach-club': ['festif', 'vue', 'mer'],
  'bowls-poke': ['sain', 'japonais'],
  creperie: ['sucre', 'francais'],
  'food-hall': ['street'],
  'glacier-gelato': ['glace', 'sucre'],
  'jus-bowls': ['sain'],
  poulet: ['street'],
  'supper-club': ['festif', 'cocktail'],
  'tacos-street-food': ['street'],
  traiteur: ['evenement'],
};
const TAGS = [...new Set(Object.values(FORMAT_TAGS).flat())].sort();

/** What M5/M6 always leave to the founder on site (method §4 M5). */
const ON_SITE_CHECKS = ['footfall_at_service_hours', 'parking', 'extraction', 'terrace_permit', 'lease_and_co_ownership', 'announced_works'];

const DIFFICULTY_ORDER = { low: 0, medium: 1, high: 2, very_high: 3 };
const BUDGET_TOLERANCE = 1.2;   // method §4 M3: engine investment at the typical size ≤ budget × 1.2
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const inter = (a, b) => (a || []).filter((x) => (b || []).includes(x));

function formatBySlug(K, slug) { return (K.formats || []).find((f) => f.slug === slug) || null; }
function districtByName(K, name) {
  const n = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return (K.districts || []).find((d) => d.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === n) || null;
}
const archetypesOf = (d) => (d && d.archetypes ? d.archetypes.map((a) => a.code) : []);

/* ------------------------------------------------------------------ */
/* M6 — fit to a given premises                                        */
/* ------------------------------------------------------------------ */

/**
 * @param premises { district, surface_m2?, seats?, extraction: 'yes'|'no'|'possible'|null, terrace?, rent_monthly? }
 * @returns { formats: [{ slug, status: 'compatible'|'condition'|'incompatible', reasons: [{code,data}] }], district_known }
 */
function premisesFit({ K, premises }) {
  const p = premises || {};
  const d = districtByName(K, p.district);
  const dTypes = archetypesOf(d);
  const out = [];
  for (const f of K.formats || []) {
    const t = f.traits || {};
    const reasons = [];
    let status = 'compatible';
    const worse = (s) => { if (s === 'incompatible' || (s === 'condition' && status === 'compatible')) status = s; };
    // Extraction (catalogue « exigences d'exploitation »).
    if (t.extraction === 'required') {
      if (p.extraction === 'no') { worse('incompatible'); reasons.push({ code: 'extraction_required_absent' }); }
      else if (p.extraction === 'possible') { worse('condition'); reasons.push({ code: 'extraction_required_possible' }); }
      else if (p.extraction == null) { worse('condition'); reasons.push({ code: 'extraction_required_unknown' }); }
    } else if (t.extraction === 'desirable' && p.extraction !== 'yes') { worse('condition'); reasons.push({ code: 'extraction_desirable' }); }
    // District type.
    if (d && dTypes.length && t.archetypes && t.archetypes.length && !inter(t.archetypes, dTypes).length) {
      worse('condition'); reasons.push({ code: 'district_type_mismatch', data: { district_types: dTypes, format_types: t.archetypes } });
    }
    // Size against the format's typical range (A9), when Arnaud has given it.
    const sz = f.ranges && f.ranges.surface_m2, st = f.ranges && f.ranges.seats;
    if (isNum(p.surface_m2) && sz) {
      if (p.surface_m2 < sz.low * 0.8) { worse('condition'); reasons.push({ code: 'surface_small', data: { surface: p.surface_m2, low: sz.low, high: sz.high } }); }
      else if (p.surface_m2 > sz.high * 1.5) { worse('condition'); reasons.push({ code: 'surface_large', data: { surface: p.surface_m2, low: sz.low, high: sz.high } }); }
    } else if (isNum(p.surface_m2) && f.seat_based) reasons.push({ code: 'size_unchecked' });
    if (isNum(p.seats) && st) {
      if (p.seats < st.low * 0.8) { worse('condition'); reasons.push({ code: 'seats_few', data: { seats: p.seats, low: st.low, high: st.high } }); }
      else if (p.seats > st.high * 1.5) { worse('condition'); reasons.push({ code: 'seats_many', data: { seats: p.seats, low: st.low, high: st.high } }); }
    }
    if (t.proposable === false) { worse('incompatible'); reasons.push({ code: 'not_proposed_regulatory' }); }
    if (!f.family) reasons.push({ code: 'outside_engine' });
    out.push({ slug: f.slug, status, reasons });
  }
  return { formats: out, district_known: !!d, district_types: dTypes };
}

/* ------------------------------------------------------------------ */
/* M3 — three directions                                               */
/* ------------------------------------------------------------------ */

/**
 * @param founder {
 *   experience: 'none'|'close'|'pro', skill: 'kitchen'|'floor'|'bar'|'management'|null, role: 'operate'|'invest',
 *   time: 'full'|'part', risk: 'prudent'|'balanced'|'bold', budget_amount?, own_funds?,
 *   desires: { tags: [], moments: ['breakfast'|'lunch'|'dinner'] },
 *   constraints: { no_alcohol?, no_evening?, districts?: [names] },
 *   idea_format?: slug (P2: the founder's own idea, always one of the three), asked_format?: slug (asked explicitly) }
 * @param premisesFit optional M6 result: incompatible formats are excluded, conditions kept as warnings
 * @param investmentOf optional (slug) -> { status: 'computed', investment } | { status: 'unchecked', gaps } — the engine at the typical size
 * @param limitTo optional list of slugs (P7: compatible formats only)
 */
function selectFormats({ K, founder, premisesFit: fit, investmentOf, limitTo }) {
  const fd = founder || {};
  const desires = fd.desires || {}; const cons = fd.constraints || {};
  const prefDistricts = (cons.districts || []).map((n) => districtByName(K, n)).filter(Boolean);
  const prefTypes = [...new Set(prefDistricts.flatMap(archetypesOf))];
  const budget = isNum(fd.budget_amount) ? fd.budget_amount : null;
  const all = [];
  for (const f of K.formats || []) {
    const t = f.traits || {};
    const own = f.slug === fd.idea_format || f.slug === fd.asked_format;
    const excluded = []; const warnings = [];
    const tagHits = inter(FORMAT_TAGS[f.slug] || [], desires.tags || []).length;
    // Hard filters (exclusion), the founder's own idea passes them with warnings instead (« franchement », method M3).
    const block = (code, data) => (own ? warnings.push({ code, data }) : excluded.push({ code, data }));
    if (limitTo && !limitTo.includes(f.slug) && !own) excluded.push({ code: 'premises_incompatible' });
    if (t.proposable === false) { if (own) warnings.unshift({ code: 'regulatory_first' }); else excluded.push({ code: 'not_proposed_regulatory' }); }
    if (cons.no_alcohol && t.alcohol === 'core') block('alcohol_core');
    if (cons.no_evening && (t.services || []).length === 1 && t.services[0] === 'dinner') block('evening_only');
    if (fd.experience === 'none' && fd.role !== 'invest' && t.beginner_difficulty === 'very_high') block('too_demanding_for_beginner');
    if (t.thin_sheet && !tagHits) block('thin_sheet_no_clear_match');
    if (fit) {
      const r = fit.formats.find((x) => x.slug === f.slug);
      if (r && r.status === 'incompatible') block('premises_incompatible', { reasons: r.reasons.map((x) => x.code) });
      else if (r && r.status === 'condition') warnings.push({ code: 'premises_condition', data: { reasons: r.reasons.map((x) => x.code) } });
    }
    // Budget (engine at the format's typical size, when the range exists).
    let inv = null;
    if (investmentOf && f.family) inv = investmentOf(f.slug);
    if (budget != null && inv && inv.status === 'computed') {
      if (inv.investment > budget * BUDGET_TOLERANCE) block('above_budget', { investment: inv.investment, budget });
    } else if (budget != null && f.family) warnings.push({ code: 'budget_unchecked', data: { missing: (inv && inv.gaps) || ['typical_size'] } });
    // Warnings that travel with the card.
    if (!f.family) warnings.push({ code: 'outside_engine' });
    if (t.thin_sheet) warnings.push({ code: 'thin_sheet' });
    if (t.regulatory_flag === 'watch') warnings.push({ code: 'regulatory_watch' });
    if (t.regulatory_flag === 'strong' && t.proposable !== false) warnings.push({ code: 'regulatory_strong' });
    if (t.alcohol === 'core') warnings.push({ code: 'alcohol_licence' });
    if (fd.role === 'invest' && (t.investor_needs_operator === 'yes' || t.investor_needs_operator == null)) warnings.push({ code: 'needs_operator', data: { skill: t.key_skill || null, known: t.investor_needs_operator != null } });
    if (fd.role !== 'invest' && fd.experience !== 'pro' && t.key_skill && fd.skill !== t.key_skill && DIFFICULTY_ORDER[t.beginner_difficulty] >= 2) warnings.push({ code: 'needs_partner_skill', data: { skill: t.key_skill } });
    if (fd.time === 'part' && fd.role !== 'invest' && t.key_skill === 'floor') warnings.push({ code: 'founder_presence', data: { skill: t.key_skill } });
    if (prefTypes.length && t.archetypes && t.archetypes.length && !inter(t.archetypes, prefTypes).length) warnings.push({ code: 'district_type_mismatch', data: { district_types: prefTypes } });
    // Internal rank — never shown (method §1.3).
    let rank = 3 * tagHits;
    rank += inter(t.services || [], desires.moments || []).length;
    if (fd.skill && t.key_skill === fd.skill) rank += 2;
    const diff = DIFFICULTY_ORDER[t.beginner_difficulty];
    if (fd.experience === 'none' && diff != null) rank += 2 - diff;
    if (fd.experience === 'close' && diff != null) rank += diff <= 1 ? 1 : 0;
    if (fd.risk === 'prudent') rank += t.regulatory_flag === 'none' ? 1 : -1;
    if (fd.role === 'invest' && t.investor_needs_operator === 'franchise_ok') rank += 1;
    if (prefTypes.length && inter(t.archetypes || [], prefTypes).length) rank += 1;
    if (f.priority === 1) rank += 0.5;
    if (t.thin_sheet) rank -= 1;
    const possibleGap = (f.casa_lines || 0) === 0 && !(f.examples && f.examples.casa_recent);
    if (possibleGap && fd.risk === 'bold') rank += 0.5;
    if (own) rank += 100;
    all.push({ slug: f.slug, family: f.family || null, own, tag_hits: tagHits, status: excluded.length ? 'excluded' : 'candidate', excluded, warnings, rank, investment: inv && inv.status === 'computed' ? inv.investment : null, possible_gap: possibleGap });
  }
  const cands = all.filter((x) => x.status === 'candidate').sort((a, b) => b.rank - a.rank || a.slug.localeCompare(b.slug));
  // Three directions (ss-1.0.0): the founder's idea first; then the best that meet his wishes (when at least three
  // do), so a direction never comes from diversity alone; a format of another family replaces the third only when
  // it ranks within one point of it (mild diversity, Arnaud's read of the first outputs, 12 Nov 2026).
  const wished = cands.filter((c) => c.own || c.tag_hits > 0);
  const pool = (desires.tags || []).length && wished.length >= 3 ? wished : cands;
  const three = pool.slice(0, 3);
  if (three.length === 3 && new Set(three.map((c) => c.family)).size === 1) {
    const alt = pool.slice(3).find((c) => c.family !== three[0].family && c.rank >= three[2].rank - 1);
    if (alt && !three[2].own) three[2] = alt;
  }
  return { formats: all, three: three.map((c) => c.slug), candidates: cands.length };
}

/** Qualitative comparison of the directions: levels, never a note (method M3). */
function comparison(K, slugs, founder) {
  const fd = founder || {};
  return slugs.map((slug) => {
    const f = formatBySlug(K, slug) || {}; const t = f.traits || {};
    const skillFit = fd.role === 'invest' ? (t.investor_needs_operator === 'franchise_ok' ? 'franchise_ok' : 'needs_operator')
      : fd.experience === 'pro' || (fd.skill && fd.skill === t.key_skill) ? 'matches' : DIFFICULTY_ORDER[t.beginner_difficulty] <= 1 ? 'learnable' : 'needs_partner';
    return {
      slug,
      operating_demand: t.beginner_difficulty || 'unknown',
      key_skill: t.key_skill || 'unknown',
      risk: t.regulatory_flag === 'strong' ? 'regulatory_strong' : t.alcohol === 'core' ? 'alcohol_licence' : t.regulatory_flag === 'watch' ? 'regulatory_watch' : 'ordinary',
      profile_fit: skillFit,
      knowledge: t.thin_sheet ? 'thin' : 'documented',
    };
  });
}

/* ------------------------------------------------------------------ */
/* M5 — districts                                                      */
/* ------------------------------------------------------------------ */

/**
 * @param format slug of the chosen format
 * @param surface_m2 targeted surface (the monthly rent for it is computed when the district has a rent)
 * @param prefer district names the founder already has in mind
 * @returns { districts: [{ name, id, types, rent, competitors, reasons, unknowns, on_site }], none_reason? }
 */
function selectDistricts({ K, format, surface_m2, prefer }) {
  const f = formatBySlug(K, format);
  if (!f) return { districts: [], none_reason: 'unknown_format' };
  const fTypes = (f.traits && f.traits.archetypes) || [];
  if (!fTypes.length) return { districts: [], none_reason: 'format_without_district_type' };
  const preferred = (prefer || []).map((n) => districtByName(K, n)).filter(Boolean).map((d) => d.id);
  const scored = [];
  for (const d of K.districts || []) {
    const types = archetypesOf(d);
    const common = inter(fTypes, types);
    const isPreferred = preferred.includes(d.id);
    if (!common.length && !isPreferred) continue;   // district type compatible: mandatory (a preferred one is kept and said)
    const reasons = []; const unknowns = [];
    let rank = 0;
    if (common.length) {
      const best = Math.min(...d.archetypes.filter((a) => common.includes(a.code)).map((a) => a.rank));
      reasons.push({ code: 'district_type', data: { types: common, inference: d.archetypes.some((a) => common.includes(a.code) && a.inference) } });
      rank += best === 1 ? 3 : 2;
    } else reasons.push({ code: 'district_type_mismatch', data: { district_types: types, format_types: fTypes } });
    if (isPreferred) { rank += 3; reasons.push({ code: 'founder_choice' }); }
    let rent = null;
    if (d.rent && isNum(d.rent.m2)) {
      rent = { m2: d.rent.m2, low: d.rent.low, high: d.rent.high, source: d.rent.source, observed_at: d.rent.observed_at, level: 'district' };
      if (isNum(surface_m2)) rent.monthly_for_surface = Math.round(d.rent.m2 * surface_m2);
      rank += 1;
    } else {
      unknowns.push({ code: 'rent_undocumented', data: K.city_rent ? { city_m2: K.city_rent.m2 } : null });
    }
    const same = (d.venues || []).filter((v) => (v.formats || []).includes(f.slug));
    const sameFamily = (d.venues || []).filter((v) => !(v.formats || []).includes(f.slug) && f.family && v.family === f.family);
    const near = (list) => list.map((v) => ({ name: v.name, source_published_at: v.source_published_at, formats: v.formats || [] }));
    if (same.length >= 2) { rank -= 1; reasons.push({ code: 'same_format_cluster', data: { venues: near(same) } }); }
    else if (same.length === 1) reasons.push({ code: 'same_format_present', data: { venues: near(same) } });
    if (sameFamily.length) { reasons.push({ code: 'same_family_nearby', data: { venues: near(sameFamily) } }); if (same.length + sameFamily.length >= 2) rank -= 0.5; }
    if (!same.length && !sameFamily.length) { reasons.push({ code: 'no_same_format_recorded' }); rank += 0.5; }
    // Seafront (type D): the 2026 public-domain enforcement and demolitions on the Aïn Diab coast (catalogue lines of the
    // seafront formats) — the lighter flag of the method §5, always said for a seafront district.
    if (types.includes('D')) unknowns.push({ code: 'seafront_public_domain', data: { strong: (f.traits && f.traits.regulatory_flag) === 'strong' } });
    if (!d.density) unknowns.push({ code: 'no_density' });
    if (!(d.notes > 0)) unknowns.push({ code: 'no_district_card' });
    scored.push({ name: d.name, id: d.id, types, rent, competitors: same.map((v) => v.name), reasons, unknowns, on_site: ON_SITE_CHECKS.slice(), rank, preferred: isPreferred });
  }
  scored.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  const top = scored.slice(0, 3);
  return { districts: top, none_reason: top.length ? null : 'no_compatible_district', considered: scored.length };
}

/* ------------------------------------------------------------------ */
/* M2 — market reading                                                 */
/* ------------------------------------------------------------------ */

/**
 * Per district type: the districts of that type, the formats of the catalogue documented there, which of them
 * have a dated Casablanca presence (census, sourced lines, recent examples) and which have none in our data
 * (« possible gap, or a limit of our data »), and the clusters the census shows (two venues of a format in one district).
 * @param focus optional slug (P2: reading targeted on the founder's format)
 */
function marketReading({ K, focus }) {
  const out = [];
  for (const a of ARCHETYPES) {
    const districts = (K.districts || []).filter((d) => archetypesOf(d).includes(a));
    const formats = (K.formats || []).filter((f) => (f.traits && f.traits.archetypes || []).includes(a) && f.traits.proposable !== false && (!focus || f.slug === focus));
    const present = []; const noDatedExample = []; const clusters = [];
    for (const f of formats) {
      const venues = districts.flatMap((d) => (d.venues || []).filter((v) => (v.formats || []).includes(f.slug)).map((v) => ({ name: v.name, district: d.name, source_published_at: v.source_published_at })));
      const recent = (f.examples && f.examples.casa_recent) || 0;
      if (venues.length || (f.casa_lines || 0) > 0 || recent > 0) present.push({ slug: f.slug, venues, casa_lines: f.casa_lines || 0, recent_examples: recent });
      else noDatedExample.push({ slug: f.slug, reserve: 'possible_gap_or_data_limit', elsewhere: (f.examples && f.examples.top || []).filter((e) => e.country !== 'MA' || !/casablanca/i.test(e.city)).slice(0, 1) });
      for (const d of districts) {
        const v = (d.venues || []).filter((x) => (x.formats || []).includes(f.slug));
        if (v.length >= 2) clusters.push({ slug: f.slug, district: d.name, venues: v.map((x) => ({ name: x.name, source_published_at: x.source_published_at })) });
      }
    }
    out.push({ archetype: a, label: ARCHETYPE_LABELS[a], districts: districts.map((d) => d.name), inference: districts.some((d) => d.archetypes.some((x) => x.code === a && x.inference)), present, no_dated_example: noDatedExample, clusters });
  }
  return { types: out, census_size: (K.districts || []).reduce((s, d) => s + (d.venues || []).length, 0) };
}

/** What may leave the server: the internal rank is removed (method §1.3). */
function publicView(selection) {
  const s = JSON.parse(JSON.stringify(selection));
  for (const f of s.formats || []) { delete f.rank; delete f.tag_hits; }
  for (const d of s.districts || []) delete d.rank;
  return s;
}

module.exports = { SELECT_VERSION, ARCHETYPES, ARCHETYPE_LABELS, FORMAT_TAGS, TAGS, ON_SITE_CHECKS, BUDGET_TOLERANCE, formatBySlug, districtByName, premisesFit, selectFormats, comparison, selectDistricts, marketReading, publicView };
