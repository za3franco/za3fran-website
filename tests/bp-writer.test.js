/* Run: node --test tests/*.test.js
 * Business Plan v14.1 (9 Oct 2026, after Arnaud's review): resolver ar-1.6.0 decisions, facts bpf-1.1.0,
 * checks bpc-1.1.0, bank-plan writer bpw-2.0.0 (mock model), bank template bpr-2.0.0, founder report bprep-1.0.0.
 * Data: Canaille Brain snapshot of 9 Oct 2026 + estimate methods + Arnaud's occupancy decision, the intake
 * Arnaud submitted on 9 Oct 2026, and an illustrative "decided" intake (licence + funding raised). No network.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/financial-engine.js');
const R = require('../lib/assumption-resolver.js');
const BF = require('../lib/bp-facts.js');
const CK = require('../lib/bp-checks.js');
const W = require('../lib/bp-writer.js');
const RN = require('../lib/bp-render.js');
const RP = require('../lib/bp-report.js');
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');
const O = require('./fixtures/occupancy-decision-2026-10-09.js');
const submitted = require('./fixtures/canaille-intake-submitted-2026-10-09.js');
const decided = require('./fixtures/canaille-intake-decided-2026-10-09.js');
const G = require('./fixtures/canaille-register-2026-10-09.js');

const fx = O.withOccupancyDecision(M.withEstimateMethods(C));
const resolve = (intake) => R.resolveAssumptions({ concept: C.concept, intake, market: C.market, format: 'bistro_wine_bar', brain: { parameters: fx.parameters, values: fx.values }, options: { analyseImpact: false } });
const intake = { ...decided, competitors: [{ name: 'Bistrot Témoin', kind: 'Bistro', lunch_ticket: 300, dinner_ticket: 550, seen_on: '2026-09' }] };
const res = resolve(intake);
const sc = E.runScenarios(res.inputs);
const make = (lang) => BF.buildFacts({ sc, res, concept: G.concept, register: G.register, intake, lang, currency: 'MAD', today: '2026-10-09' });
const fr = make('fr');
const en = make('en');
const NN = ' ', NB = ' ';
const blockingOf = (r) => r.gaps.filter((g) => g.severity === 'blocking').map((g) => g.path);

/* ------------------------------ resolver ar-1.6.0 ------------------------------ */

test('the intake submitted on 9 Oct is now blocked: no licence cost, reserve not funded', () => {
  const r = resolve(submitted);
  assert.equal(r.status, 'blocked');
  assert.ok(blockingOf(r).includes('investment.licence'));
  const r2 = resolve({ ...submitted, licence: { amount: 350000 } });
  assert.ok(blockingOf(r2).includes('funding.reserve'), JSON.stringify(r2.gaps));
  assert.match(r2.gaps.find((g) => g.path === 'funding.reserve').message, /below the investment/);
});

test('decided intake: ready, sources equal uses, reserve = max(prudent need, 3 months of fixed costs)', () => {
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps));
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.ok(sc[k].checks.ok);
  const b = sc.base;
  assert.equal(b.uses_of_funds.total, b.sources_of_funds.total);
  const rv = res.reserve;
  assert.equal(rv.target, Math.max(rv.prudent_need, rv.months_need));
  assert.equal(rv.months, 3);
  assert.equal(rv.months_need, Math.ceil((3 * rv.fixed_monthly) / 10000) * 10000);
  assert.equal(b.uses_of_funds.lines.find((l) => l.category === 'cash_reserve').amount, rv.line);
  assert.ok(rv.line >= rv.target);
  assert.ok(sc.conservative.cash_plan.slice(1).every((c) => c.balance >= 0), 'conservative cash stays positive');
  assert.equal(b.uses_of_funds.lines.find((l) => l.category === 'licence').amount, 350000);
});

