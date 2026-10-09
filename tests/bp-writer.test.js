/* Run: node --test tests/*.test.js
 * Business Plan v14: facts (bpf), checks (bpc), writer loop with a mock model (bpw), template (bpr).
 * Data: Canaille Brain snapshot of 9 Oct 2026 + estimate methods + the intake Arnaud submitted on
 * 9 Oct 2026 + the live readiness-review register. No network.
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
const C = require('./fixtures/canaille-live-2026-10-09.js');
const M = require('./fixtures/estimate-models-2026-10-09.js');
const intake = require('./fixtures/canaille-intake-submitted-2026-10-09.js');
const G = require('./fixtures/canaille-register-2026-10-09.js');

const fx = M.withEstimateMethods(C);
const res = R.resolveAssumptions({ concept: C.concept, intake, market: C.market, format: 'bistro_wine_bar', brain: { parameters: fx.parameters, values: fx.values }, options: { analyseImpact: false } });
const sc = E.runScenarios(res.inputs);
const make = (lang) => BF.buildFacts({ sc, res, concept: G.concept, register: G.register, intake, lang, currency: 'MAD', today: '2026-10-09' });
const fr = make('fr');
const en = make('en');
const NN = ' ', NB = ' ';

test('resolver ready on the submitted intake; engine invariants hold', () => {
  assert.equal(res.status, 'ready', JSON.stringify(res.gaps));
  for (const k of ['base', 'conservative', 'optimistic', 'stress']) assert.ok(sc[k].checks.ok);
});

test('facts are the engine figures, formatted once', () => {
  const y2 = sc.base.annual[1];
  assert.equal(fr.F.ca_a2.raw, y2.revenue);
  assert.equal(fr.F.ca_a2.v, BF.money(y2.revenue, 'MAD', 'fr'));
  assert.equal(fr.F.besoin_total.v, `2${NN}429${NN}000${NB}MAD`);
  assert.equal(en.F.besoin_total.v, `2,429,000${NB}MAD`);
  assert.equal(fr.F.dscr_a2.raw, y2.dscr);
  assert.equal(fr.F.ouverture.v, 'octobre 2027');
  assert.equal(fr.F.ticket_lunch.raw, 350);
  assert.equal(fr.F.ticket_dinner.raw, 650);
  assert.equal(fr.F.payback.v, 'au-delà de l’année 3');
  assert.equal(BF.pct(0.0025, 'fr'), `0,25${NB}%`);
});

test('the conservative cash shortfall is stated with the reserve that covers it', () => {
  assert.ok(sc.conservative.min_cash.balance < 0);
  const need = Math.ceil(-sc.conservative.min_cash.balance / 10000) * 10000;
  assert.equal(fr.F.reserve_complementaire.raw, need);
  const r = fr.risks.find((x) => x.key === 'cash_conservative');
  assert.ok(r && r.severity === 'high');
  const pts = W.mandatoryPoints(fr);
  assert.ok(pts.tresorerie.some((p) => p.cite.includes('reserve_complementaire')));
  assert.ok(pts.tresorerie.some((p) => p.cite.includes('differe')), 'interest-only period must be explained');
});

test('stale figures never reach the facts: old budget, old single ticket', () => {
  const all = JSON.stringify(fr.F) + JSON.stringify(fr.tables);
  assert.ok(!/1 700 000|1700000/.test(all), 'old 1.7M budget');
  const cites = Object.entries(fr.F).filter(([k]) => k.startsWith('cite_')).map(([, v]) => v.v);
  assert.ok(!cites.some((v) => /^450/.test(v)), 'old 450 MAD ticket offered as a founder figure: ' + cites.join(' | '));
  assert.ok(cites.some((v) => /200.800/.test(v)), 'licence cost range from the founder should be offered: ' + cites.join(' | '));
});

test('one severity per risk; contested statements become assumptions to confirm', () => {
  const ids = fr.risks.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  fr.risks.forEach((r) => assert.ok(['high', 'medium', 'low'].includes(r.severity)));
  assert.ok(!fr.risks.some((r) => /Coravin/.test(r.title_src || '')), 'contested risk must not be in the risk table');
  assert.ok(fr.confirm.some((h) => /Coravin/.test(h.title_src)));
  assert.ok(!fr.confirm.some((h) => /Cash Reserve/i.test(h.title_src)), 'budget-only alert superseded by the financing plan');
  assert.ok(fr.risks[0].severity === 'high');
});

test('the writer never sees Validator scores or Validator mitigation text', () => {
  const pts = W.mandatoryPoints(fr);
  const all = W.GROUPS.map((g) => W.groupPrompt(g, fr, pts)).join('\n');
  for (const bad of ['BMCE', 'Attijariwafa', 'partnership confirmed', 'VIABLE', 'score', '/100']) assert.ok(!all.includes(bad), bad);
});

test('checks: numbers outside placeholders, English, invented names, unfinished text', () => {
  const ctx = { lang: 'fr', keys: new Set(Object.keys(fr.F)), names: new Set(fr.names) };
  const codes = (t) => CK.checkText(t, ctx).map((e) => e.code);
  assert.deepEqual(codes('Le chiffre d’affaires atteint {ca_a2} en année deux.'), []);
  assert.ok(codes('Le chiffre d’affaires atteint 5,5 millions.').includes('digit'));
  assert.ok(codes('La marge atteint vingt pour cent.').includes('spelled'));
  assert.ok(codes('Le cash est suivi chaque semaine.').includes('language'));
  assert.ok(codes('Un crédit sera négocié avec Attijariwafa dès que possible.').includes('name'));
  assert.ok(codes('Le fournisseur Meniat est identifié par le porteur de projet.').every((c) => c !== 'name'));
  assert.ok(codes('Le plan prévoit').includes('unfinished'));
  assert.ok(codes('Voir {inconnu} pour le détail.').includes('placeholder'));
  assert.ok(codes('Le score du projet est bon.').includes('banned'));
  assert.ok(codes('La gestion de le stock est suivie.').includes('grammar'));
  const enCtx = { lang: 'en', keys: new Set(Object.keys(en.F)), names: new Set(en.names) };
  assert.ok(CK.checkText('Revenue reaches {ca_a2} avec the ramp-up.', enCtx).some((e) => e.code === 'language'));
  assert.equal(CK.fill('CA {ca_a2}.', fr.F), `CA ${fr.F.ca_a2.v}.`);
});

function mockModel(facts, { breakFirst = false } = {}) {
  const pts = W.mandatoryPoints(facts);
  let n = 0;
  const fn = async (system, user) => {
    n++;
    const out = {};
    const ids = [...user.matchAll(/^\[([a-z]+)\] /gm)].map((m) => m[1]).filter((id) => W.SECTIONS[id]);
    if (ids.length) {
      out.sections = {};
      for (const id of ids) {
        const cites = (pts[id] || []).flatMap((p) => p.cite).map((k) => `{${k}}`).join(', ');
        out.sections[id] = [`Le projet {nom} repose sur les éléments suivants : ${cites || 'une description qualitative'}.`];
      }
    }
    if (/=== RISQUES ===/.test(user)) { out.risks = {}; facts.risks.forEach((r) => { out.risks[r.id] = { titre: 'Risque identifié', attenuation: 'Les mesures prévues sont suivies chaque mois par le porteur de projet.', suivi: 'Une action est engagée sous {point_mort_couverts} couverts par jour d’ouverture.' }; }); }
    if (/HYPOTHÈSES À CONFIRMER/.test(user)) { out.hypotheses = {}; facts.confirm.forEach((h) => { out.hypotheses[h.id] = { enonce: 'Selon le porteur de projet, ce point est maîtrisé.', verification: 'Une vérification sur place est prévue avant tout engagement.' }; }); }
    let text = JSON.stringify(out);
    if (breakFirst && !/Ta réponse précédente/.test(user)) text = text.replace('repose sur', 'repose en 2027 sur');
    return { text, usage: { input_tokens: 10, output_tokens: 5 } };
  };
  fn.calls = () => n;
  return fn;
}

test('writer: a failing answer is sent back with its problems, then passes', async () => {
  const m = mockModel(fr, { breakFirst: true });
  const r = await W.writePlan({ facts: fr, callModel: m });
  assert.ok(r.ok, JSON.stringify(r.errors.slice(0, 3)));
  assert.ok(Object.values(r.attempts).every((a) => a >= 1));
  assert.ok(Object.values(r.attempts).some((a) => a === 2));
});

test('writer: a group that keeps failing blocks delivery', async () => {
  const bad = async () => ({ text: JSON.stringify({ sections: { synthese: ['Chiffre 12 inventé.'] } }), usage: {} });
  const r = await W.writePlan({ facts: fr, callModel: bad });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === 'digit'));
  assert.equal(r.attempts.g1, W.MAX_REWRITES + 1);
});

test('template: every placeholder filled, engine figures shown, disclaimer present, no score', async () => {
  const r = await W.writePlan({ facts: fr, callModel: mockModel(fr) });
  const html = RN.renderPlan({ facts: fr, text: r.text });
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.ok(!/\{[a-z0-9_]+\}/.test(body), 'unfilled placeholder');
  assert.ok(body.includes(`2${NN}429${NN}000${NB}MAD`));
  assert.ok(body.includes('intelligence artificielle'));
  assert.ok(!/score|\/100|Validator/i.test(body));
  assert.ok(/lang="fr"/.test(html));
  assert.ok(html.includes("@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap')"));
});

test('checks allow the brand name and the plan year labels, nothing else', () => {
  const ctx = { lang: 'fr', keys: new Set(Object.keys(fr.F)), names: new Set(fr.names) };
  const codes = (t) => CK.checkText(t, ctx).map((e) => e.code);
  assert.deepEqual(codes('Une estimation Za3fran couvre ce poste en année 1, puis en années 2 et 3.'), []);
  assert.ok(codes('Le chiffre atteint son maximum en année 4.').includes('digit'));
  assert.ok(codes('Le délai est de 30 jours.').includes('digit'));
});

test('checks catch a figure used for something else (unit after it, text glued to it)', () => {
  const ctx = { lang: 'fr', keys: new Set(Object.keys(fr.F)), names: new Set(fr.names) };
  const codes = (t) => CK.checkText(t, ctx).map((e) => e.code);
  assert.ok(codes('Une baisse de fréquentation de {sens_covers_20_dscr} points pèserait sur le DSCR.').includes('misuse'));
  assert.ok(codes('La trésorerie à la fin du {tresorerie_m24}e mois est positive.').includes('misuse'));
  assert.deepEqual(codes('Une baisse de fréquentation de {choc_frequentation} ramènerait le DSCR à {sens_covers_20_dscr}.'), []);
  assert.deepEqual(codes('La salle compte {places} places et sert {couverts_jour_a2} couverts par jour.'), []);
});

test('checks: "un point bas" is French, "trois points" is an invented threshold', () => {
  const ctx = { lang: 'fr', keys: new Set(Object.keys(fr.F)), names: new Set(fr.names) };
  const codes = (t) => CK.checkText(t, ctx).map((e) => e.code);
  assert.deepEqual(codes('La trésorerie atteint un point bas en {tresorerie_min_mois}, un point d’attention pour la banque.'), []);
  assert.ok(codes('Un écart de plus de trois points déclenche une revue.').includes('spelled'));
});
