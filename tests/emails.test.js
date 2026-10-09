/* Run: node --test tests/*.test.js
 * Intake emails (lib/emails.js): language, figures copied from the preview, no action asked of Za3fran.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/emails.js');

const summary = {
  currency: 'MAD', uses: { total: 2139000 }, sources: { equity: 939000, loans: 1200000 },
  sizing: { founder: { amount: 428000 }, partner: { amount: 511000 }, loan: { amount: 1200000 } },
  years: [{ revenue: 4434866, dscr: 7.44 }, { revenue: 5529674, dscr: 4.07 }],
  estimated: { roster: [{ role: 'chef' }], investment: [{ key: 'fitout' }] },
};

test('founder confirmation in French: subject, figures, estimate wording, links', () => {
  const m = M.intakeConfirmation({ lang: 'fr', firstName: 'Arnaud', conceptName: 'Canaille', code: 'ESATZMB2', summary });
  assert.equal(m.subject, 'Vos chiffres sont bien reçus — Canaille');
  assert.match(m.html, /Bonjour Arnaud,/);
  assert.match(m.html, /2 139 000 MAD/);
  assert.match(m.html, /4,07/);
  assert.match(m.html, /Za3fran a estimé votre équipe et vos investissements/);
  assert.match(m.html, /bp-intake\?code=ESATZMB2/);
  assert.doesNotMatch(m.html, /Total to finance/);
});

test('founder confirmation in English, resubmitted, no estimates, no name', () => {
  const m = M.intakeConfirmation({ lang: 'en', conceptName: 'Canaille', code: 'ESATZMB2', summary: { ...summary, estimated: null }, resubmitted: true });
  assert.equal(m.subject, 'Figures updated — Canaille');
  assert.match(m.html, /Hi there,/);
  assert.match(m.html, /2,139,000 MAD/);
  assert.doesNotMatch(m.html, /estimated/);
});

test('information copy for Za3fran: no action needed, third person', () => {
  const m = M.intakeNotice({ conceptName: 'Canaille', code: 'ESATZMB2', summary, lang: 'fr' });
  assert.match(m.subject, /^For information/);
  assert.match(m.html, /No action needed/);
  assert.match(m.html, /estimated the team and the investment/);
  assert.doesNotMatch(m.html, /your team/);
});

test('names and codes are escaped', () => {
  const m = M.intakeConfirmation({ lang: 'en', firstName: '<b>x</b>', conceptName: 'A & B', code: 'ESATZMB2', summary: null });
  assert.doesNotMatch(m.html, /<b>x<\/b>/);
  assert.match(m.html, /A &amp; B/);
});
