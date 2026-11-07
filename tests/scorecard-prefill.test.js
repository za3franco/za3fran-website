// Scorecard → Validator carry-over: mapping, expiry, wiring, funnel events
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const validator = fs.readFileSync(path.join(__dirname, '..', 'validator.html'), 'utf8');
const scorecard = fs.readFileSync(path.join(__dirname, '..', 'scorecard.html'), 'utf8');
const scApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'scorecard.js'), 'utf8');

function load() {
  const m = validator.match(/\/\* prefill:start \*\/([\s\S]*?)\/\* prefill:end \*\//);
  assert.ok(m, 'prefill block present in validator.html');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[1] + ';this.map=mapScorecardPrefill;this.read=readScorecardPrefill;', ctx);
  return ctx;
}

const SAMPLE = {
  ts: Date.now(), name: 'Sara', email: 'sara@example.com',
  answers: { conceptType: 'cafe_bistro', conceptDescription: 'Un café de spécialité à Maarif', location: 'Maarif, Casablanca',
    differentiation: 'Torréfaction maison', competitorGap: 'Peu de cafés ouverts le soir', journeyStage: 'refining', targetTicket: '100_250' }
};

test('every Scorecard concept type and stage maps to a value the Validator form offers', () => {
  const { map } = load();
  const typeValues = [...validator.matchAll(/<option value="([a-z_]+)"[^>]*>/g)].map(x => x[1]);
  ['casual_restaurant','fine_dining','cafe_bistro','fast_casual','hotel_fb','bar_lounge','beach_club','other'].forEach(t => {
    const v = map({ answers: { conceptType: t } })['f-type'];
    assert.ok(v && typeValues.includes(v), t + ' -> ' + v);
  });
  ['exploring','refining','planning','operating'].forEach(s => {
    const v = map({ answers: { journeyStage: s } })['f-stage'];
    assert.ok(v && typeValues.includes(v), s + ' -> ' + v);
  });
});

test('mapping carries text answers, e-mail and a recognised city; never the ticket band', () => {
  const out = load().map(SAMPLE);
  assert.strictEqual(out['f-email'], 'sara@example.com');
  assert.strictEqual(out['f-type'], 'cafe_brunch');
  assert.strictEqual(out['f-stage'], 'idea');
  assert.strictEqual(out['f-city'], 'Casablanca');
  assert.strictEqual(out['f-gap'], 'Peu de cafés ouverts le soir');
  assert.ok(!Object.keys(out).some(k => /ticket|t-|budget/.test(k)));
});

test('an unknown city is left empty rather than guessed', () => {
  assert.strictEqual(load().map({ answers: { location: 'Dakar' } })['f-city'], undefined);
});

test('stored answers expire after 30 days and bad JSON is ignored', () => {
  const { read } = load();
  const mk = v => ({ getItem: () => v });
  assert.ok(read(mk(JSON.stringify({ ts: Date.now() - 1000 })), Date.now()));
  assert.strictEqual(read(mk(JSON.stringify({ ts: Date.now() - 31 * 864e5 })), Date.now()), null);
  assert.strictEqual(read(mk('{not json'), Date.now()), null);
  assert.strictEqual(read(mk(null), Date.now()), null);
});

test('wiring: Scorecard stores answers and links with ?from=scorecard; Validator shows a bilingual note, clears the answers, tracks events', () => {
  assert.ok(/localStorage\.setItem\('za3fran_prefill'/.test(scorecard));
  assert.ok(scorecard.includes('href="/validator?from=scorecard"'));
  assert.ok(/data-en>Your Scorecard answers/.test(scorecard) && /data-fr>Vos réponses du Scorecard/.test(scorecard));
  assert.ok(/id="prefill-note"[\s\S]*?data-en>[\s\S]*?data-fr>/.test(validator));
  assert.ok(validator.includes("localStorage.removeItem('za3fran_prefill')"));
  ['scorecard_started','scorecard_step'].forEach(e => assert.ok(scorecard.includes(e), e));
  ['validator_opened','validator_form_started','form_submitted','begin_checkout'].forEach(e => assert.ok(validator.includes(e), e));
});

test('the Scorecard e-mail no longer links to a homepage anchor that does not exist', () => {
  assert.ok(!scApi.includes('/#validator'));
  assert.ok(scApi.includes('/validator?from=scorecard_email'));
});