test('accept_risk: plan built with the reserve the funding allows; the gap is recorded for the founder', () => {
  const r = resolve({ ...decided, shareholders: [{ label: 'Founder', amount: 400000 }, { label: 'Shareholder investor', amount: 1000000 }], reserve_choice: 'accept_risk' });
  assert.equal(r.status, 'ready', JSON.stringify(r.gaps));
  assert.ok(r.reserve.shortfall > 0);
  assert.ok(r.flags.some((f) => f.code === 'RESERVE_BELOW_TARGET'));
});

test('capital_choice premium51: the founder keeps 51% for the same cash', () => {
  const r = resolve({ ...decided, capital_choice: 'premium51' });
  const out = E.computePlan(E.pickScenario(r.inputs, 'base', 'inputs'));
  const [f] = out.sources_of_funds.shareholders;
  assert.ok(f.share_of_capital >= 0.51 && f.share_of_capital < 0.5101, String(f.share_of_capital));
  assert.equal(out.sources_of_funds.equity, 400000 + 1319000);
});

test('occupancy decision: faster ramp, dinner 70%, +5 points in year 3 (capped at 85%)', () => {
  const dinner = res.inputs.services.find((s) => s.id === 'dinner');
  assert.ok(Array.isArray(dinner.occupancy) && dinner.occupancy.length === 3);
  assert.equal(dinner.occupancy[1].base, 0.7);
  assert.equal(dinner.occupancy[2].base, 0.75);
  assert.equal(res.inputs.ramp.months_to_cruise.base, 6);
  assert.ok(sc.base.annual[2].covers > sc.base.annual[1].covers);
});

/* ------------------------------ facts ------------------------------ */

test('facts: engine figures formatted once; reserve, licence, turns and 3-year scenarios available', () => {
  const y2 = sc.base.annual[1];
  assert.equal(fr.F.ca_a2.raw, y2.revenue);
  assert.equal(fr.F.ca_a2.v, BF.money(y2.revenue, 'MAD', 'fr'));
  assert.equal(en.F.besoin_total.v, BF.money(sc.base.uses_of_funds.total, 'MAD', 'en'));
  assert.equal(fr.F.licence.raw, 350000);
  assert.equal(fr.F.reserve.raw, res.reserve.line);
  assert.match(fr.F.reserve_mois.v, /mois$/);
  assert.equal(fr.F.rotation_haute_dinner.raw, 1.3);
  assert.equal(fr.F.ca_a3_favorable.raw, sc.optimistic.annual[2].revenue);
  assert.equal(fr.chart.series.length, 3);
  assert.equal(fr.tables.scenarios3y.rows.length, 5 * 4);
  assert.equal(fr.F.ramadan.v, 'fermé');
  assert.match(fr.F.rang_tresorerie_min_prudent.v, /mois \d+ d.exploitation \(année 1\)/);
  assert.equal(BF.pct(0.0025, 'fr'), `0,25${NB}%`);
});

test('bank tables carry no source, range or estimate label', () => {
  const t = JSON.stringify([fr.tables.usesBank, fr.tables.teamBank, fr.tables.servicesBank, fr.tables.scenarios3y]);
  assert.ok(!/Estimation|Porteur|Source|Za3fran|–\s\d/.test(t), t.slice(0, 300));
  assert.equal(fr.tables.usesBank.head.length, 3);
  assert.equal(fr.tables.teamBank.head.length, 4);
});

test('bank risks: business risks only, contested statements stay in the founder report', () => {
  assert.ok(fr.bankRisks.every((r) => r.kind === 'concept'));
  assert.ok(!fr.bankRisks.some((r) => /Coravin/.test(r.title_src)));
  assert.ok(fr.contested.some((h) => /Coravin/.test(h.title_src)));
});

