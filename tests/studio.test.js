/* Run: node --test tests/*.test.js
 * Concept Studio lot 1 (12 Nov 2026): routing (sr-1.0.0), selection in code (ss-1.0.0), engine figures (sf-1.0.0),
 * knowledge from the Brain (sb-1.0.0), on the live Brain read of 12 Nov 2026 and 8 fictitious profiles.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROUTE = require('../lib/studio-route.js');
const SEL = require('../lib/studio-select.js');
const FIG = require('../lib/studio-figures.js');
const SB = require('../lib/studio-brain.js');
const V = require('../lib/validator-v2.js');
const K = require('./fixtures/studio-knowledge-2026-11-12.js');
const brain = require('./fixtures/studio-engine-brain.js');
const PROFILES = require('./fixtures/studio-profiles.js');
const LAB = require('./tools/studio-lab.js');

const TODAY = '2026-11-12';
const clone = (x) => JSON.parse(JSON.stringify(x));
const run = (key) => LAB.runProfile(PROFILES.find((p) => p.key === key), { K, brain, today: TODAY });

test('routing: the method §3 rules, in order, for the eight profiles', () => {
  const want = { 'p1-salma': 'P1', 'p2-nadia': 'P2', 'p3-youssef': 'P3', 'p4-leila': 'P4', 'p5-omar': 'P5', 'p6-mehdi': 'P6', 'p7-amina': 'P7', 'canaille-like': 'P2' };
  for (const p of PROFILES) {
    const { answers, errors } = ROUTE.normalizeAnswers(p.entry);
    assert.deepEqual(errors, [], p.key);
    assert.equal(ROUTE.route(answers).profile, want[p.key], p.key);
  }
  assert.deepEqual(ROUTE.route({ ...ROUTE.normalizeAnswers(PROFILES[3].entry).answers }).path, [{ id: 'VALIDATOR' }]);
});

test('routing: outside Casablanca is said plainly (D6), « Casa » and accents are Casablanca', () => {
  const base = { idea: 'worked', place: 'none', budget: 'amount', experience: 'close', role: 'operate' };
  for (const c of ['Casa', 'casablanca', 'CASABLANCA ', 'Casablanca']) assert.equal(ROUTE.normalizeAnswers({ ...base, city: c }).answers.city, 'casablanca', c);
  const r = ROUTE.route(ROUTE.normalizeAnswers({ ...base, city: 'Rabat' }).answers);
  assert.equal(r.profile, null); assert.equal(r.outside_city, true); assert.deepEqual(r.offer, ['validator', 'waitlist']);
  const r2 = ROUTE.route(ROUTE.normalizeAnswers({ ...base, idea: 'none', city: 'Marrakech' }).answers);
  assert.deepEqual(r2.offer, ['waitlist']);
  assert.equal(ROUTE.normalizeAnswers({ ...base }).errors[0].path, 'city');
});

test('routing: a worked concept with a premises but no budget still goes to the Validator, with a note', () => {
  const r = ROUTE.route({ idea: 'worked', place: 'premises', budget: 'unknown', experience: 'none', role: 'operate', city: 'casablanca' });
  assert.equal(r.profile, 'P4'); assert.ok(r.notes.includes('p4_budget_asked_by_validator'));
  // An investor with a premises is a P7 (the premises rule comes first), noted.
  const r7 = ROUTE.route({ idea: 'none', place: 'premises', budget: 'amount', experience: 'none', role: 'invest', city: 'casablanca' });
  assert.equal(r7.profile, 'P7'); assert.ok(r7.notes.includes('premises_owner_invests'));
});

test('selection: the beach club is never proposed spontaneously; asked, its regulatory flag comes first (D4)', () => {
  for (const p of PROFILES.filter((x) => x.founder.desires.tags.length)) {
    const s = SEL.selectFormats({ K, founder: { ...p.founder, desires: { tags: ['festif', 'vue', 'mer'], moments: ['dinner'] } } });
    assert.ok(!s.three.includes('beach-club'), p.key);
    assert.equal(s.formats.find((f) => f.slug === 'beach-club').status, 'excluded');
  }
  const asked = SEL.selectFormats({ K, founder: { ...PROFILES[0].founder, asked_format: 'beach-club' } });
  assert.equal(asked.three[0], 'beach-club');
  assert.equal(asked.formats.find((f) => f.slug === 'beach-club').warnings[0].code, 'regulatory_first');
});

test('selection: constraints exclude, the founder’s own idea passes with warnings, three distinct directions', () => {
  const noAlc = SEL.selectFormats({ K, founder: { ...PROFILES[1].founder } });
  for (const f of K.formats.filter((x) => x.traits.alcohol === 'core')) assert.equal(noAlc.formats.find((x) => x.slug === f.slug).status, 'excluded', f.slug);
  assert.equal(noAlc.three[0], 'burger');
  // The founder's idea is first even when a filter would exclude it.
  const own = SEL.selectFormats({ K, founder: { ...PROFILES[1].founder, idea_format: 'bar-a-vin' } });
  assert.equal(own.three[0], 'bar-a-vin');
  assert.ok(own.formats.find((x) => x.slug === 'bar-a-vin').warnings.some((w) => w.code === 'alcohol_core'));
  for (const p of PROFILES) {
    const r = run(p.key);
    if (!r.selection) continue;
    assert.equal(new Set(r.selection.three).size, r.selection.three.length, p.key);
    assert.ok(r.selection.three.length === 3, p.key);
    // Every direction meets a wish when the founder stated some (no direction from diversity alone).
    if (p.founder.desires.tags.length) for (const slug of r.selection.three) {
      const own2 = slug === p.founder.idea_format;
      assert.ok(own2 || SEL.FORMAT_TAGS[slug].some((t) => p.founder.desires.tags.includes(t)), `${p.key} ${slug}`);
    }
  }
});

test('selection: a beginner never gets a very demanding format; an investor sees the operator need', () => {
  const s = run('p1-salma').selection;
  for (const f of K.formats.filter((x) => x.traits.beginner_difficulty === 'very_high')) assert.notEqual(s.formats.find((x) => x.slug === f.slug).status, 'candidate', f.slug);
  const inv = run('p6-mehdi');
  const needs = inv.selection.formats.filter((f) => f.status === 'candidate' && f.warnings.some((w) => w.code === 'needs_operator'));
  assert.ok(needs.length > 0);
  for (const c of inv.comparison) assert.ok(['franchise_ok', 'needs_operator'].includes(c.profile_fit));
});

test('selection: no score leaves the server (publicView), the comparison holds levels only', () => {
  const s = SEL.publicView(run('p1-salma').selection);
  for (const f of s.formats) { assert.equal(f.rank, undefined); assert.equal(f.tag_hits, undefined); }
  const c = run('p1-salma').comparison;
  for (const row of c) for (const v of Object.values(row)) assert.equal(typeof v, 'string');
});

test('M6: a premises without extraction rules out the formats that require it; the beach club is never compatible', () => {
  const fit = SEL.premisesFit({ K, premises: PROFILES.find((p) => p.key === 'p7-amina').premises });
  for (const f of K.formats.filter((x) => x.traits.extraction === 'required')) assert.equal(fit.formats.find((x) => x.slug === f.slug).status, 'incompatible', f.slug);
  assert.equal(fit.formats.find((x) => x.slug === 'beach-club').status, 'incompatible');
  const possible = SEL.premisesFit({ K, premises: { district: 'CIL', extraction: 'possible' } });
  assert.equal(possible.formats.find((x) => x.slug === 'burger').status, 'condition');
  const r = run('p7-amina');
  for (const slug of r.selection.three) assert.notEqual(fit.formats.find((x) => x.slug === slug).status, 'incompatible');
});

test('M5: 2–3 districts of a compatible type (or the founder’s), never an address, seafront flagged, competition read', () => {
  for (const p of PROFILES) {
    const r = run(p.key);
    if (!r.districts) continue;
    const f = SEL.formatBySlug(K, r.chosen);
    assert.ok(r.districts.districts.length >= 1 && r.districts.districts.length <= 3, p.key);
    for (const d of r.districts.districts) {
      assert.ok(d.preferred || d.types.some((t) => f.traits.archetypes.includes(t)), `${p.key} ${d.name}`);
      assert.equal(d.address, undefined); assert.equal(d.street_hint, undefined);
      if (d.types.includes('D')) assert.ok(d.unknowns.some((u) => u.code === 'seafront_public_domain'), d.name);
      if (!d.rent) assert.ok(d.unknowns.some((u) => u.code === 'rent_undocumented'), d.name);
      if (d.rent && d.rent.monthly_for_surface) assert.equal(d.rent.monthly_for_surface, Math.round(d.rent.m2 * p.m4.surface_m2));
    }
  }
  const wine = run('canaille-like').districts.districts.find((d) => d.name === 'Gauthier');
  const near = wine.reasons.find((x) => x.code === 'same_family_nearby');
  assert.ok(near && near.data.venues.some((v) => /Braise/.test(v.name)));
  assert.ok(!wine.reasons.some((x) => x.code === 'no_same_format_recorded'));
});

test('M2: an absence is « possible gap, or a limit of our data », never a market gap; beach club absent from the reading', () => {
  const m = SEL.marketReading({ K });
  for (const t of m.types) {
    for (const x of t.no_dated_example) assert.equal(x.reserve, 'possible_gap_or_data_limit');
    assert.ok(!t.present.concat(t.no_dated_example).some((x) => x.slug === 'beach-club'));
  }
  const gauthier = m.types.find((t) => t.archetype === 'C');
  assert.ok(gauthier.inference);
});

test('M7: figures are the Validator engine’s own numbers, the Studio never scores', () => {
  const r = run('canaille-like');
  assert.equal(r.figures.status, 'computed');
  const fin = V.runFinancials({ record: r.figures.record, market: SB.marketFor(K, 'Gauthier'), brain });
  const o = fin.base.sc.base;
  assert.equal(r.figures.figures.funding_need, o.uses_of_funds.total);
  assert.equal(r.figures.figures.revenue.y3, o.annual[2].revenue);
  assert.equal(r.figures.figures.headcount, o.payroll.headcount);
  assert.equal(r.figures.figures.loan_needed, o.sources_of_funds.loans_total);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'studio-figures.js'), 'utf8');
  assert.ok(!/\bV\.assess\(|\bV\.finalize\(|\bassess\(|\bfinalize\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'studio-figures must not call assess() or finalize()');
  for (const k of Object.keys(r.figures)) assert.ok(!/score|verdict/i.test(k));
});

test('M7: nothing is filled in silence — a missing ticket, days or Ramadan is a gap; the alcohol of a « possible » format is asked', () => {
  const draft = { district: 'Maârif', services: [{ id: 'lunch', days: [1, 2, 3, 4, 5] }], seats: 40, surface_m2: 120, ramadan: null, opening: '2027-09', budget_amount: 1e6 };
  const r = FIG.figures({ draft, format: 'cafe-resto-brunch', K, market: SB.marketFor(K, 'Maârif'), brain, today: TODAY });
  assert.equal(r.status, 'needs_input');
  const paths = r.gaps.map((g) => g.path);
  for (const p of ['services.lunch.ticket', 'ramadan', 'alcohol']) assert.ok(paths.includes(p), p);
  const noDays = FIG.draftRecord({ draft: { services: [{ id: 'lunch', ticket: 120 }] }, format: 'burger', K });
  assert.ok(noDays.gaps.some((g) => g.path === 'services.lunch.days'));
  assert.equal(FIG.figures({ draft, format: 'dark-kitchen', K, market: null, brain }).status, 'outside_engine');
  assert.equal(FIG.figures({ draft, format: 'traiteur', K, market: null, brain }).status, 'outside_engine');
});

test('M7: a format range (A9) fills a missing figure as an estimate with its range; the founder’s figure wins', () => {
  // TEST DATA ONLY — invented range, not Arnaud's: exercises the code path until the Fourchettes tab is filled.
  const K2 = clone(K);
  const f = K2.formats.find((x) => x.slug === 'cafe-resto-brunch');
  f.ranges = { ticket: { breakfast: { low: 60, high: 90 }, lunch: { low: 120, high: 180 } }, seats: { low: 30, high: 50 }, surface_m2: { low: 90, high: 150 } };
  const draft = { district: 'Maârif', services: [{ id: 'breakfast', days: [0, 1, 2, 3, 4, 5, 6] }, { id: 'lunch', days: [0, 1, 2, 3, 4, 5, 6], ticket: 200 }], alcohol: false, ramadan: 'reduced', opening: '2027-09', budget_amount: 2e6, own_funds: 6e5 };
  const r = FIG.figures({ draft, format: 'cafe-resto-brunch', K: K2, market: SB.marketFor(K2, 'Maârif'), brain, today: TODAY });
  assert.equal(r.status, 'computed');
  assert.deepEqual(r.origins['services.breakfast.ticket'], { source: 'estimate', low: 60, high: 90, origin: 'za3fran_range', note: null });
  assert.equal(r.record.services[0].ticket, 75);
  assert.equal(r.origins['services.lunch.ticket'].source, 'founder');
  assert.equal(r.record.services[1].ticket, 200);
  assert.equal(r.record.seats, '40');
  const ready = FIG.readyForValidator({ record: r.record, origins: r.origins });
  assert.equal(ready.ready, true);
  for (const k of ['services.breakfast.ticket', 'seats', 'surface_m2', 'rent_monthly']) assert.ok(ready.to_confirm.includes(k), k);
  // The M3 budget filter now works for that format.
  const inv = FIG.investmentAtTypicalSize({ format: 'cafe-resto-brunch', K: K2, market: SB.marketFor(K2, 'Maârif'), brain, base: { budget_amount: 5e5 }, today: TODAY });
  assert.equal(inv.status, 'computed');
  const s = SEL.selectFormats({ K: K2, founder: { ...PROFILES[0].founder, budget_amount: 5e5 }, investmentOf: (slug) => FIG.investmentAtTypicalSize({ format: slug, K: K2, market: SB.marketFor(K2, 'Maârif'), brain, base: { budget_amount: 5e5 }, today: TODAY }) });
  assert.equal(s.formats.find((x) => x.slug === 'cafe-resto-brunch').excluded[0].code, 'above_budget');
});

test('M7 findings are facts of the engine: investment vs budget told apart from the reserve', () => {
  const youssef = run('p3-youssef').figures;
  assert.ok(youssef.findings.some((x) => x.code === 'reserve_makes_need_above_budget'));
  assert.ok(youssef.findings.some((x) => x.code === 'rent_share_high'));
  const nadia = run('p2-nadia').figures;
  assert.ok(nadia.findings.some((x) => x.code === 'investment_above_budget'));
  assert.ok(run('canaille-like').figures.findings.some((x) => x.code === 'licence_unpriced'));
});

test('M8: readiness lists what is missing, never fills it', () => {
  const r = FIG.readyForValidator({ record: { format_family: 'restaurant', services: [{ id: 'dinner', days: [5, 6] }] }, origins: {} });
  assert.equal(r.ready, false);
  for (const k of ['services.dinner.ticket', 'seats', 'surface_m2', 'budget_amount', 'opening', 'ramadan', 'alcohol']) assert.ok(r.missing.includes(k), k);
});

test('knowledge: built from raw Brain rows — traits parsed, superseded ignored, ranges read, census venues matched by the examples', () => {
  const rows = {
    today: TODAY,
    formats: [{ id: 'f1', slug: 'bar-a-vin', name_fr: 'Bar à vin', family: 'bistro_wine_bar', seat_based: true, priority: 1, status: 'researched' }],
    traits: [
      { format_id: 'f1', trait: 'archetypes', value: 'C,B', inference: true, status: 'researched' },
      { format_id: 'f1', trait: 'proposable', value: 'yes', status: 'researched' },
      { format_id: 'f1', trait: 'key_skill', value: 'kitchen', status: 'superseded' },
      { format_id: 'f1', trait: 'key_skill', value: 'bar', status: 'researched' },
    ],
    lines: [{ id: 'l1', format_id: 'f1', block: 'gaps', position: 1, body_fr: 'Aucune carte datée.', status: 'researched' }, { id: 'l2', format_id: 'f1', block: 'casablanca', position: 1, body_fr: 'x', source_name: 'Presse', status: 'researched' }],
    examples: [{ id: 'e1', format_id: 'f1', venue_name: 'Braise Social Kitchen & Wine Bar', city: 'Casablanca (Gauthier)', country: 'MA', source_published_at: '2026-10-15', status: 'researched' }],
    markets: [{ id: 'ma', country_code: 'MA' }, { id: 'casa', country_code: 'MA', city: 'Casablanca' }, { id: 'g', country_code: 'MA', city: 'Casablanca', district: 'Gauthier' }],
    archetypes: [{ market_id: 'g', archetype: 'C', rank: 1, inference: true, status: 'researched' }],
    values: [
      { id: 'r1', market_id: 'g', parameter_key: 'property.rent_m2_month', value_num: '150', low: '120', high: '182', status: 'researched', source_name: 'Mahaly' },
      { id: 'r0', market_id: 'g', parameter_key: 'property.rent_m2_month', value_num: '99', status: 'superseded' },
      { id: 't1', format_key: 'bar-a-vin', parameter_key: 'concept.ticket', qualifier: 'dinner', low: '300', high: '450', source_class: 'estimate', status: 'researched' },
    ],
    venues: [{ market_id: 'g', name: 'Braise Social Kitchen & Wine Bar', family: 'bistro_wine_bar', source_published_at: '2026-10-15', status: 'researched' }, { market_id: 'g', name: 'Old Bar', family: 'bar_lounge', venue_status: 'closed', status: 'researched' }],
    density: [], notes: [{ market_id: 'g', status: 'researched' }],
  };
  const K1 = SB.buildKnowledge(rows);
  const f = K1.formats[0];
  assert.deepEqual(f.traits.archetypes, ['C', 'B']); assert.equal(f.traits.key_skill, 'bar'); assert.equal(f.traits.proposable, true);
  assert.equal(f.trait_inference.archetypes, true);
  assert.deepEqual(f.ranges.ticket.dinner, { low: 300, high: 450, value: null, source_class: 'estimate', origin: 'za3fran_range', note: null, id: 't1' });
  assert.equal(f.casa_lines, 1); assert.equal(f.examples.casa_recent, 1);
  const g = K1.districts[0];
  assert.equal(g.rent.m2, 150); assert.equal(g.venues.length, 1); assert.deepEqual(g.venues[0].formats, ['bar-a-vin']);
  assert.deepEqual(SB.marketFor(K1, 'gauthier').chain, [{ id: 'g', level: 'district' }, { id: 'casa', level: 'city' }, { id: 'ma', level: 'country' }]);
  assert.deepEqual(SB.matchVenueFormats('Brass', rows.examples, { f1: rows.formats[0] }), []);
});

test('knowledge snapshot: every format has its traits, the beach club is not proposable, district types are deductions', () => {
  assert.equal(K.formats.length, 29);
  for (const f of K.formats) for (const t of ['key_skill', 'beginner_difficulty', 'alcohol', 'proposable', 'regulatory_flag']) assert.ok(f.traits[t] !== undefined, `${f.slug} ${t}`);
  const bc = K.formats.find((f) => f.slug === 'beach-club');
  assert.equal(bc.traits.proposable, false); assert.equal(bc.traits.regulatory_flag, 'strong');
  for (const d of K.districts) for (const a of d.archetypes) assert.equal(a.inference, true);
});

test('lab output: the eight profiles run; no score, no verdict wording', () => {
  const results = PROFILES.map((p) => LAB.runProfile(p, { K, brain, today: TODAY }));
  const md = LAB.render(results, K);
  assert.ok(!/\/100|\bscore\b|\bnote\b|\bnon viable\b|\bviable\b|garanti|succès assuré/i.test(md.replace(/Aucune note, aucun score/, '')));
  assert.equal(results.filter((r) => r.figures && r.figures.status === 'computed').length, 7);   // every profile but P4 (straight to the Validator)
});

test('Validator val-2.0.4: « loyer mensuel retenu » is the monthly rent, also when it comes from the Brain per m²', () => {
  const r = run('p1-salma');
  const fin = V.runFinancials({ record: r.figures.record, market: SB.marketFor(K, r.district), brain });
  const F = V.buildFacts({ record: r.figures.record, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const d = K.districts.find((x) => x.name === r.district);
  assert.equal(F.loyer_mois.raw, d.rent.m2 * r.figures.record.surface_m2);
  assert.equal(V.VALIDATOR_VERSION, 'val-2.0.4');
});
