/* Run: node --test tests/*.test.js
 * Concept Validator v2 (val-2.0.0, 28 Oct 2026): concept record, format families, figures from the engine,
 * scores in code, checked writing (mock model), fixed template. Canaille = the live Brain snapshot of 9 Oct with
 * the estimate methods, Arnaud's occupancy decision, sm-3, plus the four new format families.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const FMT = require('../lib/formats.js');
const CR = require('../lib/concept-record.js');
const V = require('../lib/validator-v2.js');
const W = require('../lib/validator-writer.js');
const P = require('../lib/validator-pipeline.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');
const G = require('./fixtures/estimate-models-2026-10-27.js');
const O = require('./fixtures/occupancy-decision-2026-10-09.js');
const FF = require('./tools/build-format-families.js');
const REC = require('./fixtures/canaille-record-2026-10-28.js');
const { mockModel } = require('./fixtures/validator-mock-model.js');

const fx = G.withGrowth(O.withOccupancyDecision(M.withEstimateMethods(C)));
const MA = C.market.chain[C.market.chain.length - 1].id;
const brain = { parameters: fx.parameters, values: [...fx.values, ...FF.asBrainRows(MA)] };
const clone = (x) => JSON.parse(JSON.stringify(x));
const TODAY = '2026-10-28';
const labels = { type: 'Bistro / bar à vin', audience: 'Résidents locaux', stage: 'Idée précoce', ramadan: 'Fermé' };

const cafe = { ...clone(REC), concept_name: 'Café Test', concept_type: 'cafe_brunch', format_family: undefined, alcohol: false, seats: '40', rent_monthly: 25000, surface_m2: 120,
  services: [{ id: 'breakfast', days: [0, 1, 2, 3, 4, 5, 6], ticket: 60, covers: 50 }, { id: 'lunch', days: [0, 1, 2, 3, 4, 5, 6], ticket: 140, covers: 40 }],
  budget_amount: 1500000, own_funds: 500000, stage: 'location', opening: '2027-06' };

test('format families: every Validator type maps to a family, except dark kitchen and other', () => {
  for (const [type, fam] of Object.entries(FMT.FAMILY_BY_TYPE)) {
    if (type === 'dark_kitchen' || type === 'other') assert.equal(fam, null);
    else assert.ok(FMT.FAMILIES[fam], type);
  }
  assert.equal(FMT.familyFor('other', 'cafe_brunch'), 'cafe_brunch');
  assert.equal(FMT.familyFor('dark_kitchen'), null);
});

test('migration seeds every format parameter the resolver reads, for each new family', () => {
  const keys = ['benchmark.food_cost_pct', 'benchmark.beverage_cost_pct', 'benchmark.turns', 'benchmark.cruise_occupancy', 'benchmark.beverage_share', 'benchmark.ramp_months',
    'benchmark.ramp_start_factor', 'benchmark.utilities_pct', 'benchmark.marketing_pct', 'benchmark.other_opex_pct', 'benchmark.maintenance_capex_pct', 'benchmark.occupancy_growth_y3'];
  for (const fam of ['restaurant', 'cafe_brunch', 'fast_casual', 'bar_lounge']) {
    const rows = FF.F[fam];
    for (const k of keys) assert.ok(rows.some((r) => r[0] === k), `${fam} ${k}`);
    for (const r of rows) { assert.ok(r[3] <= r[2] && r[2] <= r[4], `${fam} ${r[0]} range`); }
    assert.ok(FF.STAFF[fam].version && FF.CAPEX[fam].version);
  }
});

test('concept record: form normalisation, derived v1 answers, amendments scale the per-service figures', () => {
  const { v2, errors } = CR.normalizeForm({ services: [{ id: 'lunch', days: [1, 2, 3], ticket: '250', covers: '30' }, { id: 'dinner', days: [3, 4, 5, 6], ticket: '450', covers: 40 }],
    alcohol: 'yes', licence_cost: '300 000', ramadan: 'closed', opening: '2027-09', budget_amount: '2 000 000', own_funds: '600000', founder_works: 'no', competitors_list: [{ name: 'A' }, { name: '' }] });
  assert.deepEqual(errors, []);
  assert.equal(v2.licence_cost, 300000);
  assert.equal(v2.competitors_list.length, 1);
  const legacy = CR.derivedLegacy(v2);
  assert.equal(legacy.budget, '2000000');
  // weekly covers 30×3 + 40×4 = 250 on 6 open days
  assert.equal(legacy.covers, String(Math.round(250 / 6)));
  assert.equal(legacy.ticket, String(Math.round((90 * 250 + 160 * 450) / 250)));
  const bad = CR.normalizeForm({ services: [{ id: 'brunch', days: [1] }], opening: '2027-13', own_funds: 5, budget_amount: 2000 });
  assert.deepEqual(bad.errors.map((e) => e.code).sort(), ['bad_month', 'unknown_service'].sort());
  const rec = Object.assign({ ticket: legacy.ticket, covers: legacy.covers }, v2);
  const am = CR.applyAmendments(rec, [{ field_key: 'ticket', amended_value: String(Number(legacy.ticket) * 1.1), amendment_status: 'active' }, { field_key: 'budget', amended_value: '2500000', amendment_status: 'active' }]);
  assert.equal(am.services[0].ticket, Math.round(250 * 1.1));
  assert.equal(am.budget_amount, 2500000);
  assert.deepEqual(am.amended_fields, ['ticket', 'budget']);
});

test('resolver ar-1.8.0: covers per service set each service occupancy and flag the services above the cap', () => {
  const ri = CR.resolverInput(cafe, { covers: 'founder' });
  const res = R.resolveAssumptions({ concept: ri.concept, intake: ri.intake, market: C.market, format: ri.format, brain, options: { analyseImpact: false } });
  assert.equal(res.status, 'ready');
  const b = res.assumptions.find((a) => a.parameter_key === 'services.breakfast.occupancy');
  assert.ok(Math.abs(b.value_num - Math.min(0.85, 50 / (40 * 3))) < 1e-3);
  assert.equal(R.RESOLVER_VERSION, 'ar-1.8.0');
});

test('Canaille v2: base case = format benchmark (same year-2 revenue as the cleared plan), claim tested against the room', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  assert.equal(fin.status, 'computed');
  assert.equal(fin.base_source, 'benchmark');
  assert.equal(fin.base.sc.base.annual[1].revenue, 5811567);          // bp_v14_canaille_8, year 2
  assert.ok(fin.claim.res.flags.some((f) => f.code === 'FOUNDER_COVERS_ABOVE_CAP'));
  for (const k of ['base', 'conservative', 'optimistic']) assert.ok(fin.base.sc[k].checks.ok);
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  assert.deepEqual(A.alerts.map((a) => a.code), ['CAPACITY', 'DEBT_SERVICE', 'LICENCE_UNPRICED']);
  assert.ok(A.alerts.every((a) => a.fields.length && a.fields_source === 'code' && /^alert_v2_/.test(a.risk_key)));
  assert.equal(A.financial.criteria.find((c) => c.id === 'capacity').points, 0);
  assert.equal(A.financial.score, A.financial.criteria.reduce((a, c) => a + c.points, 0));
  assert.ok(A.F.ca_a2 && A.F.point_mort_couverts_jour && A.F.remplissage_demande);
});

test('every format family computes with Brain estimates only (team, investment), never blocked', () => {
  const recs = [cafe,
    { ...cafe, concept_type: 'fast_casual', services: [{ id: 'lunch', days: [1, 2, 3, 4, 5, 6], ticket: 90, covers: 90 }, { id: 'dinner', days: [1, 2, 3, 4, 5, 6], ticket: 90, covers: 60 }] },
    { ...cafe, concept_type: 'bar_lounge', alcohol: true, licence_cost: 300000, seats: '80', services: [{ id: 'dinner', days: [3, 4, 5, 6], ticket: 400, covers: 70 }] },
    { ...cafe, concept_type: 'restaurant_fine', alcohol: true, seats: '45', services: [{ id: 'dinner', days: [2, 3, 4, 5, 6], ticket: 900, covers: 30 }] },
    { ...cafe, concept_type: 'other', format_family: 'restaurant', seats: '60', services: [{ id: 'lunch', days: [1, 2, 3, 4, 5, 6], ticket: 180, covers: 40 }, { id: 'dinner', days: [1, 2, 3, 4, 5, 6], ticket: 300, covers: 45 }] }];
  for (const r of recs) {
    const fin = V.runFinancials({ record: r, market: C.market, brain });
    assert.equal(fin.status, 'computed', r.concept_type);
    const o = fin.base.sc.base;
    assert.ok(o.checks.ok && o.uses_of_funds.total > 0 && o.payroll.headcount >= 3, r.concept_type);
    assert.ok(o.annual[1].ratios.payroll > 0.08 && o.annual[1].ratios.payroll < 0.6, `${r.concept_type} payroll ${o.annual[1].ratios.payroll}`);
  }
  const dk = V.runFinancials({ record: { ...cafe, concept_type: 'dark_kitchen' }, market: C.market, brain });
  assert.equal(dk.status, 'not_seat_based');
  const A = V.assess({ record: { ...cafe, concept_type: 'dark_kitchen' }, fin: dk, lang: 'fr', currency: 'MAD', today: TODAY });
  assert.equal(A.financial.score, null);
  assert.deepEqual(A.alerts.map((a) => a.code), ['NOT_COMPUTED']);
});

test('scores in code: rubric 0–4 summed, competitor knowledge set in code, verdict capped by weak financials', () => {
  const r = V.rubricScore('s3', { intensity: { score: 4 }, edge: { score: 4 }, price_position: { score: 4 }, copy: { score: 4 }, knowledge: { score: 4 } }, { competitors_list: [] });
  assert.equal(r.criteria.find((c) => c.id === 'knowledge').score, 0);
  assert.equal(r.score, 80);
  const A = { lang: 'fr', record: { competitors_list: [] }, financial: { score: 30, criteria: [] }, execution: { score: 100, criteria: [] }, alerts: [] };
  const top = { s1: {}, s2: {}, s3: {} };
  for (const s of ['s1', 's2', 's3']) for (const [id] of V.RUBRIC[s]) top[s][id] = { score: 4 };
  const f = V.finalize({ assessment: A, written: { rubric: top, risks: [] } });
  assert.ok(f.overall >= 60);
  assert.equal(f.verdict, 'FRAGILE');
  assert.equal(f.verdict_capped, true);
  assert.equal(f.overall, Math.round(f.breakdown.reduce((a, b) => a + b.contribution, 0)));
  // dark kitchen: area 4 not scored, weights spread pro rata
  const g = V.finalize({ assessment: { ...A, financial: { score: null, criteria: [] } }, written: { rubric: top, risks: [] } });
  assert.equal(g.breakdown.find((b) => b.key === 's4').weight, 0);
  assert.ok(Math.abs(g.breakdown.reduce((a, b) => a + b.weight, 0) - 1) < 1e-3);
});

test('writer checks: a digit outside a placeholder, a missing citation or an unknown name is rejected', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const ctx = { record: REC, names, allowedExtra: [] };
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const errs = W.checkGroup(g3, { s4: { paragraphes: ['Le chiffre d’affaires atteint 5 millions chez Bagatelle.'], cette_semaine: ['Appeler la banque.'] }, s5: { paragraphes: ['Votre apport est solide.'], cette_semaine: ['Lister les concurrents.'] } }, A, ctx);
  const codes = errs.map((e) => e.code);
  assert.ok(codes.includes('digit') && codes.includes('missing') && codes.includes('name'), codes.join(','));
});

test('pipeline (mock model): checked text, filled template, report_json in the shape the readiness review reads', async () => {
  const r = await P.generate({ record: REC, labels, callModel: mockModel({ bad: true }), today: TODAY, preloaded: { market: C.market, brain } });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.ok(Object.values(r.audit.attempts).every((n) => n === 2));    // the injected digit was sent back and fixed
  assert.doesNotMatch(r.html, /\{[a-z0-9_]+\}|undefined|NaN/);
  assert.match(r.html, /AI-generated|intelligence artificielle/);
  const j = r.json;
  assert.match(j.meta.generator, /^val-2\.0\./);
  assert.ok(['STRONG', 'VIABLE', 'FRAGILE', 'HIGH_RISK'].includes(j.overall.verdict));
  assert.equal(j.score_breakdown.length, 6);
  assert.ok(j.sections.s4_financial.alerts.length >= 1);
  assert.ok(j.sections.s6_risks.risks.length >= 3 && j.sections.s6_risks.risks.every((x) => x.fields.every((f) => W.FIELD_KEYS.includes(f))));
  assert.equal(j.sections.s5_strategy.recommendations.length, 5);
  assert.equal(j.action_plan.length, 4);
  // PDF copy: fonts and logo embedded, no network
  const pdfHtml = P.embedForPdf(r.html);
  assert.doesNotMatch(pdfHtml, /fonts\.googleapis|src="\/assets\/logo\.png"/);
  assert.match(pdfHtml, /@font-face/);
});

test('BP intake pre-fill from the concept record (bpi-1.5.0 shape)', () => {
  const p = CR.bpPrefill(REC);
  assert.equal(p.format, 'bistro_wine_bar');
  assert.equal(p.opening, '2027-10');
  assert.equal(p.alcohol, true);
  assert.equal(p.services.length, 2);
  assert.equal(p.sizing.founder_amount, 1719000);
  assert.equal(p.ui.founder_works, true);
  const I = require('../lib/bp-intake.js');
  assert.deepEqual(I.SERVICE_IDS, ['breakfast', 'lunch', 'dinner']);
});

test('writer vw-1.0.2: a failing action line is dropped after the rewrites, never the analysis, never the last action', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const ctx = { record: REC, names, allowedExtra: [] };
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const paras = W.required(A).s4.map((k) => `Le projet présente la valeur {${k}} pour ce poste.`);
  const out = { s4: { paragraphes: [paras.join(' ')], cette_semaine: ['Appeler la banque.', 'Visiter dix concurrents du quartier.'] }, s5: { paragraphes: ['Votre apport est solide.'], cette_semaine: ['Lister les concurrents.'] } };
  const errs = W.checkGroup(g3, out, A, ctx);
  assert.deepEqual(errs.map((e) => e.where), ['s4.cette_semaine[1]'], JSON.stringify(errs));
  const pr = W.pruneActions(g3, out, errs, A, ctx);
  assert.ok(pr); assert.deepEqual(pr.out.s4.cette_semaine, ['Appeler la banque.']);
  assert.equal(pr.pruned[0].where, 's4.cette_semaine[1]');
  // the only action of a list is never dropped; an error in the analysis is never pruned
  const solo = clone(out); solo.s4.cette_semaine = ['Visiter dix concurrents du quartier.'];
  assert.equal(W.pruneActions(g3, solo, W.checkGroup(g3, solo, A, ctx), A, ctx), null);
  const bad = clone(out); bad.s5.paragraphes = ['Votre apport couvre dix mois.'];
  assert.equal(W.pruneActions(g3, bad, W.checkGroup(g3, bad, A, ctx), A, ctx), null);
});

test('writer vw-1.0.3: a paragraph with too many figures is split at a sentence boundary, text unchanged', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const ctx = { record: REC, names, allowedExtra: [] };
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const keys = W.required(A).s4.concat(['emprunt']).filter((k) => A.F[k]);
  assert.ok(keys.length >= 7, keys.join(','));
  const para = keys.map((k) => `Le projet affiche la valeur {${k}} sur ce poste.`).join(' ');
  const out = { s4: { paragraphes: [para], cette_semaine: ['Appeler la banque.'] }, s5: { paragraphes: ['Votre apport est solide.'], cette_semaine: ['Lister les concurrents.'] } };
  const errs = W.checkGroup(g3, out, A, ctx);
  assert.deepEqual(errs.map((e) => e.code), ['too_many_figures']);
  const pr = W.pruneActions(g3, out, errs, A, ctx);
  assert.ok(pr); assert.equal(pr.out.s4.paragraphes.length, 2);
  assert.equal(pr.out.s4.paragraphes.join(' '), para);
  assert.equal(pr.pruned[0].action, 'split');
});

test('writer vw-1.0.4: a count placeholder used in another sense is rejected ({places} références)', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const ctx = { record: REC, names, allowedExtra: [] };
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const paras = W.required(A).s4.map((k) => `Le projet présente la valeur {${k}} pour ce poste.`);
  const base = { s4: { paragraphes: [paras.slice(0, 3).join(' '), paras.slice(3).join(' ')], cette_semaine: ['Appeler la banque.'] }, s5: { paragraphes: ['Votre salle compte {places} places.'], cette_semaine: ['Lister les concurrents.'] } };
  const ok = W.checkGroup(g3, base, A, ctx).filter((e) => e.code === 'misuse');
  assert.equal(ok.length, 0, JSON.stringify(ok));
  const bad = clone(base); bad.s5.paragraphes = ['Le système Coravin sur {places} références au verre est exigeant.'];
  assert.ok(W.checkGroup(g3, bad, A, ctx).some((e) => e.code === 'misuse' && e.where === 's5.paragraphes[0]'));
  assert.equal(CR.inputsGiven(REC).list.covers_per_service, REC.covers != null || (REC.services || []).every((s) => s.covers != null));
});

test('writer vw-1.0.4: no article right before an amount or a rate in French', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const ctx = { record: REC, names, allowedExtra: [] };
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const paras = W.required(A).s4.map((k) => `Le projet présente la valeur {${k}} pour ce poste.`);
  const out = { s4: { paragraphes: [paras.slice(0, 3).join(' '), paras.slice(3).join(' ')], cette_semaine: ['Appeler la banque.'] }, s5: { paragraphes: ['Le {ca_a2} qui en résulte est solide, et les {places} places suffisent.'], cette_semaine: ['Lister les concurrents.'] } };
  const g = W.checkGroup(g3, out, A, ctx).filter((e) => e.code === 'grammar');
  assert.equal(g.length, 1); assert.match(g[0].detail, /ca_a2/);
});

test('writer vw-1.0.5: a count of services or turns is rejected', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const paras = W.required(A).s4.map((k) => `Le projet présente la valeur {${k}} pour ce poste.`);
  const out = { s4: { paragraphes: [paras.slice(0, 3).join(' '), paras.slice(3).join(' ')], cette_semaine: ['Appeler la banque.'] }, s5: { paragraphes: ['Le format prévoit deux services en déjeuner du lundi au vendredi.'], cette_semaine: ['Lister les concurrents.'] } };
  assert.ok(W.checkGroup(g3, out, A, { record: REC, names, allowedExtra: [] }).some((e) => e.code === 'invented'));
});

test('writer vw-1.0.6: an approximate number in words is rejected', () => {
  const fin = V.runFinancials({ record: REC, market: C.market, brain });
  const A = V.assess({ record: REC, fin, lang: 'fr', currency: 'MAD', today: TODAY });
  const { names } = P.allowedNames(REC);
  const g3 = W.GROUPS.find((g) => g.id === 'g3');
  const paras = W.required(A).s4.map((k) => `Le projet présente la valeur {${k}} pour ce poste.`);
  const out = { s4: { paragraphes: [paras.slice(0, 3).join(' '), paras.slice(3).join(' ')], cette_semaine: ['Appeler la banque.'] }, s5: { paragraphes: ['Le Coravin sert une cinquantaine de références au verre.'], cette_semaine: ['Lister les concurrents.'] } };
  assert.ok(W.checkGroup(g3, out, A, { record: REC, names, allowedExtra: [] }).some((e) => e.code === 'spelled' && /cinquantaine/.test(e.detail)));
});