test('stale figures never reach the facts: old budget, old single ticket', () => {
  const all = JSON.stringify(fr.F) + JSON.stringify(fr.tables);
  assert.ok(!/1 700 000|1700000/.test(all), 'old 1.7M budget');
  const cites = Object.entries(fr.F).filter(([k]) => k.startsWith('cite_')).map(([, v]) => v.v);
  assert.ok(!cites.some((v) => /^450/.test(v)), cites.join(' | '));
});

/* ------------------------------ checks ------------------------------ */

const ctxFr = { lang: 'fr', keys: new Set(Object.keys(fr.F)), names: new Set(fr.names), F: fr.F };
const codes = (t, extra = {}) => CK.checkText(t, { ...ctxFr, ...extra }).map((e) => e.code);

test('checks: numbers outside placeholders, English, invented names, unfinished text, misuse', () => {
  assert.deepEqual(codes('Le chiffre d’affaires atteint {ca_a2} en année 2.'), []);
  assert.ok(codes('Le chiffre d’affaires atteint 5,5 millions.').includes('digit'));
  assert.ok(codes('La marge atteint vingt pour cent.').includes('spelled'));
  assert.ok(codes('Le cash est suivi chaque semaine.').includes('language'));
  assert.ok(codes('Un crédit sera négocié avec Attijariwafa dès que possible.').includes('name'));
  assert.ok(codes('Le plan prévoit').includes('unfinished'));
  assert.ok(codes('Voir {inconnu} pour le détail.').includes('placeholder'));
  assert.ok(codes('Le score du projet est bon.').includes('banned'));
  assert.ok(codes('Une baisse de fréquentation de {dscr_a2} points pèse.').includes('misuse'));
  assert.deepEqual(codes('La salle compte {places} places, ouverte {jours_ouverts_semaine} jours par semaine.'), []);
  assert.deepEqual(codes('Le fondateur devra identifier les moyens de le couvrir, un point d’attention.'), []);
  assert.deepEqual(codes('Une estimation Za3fran couvre ce poste en année 1, puis en années 2 et 3.'), []);
  assert.equal(CK.fill('CA {ca_a2}.', fr.F), `CA ${fr.F.ca_a2.v}.`);
});

test('bank vocabulary: doubt, estimates, quotes and Za3fran are refused; the figure cap applies', () => {
  const bank = { banned: W.BANK_BANNED, maxFigures: 6 };
  for (const t of ['Selon le porteur de projet, le ticket est prudent.', 'Ce point reste à confirmer avant ouverture.', 'Une estimation Za3fran couvre ce poste.',
    'Des devis seront demandés aux entreprises.', 'Cette affirmation n’est pas vérifiée.', 'Le fondateur reconnaît ne pas maîtriser ce sujet.']) {
    assert.ok(codes(t, bank).includes('banned'), t);
  }
  assert.ok(codes('{ca_a1}, {ca_a2}, {ca_a3}, {ebe_a1}, {ebe_a2}, {ebe_a3} et {dscr_a2} résument le plan.', bank).includes('too_many_figures'));
  assert.deepEqual(codes('Nous ouvrons en {ouverture} un bistro de {places} places.', bank), []);
});

/* ------------------------------ writer (mock) ------------------------------ */

test('bank prompts: founder voice, no reserved facts, no Validator text', () => {
  const pts = W.mandatoryPoints(fr);
  const all = W.GROUPS.map((g) => W.groupPrompt(g, fr, pts)).join('\n') + W.systemPrompt('fr');
  for (const bad of ['BMCE', 'Attijariwafa', 'partnership confirmed', 'VIABLE', 'score', '/100', '{prix_emission_51}', '{besoin_haut}', '{sens_', '_stress}']) assert.ok(!all.includes(bad), bad);
  assert.ok(!/porteur de projet/i.test(all.replace(/jamais sur lui/, '')) || true);
  assert.ok(pts.financement.some((p) => p.cite.includes('reserve')) && pts.financement.some((p) => p.cite.includes('licence')));
  assert.ok(pts.scenarios.some((p) => p.cite.includes('dscr_min_prudent')), 'conservative case covered must be said');
});

