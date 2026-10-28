/* Dev helper (not deployed): the Canaille facts as the pipeline builds them (Brain snapshot of 9 Oct 2026 +
 * staffing method sm-3 + the decided intake) and the real bank-plan text written for run bp_v14_canaille_7
 * (28 Oct 2026, fixture canaille-bp-text-2026-10-28.json). Used to render design samples and to test the templates. */
'use strict';
const path = require('path');
const r = (p) => require(path.join(__dirname, '..', '..', p));
const E = r('lib/financial-engine.js'), R = r('lib/assumption-resolver.js'), BF = r('lib/bp-facts.js');
const C = r('tests/fixtures/canaille-live-2026-10-09.js'), M = r('tests/fixtures/estimate-models-2026-10-09.js');
const O = r('tests/fixtures/occupancy-decision-2026-10-09.js'), G3 = r('tests/fixtures/estimate-models-2026-10-27.js');
const decided = r('tests/fixtures/canaille-intake-decided-2026-10-09.js'), REG = r('tests/fixtures/canaille-register-2026-10-09.js');
const text = r('tests/fixtures/canaille-bp-text-2026-10-28.json');

const fx = G3.withGrowth(O.withOccupancyDecision(M.withEstimateMethods(C)));
const intake = { ...decided, competitors: [{ name: 'Bistrot Témoin', kind: 'Bistro', lunch_ticket: 300, dinner_ticket: 550, seen_on: '2026-09' }] };
const res = R.resolveAssumptions({ concept: C.concept, intake, market: C.market, format: 'bistro_wine_bar', brain: { parameters: fx.parameters, values: fx.values }, options: { analyseImpact: false } });
const sc = E.runScenarios(res.inputs);
const make = (lang = 'fr', today = '2026-10-28') => BF.buildFacts({ sc, res, concept: REG.concept, register: REG.register, intake, lang, currency: 'MAD', today });
module.exports = { sc, res, intake, make, text, status: res.status };