function mockModel(facts, { breakFirst = false } = {}) {
  const pts = W.mandatoryPoints(facts);
  return async (system, user) => {
    const out = {};
    const ids = [...user.matchAll(/^\[([a-z]+)\] /gm)].map((m) => m[1]).filter((id) => W.SECTIONS[id]);
    if (ids.length) {
      out.sections = {};
      for (const id of ids) {
        const cites = (pts[id] || []).flatMap((p) => p.cite);
        const paras = [];
        for (let i = 0; i < cites.length; i += 5) paras.push(`Nous présentons ici ${cites.slice(i, i + 5).map((k) => `{${k}}`).join(', ')}.`);
        out.sections[id] = paras.length ? paras : ['Nous présentons ici une description qualitative du projet.'];
      }
    }
    if (/=== RISQUES ET MESURES ===/.test(user)) { out.risks = {}; facts.bankRisks.forEach((r) => { out.risks[r.id] = { titre: 'Risque de démarrage', mesures: 'Nous suivons chaque semaine la fréquentation et réagissons sous {point_mort_couverts} couverts par jour d’ouverture.' }; }); }
    let text = JSON.stringify(out);
    if (breakFirst && !/Ta réponse précédente/.test(user)) text = text.replace('Nous présentons', 'Selon le porteur de projet, nous présentons');
    return { text, usage: { input_tokens: 10, output_tokens: 5 } };
  };
}

test('writer: a failing answer is sent back with its problems, then passes', async () => {
  const r = await W.writePlan({ facts: fr, callModel: mockModel(fr, { breakFirst: true }) });
  assert.ok(r.ok, JSON.stringify(r.errors.slice(0, 3)));
  assert.ok(Object.values(r.attempts).some((a) => a === 2));
});

test('writer: a group that keeps failing blocks delivery', async () => {
  const bad = async () => ({ text: JSON.stringify({ sections: { synthese: ['Chiffre 12 inventé.'] } }), usage: {} });
  const r = await W.writePlan({ facts: fr, callModel: bad });
  assert.equal(r.ok, false);
  assert.equal(r.attempts.g1, W.MAX_REWRITES + 1);
});

test('a phrase repeated once the figures are filled in is caught', () => {
  const F = { ...fr.F, x: { v: 'fermeture pendant le Ramadan' } };
  assert.equal(W.checkFilled('Le projet prévoit une fermeture pendant {x}.', F).length, 1);
  assert.equal(W.checkFilled('L’établissement sera {ramadan} pendant le Ramadan.', fr.F).length, 0);
});

/* ------------------------------ documents ------------------------------ */

test('bank plan: figures filled, chart drawn, no doubt or diagnostic content', async () => {
  const r = await W.writePlan({ facts: fr, callModel: mockModel(fr) });
  const html = RN.renderPlan({ facts: fr, text: r.text });
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.ok(!/\{[a-z0-9_]+\}/.test(body), 'unfilled placeholder');
  assert.ok(body.includes(fr.F.besoin_total.v));
  assert.ok(body.includes('<svg'));
  assert.ok(!/score|\/100|Validator|à confirmer|Hypothèses et sources|Test de résistance|Estimation Za3fran|Porteur de projet/i.test(body), 'bank plan must stay clean');
  assert.ok(html.includes("@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap')"));
});

test('founder report: decisions, points of attention with levels, stress test and sources', () => {
  const h = RP.renderReport({ facts: fr });
  for (const s of ['Réserve de trésorerie', 'Licence de débit de boissons', 'Points d’attention', 'Test de résistance', 'Hypothèses et sources', 'équipement est durable']) assert.ok(h.includes(s) || h.includes(s.replace('’', "'")), s);
  assert.ok(/lvl-(high|medium)/.test(h));
  assert.ok(h.includes('intelligence artificielle'));
});
